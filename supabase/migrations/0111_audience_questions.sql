-- QUESTIONS AND THEIR ROUNDS (docs/work-specs/interaction/spec.md, phase 1, "Question lifecycle";
-- the Rules R1 to R17 in that spec's phase notes).
--
-- The operator keeps a list of questions with the production (`Show.questions`) and picks which
-- one the phones answer now. Each question has ONE result on the server (owner decision O1): an
-- `audience_rounds` row, now keyed by the question's own id and extended with the kind `open`, that
-- holds a snapshot of the text and options, the open/closed state the server checks, and the
-- answers and votes. Going live again reopens the same row, so the count continues.
--
-- What this file adds:
--   * `audience_rounds.question_id` (unique per production), `revision` (R5) and the kind `open`;
--   * `audience_submissions.round_id`: the round an answer was accepted into (R7), never moved;
--   * `audience_go_live(slug, question)` and `audience_stop(slug, round)`: one transaction each, under a
--     row lock on the production, so concurrent presses end with one open round (R1, R3, R4);
--   * `audience_clear_results(slug, question)`: removes one question's answers and votes, refused
--     while it is live (R9);
--   * `audience_submit` and `audience_vote` now take the round id and revision the phone read and
--     refuse a closed or stale round with "that question has closed" (R6). The old four-argument
--     forms are dropped: they took no round, so they could file an answer under whatever question
--     happened to be live when it arrived;
--   * `audience_operator_add` items may name a round of this production (paste, R13), and the
--     operator reads (`audience_list`, `audience_rounds_list`) return the new columns; a table
--     function's columns cannot change in place, so those are dropped and recreated here;
--   * the join resolve returns the open round's revision, and reports the production open only
--     while a round is (R18);
--   * R18: `audience_set_join` keeps only the presenter pointers and the brand, and the old
--     `audience_open_round` and `audience_close_round` refuse.
--
-- Nothing here writes to `control_events` (R16): nothing reaches air.
--
-- NOT purely additive. The columns, the index and the three new functions add; but the old phone
-- signatures are dropped and the old round and door writers refuse (R18, R19), so an app from
-- before this change cannot run on a database after it. Reverting the app therefore needs a new
-- migration that restores 0035's `audience_submit(text, text, text, text)`, `audience_vote(text,
-- text, uuid, int)`, `audience_set_join`, `audience_open_round` (0036's body) and
-- `audience_close_round`. The columns, the index and the new functions can stay: nothing old reads
-- them.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ══ 1. Columns ══════════════════════════════════════════════════════════════════════════════

alter table public.audience_rounds
  add column if not exists question_id text,
  add column if not exists revision    int not null default 1;

alter table public.audience_rounds drop constraint if exists audience_rounds_kind_check;
alter table public.audience_rounds add constraint audience_rounds_kind_check
  check (kind in ('poll', 'quiz', 'open'));

alter table public.audience_rounds drop constraint if exists audience_rounds_question_id_shape;
alter table public.audience_rounds add constraint audience_rounds_question_id_shape
  check (question_id is null or question_id ~ '^[A-Za-z0-9_-]{1,64}$');

-- One round per question (R2). The table holds a few rows per production, so a plain build.
create unique index if not exists audience_rounds_question_idx
  on public.audience_rounds (show_id, question_id) where question_id is not null;

alter table public.audience_submissions
  add column if not exists round_id uuid references public.audience_rounds (id) on delete set null;
create index if not exists audience_submissions_round_idx
  on public.audience_submissions (round_id) where round_id is not null;

-- ══ 2. The round guard: an Open round has no options ════════════════════════════════════════

create or replace function public.audience_round_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  count_options int;
begin
  new.question := btrim(left(coalesce(new.question, ''), 200));
  if new.kind = 'open' then
    new.options := '[]'::jsonb;
    new.correct_option := null;
    return new;
  end if;
  if jsonb_typeof(coalesce(new.options, 'null'::jsonb)) <> 'array' then
    raise exception 'invalid round' using errcode = 'check_violation';
  end if;
  new.options := coalesce((
    select jsonb_agg(btrim(left(value #>> '{}', 60)) order by ord)
    from jsonb_array_elements(new.options) with ordinality as o(value, ord)
    where jsonb_typeof(value) = 'string' and ord <= 8
  ), '[]'::jsonb);
  count_options := jsonb_array_length(new.options);
  if count_options < 2 then
    raise exception 'invalid round' using errcode = 'check_violation';
  end if;
  if new.correct_option is not null
     and (new.correct_option < 0 or new.correct_option >= count_options) then
    raise exception 'invalid round' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.audience_round_guard() from public, anon, authenticated;

-- ══ 3. The operator's lifecycle ═════════════════════════════════════════════════════════════

-- A round as the operator surfaces read it. One shape for go-live and the list.
create or replace function public.audience_round_json(p_round public.audience_rounds)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_round.id, 'kind', p_round.kind, 'question', p_round.question,
    'options', p_round.options, 'correct_option', p_round.correct_option,
    'opened_at', p_round.opened_at, 'closed_at', p_round.closed_at,
    'question_id', p_round.question_id, 'revision', p_round.revision)
$$;
revoke execute on function public.audience_round_json(public.audience_rounds) from public, anon, authenticated;

-- Put one question in front of every phone (R3). `p_question` is { id, type: 'open' | 'choice',
-- text, options? } from the production's question list. Returns the round.
create or replace function public.audience_go_live(p_slug text, p_question jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_id    text;
  v_kind  text;
  v_text  text;
  v_opts  jsonb;
  v_round public.audience_rounds%rowtype;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if jsonb_typeof(coalesce(p_question, 'null'::jsonb)) <> 'object' then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_id := p_question->>'id';
  if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_kind := case p_question->>'type' when 'open' then 'open' when 'choice' then 'poll' end;
  if v_kind is null then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_text := btrim(left(coalesce(p_question->>'text', ''), 200));
  if v_text = '' then
    raise exception 'a question needs its text' using errcode = '22023';
  end if;
  -- The snapshot in the guard's own normal form, so comparing it with the stored one is fair.
  if v_kind = 'open' then
    v_opts := '[]'::jsonb;
  else
    if jsonb_typeof(coalesce(p_question->'options', 'null'::jsonb)) <> 'array' then
      raise exception 'a vote needs its options' using errcode = '22023';
    end if;
    v_opts := coalesce((
      select jsonb_agg(btrim(left(value #>> '{}', 60)) order by ord)
      from jsonb_array_elements(p_question->'options') with ordinality as o(value, ord)
      where jsonb_typeof(value) = 'string' and ord <= 8
    ), '[]'::jsonb);
    if jsonb_array_length(v_opts) < 2 then
      raise exception 'a vote needs two options at least' using errcode = '22023';
    end if;
  end if;

  -- R1: one press at a time per production. A second press waits here and then sees the first.
  -- NO KEY UPDATE, not UPDATE: a phone's send holds a share lock on the round and then inserts a
  -- row whose foreign key takes a key-share lock on this production row. FOR UPDATE would block
  -- that key-share while this press waits on the phone's round lock: a deadlock. NO KEY UPDATE
  -- still excludes every other press, and lets the phone's insert through.
  perform 1 from public.control_shows s where s.id = v_show for no key update;

  select * into v_round from public.audience_rounds r
    where r.show_id = v_show and r.question_id = v_id;
  if v_round.id is not null then
    if v_round.kind <> v_kind then
      raise exception 'a question keeps its type' using errcode = '22023';
    end if;
    if v_round.question is distinct from v_text or v_round.options is distinct from v_opts then
      -- R8: the result always matches what was asked.
      if v_round.closed_at is null then
        raise exception 'a live question cannot change' using errcode = '22023';
      end if;
      if exists (select 1 from public.audience_submissions x where x.round_id = v_round.id)
         or exists (select 1 from public.audience_votes v where v.round_id = v_round.id) then
        raise exception 'this question has answers, so it cannot change' using errcode = '22023';
      end if;
      update public.audience_rounds r
        set question = v_text, options = v_opts, revision = r.revision + 1
        where r.id = v_round.id;
    end if;
  end if;

  update public.audience_rounds r set closed_at = now()
    where r.show_id = v_show and r.closed_at is null and r.id is distinct from v_round.id;

  if v_round.id is null then
    insert into public.audience_rounds (show_id, kind, question, options, question_id)
      values (v_show, v_kind, v_text, v_opts, v_id)
      returning * into v_round;
  else
    update public.audience_rounds r
      set closed_at = null, opened_at = case when r.closed_at is null then r.opened_at else now() end
      where r.id = v_round.id
      returning * into v_round;
  end if;

  update public.control_shows s set audience_state = s.audience_state || jsonb_build_object(
      'open', true,
      'mode', case v_kind when 'open' then 'question' else 'poll' end,
      'prompt', v_text,
      'round', v_round.id,
      'question', v_id,
      'rev', coalesce((s.audience_state->>'rev')::int, 0) + 1
    ) where s.id = v_show;
  return public.audience_round_json(v_round);
end $$;
revoke execute on function public.audience_go_live(text, jsonb) from public;
grant execute on function public.audience_go_live(text, jsonb) to anon, authenticated;

-- Back to the waiting text (R4). Stop names the round it stops: a press made just after another
-- operator's Go live committed must not stop the question that operator just put up. Returns the
-- state.
create or replace function public.audience_stop(p_slug text, p_round uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_state jsonb;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  perform 1 from public.control_shows s where s.id = v_show for no key update;
  update public.audience_rounds r set closed_at = now()
    where r.show_id = v_show and r.id = p_round and r.closed_at is null;
  if found then
    update public.control_shows s set audience_state = s.audience_state || jsonb_build_object(
        'open', false,
        'mode', 'waiting',
        'round', null,
        'question', null,
        'rev', coalesce((s.audience_state->>'rev')::int, 0) + 1
      ) where s.id = v_show;
  end if;
  select s.audience_state into v_state from public.control_shows s where s.id = v_show;
  return v_state;
end $$;
revoke execute on function public.audience_stop(text, uuid) from public;
grant execute on function public.audience_stop(text, uuid) to anon, authenticated;

-- R18: only Go live and Stop move the round and the live state. The state patch keeps the
-- presenter pointers and the brand; the old round verbs refuse rather than open a round with no
-- question or close one behind the state's back. Same signatures, so their grants stay.
create or replace function public.audience_set_join(p_slug text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_key   text;
  v_state jsonb;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if jsonb_typeof(coalesce(p_patch, 'null'::jsonb)) <> 'object' then
    raise exception 'not an audience state patch';
  end if;
  if p_patch = '{}'::jsonb then
    select s.audience_state into v_state from public.control_shows s where s.id = v_show;
    return v_state;
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('presenter', 'brand') then
      raise exception 'not an audience state patch';
    end if;
  end loop;
  if p_patch ? 'presenter' then
    if jsonb_typeof(p_patch->'presenter') <> 'object' then
      raise exception 'not an audience state patch';
    end if;
    for v_key in select jsonb_object_keys(p_patch->'presenter') loop
      if v_key not in ('current', 'next') then
        raise exception 'not an audience state patch';
      end if;
      if jsonb_typeof(p_patch->'presenter'->v_key) not in ('null', 'string')
         or coalesce(p_patch->'presenter'->>v_key, '') !~
            '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$' then
        raise exception 'not an audience state patch';
      end if;
    end loop;
  end if;
  update public.control_shows s
    set audience_state = s.audience_state || p_patch
      || jsonb_build_object('rev', coalesce((s.audience_state->>'rev')::int, 0) + 1)
    where s.id = v_show
    returning s.audience_state into v_state;
  return v_state;
end $$;

create or replace function public.audience_open_round(
  p_slug text, p_kind text, p_question text, p_options jsonb, p_correct int
) returns table (
  id uuid, kind text, question text, options jsonb,
  correct_option int, opened_at timestamptz, closed_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'questions go live from the Interaction tab' using errcode = '22023';
end $$;

create or replace function public.audience_close_round(p_slug text, p_round uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'questions stop from the Interaction tab' using errcode = '22023';
end $$;

-- A rehearsal must not count on air (R9, owner decision O2). Refused while live. Returns the
-- round, or null for a question that never went live.
create or replace function public.audience_clear_results(p_slug text, p_question text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_round public.audience_rounds%rowtype;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  perform 1 from public.control_shows s where s.id = v_show for no key update;
  select * into v_round from public.audience_rounds r
    where r.show_id = v_show and r.question_id = p_question;
  if v_round.id is null then
    return null;
  end if;
  if v_round.closed_at is null then
    raise exception 'stop the question before clearing its results' using errcode = '22023';
  end if;
  delete from public.audience_votes v where v.round_id = v_round.id;
  delete from public.audience_submissions x where x.round_id = v_round.id;
  update public.audience_rounds r set revision = r.revision + 1
    where r.id = v_round.id
    returning * into v_round;
  return public.audience_round_json(v_round);
end $$;
revoke execute on function public.audience_clear_results(text, text) from public;
grant execute on function public.audience_clear_results(text, text) to anon, authenticated;

-- ══ 4. The viewer's half: a send names the round and revision it read (R6) ═════════════════

drop function if exists public.audience_submit(text, text, text, text);
drop function if exists public.audience_submit(text, text, text, text, uuid, int);
create function public.audience_submit(
  p_join_slug text, p_device text, p_author text, p_body text, p_round uuid, p_revision int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_owner uuid;
  v_round uuid;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null or public.feature_denied_for(v_owner, 'audience') then
    raise exception 'that message could not be sent' using errcode = 'check_violation';
  end if;
  -- FOR SHARE: a Go live or Stop closing this round waits for this send, or this send waits for
  -- it and then finds the round closed. Either way an answer is never filed under a round that
  -- had closed when it was accepted.
  select r.id into v_round from public.audience_rounds r
    where r.id = p_round and r.show_id = v_show and r.kind = 'open'
      and r.closed_at is null and r.revision = p_revision
    for share;
  if v_round is null then
    raise exception 'that question has closed' using errcode = 'check_violation';
  end if;
  begin
    insert into public.audience_submissions (show_id, author, body, device_token, round_id)
      values (v_show, p_author, p_body, p_device, v_round);
  exception when others then
    raise exception 'that message could not be sent' using errcode = 'check_violation';
  end;
end $$;
revoke execute on function public.audience_submit(text, text, text, text, uuid, int) from public;
grant execute on function public.audience_submit(text, text, text, text, uuid, int) to anon, authenticated;

drop function if exists public.audience_vote(text, text, uuid, int);
drop function if exists public.audience_vote(text, text, uuid, int, int);
create function public.audience_vote(
  p_join_slug text, p_device text, p_round uuid, p_option int, p_revision int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_owner uuid;
  v_round uuid;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null or public.feature_denied_for(v_owner, 'audience') then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  select r.id into v_round from public.audience_rounds r
    where r.id = p_round and r.show_id = v_show and r.kind in ('poll', 'quiz')
      and r.closed_at is null and r.revision = p_revision
    for share;
  if v_round is null then
    raise exception 'that question has closed' using errcode = 'check_violation';
  end if;
  begin
    -- The upsert IS "change your mind while the question is live": the key is (round, device).
    insert into public.audience_votes (round_id, device_token, option_index)
      values (v_round, p_device, p_option)
      on conflict (round_id, device_token)
      do update set option_index = excluded.option_index, updated_at = now();
  exception when others then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end;
end $$;
revoke execute on function public.audience_vote(text, text, uuid, int, int) from public;
grant execute on function public.audience_vote(text, text, uuid, int, int) to anon, authenticated;

-- The join resolve, with the open round's revision (and its kind, which it already carried).
create or replace function public.audience_join_by_slug(p_join_slug text, p_device text)
returns table (production_name text, state jsonb, brand jsonb, mine jsonb, my_vote int)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show    uuid;
  v_owner   uuid;
  v_title   text;
  v_state   jsonb;
  v_denied  boolean;
  v_round   public.audience_rounds%rowtype;
begin
  select s.id, s.owner_id, s.title, s.audience_state
    into v_show, v_owner, v_title, v_state
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null then
    return;
  end if;
  v_denied := public.feature_denied_for(v_owner, 'audience');

  select * into v_round from public.audience_rounds r
    where r.show_id = v_show and r.closed_at is null
    order by r.opened_at desc limit 1;

  production_name := v_title;
  state := jsonb_build_object(
    -- R18: open only while a round is, so a state left by an older page shows the waiting text.
    'open', (coalesce((v_state->>'open')::boolean, false) and not v_denied and v_round.id is not null),
    'mode', case when v_round.id is null then 'waiting' else coalesce(v_state->>'mode', 'waiting') end,
    'prompt', coalesce(v_state->>'prompt', ''),
    -- The round WITHOUT its answer key, its question id or any tally.
    'round', case when v_round.id is null then null else jsonb_build_object(
      'id', v_round.id,
      'kind', v_round.kind,
      'question', v_round.question,
      'options', v_round.options,
      'openedAt', v_round.opened_at,
      'revision', v_round.revision
    ) end
  );
  brand := v_state->'brand';
  mine := coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'createdAt', x.created_at)
                     order by x.created_at)
    from public.audience_submissions x
    where x.show_id = v_show and x.device_token = p_device
  ), '[]'::jsonb);
  my_vote := (
    select v.option_index from public.audience_votes v
    where v.round_id = v_round.id and v.device_token = p_device
  );
  return next;
end $$;
revoke execute on function public.audience_join_by_slug(text, text) from public;
grant execute on function public.audience_join_by_slug(text, text) to anon, authenticated;

-- ══ 5. The operator reads and the paste door, with the round ════════════════════════════════

drop function if exists public.audience_list(text);
create function public.audience_list(p_slug text)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz,
  external_id text, source text, reference text, withdrawn_at timestamptz, round_id uuid
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  -- device_token is deliberately NOT selected (0035): the operator moderates words, not devices.
  return query
    select x.id, x.created_at, x.author, x.body, x.broadcast_author, x.broadcast_body,
           x.anonymize, x.status, x.shortlisted, x.used_at, x.skipped_at,
           x.external_id, x.source, x.reference, x.withdrawn_at, x.round_id
    from public.audience_submissions x
    where x.show_id = v_show
    order by x.created_at;
end $$;
revoke execute on function public.audience_list(text) from public;
grant execute on function public.audience_list(text) to anon, authenticated;

-- 0098's insert, and an item may name the round it is filed under (R13): a round of THIS
-- production, or none. Anything else refuses the whole call before a row is written.
drop function if exists public.audience_operator_add(text, jsonb);
create function public.audience_operator_add(p_slug text, p_items jsonb)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz,
  external_id text, source text, reference text, withdrawn_at timestamptz, round_id uuid
) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_show  uuid;
  v_item  jsonb;
  v_ext   text;
  v_round uuid;
  v_row   public.audience_submissions%rowtype;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'at most 100 messages at a time' using errcode = '22023';
  end if;
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e.value) = 'object'
       and coalesce(e.value->>'round_id', '') <> ''
       and not exists (
         select 1 from public.audience_rounds r
          where r.show_id = v_show and r.id::text = e.value->>'round_id')
  ) then
    raise exception 'not a question of this production' using errcode = '22023';
  end if;

  perform set_config('noacg.audience_operator', 'on', true);
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or btrim(coalesce(v_item->>'body', '')) = '' then
      continue;
    end if;
    v_ext := nullif(btrim(left(coalesce(v_item->>'external_id', ''), 200)), '');
    v_round := nullif(v_item->>'round_id', '')::uuid;
    if v_ext is not null and exists (
      select 1 from public.audience_submissions x where x.show_id = v_show and x.external_id = v_ext
    ) then
      continue;
    end if;
    insert into public.audience_submissions (show_id, author, body, device_token, external_id, source, reference, round_id)
      values (
        v_show,
        coalesce(v_item->>'author', ''),
        v_item->>'body',
        'operator_' || replace(gen_random_uuid()::text, '-', ''),
        v_ext,
        v_item->>'source',
        v_item->>'reference',
        v_round
      )
      on conflict (show_id, external_id) where external_id is not null do nothing
      returning * into v_row;
    if not found then
      continue;
    end if;
    id := v_row.id; created_at := v_row.created_at; author := v_row.author; body := v_row.body;
    broadcast_author := v_row.broadcast_author; broadcast_body := v_row.broadcast_body;
    anonymize := v_row.anonymize; status := v_row.status; shortlisted := v_row.shortlisted;
    used_at := v_row.used_at; skipped_at := v_row.skipped_at;
    external_id := v_row.external_id; source := v_row.source; reference := v_row.reference;
    withdrawn_at := v_row.withdrawn_at; round_id := v_row.round_id;
    return next;
  end loop;
  perform set_config('noacg.audience_operator', 'off', true);
end $$;
revoke execute on function public.audience_operator_add(text, jsonb) from public;
grant execute on function public.audience_operator_add(text, jsonb) to anon, authenticated;

drop function if exists public.audience_rounds_list(text);
create function public.audience_rounds_list(p_slug text)
returns table (
  id uuid, kind text, question text, options jsonb,
  correct_option int, opened_at timestamptz, closed_at timestamptz,
  question_id text, revision int
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  return query
    select r.id, r.kind, r.question, r.options, r.correct_option, r.opened_at, r.closed_at,
           r.question_id, r.revision
    from public.audience_rounds r where r.show_id = v_show order by r.opened_at;
end $$;
revoke execute on function public.audience_rounds_list(text) from public;
grant execute on function public.audience_rounds_list(text) to anon, authenticated;

-- ══ 6. Prove it by calling it ═══════════════════════════════════════════════════════════════
-- A throwaway production against a real owner, walked through the lifecycle, then removed. A
-- shape check alone would have passed 0035's broken `audience_open_round` (supabase/AGENTS.md).
do $$
declare
  v_owner  uuid;
  v_show   uuid := '00000000-0111-4000-8000-000000000111';
  v_slug   text;
  v_join   text;
  v_vote   jsonb;
  v_open   jsonb;
  v_again  jsonb;
  v_state  jsonb;
  v_failed boolean;
  v_msg    text;
begin
  -- The old forms are gone: a send that names no round cannot be filed anywhere.
  if to_regprocedure('public.audience_submit(text, text, text, text)') is not null
     or to_regprocedure('public.audience_vote(text, text, uuid, int)') is not null then
    raise exception '0111 self-check failed: a send without its round is still accepted';
  end if;

  select u.id into v_owner from auth.users u limit 1;
  if v_owner is null then
    raise notice '0111 self-check skipped: no account on this instance';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Questions self-check');
  select s.slug, s.join_slug into v_slug, v_join from public.control_shows s where s.id = v_show;

  v_vote := public.audience_go_live(v_slug, '{"id":"q-vote","type":"choice","text":"Which?","options":["A","B"]}');
  perform public.audience_vote(v_join, 'device-one-0111', (v_vote->>'id')::uuid, 1, 1);

  -- Another question going live closes the vote (R3), and the vote is refused after (R6).
  v_open := public.audience_go_live(v_slug, '{"id":"q-open","type":"open","text":"Ask us"}');
  if (select count(*) from public.audience_rounds r where r.show_id = v_show and r.closed_at is null) <> 1 then
    raise exception '0111 self-check failed: more than one round is open';
  end if;
  if (select s.audience_state->>'round' from public.control_shows s where s.id = v_show) <> v_open->>'id' then
    raise exception '0111 self-check failed: the state does not point at the live round';
  end if;
  begin
    perform public.audience_vote(v_join, 'device-one-0111', (v_vote->>'id')::uuid, 0, 1);
    v_failed := false;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    v_failed := v_msg = 'that question has closed';
  end;
  if not v_failed then
    raise exception '0111 self-check failed: a vote to a closed question was not refused as closed';
  end if;

  -- An answer is filed under the round it was sent to (R7).
  perform public.audience_submit(v_join, 'device-one-0111', 'Ana', 'Hello', (v_open->>'id')::uuid, 1);
  if not exists (select 1 from public.audience_submissions x
                  where x.show_id = v_show and x.round_id = (v_open->>'id')::uuid) then
    raise exception '0111 self-check failed: the answer is not filed under its round';
  end if;

  -- Stop closes it (R4).
  v_state := public.audience_stop(v_slug, (v_open->>'id')::uuid);
  if (v_state->>'open')::boolean or v_state->>'mode' <> 'waiting' or v_state->'round' <> 'null'::jsonb then
    raise exception '0111 self-check failed: stop left the state %', v_state;
  end if;
  begin
    perform public.audience_submit(v_join, 'device-two-0111', '', 'Late', (v_open->>'id')::uuid, 1);
    v_failed := false;
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception '0111 self-check failed: an answer after Stop was accepted';
  end if;

  -- Going live again reopens the same round at the same revision, and the count continues (R2, R5).
  v_again := public.audience_go_live(v_slug, '{"id":"q-vote","type":"choice","text":"Which?","options":["A","B"]}');
  if v_again->>'id' <> v_vote->>'id' or (v_again->>'revision')::int <> 1
     or (select count(*) from public.audience_votes v where v.round_id = (v_vote->>'id')::uuid) <> 1 then
    raise exception '0111 self-check failed: going live again did not continue the same count';
  end if;

  -- A question with answers keeps its words; Clear results is refused while live (R8, R9).
  begin
    perform public.audience_clear_results(v_slug, 'q-vote');
    v_failed := false;
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  if not v_failed then
    raise exception '0111 self-check failed: clear results while live was accepted';
  end if;
  -- Stop names its round: stopping the closed one leaves the live one up (R4).
  perform public.audience_stop(v_slug, (v_open->>'id')::uuid);
  if (select r.closed_at from public.audience_rounds r where r.id = (v_vote->>'id')::uuid) is not null then
    raise exception '0111 self-check failed: Stop on another round stopped the live one';
  end if;
  perform public.audience_stop(v_slug, (v_vote->>'id')::uuid);
  begin
    perform public.audience_go_live(v_slug, '{"id":"q-vote","type":"choice","text":"Which now?","options":["A","B"]}');
    v_failed := false;
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  if not v_failed then
    raise exception '0111 self-check failed: a question with votes changed its words';
  end if;

  -- Cleared, it may change, and its revision moves on (R5, R9).
  v_again := public.audience_clear_results(v_slug, 'q-vote');
  if (v_again->>'revision')::int <> 2
     or exists (select 1 from public.audience_votes v where v.round_id = (v_vote->>'id')::uuid) then
    raise exception '0111 self-check failed: clear results left %', v_again;
  end if;
  v_again := public.audience_go_live(v_slug, '{"id":"q-vote","type":"choice","text":"Which now?","options":["A","B","C"]}');
  if (v_again->>'revision')::int <> 3 then
    raise exception '0111 self-check failed: an edited question did not move its revision';
  end if;
  begin
    perform public.audience_vote(v_join, 'device-one-0111', (v_vote->>'id')::uuid, 2, 2);
    v_failed := false;
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception '0111 self-check failed: a vote against the old options was counted';
  end if;

  -- The type never changes (R8).
  perform public.audience_stop(v_slug, (v_vote->>'id')::uuid);
  begin
    perform public.audience_go_live(v_slug, '{"id":"q-vote","type":"open","text":"Which now?"}');
    v_failed := false;
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  if not v_failed then
    raise exception '0111 self-check failed: a question changed its type';
  end if;

  delete from public.control_shows s where s.id = v_show;
end $$;
