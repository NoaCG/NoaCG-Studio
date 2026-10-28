## NoaCG Studio

Run a [NoaCG Studio](https://noacg.studio) production from a Stream Deck or any surface Companion supports. Your keys take and take off graphics and server clips, walk the rundown, press a graphic's own live controls (a goal, a clock, a quiz reveal, an OGraf action), and show what is on air, what is selected, which actions are allowed now, and the clip clock with its 10 and 5 second warnings.

Each press is run by the NoaCG operator page that answers the panel, exactly as if the operator pressed the key there. So a key does only what the page would allow, and the page shows every press.

### Install

Companion 4.3 or later (the steps below use Companion 5.1's words). If **NoaCG: NoaCG Studio** is not in Companion's list of connections yet, install the module file you were given (`noacg-studio-<version>.tgz`): open **Modules**, press **Import module package** and choose the file. To go back to an earlier version, import that version's file the same way. A new Companion first shows its own welcome and What's New windows; finish or close them.

### Set it up

1. Publish the production in NoaCG once. On the production page open **Setup**, then **Panel** (on the hosted control page, **Panel** is in the header). Press **Pair a panel**. A code like `ABCD-EFGH` appears. It works once, for five minutes.
2. In Companion, open **Connections**, type `NoaCG` in the search box on the right, press **Add** beside **NoaCG: NoaCG Studio**, then **Add** again. Type the code into **Pairing code**, give the panel a name in **Panel name**, and press **Save**. The code field clears and the panel appears in the page's list.
3. Keep the production page open. It answers the panel by itself; the header shows **Panel ✓**.
4. Open **Buttons**, then the **Presets** tab, press **NoaCG**, open a section and drag keys onto your buttons: **Show control** (Take, Out, Next and the rest), **Server clip** (the clip clock), **Cues** (Take, Select and Trigger keys for each cue of your rundown), and **Pinned graphics** (the live controls of each graphic you pinned on the production page).

To stop a panel, press **Revoke** beside it in the page's panel list. To pair again, clear **Panel key** and type a new code.

### Which page answers

- One page answers the panel at a time. The production page takes it by itself when no other page has it, and keeps it when you reload.
- Another page never takes it away. To move the panel to the page in front of you (another laptop, or the hosted control page on a phone), press **Use here** in its panel dialog, or **Use panel here** in the production page's header.
- If the answering page closes or loses its network, the panel is free again within 15 seconds. Another open production page takes it; until one does, the keys show "No operator page".
- With no answering page, a press is refused, never queued: nothing runs later when a page comes back.

### What the keys show

| Look                                | Meaning                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| Red                                 | the cue is on air                                          |
| Green                               | the cue is selected: what Take, Next and Out act on        |
| Grey text                           | the page would not run this action now                     |
| Amber flash                         | the press was refused or not answered                      |
| Clip clock amber, then blinking red | 10 seconds left, then 5                                    |
| "No operator page"                  | no page answers the panel; presses are refused, not queued |

A graphic's key also shows what its last press came to:

| Look                        | Meaning                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| Dark amber                  | sent, running on the graphic                                                 |
| Amber                       | refused or failed: nothing ran                                               |
| Amber with "?"              | not known: it may have run. It is never sent again; check the output         |
| Dark, "?" before the name   | the graphic no longer has this control (renamed or removed): it does nothing |
| Green (a pick's option key) | that option is on air                                                        |

### Actions

- **Take (the SPACE toggle)**: what SPACE does on the answering page: takes the selected cue, or takes it off when it is on air.
- **Re-take**: plays the selected cue again while it is on air.
- **Update**: sends the selected cue's changed values to air.
- **Next**: the next step of the selected cue's graphic.
- **Out**: takes the selected cue's graphic off air.
- **Select the previous cue** and **Select the next cue**: walk the rundown. Nothing airs.
- **Pause the server clip**, **Resume the server clip** and **Pause or resume the clip on air**: the clip clock's keys.
- **All out**: takes everything off air.
- **Select a cue**: moves the selection to that cue. Nothing airs.
- **Take a cue**: airs that cue whatever the SPACE mode; pressed again while it is on air, takes it off. The selection stays where it was.
- **Trigger a cue**: plays or restarts that cue. The selection and PREVIEW stay where they were.

- **Graphic action**: one live control of one graphic, as its block on the production page draws it. It acts on the cue on air on that graphic, never on the selected cue. Choose the **Graphic** and the **Action**; a pick also takes its **Option**, a number its **Step** (+1 or -1). An OGraf action sends the on-air cue's arguments, as the button on the page does, unless you type your own into **Arguments** as JSON, like `{"team": 2}`. Empty, or `{}`, means the cue's.

The hosted control page has no server clips, so it refuses the clip keys with "not on this page". It runs no graphic actions either.

### Graphic keys

- The **Pinned graphics** presets list the graphics pinned on the production page, each with its controls in the page's order. To get keys for another graphic, pin it, or add a **Graphic action** to a button yourself. Unpinning a graphic later stops nothing: its keys keep working.
- A key remembers its control by its name in the graphic, not by its label or place. If a graphic is edited and the control is gone or renamed, the key turns dark with "?" and does nothing; drag the new preset onto it.
- A graphic action runs only on the cue that was on air when the key was drawn. If another cue of that graphic went on air in between, the press is refused rather than sent to the new cue.
- One press is one action. A press that got no answer is never repeated: the key reads "?" and `last_press` says "Not confirmed". Look at the output before pressing again.
- An OGraf graphic decides itself whether it takes an action, so its keys are never greyed by the graphic's state, only when it is off air.

### Variables

`production`, `selected`, `on_air`, `clip_name`, `clip_left`, `clip_left_s`, `clip_phase`, `answering`, `connection`, `last_press`, `graphic_actions` (why graphic keys cannot be pressed, empty when they can), and `row_1`, `row_2` and so on for the rundown.

### Good to know

- The panel key can only ask an open operator page to run these actions. It cannot reach NoaCG Bridge, your playout server, or anything else in your account.
- OBS, vMix and CasparCG keys come from those programs' own Companion connections, side by side with this one.
- Self-hosted NoaCG: change **NoaCG address** to your own app's address.
