# Unpublish and republish with a renderer open: a new epoch, and the renderer follows it

2026-09-30, preview branch B. Never production.

## What ran

Job j-2462, scenario `epoch` of the scratch script `step2/verify-b.mjs` (session scratchpad),
through the preview-branch wrapper with `branch-b.env`, this branch's app.

- A production "p6-step2 epoch probe" was created with the harness payload; a new
  `/output?...&debug=1` booted on it and followed.
- A Take went to it through `control_send_seq` as anon (a fresh sender, base = the server's
  revision), then an Out.
- The production was unpublished and published again under the same id in one Management API
  transaction: the row copied aside, deleted (cascading its log and its head), and inserted back
  with the same columns, as a republish after an unpublish keeps the id and, through the identity
  table (0040), the same slugs and topic.
- A Take went to it again the same way; 4 s later the renderer and the server were read.

## What was observed

- After the delete the production had 0 heads; the slug came back unchanged.
- The first Take was accepted (entrance 1, graphic up). The second Take was accepted too: a new
  head with a new epoch (`4270bcb8...` before, `d24eba6a...` after), its rows numbered from 1.
- The open renderer followed the new log without a reload: its debug line read "protocol:
  numbered log (proto 2), republished: following the new log from its start" and "last row: 4 (id
  521)"; it animated the second entrance (2 in all) and the graphic was up.

## Limitations

- The republish was done in SQL, not through the app's Publish button: what matters to the
  follower (the same id and topic, a head deleted by cascade and created again) is the same, but
  the app's publish path itself was not walked here.
- An operator page open across the republish was not in this run; its session learns the new
  epoch from the next frame or answer (`scripts/seq-send.test.mjs`), and a press made against the
  old epoch is refused as stale (0070's self-check).
