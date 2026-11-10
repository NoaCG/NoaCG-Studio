-- WORD QUESTIONS (docs/work-specs/interaction/spec.md, D5 and AC-14; the Rules W1 to W9 in that
-- spec's phase 6 notes).
--
-- A Word question takes one short word from each phone; the operator turns the words into a word
-- cloud. Its round is an `audience_rounds` row of the new kind `word`, and each word is an
-- `audience_submissions` row filed under it, so Go live, Stop, Clear results, the round's revision
-- and the stale-phone refusal work exactly as for an Open question (R1 to R9).
--
-- What this file adds:
--   * the round kind `word` (no options, like `open`), and Go live for a question of type `word`,
--     which sets the state's mode to `word`;
--   * `audience_submit` takes a word into a live Word round: one word (no space, no `|`) of at most
--     25 characters, and one per phone per question (W2, W3); a second is refused as "you have
--     already sent your word";
--   * the submission guard counts a Word round's words against that round's own burst cap, 300 in
--     ten seconds (as phone votes), never against the 20-per-10-seconds message throttle, and the
--     message throttle no longer counts words (W4): a hall answering at once is not refused;
--   * the join resolve gives each of this phone's own messages its round, so a phone knows its word
--     is in (W5);
--   * `audience_word_counts(slug, round)`: a Word round's words counted per spelling, as one value,
--     so the operator's cloud counts every word (W1). A new operator function, granted like
--     `audience_tally`.
--
-- Nothing here writes to `control_events` (R16): nothing reaches air.
--
-- Additive for the app: every existing function keeps its signature and grant, an Open or Multiple choice
-- question behaves as before, and `mine` gains a key an older page ignores. Revert: `git revert`
-- the app; the kind and the functions can stay, since an older page never makes a Word round.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ══ 1. The kind ═════════════════════════════════════════════════════════════════════════════
alter table public.audience_rounds drop constraint if exists audience_rounds_kind_check;
alter table public.audience_rounds add constraint audience_rounds_kind_check
  check (kind in ('poll', 'quiz', 'open', 'word'));

-- 0111's round guard: a Word round, like an Open one, has no options.
create or replace function public.audience_round_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  count_options int;
begin
  new.question := btrim(left(coalesce(new.question, ''), 200));
  if new.kind in ('open', 'word') then
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

-- ══ 2. Go live: 0111's, with the type `word` ════════════════════════════════════════════════
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
  v_kind := case p_question->>'type' when 'open' then 'open' when 'choice' then 'poll' when 'word' then 'word' end;
  if v_kind is null then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_text := btrim(left(coalesce(p_question->>'text', ''), 200));
  if v_text = '' then
    raise exception 'a question needs its text' using errcode = '22023';
  end if;
  -- The snapshot in the guard's own normal form, so comparing it with the stored one is fair.
  if v_kind in ('open', 'word') then
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

  -- R1: one press at a time per production (NO KEY UPDATE: see 0111, R22).
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
      'mode', case v_kind when 'open' then 'question' when 'word' then 'word' else 'poll' end,
      'prompt', v_text,
      'round', v_round.id,
      'question', v_id,
      'rev', coalesce((s.audience_state->>'rev')::int, 0) + 1
    ) where s.id = v_show;
  return public.audience_round_json(v_round);
end $$;

