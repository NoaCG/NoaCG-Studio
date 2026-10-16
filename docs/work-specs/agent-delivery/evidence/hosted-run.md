# Agent delivery hosted run (AC-10, AC-11)

Date: 2026-10-16, 06:04 to 07:30 UTC. The run that `final-check.md` names as missing: a coding-agent
session given only the Downloads prompt, with no plugin and a clean configuration, against hosted
noacg.studio, with a new account, a novel brief and a person opening the results. No credential,
key, account address or customer material is recorded here. The account was new and disposable,
made for this run by the owner in a private browser window.

## Setup

- Deployment: https://noacg.studio, `noacg doctor` bridge `main@36380004a8`. npm `latest` was
  `@noacg/cli@0.12.0` at the start of the run and `0.12.1` (#1287) at its end.
- Agent: Claude Code 2.1.296, headless (`claude -p`, one `--resume` per user turn, stream-json
  log), model `claude-sonnet-5-5` (the default with no user settings), on Windows 10, run in an
  empty folder. Flags: `--setting-sources local --strict-mcp-config --disable-slash-commands`,
  tools Bash, Read, Write, Edit, Glob, Grep and WebFetch allowed. HOME, USERPROFILE, APPDATA,
  LOCALAPPDATA and the npm cache pointed at new empty folders, and every `NOACG_*` variable was
  unset. The Claude config directory was the operator's own, used for sign-in only.
- A probe session with the same setup reported no skills, no MCP servers, no slash commands, no
  CLAUDE.md or memory, and only Claude Code's built-in plugins. The `noacg` plugin was not loaded.
- Prompt: copied from the live `/downloads#cli-prompt` block, 77 words, pinned to
  `@noacg/cli@0.12.0`, sent unchanged as the first message.
- Brief (second message, novel): a regional choir contest, the "Lakeside Choir Cup". It asks for a
  name strap (choir, conductor, home town), a score bug in a top corner (choir and a jury score
  out of 100), and a full-screen "Up next" card (next choir and song), in dark navy with a warm
  gold accent, plus a production "Lakeside Choir Cup" with the running order Up next, name strap,
  score bug.

## Observed, in order

1. **Early consent.** Before asking what to make, the agent ran `doctor`, `docs skill` and
   `whoami` (exit 1, not logged in), said it was starting login, and ran `login`. `doctor`
   reported the deployment, Edge, the fresh config folder and "not logged in". It also reported
   the `noacg` plugin installed in the operator's Claude config (0.3.4, not loaded in this
   session) as older than the CLI.
