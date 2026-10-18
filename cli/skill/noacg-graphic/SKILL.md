---
name: noacg-graphic
description: >-
  Make, critique or improve a broadcast graphic or show package (lower third, scoreboard,
  ticker, countdown, any on-air graphic) and save it to NoaCG. Use when the user names NoaCG,
  SPX, CasparCG or OGraf, wants graphics operated live, or asks what NoaCG can do.
---

# Make a NoaCG graphic

You are building a real broadcast graphic: HTML + CSS + JS that a playout system loads, an
operator drives from a control panel, and NoaCG saves, edits and plays out. Design it the way you
normally design - this skill tells you the CONTRACT the graphic must satisfy, how its FIELDS AND
BEHAVIOUR should work for the operator, the TOOLS that check it, and how it reaches the user's
library. It does not tell you how it should look: the look is yours, unless the user switches on
one of the two opt-in tools at the end of this file. If you were not told what the graphic is,
ask before starting.

## The loop

Before calling the CLI, follow `references/setup.md`: check Node, browser, deployment and
the installed CLI version against this package's reviewed pin. Use the pinned npm command
when the existing installation differs. This is a local workflow; ordinary Claude Chat
cannot execute the CLI.

**Connect before the brief.** Once per session, before you collect the brief or start building:
run `noacg doctor` once, then `noacg whoami` (both in the terminal; the MCP tool has no login).
A valid key is reused as it is. Otherwise tell the user a NoaCG page will open in their browser
(the link it prints works in any browser on this computer signed in to the account they want),
run `noacg login` and give it up to five minutes; the user approves it there, never you. If they
decline, the login times out or fails, carry on locally and say plainly that nothing will be
saved to their account; finish with the validated package folders (step 5's no-account route).
The account `login` and `whoami` name is the one the user approved in their browser; say it
once, and do not compare it with any other address you know for them.

**Offer a start.** When the user has not said what to make (or asks what NoaCG can do), ask with
these three example briefs, then the line under them, in the user's language:

- "A name strap and an opening title for our panel debate, in our brand from https://our-site.org"
- "A basketball scoreboard with +1/+2/+3 buttons and a game clock; our logo is logo.png in this folder"
- "A podcast set: guest strap, topic bar and a LIVE bug in purple and coral with DM Serif Display, as a production in show order"

"You can paste your website, put a logo or pictures in this folder, or name your colours and
fonts, and I will use them." A user who already gave a brief gets no examples.

1. **Start a package.** Either author from scratch against the contract below, or take a
   scaffold when it saves work or brings behaviour you need:
   - `noacg types` lists the graphic TYPES NoaCG knows (fields, operator events, designs). A type
     brings its STATE MACHINE and runtime - the scoreboard's flag/result events, a countdown's
     pause/resume. **A graphic that needs operator ACTIONS beyond Take/Update/Next/Out should
     START from its type**: a from-scratch graphic easily ends up carrying that state as extra
     fields instead of buttons - valid, but the operator cannot DO what the brief meant. When no
     type fits, AUTHOR the machine yourself - `references/contract.md` §5 has the shape, a worked
     example and the three gates below.
   - `noacg scaffold --type <id> --design neutral --out ./my-graphic` gives the type's fields,
     machine, controls and runtime on a plain spine (design it); `--design <id>` gives a proven
     catalog composition to restyle; `noacg scaffold --fields "Artist:text,Score:number,..."`
     gives a typeless graphic with exactly the fields you declare (the implicit lifecycle machine).
   A package is a folder: SOURCES you edit (`<slug>.html`, `css/template.css`, `js/template.js`,
   `images/`, `fonts/`) and GENERATED files you never edit (`<slug>.ograf.json`, `graphic.mjs`,
   `FIELDS.md`, `README.md`, `controlpanel.html`) - `noacg validate` regenerates them.
2. **Design and build.** Edit the sources with your ordinary tools. Keep the contract
   (`references/contract.md`): the SPX definition with its DataFields, one element `id="fN"` per
   field, the `play/stop/update/next` globals, ES5, GSAP only, relative references; the structure
   spine and `:root` variables that make it editable in NoaCG; the marked ANIMATION region's
   interpreter untouched (edit its DATA for different motion).
3. **Validate and look.** `noacg validate ./my-graphic --screenshots ./shots`. Fix every ERROR
   (the graphic will not export/save with one); read the WARNINGs as measurements
   (`references/validator.md` says what each rule measures and how authors usually resolve it);
   open `shots/onair.png` and `shots/stress.png` and judge the frame yourself - the stress frame
   doubles every text and widens every number, which is what a real operator will type. Each
   machine state gets a frame too, and `noacg screenshot --event <name> --at <time> --background video` shows any state at any moment over a video-like ground. Repeat
   until clean and until you would air it. **If you authored a machine, this step carries two of
   its three gates**: read the MACHINE findings (the dead-control one is a WARNING, and it is the
   likeliest typo), and let the BENCH walk the arrows - it dispatches authored events and measures
   each pose, so a state only a button can reach is measured too. It is not a complete walk and a
   `bench-skipped` NOTE is not a pass; `references/contract.md` §5a says what it misses and what
   you finish by hand.
4. **Inspect the operator surface, and show it to the user.** `noacg inspect ./my-graphic` prints
   the control panel NoaCG derives from your graphic - one input per field, one button per action,
   the step semantics. If the operator cannot change what they will need to change, add the field;
   if an action is missing, it belongs in the machine - a type's, or one you author
   (`references/contract.md` §5). Read the printed BUTTONS against what the brief's operator must
   do live - a clean validate does not prove the actions exist - and read the INPUTS against
   "Fields and behaviour" below: a word set once per show is not a live input, and a counter the
   operator steps through is a number. **With an authored machine this is the remaining gate,
   and it is the one with a human in it**: SHOW the user the buttons - "these
   are your buttons" - so a person confirms the operator surface before it is saved.
5. **Deliver.** When every requested graphic is validated and inspected, save them ALL in ONE
   command: `noacg save ./opener ./name-strap ./scorebug`. It validates each once more, refuses
   the whole set on one error, and puts every graphic in the user's NoaCG library in one
   delivery, printing each `#/graphic/<id>` link (it opens at once; it is in Home → Graphics),
   the account and deployment it went to, and an operation id. It needs the key from "Connect
   before the brief" (or `NOACG_AGENT_KEY` in CI). It never publishes, plays or airs anything.
   (No account? Zip each package folder: `zip -r my-graphic.zip my-graphic` on macOS or Linux;
   on Windows `Compress-Archive my-graphic my-graphic.zip` in PowerShell, or
   `C:/Windows/System32/tar.exe -a -cf my-graphic.zip my-graphic` from any shell (Git Bash's own
   `tar` writes a tar file, not a zip). `noacg validate my-graphic.zip` confirms it, and it
   imports through the studio's Import door. It is also a complete OGraf package any OGraf
   renderer plays.) A host that saves the graphic itself and asks you for a record instead
   (a container, a bench): hand in as `references/hand-in.md` says.

## Several graphics for one show

When the user asks for a SET - "graphics for my esports night", "a news package", "everything a
fight show needs" - make each graphic with the loop above (steps 1-4, one package folder each,
one shared look), then deliver them all with ONE `noacg save` (step 5).

