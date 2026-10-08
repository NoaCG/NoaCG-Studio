# Panel ownership lease

Status: draft, 2026-10-08. Not agreed; not built. The open owner questions are under "To decide".
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

## Proposed decisions (to confirm; see "To decide")

- **L1. A lease, not a switch.** The server holds, per production, at most one lease: the page
  holding it, its label, and an expiry. A page renews it every few seconds; a lease not renewed
  for the lease time expires by itself. Taking a free or expired lease is one atomic call; taking
  a live one is refused, except through "Use here". This replaces `panel_claim`'s "last one wins".
- **L2. Who may take it by itself.** A page takes a free lease automatically only when it can run
  the panel's verbs now: published, its playout surface mounted (not the Data or Audience view),
  and signed in where the production needs it. Which page types qualify is question Q1.
- **L3. A reload keeps it.** A page remembers its lease identity for the tab (session storage), so
  a reload renews the same lease at once rather than releasing it and racing the other pages.
- **L4. Never stolen.** A page that finds the lease held by another live page does nothing but say
  so. A page that lost its lease (it expired while the page was cut off) does not take it back
  from whoever holds it now.
- **L5. "Use here".** On a page that does not hold the lease, one press moves it there: the server
  transfers the lease, the previous holder hears it at once and stops answering. No confirm.
- **L6. A heartbeat that survives a hidden tab.** Chromium throttles timers in a hidden or covered
  tab (to once a minute after five minutes). The renewal runs where throttling cannot starve it
  (a dedicated worker's timer), so a covered operator page keeps the lease.
- **L7. A quiet indicator.** With a panel paired, the page shows who answers in one short line:
  "Panel" (here) or "Panel on <page>" with "Use here". Nothing shows for a production with no
  panel paired.

## To decide (owner)

- **Q1. Which pages take a free panel by themselves?** The production page on a laptop, and also
  the hosted control page on a phone, or the laptop only (the phone takes it only by "Use here")?
- **Q2. How long may the panel stay with a page that went silent?** Shorter means a crashed page
  hands over faster; longer means a flaky network flaps less.
- Further questions, if any, follow from the answers.

## Behaviour

### AC-1: Opening the show takes a free panel
With a panel paired and no page answering, opening the production page (published, playout
surface showing) makes it answer within 2 s, with no switch pressed. The keys leave "No operator
page" and show the rundown.

### AC-2: A second page never takes it
Opening a second eligible page (another laptop, another tab, the phone) while the first answers
leaves the first answering; the second shows "Panel on <first>" with "Use here". Opened together,
exactly one answers.

### AC-3: A reload keeps it
Reloading the answering page keeps the panel on it: no other page takes it meanwhile, and the
keys are back within 2 s of the page showing.

### AC-4: A dead page lets go, and the next one takes it
Closing, crashing or cutting the network of the answering page lets the lease expire within the
lease time; another eligible page that is open takes it by itself, and the keys follow. With no
other page, the keys show "No operator page".

### AC-5: "Use here" moves it
Pressing "Use here" moves the panel to that page within 2 s; the previous page shows "Panel on
<new>" and runs no further press.

### AC-6: A covered or hidden page keeps it
An answering page left covered or in a background tab for 30 minutes still answers: presses run
and the keys stay live.

### AC-7: Old modules and pages keep working
A Companion module from before this change pairs, presses and reads feedback unchanged. A page
from before this change can still switch the answer on, and the lease rules then apply to it as
to any page that takes the lease by hand.

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
