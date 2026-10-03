---
kind: desktop
date: 2026-10-03
serves: now
---
# A calmer Playout header

You said the Playout page was getting crowded and that Share, Panel and Export could go under a
settings menu, and you asked whether Data and Audience need to be on screen all the time. We
agreed on a menu, not a tab, so the monitors stay on screen.

## What changed

- **One Setup menu**, left of ■ All out. It holds **Share…** (when you are signed in),
  **Stream Deck panel…** with its state (Off, Connecting…, Answering here), **Playout
  settings…** and **Export…**. Below a line it offers **Add data source…** and **Turn on
  audience…** while those views are not in use. Each opens in one press from the menu, so every
  door is at most two presses away. Escape or a press outside closes the menu.
- **The header keeps what you press or watch live:** the playout status, ▶ Start production,
  ■ All out. While this page answers a Stream Deck panel, a small green **Panel ✓** shows beside
  Setup (amber **Panel …** while connecting), and a press on it opens the panel's dialog. A team
  production shows its team chip there, with Saving… and Not saved, as before.
- **Data and Audience appear only when the production uses them.** A plain production shows
  Playout alone, with no switcher. Data appears once the production has a table, a seed, a bound
  field or a live value. Audience appears once the production has an audience card or a vote
  board, or anything has arrived through the join page. The view you are on is always listed, so
  nothing disappears under you, and a production that uses a view never loses it.
- **Audience shows how many are waiting**, as a small count: **Audience 3**. On a published
  production the Playout tab reads it about every 12 seconds. In rehearsal (not published) the
  waiting messages live in the Audience tab, so the count shows there.
- **The phone is unchanged:** it already showed only Home, the name, the status and ■ All out, and
  Setup stands down there with the other authoring doors.

Screens before and after, at 1600x900 and phone width:
`docs/research/control-surfaces-review-2026-10-02/declutter/` (`before-*.png`, `after-*.png`,
and the header measurements in `before-log.txt` and `after-log.txt`).

## The route, about five minutes

1. Open a production with only a lower third. The header ends with **Setup ▾** and **■ All out**,
   and there is no Playout / Data / Audience switcher.
2. Press **Setup**. Open Playout settings, close it. Press Setup again and Export, close it.
3. Press **Setup**, then **Add data source…**. Data opens in a new tab. Add a table there. Back on
   the Playout tab, **Data** is now in the switcher and Setup no longer offers it.
4. Open a production with an audience card (for example House Q&A). **Audience** is in the
   switcher. Open it, press **Simulate 3 arrivals**: the tab reads **Audience 3**.
5. If you have a panel paired, switch answering on: **Panel ✓** shows beside Setup.

## What to look at

Whether the header reads calmer, and three choices I made that you may want differently:

- **The word "Setup"** on the button, with a ▾. "Settings" would put "Playout settings" under
  "Settings", and an icon alone hides that it is a menu.
- **Panel ✓ is green**, the same green as the Ready status, rather than a plain dot.
- **On a phone, Setup is not shown**, as Export and the Panel door were not before. Showing it
  would cost the production's name about 40 px at 390 px wide.