**A production, only when the user asks for one** (a show, a running order, "set it up to
run"): add it to the same save. The graphics, the production, its layers and its rundown arrive
together, ready to open, with no Install step:

```
noacg save ./opener ./name-strap ./scorebug ./endboard --production "Friday Fight Night" \
  --rundown ./rundown.json --layer 10
```

- `--rundown` (optional) is a JSON list of cues in show order, each naming a graphic by the name
  it is saved under: `[{ "graphic": "Name strap", "label": "Anna - host", "values": { "f0": "Anna Virtanen" } }]`.
  Write one when the brief describes a running order; the values are sample content the
  operator edits on air.
- `--layer 10` puts the first graphic on playout layer 10 and counts up (back to front, so list
  full-frame backgrounds first and bugs and tickers last), or give each one: `--layer 10,12,20`.
- As the MCP tool: `{ "command": "save", "paths": [ … ], "production": "…", "rundown": [ … ] }`.

## What the save answered, and what you report

- **Saved, confirmed by reading it back**: report each graphic's link, and the production's
  link when one was made. Only this is delivered.
- **Refused (403): the key may save graphics but not make productions.** It was made without the
  production line (an older login). Nothing was saved. Ask the user: run `noacg login` again
  and allow productions in the browser, or save library-only without `--production`.
- **`no-production`** (the `reason` in `--json`): the deployment is too old to make a production.
  When it says the graphics were saved, report their links and say no production was made;
  when it says nothing was saved, offer the library-only save or the package below.
- **Unconfirmed** (`unverified`): no answer came and a readback did not find it. Run the SAME
  command again: it resumes the same operation and never saves a second copy. Still unconfirmed?
  Report the operation id, name the graphics as unconfirmed, and ask the user to look in Home →
  Graphics. `noacg status <operation or graphic id>` reads back what a delivery made and
  whether it is there now.
- **Not logged in, or the key was revoked** (401): nothing was saved. Run `noacg login` again,
  which the user approves in the browser, then the same save.
- **Any other error** saved nothing: name the graphics and the error.

**Pending packages** are the older route, only when the user asks for a file or an Install:
`noacg pack ./a ./b --name "…" [--rundown …] --save` sends a package that WAITS on Home →
Productions until the user presses **Install**. Report it as pending Install, never as installed
or as a production. Without an account, `--out ./show.noacgpack.json` writes it as a file the
user imports on Home → Productions → **Import a package**.

**The final report** names every requested graphic once: its library link, or that it was not
saved and why, or that it is unconfirmed. The production's link follows when one was made; a
package is listed apart as pending Install. Validator warnings stay apart from the delivery
state. A saved link is saved, not opened: say "saved", not "checked in the browser". When the
user gave a brand, the report ends with its lines ("The user's brand" below): what you used
from where, what you could not use or that you used all of it, and the logo's rights.

The commands above are the NoaCG CLI, reached two ways. In a terminal: `noacg <command>`
(`npx -y @noacg/cli@0.12.3 <command>` when nothing is installed; `npm i -g @noacg/cli@0.12.3` once makes every
call faster). As an MCP tool, when your client has one named `noacg` (the `noacg-mcp` plugin, or
`noacg mcp` added as a server): call that ONE tool with `command` set to the verb and the flags as
arguments - `{ "command": "validate", "path": "./my-graphic", "screenshots": true }` returns the
frames as images, `{ "command": "docs", "topic": "contract" }` the reference. Same verbs, same
arguments, same answers either way; use whichever your client gives you. The repeatable flags
are lists: `--event` is `"events": ["clockStart", "goalA"]`, with `"at"` (a time) and
`"background": "video"` beside them on `screenshot` (and `background` on `validate`). Over MCP a
frame on a background comes back as JPEG, and one validate answer carries at most six state
frames, naming any it left out; shoot those with `screenshot` and their `events`.

## The one content rule

Content an operator - or another broadcaster reusing this graphic - may need to change is a
FIELD: names, scores, headlines, times, labels in a language ("BEGINS IN", "LIVE"). Decoration and
genuinely fixed semantic labels may stay static. Never bake event-specific or user-specific content
into the design. A repeated list (rows, credits, items) is ONE multi-line field the runtime
renders, never f7…f26.

## The user's brand

When the user gives a website, a logo, pictures, colours or fonts, the graphics carry THAT brand;
never invent one they did not give.

- **Where to take it from**: the files they gave first, then their website: the colours and
  `font-family` in its stylesheet and its logo file (often an SVG in the header). Fetch them; a
  page you cannot read is a gap to report, not a guess to make.
- **The logo** is copied into `images/` (an SVG over a PNG), referenced relatively, and placed
  where the design gives it room, on a surface it reads on. When the operator may need another
  logo (a sponsor, an opponent), it is a `filelist` field. The validator does not check that an
  `images/` file exists, so see the logo in the frames.
- **A font** is bundled into `fonts/` with `@font-face` only when its licence allows that (an open
  licence such as the OFL most Google Fonts carry, with the licence text copied beside it). A
  commercial font: ask the user for its files and their licence, or use a close free font and say so.
- **Report it** in the final report, the one with the links, even when an earlier message said
  it: the colours, fonts and logo you used and where each came from (a colour the user named is
  theirs, not the logo's); what you could not use and why, or that you used all of it; and for a
  logo or crest that is not plainly the user's own, that it belongs to its owner, so the user
  needs the right to show it on air.

## Fields and behaviour: build for the operator's show

However it looks, the graphic is driven live by one person under time pressure. These decide
whether that person can keep up, and `noacg inspect` shows you the result.

- **Live or set once.** For every field, decide whether the operator changes it during the show,
  between items included (a score, the next guest's name, a title between segments), or once per
  show (team names, a channel's word for FINAL). The operator page should hold what changes
  during the show; a thing done live with a press is a ⚡ button, never a field to retype. A goal
  is one button that adds 1 to the score (`"adjust": { "f1": 1 }` in `machine.controls`); the
  number field stays for corrections.
- **A button label is a word or two.** "Final", "Reset 0-0", "Start clock", never the explanation
  ("Take one back from player 1"): the section names the group and the button's hover already says
  what the press does. A label that acts on a player names the player in braces, `"+1 {f0|P1}"`,
  and the operator page shows the name on air ("+1 ANNA"), or the fallback after the bar while the
  field is empty. The validator warns on a label over 16 characters.
- **Set-once words are hidden word sources.** A word a state shows (POWER PLAY, END 1ST, FINAL,
  LIVE) is still a field, because the broadcaster names it, but when it is set once it is
  `"ftype": "hidden"` in a holder `<div id="f9" class="noacg-data-source">FINAL</div>`. The studio's
  Data panel edits it, the operator page stays live-only, and your runtime copies the word into
  the visible element when the state is entered and again in `update()`
  (`references/contract.md` §5e has the pattern).
- **A counter is a number.** Something the operator steps through (a question, a round, a period,
  a lap) is a `number` field, which gets - / + on the panel, with its label kept apart: "Question"
  as fixed text or a word source, `7` as the number. Never one text field holding "Question 7"
  that has to be retyped for the next question.
- **A default is a safe sample or empty.** A default airs whenever nobody types over it. Use a
  value that is right on air for most shows (`0` for a score, `20:00` for a period clock, `LIVE`),
  or leave it empty and let the design close up around it. Never a placeholder that reads as a
  mistake on air: "Host Name", "Lorem ipsum", or a city that is not this show's.
- **The common behaviours have worked patterns** in `references/contract.md` §5e: an optional
  line that collapses when its field is empty, a state's word painted from a hidden source, a
  second state group beside the lifecycle (a timer), a graphic that ends its own timed state, and
  an action the operator can press in every state.

## What is fixed and what is yours

Fixed because playout, editability or compatibility needs it (the validator checks every line of
this): the definition and field ids, the lifecycle globals, ES5 in `template.js` (CasparCG's
embedded Chromium), no network and no storage at runtime, relative paths, the structure spine, the
`:root` variables, the ANIMATION markers and interpreter, the 1920x1080 (or declared) frame,
transparency (you are composited over video), readable type (the validator reports a size floor),
the title-safe area. Everything else - composition, typography, colour, shape, rhythm, motion
character - is yours. If another design skill is active, it owns the look; NoaCG's rules bind only
where correctness, editability, compatibility or playout require. Page/responsive/mobile guidance
does not apply to a fixed broadcast frame.

## References (read the one you need)

- `references/contract.md` - the SPX/NoaCG runtime + editability contract, with a worked example;
  §5 is the operator-action contract: authoring a machine, its three gates and a worked machine.
- `references/package.md` - the package anatomy (sources, generated half, `v_noacg`, OGraf).
- `references/validator.md` - every finding the validator can raise: what it measures, how
  authors resolve it.
- `references/control.md` - how NoaCG derives the operator surface; the two markup conventions
  the control layer reads; the OGraf contract (`schema`, `customActions`, `stepCount`).
- `references/hand-in.md` - handing in a record when the host saves, not you: the coverage, a
  verdict for every frame, `noacg record --review`.
- `references/critique.md`, `references/design-notes.md` and `references/share.md` - the three
  opt-in tools below. Do not read them unless one is switched on.

## Three opt-in tools (all OFF unless the user asks)

By default NoaCG asks nothing of the design beyond the fixed list above. Three tools exist for
users who want more, and you use one only when it is asked for:

- **Critique and improve** (`references/critique.md`): a taste check on the graphic you made.
  You render it, judge it against the brief and the paid-asset bar, make the changes that matter
  and show the before and after frames. It is ON when the user asks for it ("critique my
  graphic", "make it better", `/noacg:graphic --critique ./my-graphic` in Claude Code). You may
  offer it in one sentence when you report a finished graphic; run it only if the user says yes.
- **NoaCG's design guidelines** (`references/design-notes.md`): the studio's own rules for type,
  colour, placement and motion, for users who want guard rails. It is ON when the user asks for
  NoaCG's design guidelines or the NoaCG look, passes `--guidelines` to `/noacg:graphic`, or
  their project instructions (`CLAUDE.md`, `AGENTS.md`) contain the line
  `NoaCG design guidelines: on`. When it is on, read it before you design and follow it.
- **Share to Community packs** (`references/share.md`): sends a finished package for review to
  NoaCG's public Community packs shelf. It is ON only when the user asks in this conversation to
  share, publish or submit the pack for others. Never offer it, mention it, suggest it or ask
  about it otherwise, not even when a package is finished.

When none is on, do not open their files: the look is yours, judged the way you normally judge
your own work, and the package goes only where the user said.
