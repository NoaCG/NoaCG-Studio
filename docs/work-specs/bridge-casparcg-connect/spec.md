# Connecting NoaCG Bridge to CasparCG without retyping the server

## Problem and authority

The owner's studio test on 2026-09-30 (studio laptop, NoaCG Bridge 0.6.0, CasparCG on another
computer) worked, but every session repeats the same walk: after Bridge pairs with the browser, open
the production's Playout settings, go and find the CasparCG server's IP, type it, test the
connection, then open the output links and press Put on air. The IP is typed again whenever the
browser forgets its storage, which Firefox on that laptop did every session (Chrome is used there
now).

Owner requirements (session prompt, 2026-09-30):

- (a) Right after pairing, the same window offers the next step: connecting to the CasparCG server,
  with an IP field filled with the last server used and the servers used before to pick from.
- (b) A familiar server is remembered, and connects automatically when Bridge pairs; at minimum the
  IP is never retyped.
- (c) Putting the output on air stays ONE click and is never automatic: a reconnect in the middle of
  a show must never send PLAY over a layer.
- (d) The Playout settings keep Test connection and gain Connect and Put on air beside it.
- Bridge rules stand (docs/BRIDGE.md; docs/work-specs/playout-runtime-reliability/spec.md decision
  2): loopback only, and nothing installed or configured on the CasparCG machine.

Owner decisions (asked in this session, 2026-09-30):

1. **Servers are remembered by Bridge, on disk**, in its own config next to its token, so any
   browser that pairs gets them back. This changes the documented rule that Bridge stores nothing
   but its token; the list is not a credential and never leaves the laptop.
2. **After pairing, NoaCG connects to the last server by itself** when it answers. Connecting is a
   `VERSION` call and nothing else.
3. **The pairing window ends at Open NoaCG.** Put on air stays in the production (its Playout dialog
   and its links), where the operator sees what is on air.

## Behaviour

- Bridge keeps `caspar-servers.json` in its config directory: the CasparCG servers the page
  CONNECTED to, most recent first, at most eight, host and port only. It is written only by a
  Connect, never by a Test or by the status poll, and Bridge never contacts a server on its own
  because of it.
- Bridge answers two new token-guarded routes and advertises them as the `servers` feature on
  `/health`: `/servers` (the list) and `/connect` (the same `VERSION` round trip as `/status`, and
  on success the server moves to the top of the list).
- The pairing page, once paired: reads the list; if the last server answers, it is connected and
  saved as the studio's server, and the page says so with a Change control; otherwise it shows the
  IP and port filled with the last server (or the browser's own), the others as choices, and Connect.
- The Playout settings: the CasparCG server field offers the remembered servers; beside Test
  connection sit Connect (verify, save, remember) and, when opened from a production, Put on air for
  that production's output (disabled until the production is started).
- With an older Bridge (no `servers` feature) everything still works: Connect is a Test, and the
  only server offered is the one this browser holds.

Preserved: Test connection is unchanged and remembers nothing. Put on air and Take off in the links
are unchanged. No command other than `VERSION` is ever sent without a press, and none of this runs
on the CasparCG machine.

Non-goals: finding servers on the network (BRIDGE.md milestone 2), forgetting a remembered server
from the UI, Put on air from the pairing window, starting Bridge with Windows.

### AC-1: Bridge remembers a server it connected to, across restarts

`/connect` to a server that answers returns its version and puts it first in `/servers`; a restarted
Bridge lists it again; `/status` and a refused `/connect` change nothing; the list keeps at most
eight, newest first, and a malformed file reads as empty rather than stopping Bridge.

### AC-2: Pairing connects to the last server by itself

After pairing with a Bridge that remembers a server which answers, the pairing page says it is
connected to that CasparCG version and address without a further press, and the browser's Playout
settings name that server.

### AC-3: Pairing offers the next step when it cannot connect by itself

With no remembered server, or one that does not answer, the pairing page shows the IP field filled
with the last server used and the other servers to pick from; Connect with a server that answers
shows it connected and remembers it.

### AC-4: Playout settings offer Connect and Put on air beside Test connection

Opened from a started production, the Playout dialog's Put on air sends one take of that
production's output to the graphics channel and layer and says where it went; the host field
offers the remembered servers; Test connection remembers nothing.

### AC-5: Nothing airs by itself

Pairing, auto-connect, Connect, a Bridge restart and the status poll send no PLAY, LOAD or STOP;
only a press of Put on air (or a cue) does.

### AC-6: Real servers, real pairing

With CasparCG 2.3 and 2.5.0 started from scratch configurations on the command line, a real Bridge
built from this branch pairs with a real browser, connects by itself on the second pairing, and Put
on air puts the output on the layer (INFO shows the HTML producer there) on both versions.

### AC-7: A Bridge release carries it

`cli/package.json` and `BRIDGE_CHANGELOG.md` say 0.7.0, and the release workflow can publish
`NoaCG-Bridge-0.7.0.exe` from `main`.
