---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# `noacg login` gives the terminal back

On 2026-09-10 against `noacg.studio`, `login` minted the key, stored it, printed "Logged in to…"
and then sat for 923 s until it was killed. A room full of people runs this command on their own
machines, and a person who cannot tell a finished login from a broken one runs it again and mints
a second key. `@noacg/cli` 0.3.3 ends that: the listener's sockets are dropped when it closes, so the
prompt comes back about a third of a second after you press Allow.

## Route, about a minute

From this worktree, once:

1. `npm --prefix cli run build` - 0.3.3 is not on npm yet, so `npx -y @noacg/cli` would still hand
   you the hanging 0.3.2. Row SE publishes it.
2. `node cli/dist/index.js login`. It prints a URL and opens your browser on the consent page.
3. Press **Allow**, then look back at the terminal. **Leave the browser tab open** - that tab is
   what used to hold the process.

## What to look at

- **The prompt comes back.** The success line ("Logged in to https://noacg.studio as …") appears
  and the shell is yours again, with the tab still open beside it. Before this change the line
  appeared and nothing else ever happened.
- **The line says how to take the key back**, in the same sentence: Settings → Account → Agent
  access, or `noacg logout`.
- **The giving-up path, if you want to see it**: `node cli/dist/index.js login --wait 10` and then
  close the consent tab without pressing Allow. Ten seconds later it prints "No reply from the
  browser within 10 s - run `noacg login` again." and exits. That message had never once been seen
  in the wild, because a successful handoff cancels its timer by design and the 923 s run never
  took this path.

Revoke whatever key you mint here in Settings → Account → Agent access, or with
`node cli/dist/index.js logout`.

## The numbers

Measured 2026-09-16, Windows 10, Node v24.13.0, against a stand-in deployment on loopback with a
browser-like socket held open across the handoff (`cli/test/unit.test.mjs`).

- **0.3 s** from the code arriving to exit 0, with the tab still open. Unfixed, on the same rig:
  still running when the test gave up, and it exited **100 ms** after the socket was released,
  which is the 923 s of 2026-09-10 in miniature - that number was the life of the browser tab.
- **6.0 s** for a `--wait 6` login that never hears back: exit 1, giving-up line on stdout. That
  wait is the test's own; the route above uses 10 s so you are not typing against a clock.
- **1.5 to 5.1 s** from Allow to exit 0 against `noacg.studio` itself, over seven driven runs of
  the real consent page the same day (`scripts/save-to-air-bench.mjs`). So the route above is one
  you can expect to behave, not a laboratory result.

## What it was, since it is not what the file said

`server.close()` closes connections that are IDLE in the HTTP sense - one that finished a message
and is waiting for the next. A browser also opens a speculative connection it never sends a request
on. That one has no finished message, so it is not idle, survives the close, and holds the event
loop; and nothing times it out, because closing the server also stops the interval that enforces
`headersTimeout` and `requestTimeout`. `closeAllConnections()` beside `close()`, on both the
success and the giving-up path, is the whole fix.
