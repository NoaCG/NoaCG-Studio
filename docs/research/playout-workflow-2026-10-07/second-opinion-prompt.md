You are giving an independent second opinion on a workflow and UI redesign of NoaCG Studio's
playout page. Read only: do not edit files, run builds, start servers, commit or change anything.
Report back in chat.

## Where to look

- Repo: `C:\claude\NoaCG-Studio`. The redesign lives on branch
  `claude/playout-workflow-redesign-878e32`, checked out at
  `C:\claude\NoaCG-Studio\.claude\worktrees\playout-graphic-folder-bug-95c420`.
- Design draft: `docs/research/playout-workflow-2026-10-07/README.md` in that worktree. Read it
  first.
- Mockup screenshots: `docs/research/playout-workflow-2026-10-07/mockup/01-…png` to `10-…png`.
  Look at every one.
- Today's implementation: `src/components/home/ProductionPage.tsx` (header, the status panel at
  about 4282-4390), `src/control/playoutStatus.ts`, `src/components/home/CueRundown.tsx`,
  `src/components/control/PanelControl.tsx`, `src/components/SyncStatus.tsx`.
- Background: `docs/GOALS.md` (outcome 5), `docs/CLOUD_PLAYOUT.md` (§4a, "Publication
  lifecycle"), `docs/PLAYOUT_DASHBOARD.md`.

## The product

NoaCG Studio is a free, browser-based broadcast graphics tool: make a graphic, put it in a
production with a cue rundown, and play it out live. Its users range from student productions,
churches and streamers to small broadcast teams, so it has both non-technical operators and
professional ones.

Every production has a browser source URL that OBS, vMix or any browser renderer loads. A
production can also play through CasparCG via a small desktop app, the NoaCG Bridge, which
additionally plays the server's own clips and stills from the rundown.

## The owner's vision

- Professional playout software that feels obvious. A first-time operator runs a show without
  reading instructions; an experienced operator is never slowed down or prevented from doing what
  they want.
- Every button does something meaningful. No ceremony or activation steps without a strong
  reason; genuine safety confirmations stay.
- Normal UI is short labels, states and actions, not paragraphs. Clarification goes into a tooltip
  or an info button; real errors may explain.
- Alarms only when something actually needs attention. Normal editing and normal pre-show states
  never look like a problem.
- Choosing CasparCG unlocks CasparCG features; it never creates a separate workflow, and the
  browser source always stays available.
- The cue rundown must not get worse. The owner likes today's rows (34 px, one line) and does not
  want them taller or noisier.
- Simple is the goal, but not by removing what professionals need.

## Already decided by the owner (challenge them anyway)

The draft lists them. In short:
- **Publish once.** URLs are persistent and there is no online/offline session.
- **Status:** grey, green or red with text. The healthy state is "Connected". Red only when
  something seen this session is lost, or a Take reaches no output.
- **One action slot** in the header: Publish, Load on 1-20, or Update outputs.
- **Edits after publishing** go out with an "Update outputs" press, never automatically yet.
- **CasparCG** is a per-production switch. Load and Unload are its only session actions.
- **Before the first publish, Take is local rehearsal.** TAKE is not red there.
- **Unpublish is removed from the UI**, because it is destructive and not a real revocation.
- **All out** is always enabled and clears everything.
- **Keyboard shortcuts** work immediately and capture any real combination, including Å, Ä, Ö.
- **The paired Stream Deck panel** is owned automatically by the first eligible page and never
  stolen; "Use here" moves it.
- **Cloud sync** reads Synced, then a quiet Syncing, and turns amber only after 60 s unsynced.

## What I want from you

1. **Walk the operator's real jobs end to end on the proposed design and compare each with
   today.** For each, count the presses, say where the operator has to look, and name what could
   confuse or fail:
   - first-time setup with OBS;
   - a normal show;
   - fixing a typo in a graphic mid-show;
   - OBS crashing mid-show;
   - a CasparCG studio with clips on a second channel;
   - two operators, or a laptop plus a phone;
   - end of show;
   - the same production next week.
2. **For every decision above, say keep, change or drop, with the reason.** Push hardest on:
   - Update outputs versus automatic following;
   - removing Unpublish entirely;
   - local rehearsal before publishing;
   - red only on loss;
   - the single action slot;
   - automatic panel ownership;
   - the 60 s cloud threshold.
3. **Name what a professional operator would miss:** states, failure modes, recovery,
   keyboard-only operation, several outputs, history, a panic path. Comparisons with CasparCG
   clients, SPX, H2R Graphics, Singular.live or vMix are welcome only where you are sure of them;
   say when you are not.
4. **Name anything that would be worse than today.** In particular:
   - rundown density;
   - controls operators press from muscle memory (Setup and All out must not move);
   - things that moved and might now be hard to find: the SPX/HTML template file, the control,
     presenter and audience links, Export, the Bridge download.
5. **Check the draft's factual claims against the code where it is cheap** (it gives file and
   line). Flag anything wrong.
6. **List every sentence left in the mockups** that the UI could say without.

## Output

- A verdict in three lines.
- The top ten issues, ranked by impact on the operator. Each one gives what the issue is, why it
  matters, the change you suggest, and your confidence.
- A decisions table: keep, change or drop, with a one-line reason.
- Missing states or flows.
- At most three questions only the owner can answer.

Keep it under about 1200 words, in plain language, and use no em dashes.
