---
kind: hardware
date: 2026-09-25
serves: now
---
# Which browser for the Bridge, and the Firefox prompt that kept coming back

The Downloads page's Bridge card has a **Which browser** table: Chrome or Edge recommended,
Firefox supported, Safari not supported. Under it, a note explains why a browser can ask again
every day or in every tab. That happens on a shared machine set to forget site permissions. The
note names the browser policy that allows noacg.studio for good. When Firefox's prompt is
waiting, the studio now quotes Firefox's own words for it. Before, Firefox was misread as a
browser with no permission at all, and the message blamed Safari. The pairing page and Playout
settings link the note.

**Why the laptop asked twice**: `docs/BRIDGE.md` §1b-ff. Since version 153, Firefox asks before
a site may "access other apps and services on this device", which is the Bridge. On a profile
that deletes everything on close, Firefox can only keep that Allow for the tab that asked, and
only for about an hour. So the pairing tab asked, then the production tab asked again. This is
the browser's setting, not a Bridge defect. The fix belongs on the machine.

## The route, under a minute

1. https://noacg.studio/downloads#browsers - read the table and the note.
2. On the school laptop, whoever manages it adds this to Firefox's `policies.json` (in a
   `distribution` folder next to `firefox.exe`), or the matching Windows group policy:

   ```json
   { "policies": { "LocalNetworkAccess": { "SkipDomains": ["noacg.studio"] } } }
   ```

3. Restart Firefox, pair the Bridge, open a production, add a clip from the server.

## What to look at

- After step 2, no prompt appears at all, in any tab, on any day. That is the claim to confirm.
  It comes from Mozilla's policy reference and was not measured on that laptop.
- The browser still clears everything on close, and that includes this browser's Playout
  settings and its Bridge pairing, which live in site storage. So on that laptop the operator
  pairs again every day and re-types the CasparCG host. The policy removes the prompt, not that.
  If re-typing is a burden, the next step is the Bridge remembering the last server it was told
  about. That would be a Bridge change, not a browser one.

From branch `claude/noacg-bridge-feedback-cimjwc`. Pinned in `e2e/downloads.spec.ts` and
`e2e/bridge-connect.spec.ts`.
