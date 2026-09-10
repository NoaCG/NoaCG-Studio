# The link `noacg save` prints does not open the graphic on noacg.studio

**Filed:** 2026-09-10. **Source:** measurement, the live save leg of `docs/DEMO_2026-09-25.md` §7
row 8, run against production rather than a dev server.

## Why

Three things say the link opens the graphic, and on `noacg.studio` it does not.

- The beat, `docs/DEMO_2026-09-25.md` R2.4: "`noacg save` puts it in the library and prints a link
  that opens at once."
- `save`'s own output, printed to the person who just ran it: "It is in Home -> Graphics the next
  time the studio opens (**or at once on that link**)."
- `e2e/configured/agent-access.spec.ts` step 4, which asserts `hash === '#/graphic/<id>'` and the
  editor's store open on that id, with the comment "the deep link opens the graphic on first load
  (a miss while signed in runs one sync pass)". **It passes.**

It passes because that spec runs a LOCAL vite dev server against the real backend
(`playwright.live.config.ts`). Nothing in the repository exercises the deep link against the
deployed bundle, so the difference has been invisible.

It matters for the 25th because R2.4 is a beat a room full of people will follow along with. An
agent prints a link, everyone clicks it, and everyone lands on Home instead of on the graphic they
just made. The graphic IS there and IS correct - this is a routing disappointment, not data loss -
but the sentence we said out loud will have been wrong in front of them.

## What it would take

**Drive the third navigation shape first, because neither run below isolates the variable.** The
passing spec does `page.goto('/app#/graphic/<id>')` as a FULL document load while already signed
in. Of the two runs here, the warm tab was already in the app and then navigated to the link, which
on a hash URL is a same-document change that never re-runs boot; and the cold tab signed in on the
way, where landing on `#/home` after an auth redirect is ordinary behaviour. So the deployed-bundle
difference is not yet separated from the navigation-shape difference. **The shape that matters is
the student's**: a fresh tab opening the printed link in a browser that is already signed in. Drive
that against production before concluding anything.

Then find out which of these is true, because they need different fixes:

1. The deployed router rewrites `#/graphic/<id>` to `#/home` before the record resolves, and never
   comes back. The hash was `#/home` on the very first sample in both runs and never changed, which
   is weak evidence for this and the reason it is listed first.
2. The record is not resolvable at that moment on production and the miss path differs from the dev
   server's.
3. Neither: the link works in the shape a student uses, and both runs here measured their own
   navigation choices. This is a live possibility and checking it is cheap.

Then either fix the routing or change what we promise, in all three places above at once - the
beat, `save`'s printed line (`cli/src/commands/save.ts`), and the spec. **Whatever the fix, the
spec needs a sibling that runs against the DEPLOYED bundle**, or the same class of difference will
hide again.

## Evidence

Measured 2026-09-10 against `https://noacg.studio`, signed in as the E2E test account.

- `noacg save` returned exit 0 in 9.3 s and printed
  `https://noacg.studio/app#/graphic/76de10ef-cce8-46ec-b6ca-a4f1a49f7ed9`.
- **Warm tab** (already signed in, already in the app, then navigated to that link): polled
  `location.hash` every 250 ms for 25 s. Hashes seen, in order: `["#/home"]`. It never became
  `#/graphic/76de10ef-...`.
- **Cold tab** (fresh context, the link as its FIRST navigation, signing in on the way): polled for
  30 s, 61.2 s total from first navigation. Hashes seen, in order: `["#/home"]`. Same result.
- The graphic itself is fine: a screenshot of the warm tab shows it in Recent graphics, rendering
  its scoreboard correctly, with the topbar reading Synced. A looser earlier probe that waited for
  the graphic's NAME anywhere on the page succeeded in 5.0 s - which is how long the record takes
  to appear in the library, and is the number worth quoting.

The consent half of the same walk is healthy and was measured in the same session: the production
consent page minted a one-time code, the loopback listener received it, and
`POST /api/me/agent-keys` with `action: redeem` answered 201 with scopes `["graphics:create"]`.
