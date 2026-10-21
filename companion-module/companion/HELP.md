## NoaCG Studio

Run a [NoaCG Studio](https://noacg.studio) production from a Stream Deck or any surface Companion supports. Your keys take and take off graphics and server clips, walk the rundown, and show what is on air, what is selected, which actions are allowed now, and the clip clock with its 10 and 5 second warnings.

Each press is run by the NoaCG operator page that answers the panel, exactly as if the operator pressed the key there. So a key does only what the page would allow, and the page shows every press.

### Install

Companion 4.3 or later. If the **NoaCG Studio** connection is not in Companion's list yet, install the module file you were given (`noacg-studio-<version>.tgz`): open **Modules**, press **Import module package** and choose the file. To go back to an earlier version, import that version's file the same way.

### Set it up

1. Publish the production in NoaCG once. On the production page open **Setup**, then **Panel** (on the hosted control page, **Panel** is in the header). Press **Pair a panel**. A code like `ABCD-EFGH` appears. It works once, for five minutes.
2. In Companion, open **Connections**, add **NoaCG Studio**, type the code into **Pairing code**, give the panel a name, and save. The code field clears and the panel appears in the page's list.
3. Keep the production page open. It answers the panel by itself; the header shows **Panel ✓**.
4. Open **Buttons**, then the **Presets** tab, and drag keys onto your surface: **Show control** (Take, Out, Next and the rest), **Server clip** (the clip clock), and **Cues** (Take, Select and Trigger keys for each cue of your rundown).

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
| Green                               | the cue is selected (what PREVIEW shows)                   |
| Grey text                           | the page would not run this action now                     |
| Amber flash                         | the press was refused or not answered                      |
| Clip clock amber, then blinking red | 10 seconds left, then 5                                    |
| "No operator page"                  | no page answers the panel; presses are refused, not queued |

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

The hosted control page has no server clips, so it refuses the clip keys with "not on this page".

### Variables

`production`, `selected`, `on_air`, `clip_name`, `clip_left`, `clip_left_s`, `clip_phase`, `answering`, `connection`, `last_press`, and `row_1`, `row_2` and so on for the rundown.

### Good to know

- The panel key can only ask an open operator page to run these actions. It cannot reach NoaCG Bridge, your playout server, or anything else in your account.
- OBS, vMix and CasparCG keys come from those programs' own Companion connections, side by side with this one.
- Self-hosted NoaCG: change **NoaCG address** to your own app's address.
