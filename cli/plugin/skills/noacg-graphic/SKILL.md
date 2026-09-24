---
name: noacg-graphic
description: >-
  Make a broadcast graphic - or a whole graphics package for a show - for NoaCG Studio (lower
  third, scoreboard, bug, ticker, countdown, full-screen, any on-air graphic) and put it in the
  user's NoaCG library or on their Home ready to install as a production. Use when the user says
  "for NoaCG", names NoaCG, SPX, CasparCG or OGraf playout, or wants graphics operated live
  (editable fields, Take/Update/Out). Teaches the NoaCG contract, the noacg tools and the loop,
  not how to design.
---

# Make a NoaCG graphic

You are building a real broadcast graphic: HTML + CSS + JS that a playout system loads, an
operator drives from a control panel, and NoaCG saves, edits and plays out. Design it the way you
normally design - this skill tells you the CONTRACT the graphic must satisfy, the TOOLS that
check it, and how it reaches the user's library. It does not tell you how it should look.

## The loop

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
   doubles every text and widens every number, which is what a real operator will type. Repeat
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
   do live - a clean validate does not prove the actions exist. **With an authored machine this is
   the remaining gate, and it is the one with a human in it**: SHOW the user the buttons - "these
   are your buttons" - so a person confirms the operator surface before it is saved.
5. **Save.** `noacg save ./my-graphic --name "…"` validates once more and puts it in the user's
   NoaCG library, printing the `#/graphic/<id>` link (it opens at once; it is in Home → Graphics).
   It needs the user's scoped agent key on this machine: if `noacg whoami` says not logged in,
   ask the user to run `noacg login` (it opens a consent page in THEIR browser - you cannot and
   must not do that step for them), or set `NOACG_AGENT_KEY` in CI. The key can only create
   graphics in the library - save never publishes, adds to a production or airs anything. (No
   account? `zip` the folder - it imports through the studio's Import door, and it is also a
   complete OGraf package any OGraf renderer plays.)

## A whole package: several graphics for one show

When the user asks for a PACKAGE - "graphics for my esports night", "a news package", "everything a
fight show needs" - make each graphic with the loop above (steps 1-4, one package folder each,
one shared look), then send them together instead of saving them one by one:

```
noacg pack ./opener ./name-strap ./scorebug ./endboard --name "Friday Fight Night" \
  --rundown ./rundown.json --layer 10 --save
```

- `--save` sends the package to the user's NoaCG **Home → Productions**, where it waits with an
  **Install** button. Install creates the production - every graphic pooled on its layer, the
  rundown ready to Take - and opens it. Tell the user exactly that: "it is waiting on Home →
  Productions; press Install". It uses the same agent key as `save` and works from any machine.
- `--rundown` (optional) is a JSON list of cues in show order, each naming a graphic by its name:
  `[{ "graphic": "Name strap", "label": "Anna - host", "values": { "f0": "Anna Virtanen" } }]`.
  Write one when the brief describes a running order; the values are sample content the
  operator edits on air.
- `--layer 10` puts the first graphic on playout layer 10 and counts up (back to front, so list
  full-frame backgrounds first and bugs and tickers last), or give one `--layer` per graphic.
- Every graphic is validated again before anything is sent; one error refuses the whole package.
- Without an account, `--out ./show.noacgpack.json` writes the same package as a file the user
  imports on Home → Productions → **Import a package**.
- As the MCP tool: `{ "command": "pack", "paths": ["./opener", "./scorebug"], "name": "…",
  "rundown": [ … ] }` - sent to Home when this machine holds a key; `out` also writes the file.

The commands above are the NoaCG CLI, reached two ways. In a terminal: `noacg <command>`
(`npx -y @noacg/cli <command>` when nothing is installed; `npm i -g @noacg/cli` once makes every
call faster). As an MCP tool, when your client has one named `noacg` (the `noacg-mcp` plugin, or
`noacg mcp` added as a server): call that ONE tool with `command` set to the verb and the flags as
arguments - `{ "command": "validate", "path": "./my-graphic", "screenshots": true }` returns the
frames as images, `{ "command": "docs", "topic": "contract" }` the reference. Same verbs, same
arguments, same answers either way; use whichever your client gives you.

## The one content rule

Content an operator - or another broadcaster reusing this graphic - may need to change is a
FIELD: names, scores, headlines, times, labels in a language ("BEGINS IN", "LIVE"). Decoration and
genuinely fixed semantic labels may stay static. Never bake event-specific or user-specific content
into the design. A repeated list (rows, credits, items) is ONE multi-line field the runtime
renders, never f7…f26.

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
- `references/design-notes.md` - OPTIONAL, off by default: NoaCG's own design notes. Read only
  when the user asks for "the NoaCG look" or house guidance.