2. **Defect: the browser did not open on Windows.** `login` printed the consent link, then "Could
   not open a browser here", and timed out after 300 s. The agent reported that the login timed
   out, that nothing was connected or saved, and offered a retry or local-only work. Cause:
   `cmd /c start "" <url>` lets cmd.exe split the URL at its first `&`. The browser received only
   `/app?agent=<state>`, which the app correctly refused ("This is not a valid agent request ...
   missing ... its loopback port, its challenge"). This had been present since login was added
   (fcfba3557). Fixed in 0.12.1 (#1287, merged 06:56 UTC): Windows now opens the link through
   `rundll32 url.dll,FileProtocolHandler` with the arguments passed unparsed.
3. **Consent through the printed link.** Asked to retry, the agent ran `login` once more in the
   foreground, which timed out the same way. It then ran `login` in the background, read its
   output and printed the link at once. That link expired before it reached the owner (the
   operator relayed it too late), so it did the same again, and this link was approved by the owner in the private window where the new account was signed in. `login`
   then answered "Logged in to https://noacg.studio as <the new account> ... can save graphics to
   that account's library and make productions of them; it cannot publish or play anything". The
   tab said "Done", but its text still claimed the key "can only save graphics", which was wrong
   since 0.12.0. That text was also fixed in 0.12.1.
4. **Build and visual validation.** The agent scaffolded three graphics with `scaffold --fields`,
   restyled them, ran `validate --screenshots` on each, read the on-air, stress and off frames,
   and re-rendered after its own fixes. It fixed a field-number mismatch and a lost backslash in a
   regular expression that kept the score chip hidden, both found by looking at the frames. It ran
   `inspect` to check the operator panels. In the final frames: the Up next card is navy with a
   gold rule, "UP NEXT", the choir in large type and the song in italics. The strap is a navy
   plate with a gold edge, the event, the choir, the conductor and the home town. The score bug
   sits top right with the event, the choir and a gold "87 /100" chip. Each frame carries the
   brief's content. Minor: the score chip sits a few pixels lower than the navy plate.
5. **One save.** A single command, `save ./up-next ./choir-strap ./score-bug --production
   "Lakeside Choir Cup" --rundown ./rundown.json --layer 10,20,21`. It validated all three (0
   errors; one warning, `legibility-size` for the score bug's 24px caption), then: "Saved 3
   graphics and the production ... in one delivery". The output gave four links and named the new
   account and noacg.studio, "(confirmed by reading it back from the account)". The agent's
   answer listed the links, put the warning and the engine notes under Validation apart from the
   delivery, and said "The links were not opened in a browser, and nothing is published or on
   air".
6. **Uncertain answer.** Told that the laptop slept during the save, the agent first checked
   read-only with `status <operation>` and `status` on each id. It reported "Your save did
   finish ... I created nothing" and said a re-run of the same `save` would resume and not copy.
   Its line that each graphic id was "confirmed individually" overstates that output, which
   printed only the production line. Asked to run the same save again, it got "Resuming 3 graphics
   and the production ... under operation <same id>" and "Already saved under this operation -
   nothing new was saved", with the same four ids, and reported that no copies were made.
7. **Readback counts.** The new account's Home, in the private window: Graphics (3), Productions
   (1). The three graphics are "Up next card", "Choir name strap" and "Choir score bug", each
   tagged "Lakeside Choir Cup".
8. **Every link in a fresh browser.** The Claude app's browser pane took no part in sign-up,
   consent or the save. Signed out, the strap link showed "Sign in to open this panel / This
   graphic is saved in an account", with nothing of the graphic. After the owner signed in there
   as the new account: the production link opened the production with "Not published", nothing on
   air and the cue rundown Up next (G10), Name strap (G20), Score bug (G21) in order, and each
   graphic link opened that graphic's control panel.
9. **Wrong account.** In the owner's main browser, signed in as the owner's own account, the score
   bug link showed "Opening... Looking for this graphic in your account" for over 20 s (the
   lookup waits for a sync pass, up to 60 s, `src/backend/graphicWhenSynced.ts`). It then showed
   "Graphic not found ... You are signed in as <the owner's account>", with nothing of the
   graphic.
10. **Cancelled consent, on 0.12.1.** `npx -y @noacg/cli@0.12.1 login` with its own empty key
    store printed the link, the new line "The link works in any browser on this computer that is
    signed in to the NoaCG account you want to connect", and "Opened your browser". The owner's
    default browser showed the full consent card, naming the account it was signed in to, with
    both scope lines. Don't allow returned "Access was not allowed in the browser - nothing was
    granted", exit 1, and left the key store empty.
11. **Logout.** `logout` answered "Revoked and forgot the key", then `whoami` returned exit 1, not
    logged in.

The agent's session cost USD 1.43 over the whole run (40 tool rounds in the build turn).

## Found, outside the criteria' wording

- Signed out, a production link says "This production no longer exists" while a graphic link
  offers sign-in. A fix is a separate pull request.
- The wrong-account "not found" answer took more than 20 s on an account with a large library.
- Running a blocking `login` in a headless agent hides the link until the command ends. The agent
  worked around it by running `login` in the background. An interactive session shows output
  live.

## Per criterion

- AC-10: pass. A clean agent environment with no plugin, given the Downloads prompt as published,
  connected a new account on hosted noacg.studio, built and validated the novel three-graphic set
  with a production, delivered it in one save, and every promised link opened in a fresh browser
  signed in as that account. Warnings were reported apart from delivery. The published CLI, skill,
  docs and pins agree (`final-check.md` for 0.12.0; the 0.12.1 release passed `build-skill
  --check` and the release-notes check, and `/downloads` now shows the same 77-word prompt pinned
  to 0.12.1). The Windows browser-open defect this run found is fixed in 0.12.1 and was verified
  live in step 10. The run itself used 0.12.0 through the printed link.
- AC-11: pass. The agent's receipts tell saved (read back) apart from browser-opened. Pending
  install did not arise, because no package was used. The person-opened results, the
  wrong-account open, cancelled consent and the uncertain-response repeat ran here against the
  hosted backend. Failed loading and legacy pending-package recovery rest on the configured run
  38833457342 with the published package (`final-check.md`), not on this run.
- AC-1 to AC-9: pass, on the evidence in `final-check.md`. The code that changed between that
  review and this revision is the 0.12.1 browser opener and texts (#1287), a session hook guard
  (#1285), landing and queue tooling (#1284, #1286), an editor spec's quarantine entry (#1288) and
  the traced spec map (#1282); none of it touches the Home, auth, delivery or production paths those criteria test. Steps 1 to 9
  above re-observed AC-3, AC-4, AC-6, AC-7 and AC-8 on hosted noacg.studio.

## Limits and cleanup

One run, one agent (Claude Code with Sonnet 5.5), one Windows machine. It is not a production-proven
claim. The agent key was revoked by `logout` (step 11). The new account and the graphics and
production it owns are removed by the owner. The app has no self-serve account deletion, and this
run read no service key.
