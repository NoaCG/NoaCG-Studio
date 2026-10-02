# One place to control a live graphic: a review of the control surfaces

**2026-10-02.** Answers the owner's ask in `docs/backlog/one-place-to-control-a-live-graphic.md`
(2026-09-22, after a real production test; ranked first on 2026-10-02 under production and
playout). The review proposes. It changes no code. Every finding cites the file and line it comes
from, at `a1634ea5c`, or a screen in this folder.

## The answer in one paragraph

There is already one control model: a graphic declares its fields, machine and controls, and every
surface draws its panel from that. No surface has quiz code. What is not one is the set of
SURFACES: the same verbs are drawn by six pieces of code under four different vocabularies, one of
them claims to air a graphic while it only moves its own preview, and two of the three live
surfaces keep their own copy of a cue's values with nothing that reconciles them. That is where the
owner's "controls in two places" and "a correction did not reach air" come from. The plan is eight
small slices, in order: make the page say when air is behind, give » Next and the other verbs one
meaning everywhere, put a graphic's live actions above its setup fields, make the quiz pick one
press through a generic rule, retire the fake on-air page, then reconcile the hosted page's values
with the dashboard's. Combined controls are unused and should be frozen now; deleting them is the
owner's call. Three slices are ready for the playout session today; three need one owner answer
each.

## Method

- Read: the backlog item and its inputs (`docs/CONTROL_PANEL_ANY_GRAPHIC.md`,
  `docs/PLAYOUT_DASHBOARD.md` §1, §6 to §7d, `docs/GRAPHIC_BEHAVIOUR_PLAN.md`,
  `docs/CONTROL_LAYER.md` "The operator verbs", `docs/work-specs/hardware-panel-control/spec.md`,
  `docs/backlog/operator-page-buries-live-actions-under-setup-fields.md`), the 2026-09-22 row U
  handoff (`git show c4351fca5:docs/handoffs/2026-09-22-u-quiz-live-consistency.md`), and the code
  under `src/control/`, `src/components/home/`, `src/components/HostedControlPage.tsx`, read only.
- Four read-only code sweeps (routes, live-data paths, page size and usage, quiz model), with the
  load-bearing lines re-read by hand: the graphic control page's wire and claims, the hosted
  staging overlay, the dashboard dropping staged rows, the unsent check, the answer board's default
  path, the exported panel's "⟳ Take", and where saved entries are published.
- Screens walked in the local studio at 1600x900 with a throwaway Playwright script (not kept):
  the numbered files and `shots-log.txt` in this folder. The hosted control page needs a
  configured backend and was not walked; its findings are from code.
- A blocking design consult (Fable, `design-consult`) on the simplification; its judgement and
  where this review departs from it are in §7.

## 1. Every way to control a live graphic today

