# Panel ownership lease

Status: agreed with the owner on 2026-10-08 (P1). Not built yet.
Parent: `docs/work-specs/playout-workflow-simplification/spec.md` (owner decision 12, non-goal 2).
It changes `docs/work-specs/hardware-panel-control/spec.md` AC-6 and D2, and `protocol.md` §4
to §6. Everything else of that spec stands.

## Why

A paired Stream Deck answers only on a page where someone switched "Answer the panel on this page"
on. The switch is forgotten on every reload (`src/components/control/PanelControl.tsx`), so after a
browser refresh mid-show the deck shows "No operator page" until somebody finds the switch again.
The last page to switch it on wins, so a second laptop or a phone can take the deck away from the
operator by accident. The server claim never expires, and a crashed or covered page is noticed only
by the module's 12 s silence. Owner decision 12: the panel is owned automatically when free and
never stolen; "Use here" moves it; keyboard shortcuts stay separate.

## Goal

The operator pairs a deck once and then never thinks about which page answers it. The page that
can run the show takes the panel by itself whenever nobody holds it, keeps it through reloads and
short network loss, and never loses it to another page unless someone presses "Use here" there. A
page that dies (closed, crashed, laptop lid shut, network gone) lets the panel go within a known
time, and another eligible page takes it.

## Non-goals

- Changing the press protocol, the panel key, pairing, revoking or the feedback topics (D1, D3 to
  D7 of the hardware panel spec stand).
- Keyboard shortcuts and cue hotkeys: they act on the focused page, as today.
- More than one answering page at once, or splitting verbs between pages.
- Offline operation (the parent's non-goal 4): the lease lives on the server.

## Owner decisions inherited

Parent decision 12 (above) and the hardware panel spec's owner requirements, except "An explicit
'Answer the panel on this page' switch ... The last page to switch it on wins", which decision 12
replaced.

## Key decisions

Owner decision (2026-10-08, binding):

- **P1. Only the production page takes a free panel by itself.** The hosted control page (the
  phone) takes it only by "Use here". The deck sits beside the playout laptop, so no other page
  picks it up silently, for example while the operator's page reloads.

Derived (revertible; each says how):

- **L1. A lease, not a switch.** The server holds, per production, at most one lease: the page
  holding it, where it is (production or control page), its label, the claim number presses are
  stamped with, and an expiry. The holder renews it; one not renewed for the lease time expires by
  itself. Taking a free or expired lease is one atomic call, and taking a live one held by another
  page is refused. "Answer the panel on this page" leaves the UI. Revert: the switch and
  `panel_claim`'s "last one wins".
- **L2. Eligible means published.** A production page with a published production takes a free
  lease. The panel's answer runs at page level, so it keeps running on the Data and Audience views.
  Revert: also require the playout view.
- **L3. Lease time 15 s, renewed every 5 s.** Three missed renewals let it go, above the module's
  own 12 s silence, and a reload (2 to 5 s) never loses it. Revert: the two constants.
- **L4. A reload keeps it.** A page keeps its lease identity for the tab (session storage), so a
  reload renews the same lease at once rather than releasing it. Revert: a fresh identity per load.
- **L5. Never stolen.** A page that finds the lease held by another live page only says so. A page
  whose lease expired while it was cut off does not take it back from whoever holds it now; it
  takes it again only if it is free.
- **L6. "Use here".** On any page that does not hold it, the production page or the phone, one
  press moves the lease there: the server transfers it, the previous holder hears it at once and
  stops answering. No confirm. Revert: a confirm.
- **L7. Renewal that survives a hidden tab.** Chromium throttles a hidden or covered tab's timers
  (to once a minute after five minutes), so the renewal runs on a dedicated worker's timer.
- **L8. A quiet indicator.** With a panel paired, the page shows who answers in one short line:
  "Panel" here, or "Panel on <page>" with "Use here". Nothing shows for a production with no panel.
- **L9. Pages from before this change** keep their switch, and their claim obeys the lease: it
  takes a free panel and is refused one held by a live page, with the page's existing failure line.

## Behaviour

### AC-1: Opening the show takes a free panel
With a panel paired and no page answering, opening the published production page makes it answer
within 2 s, with no switch pressed. The keys leave "No operator page" and show the rundown. Opening
the hosted control page instead takes nothing; it shows "Use here".

### AC-2: A second page never takes it
Opening a second page (another laptop, another tab, the phone) while the first answers leaves the
first answering; the second shows "Panel on <first>" with "Use here". Two production pages opened
together: exactly one answers.

### AC-3: A reload keeps it
Reloading the answering page keeps the panel on it: no other page takes it meanwhile, and the
keys are back within 2 s of the page showing.

### AC-4: A dead page lets go, and the next one takes it
Closing, crashing or cutting the network of the answering page lets the lease expire within 15 s;
another open production page takes it by itself, and the keys follow. With no other production
page, the keys show "No operator page" and an open phone offers "Use here".

### AC-5: "Use here" moves it
Pressing "Use here" moves the panel to that page within 2 s; the previous page shows "Panel on
<new>" and runs no further press.

### AC-6: A covered or hidden page keeps it
An answering page left covered or in a background tab for 30 minutes still answers: presses run
and the keys stay live.

### AC-7: Old modules and pages keep working
A Companion module from before this change pairs, presses and reads feedback unchanged. A page
from before this change can still switch the answer on while the panel is free, and is refused
while another live page holds it (L9).

## Preserved behaviour

The panel key, pairing, revoking and its rotation; press validation, duplicates and stale refusals
(protocol §6.2); feedback on `pfb-`; the module's "No operator page" after 12 s of silence;
keyboard shortcuts.

## Verification

- Node tests: the lease rules (take free, refuse live, take expired, transfer, renew by the same
  page, a lost lease not retaken).
- Migration test on a local stack: two simultaneous takes, exactly one wins.
- Configured e2e: two pages and a fake module; open, reload, close, network cut, "Use here".
- Hidden-tab renewal measured in a real Chromium (Playwright cannot hide a page; a covered window
  on the desktop).
- `/check`, then `/queue-merge`.