-- ══ 3. The phone's send: an answer, or one word ═════════════════════════════════════════════
create or replace function public.audience_submit(
  p_join_slug text, p_device text, p_author text, p_body text, p_round uuid, p_revision int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_owner uuid;
  v_round uuid;
  v_kind  text;
  v_body  text := p_body;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null or public.feature_denied_for(v_owner, 'audience') then
    raise exception 'that message could not be sent' using errcode = 'check_violation';
  end if;
  -- FOR SHARE (0111, R6): a Go live or Stop closing this round waits for this send, or this send
  -- waits for it and then finds the round closed.
  select r.id, r.kind into v_round, v_kind from public.audience_rounds r
    where r.id = p_round and r.show_id = v_show and r.kind in ('open', 'word')
      and r.closed_at is null and r.revision = p_revision
    for share;
  if v_round is null then
    raise exception 'that question has closed' using errcode = 'check_violation';
  end if;
  if v_kind = 'word' then
    -- W2: one word, no space and no line divider inside, at most 25 characters. The spaces are the
    -- ones the phone refuses (JavaScript's \s, model/wordCloud.ts), listed by code point because
    -- what [:space:] covers depends on the database's locale.
    v_body := btrim(coalesce(p_body, ''));
    if v_body = '' or char_length(v_body) > 25
       or v_body ~ ('[[:space:]|[:cntrl:]' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202)
                    || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']') then
      raise exception 'that message could not be sent' using errcode = 'check_violation';
    end if;
    -- W3: one word per phone per question. The lock makes two sends from one phone take turns,
    -- so the second always sees the first.
    perform pg_advisory_xact_lock(hashtextextended('audience-word:' || v_round::text || ':' || coalesce(p_device, ''), 0));
    if exists (select 1 from public.audience_submissions x
                where x.round_id = v_round and x.device_token = p_device) then
      raise exception 'you have already sent your word' using errcode = 'check_violation';
    end if;
  end if;
  begin
    insert into public.audience_submissions (show_id, author, body, device_token, round_id)
      values (v_show, case when v_kind = 'word' then '' else p_author end, v_body, p_device, v_round);
  exception when others then
    raise exception 'that message could not be sent' using errcode = 'check_violation';
  end;
end $$;

-- ══ 4. The submission guard: words have their own burst cap (W4) ════════════════════════════
-- 0095's guard, unchanged for a message; a word counts against its round's cap instead of the
-- production's message throttle, and the message throttle no longer counts words.
create or replace function public.audience_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent_show   int;
  recent_device int;
  recent_round  int;
  bad           text;
  operator_row  boolean := coalesce(current_setting('noacg.audience_operator', true), '') = 'on';
  word_row      boolean := new.round_id is not null and exists (
    select 1 from public.audience_rounds r where r.id = new.round_id and r.kind = 'word');
begin
  if new.device_token !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'invalid device' using errcode = 'check_violation';
  end if;
  new.author := btrim(left(coalesce(new.author, ''), 40));
  new.body   := btrim(left(coalesce(new.body, ''), 500));
  if new.body = '' then
    raise exception 'nothing to send' using errcode = 'check_violation';
  end if;
  new.external_id := nullif(btrim(left(coalesce(new.external_id, ''), 200)), '');
  new.source      := nullif(btrim(left(coalesce(new.source, ''), 60)), '');
  new.reference   := nullif(btrim(left(coalesce(new.reference, ''), 200)), '');

  if not operator_row then
    if new.device_token like 'operator\_%' then
      raise exception 'invalid device' using errcode = 'check_violation';
    end if;
    if word_row then
      select count(*) into recent_round from public.audience_submissions x
        where x.round_id = new.round_id and x.created_at > now() - interval '10 seconds';
      if recent_round >= 300 then
        raise exception 'too many messages' using errcode = 'check_violation';
      end if;
    else
      select count(*) into recent_show from public.audience_submissions x
        where x.show_id = new.show_id and x.created_at > now() - interval '10 seconds'
          and x.device_token not like 'operator\_%'
          and not exists (select 1 from public.audience_rounds r where r.id = x.round_id and r.kind = 'word');
      if recent_show >= 20 then
        raise exception 'too many messages' using errcode = 'check_violation';
      end if;
    end if;
    select count(*) into recent_device from public.audience_submissions x
      where x.show_id = new.show_id and x.device_token = new.device_token
        and x.created_at > now() - interval '30 seconds';
    if recent_device >= 3 then
      raise exception 'too many messages' using errcode = 'check_violation';
    end if;
  end if;

  for bad in select b.word from public.chat_blocklist b loop
    new.body := regexp_replace(new.body, bad, repeat('*', char_length(bad)), 'gi');
  end loop;

  new.broadcast_author := new.author;
  new.broadcast_body   := new.body;
  new.status           := 'new';
  new.shortlisted      := false;
  new.used_at          := null;
  new.skipped_at       := null;
  new.moderated_at     := null;
  return new;
end $$;
revoke execute on function public.audience_guard() from public, anon, authenticated;

-- ══ 5. The join resolve: this phone's messages carry their round (W5) ═══════════════════════
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
    select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'createdAt', x.created_at, 'roundId', x.round_id)
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

-- ══ 6. The operator's word count (W1) ═══════════════════════════════════════════════════════
-- A Word round's words, counted per exact spelling over every word filed under it, first arrival
-- first: [{ word, count }]. One jsonb value rather than a set of rows, because PostgREST caps a
-- set at a page (`max_rows`) and the operator's message list is such a set: a big room's later
-- words would be missing from the cloud. Grouping by case is the page's (model/wordCloud.ts).
create or replace function public.audience_word_counts(p_slug text, p_round uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if not exists (select 1 from public.audience_rounds r where r.id = p_round and r.show_id = v_show) then
    raise exception 'unknown round';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('word', w.body, 'count', w.n) order by w.first_at, w.body)
    from (
      select x.body, count(*) as n, min(x.created_at) as first_at
        from public.audience_submissions x
       where x.round_id = p_round
       group by x.body
    ) as w
  ), '[]'::jsonb);
end $$;
revoke execute on function public.audience_word_counts(text, uuid) from public;
grant execute on function public.audience_word_counts(text, uuid) to anon, authenticated;

-- ══ 7. Prove it by calling it ═══════════════════════════════════════════════════════════════
-- A throwaway production against a real owner, walked through a Word question, then removed.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0114-4000-8000-000000000114';
  v_slug  text;
  v_join  text;
  v_word  jsonb;
  v_open  jsonb;
  v_fail  boolean;
  v_msg   text;
  v_row   record;
  g       int;
