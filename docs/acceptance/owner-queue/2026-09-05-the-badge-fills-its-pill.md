---
kind: agent
date: 2026-09-05
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The one judgement it puts up, whether a percentage should accept a rehearsal value, is answered in
its own text: a tally repaints them on every vote, so a typed value would vanish, and Simulate
votes is the rehearsal road. The rest is two of the owner's three reported bugs, fixed and
measured, which an agent confirms.

Re-kinding and deleting are separate commits by rule, so this item stays here until an
agent drives the route below and records what it saw. The original text follows,
unchanged.

# THE VOTE BADGE FILLS ITS PILL, AND THE DEAD FIELDS ARE GONE

Two of the three bugs from your live-vote walk. They turned out to be one cause and one piece of
missing honesty, not three separate faults.

**Route (about a minute):**
1. `/app` -> New graphic -> **Import graphic**, drop
   `e2e/fixtures/svg-corpus/illustrator-live-vote-band.svg`, **Next** to the Fields step.
2. Look at the checklist, then **Create project**.
3. In the editor's Content panel, type into **Badge text**: `VOTE NOW`, then `PLEASE VOTE`, then
   `PLEASE VOTE NOW`, then something absurd, then back to `VOTE NOW`.

**What to look at:**

- **The badge stays the size you drew it** until the pill is genuinely full. It used to be handed
  143 units of room inside a 260-unit pill, because the gaps either side of a centred word are
  half the leftover rather than a margin anybody chose - so one extra word cost it a quarter of
  its size and two crushed it to a smear. `PLEASE VOTE` now airs at the 22px you drew;
  `PLEASE VOTE NOW` at 20.5px where it used to be 12.1px and squeezed. This is your *"it doesn't
  fill the whole shape. It could."*
- **Nothing strands it.** Push it past what the pill can hold and it still floors, still stays
  inside the pill, and still tells you the value is too long - and the moment you shorten it,
  every one of those comes back off. I could not reproduce the half where it never came back,
  before or after this change; my best guess is that the fit fix that landed the night before had
  already removed it, and the recovery is now gated so it cannot return quietly.
- **The Fields checklist.** Eight of the nine rows on this board are layers the vote writes, and
  they used to offer a name box and a text box that reached nothing at all - which is what you hit
  when you selected a percentage, watched it light up in the preview, and typed. Those boxes are
  gone. The row says which layer it is and that the vote fills it, and the count at the top now
  says **1 of 9 editable on air**, which is the truth. Their tick is greyed too, for a reason worth
  a glance: unticking one with "take it off the artwork" used to hide a layer the vote goes on
  writing into, so the counts landed somewhere nobody could see and nothing said a word. To take a
  layer out of the vote, set its picker in **What it does** to "not drawn" - that gives the row its
  boxes back.

**The judgement I would most like your read on:** I decided the percentages should NOT accept a
rehearsal value. The tally repaints them on every vote, so anything you typed would vanish the
moment a vote landed, and I would rather the board refuse than lie for a few seconds. Rehearsing
them is what **Simulate votes** on the Audience tab is for. Tell me if you would rather be able to
type one.

**What is NOT done:** the vote's options are still ONE multi-line field rather than one field per
option. That is a change to a saved format and needs its migration in the same commit, so it is
filed rather than rushed (`docs/backlog/live-vote-fields-that-do-not-work.md`).

**Beyond this board:** the room rule is the fit ladder's, not the vote's, so every centred line in
every imported design gets its box back - a centred headline in a title card, a score in its plate.
Worth a glance at one of those too if you have a file handy.
