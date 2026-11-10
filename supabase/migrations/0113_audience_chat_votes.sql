-- CHAT VOTES (docs/work-specs/interaction/spec.md, "Chat votes"; phase 4, AC-10; the Rules C1 to C10
-- in that spec's phase notes).
--
-- While a Multiple choice question is live, a YouTube or Twitch chat line that is only an option's
-- number or letter is a vote. The operator's page reads the chat (as it does today) and sends the
-- votes here, through the control slug, at most 500 a call.
--
-- What this file adds:
--   * `audience_votes.source` ('phone' or 'chat') and `cast_at` (the platform's own time of a chat
--     vote; null for a phone's). A chat voter is `yt:<channel id>` or `tw:<user id>`, never a name;
--     a phone's token cannot hold a colon, so the two can never be the same row (C2);
--   * the vote guard: a phone keeps 0035's burst cap, counted over phone votes only, so a chat burst
--     never crowds phones out; a chat vote is bounded by `audience_operator_votes` instead (C8);
--   * `audience_operator_votes(slug, round, items)`: counts each voter's latest vote by platform time
--     into an open Multiple choice round, and only votes timestamped after the round last went live
--     (C4 to C7). It never touches the message throttle (0035's 20 per 10 seconds is on
--     `audience_submissions`, which this does not write);
--   * `audience_tally` also returns the phone and chat counts apart (C9). Its first three columns are
--     unchanged, so a page from before this change reads it as before. A table function's columns
--     cannot change in place, so it is dropped and recreated here.
--
-- Nothing here writes to `control_events`: nothing reaches air.
--
-- Additive for the app: the columns default to what every existing vote is, the phone functions keep
-- their signatures, and the tally keeps its columns. Revert: `git revert` the app; the columns and
-- the function can stay, since nothing older reads them.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ══ 1. Columns ══════════════════════════════════════════════════════════════════════════════
alter table public.audience_votes
  add column if not exists source  text not null default 'phone',
  add column if not exists cast_at timestamptz;

alter table public.audience_votes drop constraint if exists audience_votes_source_check;
alter table public.audience_votes add constraint audience_votes_source_check
  check (source in ('phone', 'chat')) not valid;
alter table public.audience_votes validate constraint audience_votes_source_check;

-- ══ 2. The vote guard: who a voter can be, and each source's own limit ══════════════════════
create or replace function public.audience_vote_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  count_options int;
  is_open       boolean;
  recent        int;
begin
  if new.source = 'chat' then
    -- C2: a platform's own user id, never a display name.
    if new.device_token !~ '^(yt|tw):[A-Za-z0-9_-]{1,120}$' or new.cast_at is null then
      raise exception 'that vote could not be counted' using errcode = 'check_violation';
    end if;
  elsif new.device_token !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  select jsonb_array_length(r.options), r.closed_at is null
    into count_options, is_open
    from public.audience_rounds r where r.id = new.round_id;
  if count_options is null or not is_open
     or new.option_index < 0 or new.option_index >= count_options then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  -- 0035's burst cap, for phones and over phones only (C8).
  if new.source = 'phone' then
    select count(*) into recent from public.audience_votes
      where round_id = new.round_id and source = 'phone' and updated_at > now() - interval '10 seconds';
    if recent >= 300 then
      raise exception 'that vote could not be counted' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.audience_vote_guard() from public, anon, authenticated;

-- ══ 3. The operator's door for chat votes ═══════════════════════════════════════════════════
-- `p_items` is a list of { voter, option, at }: `voter` is `yt:<channel id>` or `tw:<user id>`,
-- `option` the option's index, `at` the platform's time of the message. Returns how many were
-- counted. Refused as "that question has closed" unless `p_round` is this production's open
-- Multiple choice round (C5).
create or replace function public.audience_operator_votes(p_slug text, p_round uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_show    uuid;
  v_round   public.audience_rounds%rowtype;
  v_from    timestamptz;
  v_counted int := 0;
  v_recent  int;
  v_rows    int;
  v_item    record;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'at most 500 votes at a time' using errcode = '22023';
  end if;
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  -- A share lock, as a phone's send takes (R6): Go live, Stop and Clear results wait for it or are
  -- seen by it.
  select * into v_round from public.audience_rounds r
    where r.id = p_round and r.show_id = v_show and r.kind = 'poll' and r.closed_at is null
    for share;
  if v_round.id is null then
    raise exception 'that question has closed' using errcode = 'check_violation';
  end if;
  -- C8: chat's own ceiling, far above any burst a chat can make in ten seconds, and apart from the
  -- phones' and from the message throttle.
  select count(*) into v_recent from public.audience_votes v
    where v.round_id = v_round.id and v.source = 'chat' and v.updated_at > now() - interval '10 seconds';
  if v_recent >= 5000 then
    raise exception 'too many chat votes at once' using errcode = 'check_violation';
  end if;

  -- C6: only what was said after the question last went live, less one second for YouTube's
  -- whole-second times (measured in the recorded fixtures), and nothing from the future.
  v_from := v_round.opened_at - interval '1 second';

  -- C3, C4: per voter, the latest by platform time; in a call, the last of equal times. An item
  -- whose option or time cannot be read is skipped, never the whole call: each cast sits behind a
  -- CASE that checks the text first (a calendar day past the month's end included), since the
  -- planner may evaluate a WHERE condition before another.
  for v_item in
    select distinct on (x.voter) x.voter, x.opt, x.at
    from (
      select e.value->>'voter' as voter,
             case when e.value->>'option' ~ '^[0-9]{1,2}$' then (e.value->>'option')::int end as opt,
             case when e.value->>'at' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-][01][0-9]:[0-5][0-9])$'
                  then case when substr(e.value->>'at', 9, 2)::int <= extract(day from
                         make_date(substr(e.value->>'at', 1, 4)::int, substr(e.value->>'at', 6, 2)::int, 1)
                         + interval '1 month' - interval '1 day')
                       then (e.value->>'at')::timestamptz end
             end as at,
             e.ord
      from jsonb_array_elements(p_items) with ordinality as e(value, ord)
      where jsonb_typeof(e.value) = 'object'
        and coalesce(e.value->>'voter', '') ~ '^(yt|tw):[A-Za-z0-9_-]{1,120}$'
    ) as x
    where x.opt is not null and x.at is not null
      and x.at >= v_from and x.at <= now() + interval '1 minute'
      and x.opt < jsonb_array_length(v_round.options)
    order by x.voter, x.at desc, x.ord desc
  loop
    insert into public.audience_votes as v (round_id, device_token, option_index, source, cast_at)
      values (v_round.id, v_item.voter, v_item.opt, 'chat', v_item.at)
      on conflict (round_id, device_token) do update
        set option_index = excluded.option_index, cast_at = excluded.cast_at, updated_at = now()
        -- C4: an older message never overwrites a newer one, whatever order they arrive in.
        where v.source = 'chat' and v.cast_at <= excluded.cast_at;
    get diagnostics v_rows = row_count;
    v_counted := v_counted + v_rows;
  end loop;
  return v_counted;
end $$;
revoke execute on function public.audience_operator_votes(text, uuid, jsonb) from public;
grant execute on function public.audience_operator_votes(text, uuid, jsonb) to anon, authenticated;

-- ══ 4. The tally, with phone and chat apart (C9) ════════════════════════════════════════════
drop function if exists public.audience_tally(text, uuid);
create function public.audience_tally(p_slug text, p_round uuid)
returns table (round_id uuid, counts jsonb, total int, phone_counts jsonb, chat_counts jsonb)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show    uuid;
  v_options int;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  select jsonb_array_length(r.options) into v_options
    from public.audience_rounds r where r.id = p_round and r.show_id = v_show;
  if v_options is null then raise exception 'unknown round'; end if;
  round_id := p_round;
  -- One pass over the round's votes, grouped by option; an option nobody picked is a 0.
  select coalesce(jsonb_agg(coalesce(c.n_all, 0) order by i.i), '[]'::jsonb),
         coalesce(jsonb_agg(coalesce(c.n_phone, 0) order by i.i), '[]'::jsonb),
         coalesce(jsonb_agg(coalesce(c.n_chat, 0) order by i.i), '[]'::jsonb),
         coalesce(sum(c.n_all), 0)::int
    into counts, phone_counts, chat_counts, total
    from generate_series(0, v_options - 1) as i(i)
    left join (
      select v.option_index,
             count(*) as n_all,
             count(*) filter (where v.source = 'phone') as n_phone,
             count(*) filter (where v.source = 'chat') as n_chat
        from public.audience_votes v
       where v.round_id = p_round
       group by v.option_index
    ) as c on c.option_index = i.i;
  return next;
end $$;
revoke execute on function public.audience_tally(text, uuid) from public;
grant execute on function public.audience_tally(text, uuid) to anon, authenticated;

-- ══ 5. Prove it by calling it ═══════════════════════════════════════════════════════════════
-- A throwaway production against a real owner, walked through chat votes, then removed.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0113-4000-8000-000000000113';
  v_slug  text;
  v_join  text;
  v_round jsonb;
  v_other jsonb;
  v_n     int;
  v_t     record;
  v_items jsonb;
  v_now   timestamptz := now();
  v_fail  boolean;
begin
  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'audience') limit 1;
  if v_owner is null then
    raise notice '0113 self-check skipped: no account here may use the audience feature';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Chat votes self-check');
  select s.slug, s.join_slug into v_slug, v_join from public.control_shows s where s.id = v_show;

  v_round := public.audience_go_live(v_slug, '{"id":"q-chat","type":"choice","text":"Which?","options":["A","B","C"]}');
  perform public.audience_vote(v_join, 'device-one-0113', (v_round->>'id')::uuid, 0, 1);

  -- Once per voter, the latest by platform time; the earlier message arriving later loses (C3, C4).
  v_n := public.audience_operator_votes(v_slug, (v_round->>'id')::uuid, jsonb_build_array(
    jsonb_build_object('voter', 'yt:UCone', 'option', 1, 'at', v_now + interval '2 seconds'),
    jsonb_build_object('voter', 'yt:UCone', 'option', 2, 'at', v_now + interval '1 second'),
    jsonb_build_object('voter', 'tw:500001', 'option', 2, 'at', v_now + interval '1 second'),
    jsonb_build_object('voter', 'tw:500002', 'option', 0, 'at', v_now - interval '1 hour'),
    jsonb_build_object('voter', 'tw:500004', 'option', 0, 'at', '2026-02-30T00:00:00Z'),
    jsonb_build_object('voter', 'tw:500005', 'option', 'x', 'at', v_now)
  ));
  if v_n <> 2 then
    raise exception '0113 self-check failed: counted % chat votes, expected 2', v_n;
  end if;
  perform public.audience_operator_votes(v_slug, (v_round->>'id')::uuid, jsonb_build_array(
    jsonb_build_object('voter', 'yt:UCone', 'option', 0, 'at', v_now)
  ));
  select * into v_t from public.audience_tally(v_slug, (v_round->>'id')::uuid);
  if v_t.counts <> '[1,1,1]'::jsonb or v_t.phone_counts <> '[1,0,0]'::jsonb
     or v_t.chat_counts <> '[0,1,1]'::jsonb or v_t.total <> 3 then
    raise exception '0113 self-check failed: tally %', row_to_json(v_t);
  end if;

  -- 500 at once, past the phones' 300-per-10-seconds cap (C8).
  select jsonb_agg(jsonb_build_object('voter', 'tw:' || (900000 + g), 'option', g % 3, 'at', v_now))
    into v_items from generate_series(1, 500) g;
  v_n := public.audience_operator_votes(v_slug, (v_round->>'id')::uuid, v_items);
  if v_n <> 500 then
    raise exception '0113 self-check failed: a burst of 500 counted %', v_n;
  end if;

  -- A closed round refuses as closed (C5).
  v_other := public.audience_go_live(v_slug, '{"id":"q-open","type":"open","text":"Ask us"}');
  begin
    perform public.audience_operator_votes(v_slug, (v_round->>'id')::uuid, '[]'::jsonb);
    v_fail := false;
  exception when check_violation then
    v_fail := true;
  end;
  if not v_fail then
    raise exception '0113 self-check failed: chat votes to a closed round were accepted';
  end if;
  perform public.audience_stop(v_slug, (v_other->>'id')::uuid);

  delete from public.control_shows s where s.id = v_show;
end $$;
