## NoaCG Studio

Run a [NoaCG Studio](https://noacg.studio) production from a Stream Deck or any surface Companion supports. Your keys take and take off graphics and server clips, walk the rundown, and show what is on air, what is selected, which actions are allowed now, and the clip clock with its 10 and 5 second warnings.

Each press is run by the NoaCG operator page that answers the panel, exactly as if the operator pressed the key there. So a key does only what the page would allow, and the page shows every press.

### Set it up

1. On the NoaCG production page (or the hosted control page), open **Panels** and press **Pair a panel**. A code like `ABCD-EFGH` appears. It works once, for five minutes.
2. In Companion, add a **NoaCG Studio** connection. Type the code into **Pairing code**, give the panel a name, and save. The code field clears and the panel appears in the page's list.
3. On the operator page, switch on **Answer the panel on this page**.
4. Drag ready keys from the **Presets** tab: **Show control** (Take, Out, Next and the rest), **Server clip** (the clip clock), and **Cues** (one key per cue of your rundown).

To stop a panel, revoke it in the page's **Panels** list. To pair again, clear **Panel key** and type a new code.

### What the keys show

| Look                                | Meaning                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| Red                                 | the cue is on air                                            |
| Green                               | the cue is selected (what PREVIEW shows)                     |
| Grey text                           | the page would not run this action now                       |
| Amber flash                         | the press was refused or not answered                        |
| Clip clock amber, then blinking red | 10 seconds left, then 5                                      |
| "No operator page"                  | no page answers the panel; presses are refused, never queued |

### Actions

Take (the SPACE toggle), Re-take, Update, Next, Out, Select the previous or next cue, Pause, Resume, Pause or resume the clip on air, All out, Select a cue, and Take a cue. **Take a cue** airs that cue whatever the SPACE mode, and pressed again while it is on air, takes it off.

### Variables

`production`, `selected`, `on_air`, `clip_name`, `clip_left`, `clip_left_s`, `clip_phase`, `answering`, `connection`, `last_press`, and `row_1`, `row_2` and so on for the rundown.

### Good to know

- Only one page answers at a time: the last one where **Answer the panel on this page** was switched on.
- If the answering page closes, the keys show "No operator page" within 12 seconds.
- The panel key can only ask an open operator page to run these actions. It cannot reach NoaCG Bridge, your playout server, or anything else in your account.
- OBS, vMix and CasparCG keys come from those programs' own Companion connections, side by side with this one.
- Self-hosted NoaCG: change **NoaCG address** to your own app's address.
