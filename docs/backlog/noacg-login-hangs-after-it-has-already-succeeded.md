# `noacg login` finished its work and then hung for 15 minutes, saying nothing

**Filed:** 2026-09-10. **Source:** measurement, the live save leg of `docs/DEMO_2026-09-25.md` §7
row 8 (jobs `j-0918`, `j-0921`, `j-0929`).

## Why

`noacg login` is the one step of the agent road that needs a human to click something. On the 25th
a room follows R2.4 along on their own machines. Observed on 2026-09-10 against `noacg.studio`:
the login completed successfully - the key was minted and stored - and the process then **sat for
923 seconds without exiting and without the terminal saying anything**, until it was killed. The
person watching that terminal has no way to tell a finished login from a broken one, and the
reasonable thing for them to do, Ctrl-C, is exactly wrong.

It also defeats the CLI's own safety net. `cli/src/commands/login.ts` sets `DEFAULT_WAIT_SEC = 300`
and a timer that closes the server and reports *"No reply from the browser within 300 s - run
`noacg login` again."* At 923 s that message had not appeared either, so both the success path and
the giving-up path end in the same silence.

## What it would take

The likely mechanism, worth testing before anything is changed: **`server.close()` does not destroy
established keep-alive connections.** The callback page the CLI itself serves stays open in the
user's browser and holds one, so the HTTP server never finishes closing and the event loop never
drains. Both close paths are affected - the 200 ms one after a successful handoff
(`login.ts:101`) and the timeout one (`login.ts:112`).

If that is it, the fix is small: track the sockets, or call `server.closeAllConnections()`
alongside `close()`, in both paths. Then confirm the success line actually reaches the person.

Two things to pin afterwards, because neither is covered today: a login whose code never arrives
exits non-zero within its wait and prints the giving-up message, and a login that succeeds exits 0
promptly with the browser tab still open.

## Evidence

**What made this look like a different bug at first, and is worth knowing.** The first reading of
`j-0918` was "the CLI never received the code", because the captured output ended on "Waiting for
you to allow access…". That was wrong twice over. The driver concatenated `stdout + stderr` and
printed the last three lines, so it printed the tail of STDERR only - and `login` writes its
progress lines through `out.log()`, which `cli/src/output.ts` sends to stderr always, while the
success line goes through `out.say()` to stdout. The success line was never in view.

What settled it was `j-0929`, which listed the account's agent keys through the real Settings UI
two hours later: **two rows, one of them `noacg CLI on Legion-001`, `noacg_ak_d3143c…`, created
that day, "last used never"**. That is the default name `login` gives a key on this machine, and
nothing else could have created it. So the consent code arrived, the redeem succeeded and the key
was stored; only the exit did not happen. "Last used never" fits exactly: `j-0918` died before it
reached `save`.

The product half is healthy and was measured separately (`j-0921`): driving the same production
consent page with an independent listener, `GET /callback` and `POST /complete` both arrived, the
state matched, the code was present, and redeeming it returned 201 with scopes
`["graphics:create"]`.

Both keys were revoked afterwards through Settings -> Account -> Agent access, which loads in about
2 seconds and answers 200 on the revoke. That section is fine.