| # | Route | Where | What it can do to a graphic | Wire | Size |
|---|---|---|---|---|---|
| R1 | **Production page** (playout dashboard) | `#/production/<id>`, `src/components/home/ProductionPage.tsx` | TAKE (SPACE), Re-take (R), Update (U), » Next (N), Out (0), All out; staged cue editor; ⚡ GRAPHIC ACTIONS with Snap and Combined inside; ± LIVE NUMBERS; folders; server clips | hosted command log plus the fast road when published (`ProductionPage.tsx:1873-1880`); its own PROGRAM monitor only when not (`:1845-1864`); Bridge for server cues (`:2341-2422`) | 4810 lines |
| R2 | **Hosted control page** | `?control=<slug>`, `src/components/HostedControlPage.tsx` | the same verbs, ⚡, Snap, Combined, ± (`:1457-1560`, `:1830-1860`, `:2045-2184`); no folders, no server cues, no pause (`src/components/playoutKeys.ts:22-35`) | command log; field edits go to a shared server-side staging buffer (`:831-843`, `src/control/hostedControl.ts:1801`) | 2187 |
| R3 | **Exported production controller** | the show export's local package, `src/control/productionControllerHtml.ts` | → Preview, TAKE, Re-take, Update, » Next, Out, All out, ⚡, ± (`:368-396`, `:850-877`, `:1201`); no Snap; Combined is one line pointing to R2 (`:1124-1135`) | bundled local relay (`:437-440`) | 1257 |
| R4 | **Graphic control page** ("Control panel" on a Home library row) | `#/control/<graphicId>`, `src/components/home/GraphicControlPage.tsx`; menu item `GraphicRow.tsx:176-178` | ▶ Play, ⟳ Update, » Next, ■ Stop, ⚡ events, saved entries, motion presets, controlpanel.html download (`:722-803`, `:912-984`) | **its own preview iframe only** (`postPreviewCmd`, `:196-199`). Nothing reaches an output. | 1009 |
| R5 | **Exported controlpanel.html** (one graphic) | HTML overlay, CasparCG and show exports, `src/control/controlPanelHtml.ts` | ▶ Play, ■ Stop, ⟳ Take, » Next, ⚡ events; a "Live" box that airs every keystroke (`:381`, `:465`, `:845-853`) | BroadcastChannel, local relay, public Realtime | 903 |
| R6 | **Rehearse** in the old code editor | `src/components/ControlPanel.tsx`, mounted only by `AppShell.tsx:287` / `SidePanel.tsx:57` | preview only | none: no route renders AppShell (`src/App.tsx:388`) | 417 (+572 shell) |
| R7 | **Keyboard and hardware panel** | `src/components/playoutKeys.ts` on R1 and R2; R3 has its own copy (`productionControllerHtml.ts:690-701`); Companion relay `src/control/panelRelay.ts`, verbs `panelFeedback.ts:16-31` | the R1/R2 verbs by key; a Stream Deck presses named verbs | through the answering page's own dispatcher; today only R2 answers (`HostedControlPage.tsx:504`), the hardware-panel session is adding R1 per its spec | 225 / 1537 module |
| R8 | **Production data tree** | Data tab (`ProductionDataPanel.tsx`), `/api/data/*` | a bound field changes on air at once on every graphic bound to it | server writes update rows (`api/data/[...path].ts`) | 666 |

Not routes, checked: the new editor has no live verbs (`src/components/editorFoundation/PreviewController.ts`
drives its own sandbox); editing a library graphic reaches air only through a publish, and the
output reloads onto a new version only when nothing is on air (`src/output/main.ts:331-333`). The
Audience workspace makes cues and airs nothing (`ProductionAudienceWorkspace.tsx:48`). The CLI's
`noacg caspar send` can send raw AMCP to any CasparCG layer (`cli/src/commands/caspar.ts:56-96`);
it is outside the control model on purpose.

## 2. Where they duplicate each other

1. **R4 is a second control system that says it airs.** It shows a red "● ON AIR" badge
   (`GraphicControlPage.tsx:685`) and the hint "This is the on-air control surface. Playing an
   entry here airs it" (`:923-924`, comment `:80`), while every press goes to its own preview
   iframe (`:196-199`). See `07-graphic-control-page-says-on-air.png`: after ▶ Play the red ON AIR
   badge and frame are up in a studio with no output open, and the quiz's ⚡ Select answer has no
   letter to choose until an entry is made. This is the "controls in
   the template editing area" the owner met, and `docs/GOALS.md` lists "a second cue or control
   system beside the production workflow" as a standing non-goal.
2. **The operator block is written three times.** R1, R2 and R3 each draw TAKE, Update, » Next,
   Out, ⚡ and ±; `docs/PLAYOUT_DASHBOARD.md` §0 says they "must not diverge", and they already
   do in small ways:
   - ⚡ greys on R1 when the layer is not live (`ProductionPage.tsx:3510`); R2 checks legality only
     (`HostedControlPage.tsx:1833`).
   - All out on R1 also cuts server clips and unnamed slots (`ProductionPage.tsx:2599-2600`); on R2
     graphic layers only (`HostedControlPage.tsx:1046-1053`).
   - The P key pauses on R1 and R2 (`playoutKeys.ts:103`) and means → Preview on R3
     (`productionControllerHtml.ts:699`).
