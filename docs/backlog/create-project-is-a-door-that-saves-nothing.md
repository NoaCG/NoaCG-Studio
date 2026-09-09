# Should "Create project" save? It is the editor door taken early, and it persists nothing

**Filed:** 2026-09-09. **Source:** surfaced by the review of `claude/d-import-road-guide` (pull
request 191), which walked the import road cold. That row corrected its guide and pinned the
sentence in `e2e/docs.spec.ts`, so the DOCUMENTATION is now right; nobody has asked whether the
BEHAVIOUR is. Filed by the handoff-drain row on the orchestrator's request, because the row that
found it had already queued and could not file it.

**This is an open QUESTION, not an asserted defect.** Neither the row that found it nor the row
that filed it has reproduced it in the running app. Read the first step below before acting on
anything here.

## Why

The code fact, quoted from the row that found it rather than paraphrased:

> "Create project is the editor door taken early and it does not save (`create()` calls
> `applyDraftProject()` with no arguments; both Finish doors save explicitly). I had written it up
> as a harmless shortcut."

So a control labelled "Create project" is, on that reading, a navigation shortcut into the editor
that persists nothing, while the two doors a user reaches by finishing the wizard both save on
purpose. The question is whether that is the behaviour we want.

The date is what makes it worth a file rather than a shrug. **On 2026-09-25 a room of students and
YLE people uses this wizard.** A button that says "Create project" and leaves nothing behind is the
shape of thing that loses somebody's work in front of an audience - and the audience is the point
of that day.

Three answers are all defensible and the item is not decided:

1. **It should save**, because a control that says "create" is a promise, and an early door into
   the editor is exactly where an inexperienced user will leave.
2. **It should be named for what it does** - "Open in editor", or similar - and keep its current
   behaviour, because the wizard's Finish is the moment a project exists and adding a second save
   point invites two half-made records of one thing.
3. **It is already fine**, because the editor saves on its own from that point and nothing is
   actually lost. That is the possibility the reproduce settles.

## What it would take

**First, reproduce it in the running app.** That is the whole first step and it is not optional:
a label risk and a data-loss risk are different sizes, and only the walk tells you which this is.
Take the door early, close the tab, and look for the project. Do it before reading the code, so the
answer is what a user would see rather than what the call graph suggests.

Then, if something really is lost, the decision above is a taste call with a deadline on it and
belongs in an owner-queue walk rather than in whichever fix is quickest.

## Evidence

- `claude/d-import-road-guide`, pull request 191 - the walk that surfaced it, and the guide
  correction and `e2e/docs.spec.ts` assertion that came out of it.
- The call it cites: `create()` invoking `applyDraftProject()` with no arguments, against the two
  Finish doors which save explicitly. **Unverified by this session** - read it in the source before
  quoting it as fact.

## Read in the source on 2026-09-09 by `claude/aa-deck-repair`, and one thing corrected

Still not reproduced in the running app - the walk above is still the first step. But the code was
read, because the 25 September deck was sending the room through this button and had to stop:

- **The call graph is as quoted.** `create()` is `applyDraftProject()` with no arguments, and its
  own comment says so out loud: *"The editor door (and the quiet from-any-step shortcut): create
  and hand over. Saving stays the user's move, exactly as it always has been."*
  (`src/components/wizard/CreationWizard.tsx`, above `const create`.)
- **The button is reachable earlier than "an early door" suggests.** Its guard is
  `(mode === 'design' || mode === 'svg' || mode === 'import') && step < finishStep`, so on the SVG
  road it sits in the footer from the Design step onward - beside every step a student is on.
- **"Both Finish doors save" is true of the two doors the default studio shows, and only those.**
  The production door and the export door save. Finish's THIRD door, "Open in the editor
  (Alpha)", is wired to `onOpenEditor={create}` (`CreationWizard.tsx:2331`) - the same function,
  so it does not save either. It renders in Advanced mode only, which is why the students in the
  room will not see it, but option 2 above ("name it for what it does") has to cover two controls
  rather than one.

What the deck does in the meantime: slide 4 sends the room to Finish and names the production
door, and never mentions "Create project". That is a workaround for the day, not an answer.