begin
  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'audience') limit 1;
  if v_owner is null then
    raise notice '0114 self-check skipped: no account here may use the audience feature';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Word questions self-check');
  select s.slug, s.join_slug into v_slug, v_join from public.control_shows s where s.id = v_show;

  v_word := public.audience_go_live(v_slug, '{"id":"q-word","type":"word","text":"One word for tonight?"}');
  if v_word->>'kind' <> 'word' or v_word->'options' <> '[]'::jsonb
     or (select s.audience_state->>'mode' from public.control_shows s where s.id = v_show) <> 'word' then
    raise exception '0114 self-check failed: Go live made %', v_word;
  end if;

  -- One word, trimmed (W2).
  perform public.audience_submit(v_join, 'device-word-0114a', 'Ana', '  Brilliant ', (v_word->>'id')::uuid, 1);
  if not exists (select 1 from public.audience_submissions x
                  where x.round_id = (v_word->>'id')::uuid and x.body = 'Brilliant' and x.author = '') then
    raise exception '0114 self-check failed: the word was not filed as sent';
  end if;

  -- A second word from the same phone is refused (W3).
  begin
    perform public.audience_submit(v_join, 'device-word-0114a', '', 'Again', (v_word->>'id')::uuid, 1);
    v_fail := false;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    v_fail := v_msg = 'you have already sent your word';
  end;
  if not v_fail then
    raise exception '0114 self-check failed: a second word from one phone was not refused';
  end if;

  -- Two words, 26 characters and the line divider are refused; 25 characters are taken (W2).
  foreach v_msg in array array['two words', repeat('x', 26), 'a|b', 'a' || chr(160) || 'b', 'a' || chr(12288) || 'b'] loop
    begin
      perform public.audience_submit(v_join, 'device-word-0114b', '', v_msg, (v_word->>'id')::uuid, 1);
      v_fail := false;
    exception when check_violation then
      v_fail := true;
    end;
    if not v_fail then
      raise exception '0114 self-check failed: "%" was taken as one word', v_msg;
    end if;
  end loop;
  perform public.audience_submit(v_join, 'device-word-0114b', '', repeat('y', 25), (v_word->>'id')::uuid, 1);

  -- The phone reads its own word under its round (W5).
  select * into v_row from public.audience_join_by_slug(v_join, 'device-word-0114a');
  if v_row.mine->0->>'roundId' <> v_word->>'id' or v_row.state->'round'->>'kind' <> 'word' then
    raise exception '0114 self-check failed: the join resolve gave %', row_to_json(v_row);
  end if;

  -- A room answering at once is not held to the 20-per-10-seconds message throttle (W4).
  for g in 1..30 loop
    perform public.audience_submit(v_join, 'device-word-0114-' || lpad(g::text, 3, '0'), '', 'Loud', (v_word->>'id')::uuid, 1);
  end loop;

  -- The operator's count covers every word, per spelling (W1).
  -- (As a set: in this one transaction every row has the same time, so arrival order ties.)
  if not (public.audience_word_counts(v_slug, (v_word->>'id')::uuid)
            @> '[{"word": "Brilliant", "count": 1}, {"word": "yyyyyyyyyyyyyyyyyyyyyyyyy", "count": 1}, {"word": "Loud", "count": 30}]'::jsonb
          and jsonb_array_length(public.audience_word_counts(v_slug, (v_word->>'id')::uuid)) = 3) then
    raise exception '0114 self-check failed: word counts %', public.audience_word_counts(v_slug, (v_word->>'id')::uuid);
  end if;

  -- An Open question going live takes a message at once: the words do not count against it.
  v_open := public.audience_go_live(v_slug, '{"id":"q-open","type":"open","text":"Ask us"}');
  perform public.audience_submit(v_join, 'device-open-0114', 'Ana', 'Hello there', (v_open->>'id')::uuid, 1);

  -- The Word round closed with it, and refuses as closed (R6).
  begin
    perform public.audience_submit(v_join, 'device-word-0114c', '', 'Late', (v_word->>'id')::uuid, 1);
    v_fail := false;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    v_fail := v_msg = 'that question has closed';
  end;
  if not v_fail then
    raise exception '0114 self-check failed: a word to a closed question was not refused as closed';
  end if;

  -- An Open question still takes a sentence (the word rule is the Word round's alone).
  perform public.audience_submit(v_join, 'device-open-0114b', '', 'Two words or more', (v_open->>'id')::uuid, 1);
  perform public.audience_stop(v_slug, (v_open->>'id')::uuid);

  -- Clear results removes the words (R9).
  perform public.audience_clear_results(v_slug, 'q-word');
  if exists (select 1 from public.audience_submissions x where x.round_id = (v_word->>'id')::uuid) then
    raise exception '0114 self-check failed: clear results left words';
  end if;

  delete from public.control_shows s where s.id = v_show;
end $$;