3. **Four vocabularies for four verbs.** The glossary (`docs/CONTROL_LAYER.md` "The operator
   verbs") defines ⟳ Take, ✎ Update, » Next, ■ Out, and ▶ Play / ■ Stop for single-graphic pages.
   R5's "⟳ Take" sends only an update (`controlPanelHtml.ts:848-852`), the opposite of the
   glossary's Take. R4 says "⟳ Update" (`GraphicControlPage.tsx:726`), the dashboards "✎ Update".
   The cue editor's "↷ Next" loads the next data row (`ProductionPage.tsx:4128-4141`) beside a
   verb row whose » Next advances the graphic.
4. **Four places a cue's values come from.** The cue itself (R1), the shared staging buffer (R2),
   a graphic's saved entries (authored on R4, published read-only to R2,
   `hostedControl.ts:72-78`, loaded at `HostedControlPage.tsx:1747-1756`), and production data rows
   (R1's "↷ Next", R2's `loadDataRow`, `HostedControlPage.tsx:1759-1767`). Entries and data rows do
   the same job; only data rows reach R1.
5. **Three sources for a ⚡ payload.** R4 takes the active entry (`GraphicControlPage.tsx:427-432`),
   R1 the on-air cue (`ProductionPage.tsx:3196`, `:3207-3213`), R2 the box as typed
   (`HostedControlPage.tsx:1836`). The same press can carry three different values.
6. **R6 is dead code.** `ControlPanel.tsx`, `AppShell.tsx` and `SidePanel.tsx` (989 lines) have no
   route. It is editor-area cleanup rather than a playout slice, so it is listed here and not
   planned below.

## 3. Where live data falls out of sync

Ranked by how likely each is in a student-run show. "Says so" is whether the operator can see it.

