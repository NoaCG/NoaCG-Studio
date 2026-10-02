# The page half on the hosted control page (AC-1, AC-3, AC-4, AC-6, AC-7 in part)

Run on 2026-10-02 from the owner's Windows 10 laptop, branch `claude/hardware-panel-page`, against
the temporary preview branch `tyefsqusudalbwysqbhe` (migration 0073 applied; see
`server-relay-on-preview-branch.md`). The production page's hook-up is not in this piece: its file
was in flight in another session, so it lands after that one.

## Unit: `scripts/panel-feedback.test.mjs`

13 tests, 13 pass. The press judge: a press on the row its key showed runs; a moved selection is
`stale`; Take whose toggle direction changed since the key was drawn, or drawn too long ago, is
`stale`; walking and All out are never stale; Take a cue on a vanished row or one that went on or
off air since is `stale`, and taking it off as the key showed runs; pause-toggle on a changed clip
is `stale`; a greyed verb or blocked cue is `not-allowed`; a verb the surface does not run is
`not-here`. The press-id memory (10 minutes, last 256), the state ring, change detection that
ignores the clock's render jitter, the clip clock as an end in the page's clock (TO STUDIO when a
clip follows, none while paused, the past end while holding), reading only `press_id` and never
Realtime's own `id`, and the wire shapes. Mutation: disabling the moved-selection rule fails one
test.

## Configured: `e2e/configured/panel-page.spec.ts` with `panel-relay.spec.ts`

Through the job queue with the branch's environment, `--retries=0`.

- **j-2909: 8 passed, exit 0** (the page walk and the seven server tests). The walk, on a published
  two-cue production (Anna, Ben) opened as the hosted control page:
  - the Panel door reads Off and the dialog says no page answers; "Pair a panel" shows an
    `XXXX-XXXX` code; the "module" (an anonymous client) exchanges it, and the page lists "Spec
    deck" within 10 s and hides the spent code;
  - switching "Answer the panel on this page" on: the door turns to Answering here, and the module
    receives a state (`where: control`, `space: take`, nothing live, Take allowed, Out not) and the
    rows Anna, Ben;
  - a relayed Take airs Anna (the page's live chip says so); press call to the page's result 144 ms
    in this run (115 to 442 ms across runs on a loaded machine); the next state shows Anna live,
    `space: take-off`, Out allowed;
  - the same press id again is answered `duplicate` and nothing more airs;
  - a Take drawn before Anna went up is `stale`; the dialog's last-press line and the page's own
    activity feed say "Spec deck: Take refused, what Take does changed"; Out drawn for Ben while
    Anna is selected is `stale`;
  - Take a cue on Ben airs Ben and selects him, and again takes him off;
  - with nothing on air All out is `not-allowed` (the header button is greyed too); with Anna up it
    runs and the chip reads nothing on air;
  - a second hosted page switches the answer on: the first page's switch turns itself off within
    2 s and says which page answers now; the module's next state comes from the second page, which
    runs a select-next;
  - closing the second page lets go: hello then reports no page answering.
- Earlier runs (j-2894, j-2904, j-2906, j-2907, j-2908) failed on four spec bugs, each fixed in the
  spec and none in the page: a duplicate check that matched the first press's own result, All out
  pressed with nothing on air (Anna and Ben share a graphic, so Ben's Take replaced her), a state
  wait that matched a state from before the press, and Realtime sockets still closing at exit, which
  trips a libuv assertion on Windows after every test passed.

## The dialog, seen

`test-results/panel-dialog-answering.png` from j-2909: the shared dialog anatomy (header with the
close square hard right, the `.dlg-check` row "Answer the panel on this page" with its status line
under it), a "Pair a panel" section, and the paired panel with its date, last use and Revoke,
sized to its content at 560 px wide. Not checked: a phone-width rendering of the dialog.
