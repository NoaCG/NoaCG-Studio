# The server half on a preview branch (AC-1, AC-2, AC-5, AC-6, AC-10, server side)

Run on 2026-10-02 from the owner's Windows 10 laptop, branch `claude/hardware-panel-server`.
The page's half (running a press through `onVerb`, publishing feedback) and the module against a
real page are not covered here.

## The backend

A temporary Supabase preview branch of the production project (`kprolrchuldgfrzspthy`), named
`hw-panel-relay` (ref `tyefsqusudalbwysqbhe`), created through the Management API for this run and
deleted after it. Never production. The branch came up at migration 0072.

- `npm run db:push -- --dry-run --ref tyefsqusudalbwysqbhe`: one pending file, `0073_panel_relay.sql`,
  classified LIVE-PATH (touches `control_shows`, `realtime.messages`) and nothing refused. Its first
  draft was refused for deleting from a table its self-check had not inserted into; that line was
  removed.
- 0073 was applied through the Management API's query endpoint (not db:push), after a throwaway
  confirmed test user was made on the branch, so the self-check's calls ran instead of skipping.
  It applied without error. Its traces: the shared failure bucket held exactly the self-check's two
  refused exchanges (`used-code`, `unknown-code`), and no key was left (they went with the throwaway
  production). `pg_policies` on `realtime.messages` then listed the three new policies beside the
  five existing ones.
- After the spec's first run, the relayed press's id moved from `id` to `press_id` (below), and
  0073 was applied again; it is re-runnable as written.

## The spec: `e2e/configured/panel-relay.spec.ts`

Through the job queue, `playwright.live.config.ts` with the branch's URL, publishable key, service
key and test account in the environment (a scratch wrapper), `--retries=0`.

- **j-2872, the first draft:** 2 passed, 1 flaky, 4 failed. Three causes, all fixed: Realtime puts
  its own message id at `id` in every payload the database broadcasts (`"id": "80eba7c6-..."`
  appeared in a `want`), which would have REPLACED the press id the page dedupes by, so the relay
  now sends `press_id` and protocol §5 says so; sequential presses take about 100 ms each, so 22 of
  them never exceed 20 in 2 s, and the burst is now 30 at once; a first private join came back
  `CHANNEL_ERROR` once, and the spec now rejoins as a page does.
- **j-2880:** 7 passed, 0 failed, no retries:
  1. a one-time code pairs a panel once (typed lower case with a space), lives 5 minutes, is refused
     `used-code`, `unknown-code` and, past its time, `expired-code`; the page lists the panel with
     its trimmed name; the key cannot read `panel_keys` (permission denied) and its answers carry
     neither the control slug nor the show id;
  2. with no answering page, hello says `answering: false`, a press is refused `no-page`, nothing
     reaches the press topic, and a page that answers afterwards hears only its own claim;
  3. a press reaches the answering page as exactly `{v, verb, target, seen, press_id, claim, panel}`
     (an extra field and a forged `claim` in the call were dropped), Realtime's own id beside it;
     hello makes the page hear `want`;
  4. foreign verbs (`paste`, `copy`, `folder-new`, `select-clear`, `drop-table`) are
     `not-a-panel-verb`; a bad target, a string or fractional `seen`, a bad id and a bare object are
     `bad-press`; a wrong key is `unknown-key`; 30 presses at once: at most 20 relayed, at least 10
     `slow-down`;
  5. a second claim is announced to the first page with its number and label, presses carry it, the
     replaced page's release changes nothing, the answering page's release stops presses (`no-page`);
  6. revoking one of two panels announces `rotated` with a new feedback topic; the revoked key's press
     and hello are refused `revoked`; the other key's hello gets the new topic and its press relays;
     the list shows only the other panel;
  7. a page's broadcast on the feedback topic reaches a panel; a client's broadcast on the press
     topic is answered `ok` by the socket and reaches nobody.
- **The relay's own hop**, press call to the page's receipt, 15 presses 150 ms apart:
  p50 67 ms, min 65 ms, max 164 ms (research §6.3 measured p50 68 ms for its stand-in).
- **Mutation, j-2881:** a temporary policy letting clients insert on `^pnp-` was added on the branch
  and test 7 run alone: it FAILED, the forged `press` arriving at the page's listener (expected
  `[]`, received an 11-line message). So the test is not vacuous. The policy was dropped afterwards
  and `pg_policies` confirmed it gone.

## /panel.json

`scripts/panelBackendPlugin.test.mjs`: the body names the app's own backend URL and publishable key
as `{v: 1, supabaseUrl, supabaseKey}`, and there is no file with no backend configured.