| # | Scenario | Air shows | Says so? | Evidence |
|---|---|---|---|---|
| S1 | The operator edits the ON-AIR cue, does not press ✎ Update, and clicks another row | the old value, until some later Take or Re-take of that cue airs the forgotten edit | **No.** The "not on air yet" line and the dot on Update exist only while that cue is in the editor (`ProductionPage.tsx:2311-2317`, `:3916-3932`); `selectCue` drops the draft into the record (`:1750-1757`) and the rundown row carries no mark | `02-` then `03-`: the amber line is there, then gone, and the ON AIR row and the Update button carry nothing (`shots-log.txt`: 1, then 0) |
| S2 | Two cues of one lower third on R2, or yesterday's rehearsal typed on R2 | R2's Take airs values typed into the OTHER cue or the earlier session | No | R2 overlays `staged[cue.graphic]`, keyed by graphic, on every cue of that graphic (`src/control/hostedCombine.ts:124-134`); `control_stage` only merges into the column (`supabase/migrations/0022_entitlement_absolutes.sql:257`) and nothing resets it |
| S3 | A second operator corrects a value on R2 and presses Update; the producer on R1 then presses Update or a ⚡ action that carries it (the quiz's Reveal) | R1 re-sends its stale value and undoes the correction | Partly: R1 shows an amber "1 change not on air yet" that invites the very Update that does the damage | R1 drops `staged` rows (`ProductionPage.tsx:887-891`); its ⚡ payload comes from its own cue (`:3196`, `:3207-3213`); filed as `docs/backlog/quiz-control-questions-the-answer-key-fix-left-open.md` |
| S4 | A field bound to the production data tree | a permanent amber that Update cannot clear; and before the tree loads, the box reads "not set yet" while Take airs the cue's stale stored value | Wrongly | `unsentFields` compares the stored value with the aired tree value (`:2311-2316`); `withBoundValues` falls back to the stored value (`:1353-1358`) |
| S5 | A ⚡ or combined press is refused (rate cap, stale, network) | air keeps 2 while the cue now holds 3; the next Take airs 3 | One line on the note line, replaced by the next note | the figure is mirrored into the cue before the send (`:3214-3219` before `:3227`; `:3418-3421` before `:3428`) |
| S6 | The operator's tab reloads | combined waits are dropped, folder step memory falls back to air, a draft typed in the last 300 ms is lost | No | `:688-690`, `:423-426`, `:2328-2329`; `useDeferredEdits.ts:36-38` |

The fast and durable command roads are not a likely source: a sender's own slow event holds its
graphic's later fast sends for 1200 ms (`hostedControl.ts:1186-1197`). Across two devices the
order can differ, which is a stated limit (`:1105-1108`).

The rule that must not move while fixing these: **nothing airs because it was typed.** The staged
draft is what makes the page safe for a nervous operator (`docs/CONTROL_LAYER.md`, "Editing is
always a DRAFT"). Every fix below keeps it and makes the gap between draft and air visible instead.

## 4. Quiz controls and every other graphic's controls

The control layer has no quiz branch. The one quiz-aware line is a re-derive ledger entry that
adds the answer key to an old saved quiz's Reveal (`src/control/controlUpgrades.ts:33-58`). The
inconsistency the owner felt is between two **declarations**:

| Family | Boards | Pick | Lock | Reveal |
|---|---|---|---|---|
| Answer board, "Pick, then lock" (`src/templates/types/answerBoard.ts:144-154`) | qz01 to qz12, and every imported SVG quiz (`src/templates/behaviours/quiz.ts:97-100`) | choose the letter in the cue editor's Selected answer field, **then** press ⚡ Select answer in the block below: two places, two presses | ⚡ Lock it in | ⚡ Reveal correct, carrying the Correct answer field |
| Quiz show, "Pick, one press" (`src/templates/types/quizShow.ts:80-92`) | qz13 to qz15, including the Arcade quiz | ⚡ Pick A to Pick D: one press | none | ⚡ Reveal correct answer |

Every other press-to-pick graphic already uses one press per row (`behaviours/choice.ts:67-74`,
`behaviours/survey.ts:82-97`). The podium spotlight has the answer board's field-then-button shape
(`types/podiumScore.ts:124`). So the fix is not "a quiz model": it is one generic rendering rule
for any action that carries a field with a few fixed options. See `02-` (answer board: the
letter in F6 Selected answer, then ⚡ Select answer far below it) against `03-` (show board: ⚡
Pick A to Pick D in one row).

**» Next on a quiz goes straight to the reveal, by declaration.** The answer board's main path is
Question, then `judge`, then Reveal (`answerBoard.ts:37`), with select and lock as branches off
it; `next` from Locked rejoins the reveal (`:76-77`). The glossary says the same ("» Next -
advance the live graphic to its next step (its reveal)"). The owner's 2026-09-30 finding
(`docs/backlog/quiz-next-jumps-to-last-step.md`) is this, not a skipped step: one press of » Next
is a second Reveal button that nothing on the page names. Measured (`06-`, `shots-log.txt`): at
Question the button's hint reads "Advance House Quiz to its next step", one press leaves the state
chip at Reveal, and the activity line says "Next step".

## 5. Do Combined controls and » Next earn their place?

**Combined controls: not yet, by every measure available.** About 1.7k lines (`src/control/combine.ts`
365, `combineSend.ts` 286, `src/components/control/CombinedButton.tsx` 100, about 340 of the
composer in `ProductionControlsPanel.tsx`, `src/control/hostedCombine.ts` 184, about 300 inside
`ProductionPage.tsx` at `:672-701`, `:3252-3486`, `:4419-4427`, about 120 in `HostedControlPage.tsx`).
- No shipped pack, docs example, fixture or research walk uses one: `public/packs/*` carry no
  `profile`; the proof-case fixture `e2e/fixtures/agent-made/vote-show.noacgpack.json` has none
  and the spec writes one in.
- The user docs (`public/docs.html`, `src/docs/docs.ts`) never mention them.
- The owner's acceptance walk for them (`docs/acceptance/owner-queue/2026-09-16-a-profile-driven-where-the-show-is-run.md`)
  was filed and never walked.
- The design's own proof case needs "two presses plus one per correct guess, every one of them in
  today's dashboard" (`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §3c).
- Two open defects (`docs/backlog/a-renamed-control-still-wears-its-section-in-a-combined-step.md`,
  `docs/backlog/hosted-combined-control-two-operators.md`), and their waits die with the tab (S6).
- Against removal: `docs/GOALS.md` outcome 4 names "combined presses" in its desired state, and
  `docs/RUNDOWN_AUTOMATION_PLAN.md` names Combined as the host of linked cues. Folders' "All
  together" (`docs/PLAYOUT_DASHBOARD.md` §2i) now covers one press airing several cues.
- What removal breaks: nothing that ships. The exports read `readPublishedProfile(...)?.combine ?? []`
  (`src/export/showExport.ts:373`, `spxLeftBehind.ts:113-115`) and already test the empty path
  (`e2e/shows.spec.ts:464`, `:494-498`); stored profiles need a tolerant reader.

**ARRANGE** (pin, rename, hide ⚡ controls per production; `src/model/profile.ts`, about 300 lines
of the Controls panel) has the same usage record, but it answers a real filed problem: the
buttons pressed all game sit below the fold. Its data is worth keeping; its separate panel is not.
See `05-controls-panel.png`.

**» Next: yes, it stays.** It is the verb a playout host with no panel walks (SPX Continue, OGraf,
CasparCG) and a Companion key presses (`companion-module/src/presets.ts:80`). What does not earn
its place is a » Next that is lit when it will do nothing and silent about what it will do:
- `canAdvance` returns true before any state is reported, with no parseable machine, or with no
  current state (`src/control/controlModel.ts:696-712`);
- every server template cue gets it regardless (`ProductionPage.tsx:3122-3124`);
- R3, R4 and R5 never grey it (`productionControllerHtml.ts:797`, `GraphicControlPage.tsx:729-731`,
  `controlPanelHtml.ts:849`);
- the log writes "Next step" for any press (`src/control/eventLog.ts:66`).

"Next Steps" in the owner's ask is read here as » Next walking a graphic's steps, since no surface
has a feature by that name. If he meant Combined's steps, §5's first half answers it.

## 6. Has the playout page accumulated code nobody needs?

`ProductionPage.tsx` is 4810 lines with 54 `useState`s. Most of it is real work the page does:

| Part | Size | What removing it would cost |
|---|---|---|
| Combined controls + composer | about 1.7k lines across files, about 300 in the page | nothing that ships; 4 e2e tests in `e2e/production-controls.spec.ts:1394-1704`, the hosted walk, 19 unit tests; the GOALS line and the linked-cues plan (owner) |
| ARRANGE / Controls panel | about 300 lines of panel, half of `profile.ts` (788) | the pin/hide feature, unless it moves onto the ⚡ buttons; 2 e2e tests (`:1197-1393`); the exported controller already degrades to the generated panel |
| Snap picker | about 55 lines inline (`:3231-3250`, `:4348-4380`) | the only recovery tool after a renderer restart; keep, folded closed |
| ± LIVE NUMBERS | about 90 lines | pinned by 10 specs and the user docs; keep |
| Folders | 1100 lines across files | built 2026-09-28 for clips; keep |
| Clip clock, server cues | 2620 across files | the CasparCG road; keep |
| Data tree and Audience | 2866 across files | separate tabs (`sub === 'audience'`, `:3807`), not the playout column; keep |
| The operator block itself, drawn again in R2 and R3 | R2 2187, R3 1257 | the structural duplication. One shared component for R1 and R2 is the long-run answer and a larger refactor than this plan |

Code that can go with no feature loss: R6 (989 lines, editor area), the fake on-air claims in R4,
and Combined if the owner agrees. The page is not bloated with dead code; it is long because three
products (graphics, clips, data) share one column, and the controls a student needs are not at the
top of it (`docs/research/plugin-graphics-quality-2026-10-02/brief-2-hockey/01-ready-page.jpg`, and
`01-answer-board-cue-at-load.png` here, where the quiz's Reveal row is cut by the fold at
1600x900 under eight setup fields).

## 7. The design consult

Asked of `design-consult` (Fable), blocking, with the evidence above. Its judgement, with reasons:

1. **One place.** R1 is the surface, R2 the same surface on another device, R3 its offline copy:
   the only answer consistent with the GOALS non-goal. R4 should be **removed, not relabelled**: an
   honest preview still leaves a second verb set (Play, Stop, entries) on the Home row for a student
   to find first, and the editor already previews. Its caveat: saved entries are published to R2,
   so they need a migration first. Checked: they are (`hostedControl.ts:72-78`).
2. **Quiz.** The generic fix: an action whose payload field has a few fixed options renders those
   options as buttons inside the ⚡ block ("Select answer: A B C D"), one press, no template
   rewrite, and the podium spotlight is fixed with it. Lock survives as a beat the design draws,
   never a required step. Whether the twelve answer boards keep a lock is the owner's taste call.
3. **» Next.** Keep it on the wire and the button. Name the target when the machine knows it
   ("» Next: Reveal"). Where Next equals a declared action, keep both: the ⚡ button is the one that
   carries the key. Rename "↷ Next" to "Load next row".
4. **Combined and ARRANGE.** Freeze Combined now (hide the composer and the section when a profile
   has none; keep reading old profiles); deletion is a direction change for the owner, because
   GOALS names combined presses. Keep ARRANGE's data, remove the separate Controls panel, put pin
   and hide on the ⚡ buttons.
5. **Simplest for a student, in order:** live actions directly under the monitors; one honest
   surface and one vocabulary; the edited-but-not-sent mark on the ON AIR row. **Do not touch**
   TAKE on SPACE, the PVW/PGM pair, and "nothing airs because it was typed".

**Where this review departs from it, and why:**
- **The quiz's default path stays.** Fable proposed that Next from Question go to the pick rather
  than the reveal. The default path is what SPX Continue and every host with no panel walks, and a
  pick needs a letter Next cannot carry. Naming the target on the button makes the jump visible
  without changing what a dumb host does. Recorded as a decision the owner can overturn.
- **» Next greys with its reason rather than hiding.** Fable proposed hiding it when the state has
  no next step. The verb row is muscle memory (SPACE, R, U, N, 0) and the phone layout has a fixed
  TAKE · Next · Out bar (`docs/PLAYOUT_DASHBOARD.md` §3); a button that comes and goes moves the
  others under the operator's thumb. The label carries the reason instead ("» Next: last step").
- **R4 is fixed in two steps.** Its false ON AIR claim is a defect today and needs no decision;
  removing the page needs the entries migration and the owner's yes, so it is a later slice.

## 8. The plan: small, ordered slices toward one way

Each slice stands on its own and lands separately. "Ready" means the playout session can start it
with no owner answer. The playout and hardware-panel sessions own `src/control` and have work in
flight there; slices 5 and 7 touch the same files as the R1 panel answer and should follow it.

| # | Slice | Files | Done when | Ready? |
|---|---|---|---|---|
| 1 | **Air is behind, said where you look.** The rundown's ON AIR row carries an "edited, not sent" mark while its cue differs from air (S1). Bound fields never count as unsent, and a bound box whose tree has not loaded refuses Take with the reason instead of airing the stored value (S4) | `ProductionPage.tsx`, `CueRundown.tsx` | a walk that edits the on-air cue and selects another row still shows the mark on the ON AIR row; a bound scoreboard shows no amber after Update | **Ready** |
| 2 | **» Next says what it will do.** The button and its N hint name the target state when the machine knows it ("» Next: Reveal correct"), grey with "last step" when there is none; `canAdvance` stops returning true for "no report yet" once a report is due; the cue editor's "↷ Next" becomes "Load next row" | `controlModel.ts`, `ProductionPage.tsx`, `HostedControlPage.tsx` | on a quiz at Question the button reads "» Next: Reveal correct"; `docs/backlog/quiz-next-jumps-to-last-step.md` closes as explained | **Ready** |
| 3 | **One vocabulary.** R5's "⟳ Take" becomes "✎ Update" with the glossary's hint; R3's P key means pause as on R1/R2 (preview moves to another key); R4's "⟳ Update" becomes "✎ Update" | `controlPanelHtml.ts`, `productionControllerHtml.ts`, `GraphicControlPage.tsx` | every surface's verb row reads from the glossary in `docs/CONTROL_LAYER.md`; the copy gate passes | **Ready** |
| 4 | **Live actions first.** When a graphic declares events, the ⚡ block sits under the monitors and setup fields fold below once set; Snap folds closed; pin and hide move onto the ⚡ buttons and the separate Controls panel goes (ARRANGE data unchanged) | `ProductionPage.tsx`, `ProductionControlsPanel.tsx`, `HostedControlPage.tsx`, css | the hockey brief's clock and goal buttons show without scrolling at 1600x900 (the AC of `operator-page-buries-live-actions-under-setup-fields.md`); a graphic with no events gets today's panel | Ready (answers a filed item); the visual result needs the owner's look |
| 5 | **R4 stops claiming air, then goes.** Now: remove the ON AIR badge and the "airs it" copy (`GraphicControlPage.tsx:80`, `:685`, `:923-924`). Later: move controlpanel.html download to Export, migrate saved entries to production data rows, remove the route and the Home menu item | `GraphicControlPage.tsx`, `GraphicRow.tsx`, `hostedControl.ts`, export | the first half: no surface outside R1, R2, R3 says ON AIR. The second: `#/control/<id>` redirects to the graphic's production or editor | First half ready; **removal needs the owner** |
| 6 | **One-press pick, by a generic rule.** An action whose payload is a field with a few fixed options draws those options as its buttons inside the ⚡ block, and one press sets the field and fires the event | `controlModel.ts`, the three renderers | on qz02 one press of "B" under Select answer selects B on PROGRAM; the podium spotlight works the same; `e2e/quiz-live-consistency.spec.ts` updated | Ready to build; **whether the answer boards keep Lock is the owner's taste** |
| 7 | **One set of values across R1 and R2.** R2's staging becomes per cue and clears on Take; R1 shows R2's staged edits in its editor ("changed on another screen") and stops re-sending a value it has not seen; a press mirrors into the cue only after the send is accepted (S2, S3, S5) | `hostedControl.ts`, `hostedCombine.ts`, a migration, `ProductionPage.tsx`, `HostedControlPage.tsx` | two operator pages on one production: a correction on either reaches air from either, and the quiz key case in `quiz-control-questions-the-answer-key-fix-left-open.md` passes | Ready after the hardware-panel R1 work lands; largest slice |
| 8 | **Freeze Combined.** Hide the composer and the Combined section unless the production already has one; keep reading stored profiles | `ProductionControlsPanel.tsx`, `ProductionPage.tsx`, `HostedControlPage.tsx` | a new production shows no Combined UI; an old one with a combined control still runs it | **Needs the owner**: freeze now and delete later, or keep |

Not planned: one shared operator component for R1 and R2 (the structural fix for §2.2, a larger
refactor this ask ruled out), R6's deletion (editor area), the S6 reload losses beyond Combined
(page memory by design), and the fast-road ordering across devices (a stated limit).

**What goes to the owner, one question each:**
1. Remove the graphic control page and fold its entries into production data rows (slice 5)?
   Recommended: yes.
2. Do the twelve answer-board quizzes keep a Lock beat (slice 6)? Recommended: yes, as an optional
   beat the design draws, since a "final answer" moment is a real format.
3. Combined controls: freeze now and delete later, with linked cues built on folders or a
   server-side sequence where a reload cannot drop a wait (slice 8)? Recommended: freeze now.

## 9. What this review did not check

- The hosted control page (R2) on a real backend, and two operator pages on one production: S2 and
  S3 are read from code and the filed backlog, not reproduced. S4 to S6 are also read from code;
  only S1, the » Next jump and R4's ON AIR badge were reproduced in the browser.
- R3 and R5 in a browser; their findings are from code.
- Usage of Combined or ARRANGE in production databases: the review measured the repository only.
- The hardware panel on R1: in flight in another session.

## Files in this folder

- `01-answer-board-cue-at-load.png`: a quiz cue selected on R1 at 1600x900.
- `02-answer-board-unsent-key-and-actions.png`: the on-air quiz after a pick and an unsent key change.
- `03-walked-off-the-on-air-cue.png`: the same moment after selecting another row (S1); the
  editor now shows the Arcade quiz's one-press pick.
- `05-controls-panel.png`: the Controls panel (ARRANGE and the Combined composer).
- `06-next-from-question.png`: one » Next from Question on the answer board.
- `07-graphic-control-page-says-on-air.png`: R4's ON AIR badge with no output involved.
- `shots-log.txt`: what the walk read off the page at each step.
