# V2 strict XML replacement receipt

The strict parser passed independent review. V2 remains blocked. The reviewed
local head is `c2e07c54d631bb0453d2e104ba281e2f1a5c6ea6` against
`74102c14a69818a3426323f01b83ff7a5da626c0`. The implementation commit is
`692796562`. PR #2293 remains open and draft at the pre-code Rules checkpoint
`3bda7063405c8862586cab12c5578e2f2f38cf91`, with auto-merge absent. The four
previous parser attempts and their reviews are retained.

The Rules review was AGREE WITH CORRECTIONS. The corrected rules and evidence
are in the candidate's phase-v2.md. Fresh independent review of all 34 files
at the exact head gave the XML repair A and full V2 B. Its compiled fake saw
the exact new Browser marker, then an undefined entity in ignored XML, and
observed only AddInput, an uncertain result, no ownership or redirect, and an
empty Overlay 8. The same reviewer independently verified wire framing, QName
and namespace handling, valid nested metadata, scalar content and depth bounds.

The actual local `/check` stamp is `exact-check-stamp.json`. The Codex review
read the same 34 files against the earlier base `5dec450ec83a0de47af76fec172c5717db8c9f27`.
Its verdict was discarded and its findings were replayed against the exact
candidate. Review ran in discarded+inline mode with five families and zero
fixed in this scoped repair. Simplify ran inline with no resulting change.
Verify ran inline. The stamp records FAIL. The earlier b3bf2f226 pass stamp is
preserved as `prior-check-stamp.json`.

## Verification

- The new regressions reproduced on the prior compiled Bridge. The strict
  candidate passed 94 focused vMix, CasparCG and Bridge tests. The package
  conformance probe rejected 1,017 selected malformed XML cases. Saxes 6.0.0
  and xmlchars 2.2.0 are pinned only in the CLI. The package comparison, Saxes
  archive status, QName check and depth bound are in the phase evidence.
- The changed-file gates passed 393 tests after correcting a Windows checkout
  conversion of an unchanged file to match its committed LF blob. The failure
  remains in `changed-gates.log`, and the exact success in `exact-gates.log`.
  Studio TypeScript and lint passed. The Studio lint configuration excludes the
  CLI TypeScript paths, which the TypeScript step of the CLI build covered.
  The focused Studio setup tests passed 12 tests.
- Windows Bridge 0.11.0 returned healthy. Its SHA-256 was
  `56c5beed4707bf8cafd0193b11e2cc3c0ed126d0d772d7f21ca9c04aad6163eb`.
  Four owned vMix 29.0.0.49 Trial preset stages passed on ports 48833/48834.
  The two configuration files were hash-verified after each stage. The vMix
  service stayed running and Program/Preview selections stayed fixed. The
  packaged evidence is under `packaged-preset`. vMix 28 and Basic HD have
  focused fake coverage. The real device run used vMix 29 Trial.
- The two browser specs under job `j-5040` logged all 69 tests passing.
  The queue recorded `failed`, `reapedAsDead: true` and `exitCode: null`.
  Preserve the test output and failed infrastructure receipt separately.
  Configured CI, queue admission and AC-6 release remain open.

## V2 issues outside the parser repair

- After healthy HTTP `/health`, a 200 JSON `null` reply throws at
  `src/control/playoutLink.ts:537` on `/status`, `/connect`, `/state` and
  `/act`. `{ "ok": "false" }` reports Connected for `/state` and `/act`.
  An HTTP `/state` claiming ownership of Overlay 99 with no input passes
  through `src/control/vmixSetup.ts:30` on an eight-channel status. These
  break the V2 AC-3 and AC-5 handling of status, actions and on-air state.
  See `http-boundary-repro.log` and `remaining-v2-repro.log`.
- An earlier four-channel `/status` followed by an eight-channel `/state`
  sends Load to Overlay 4 without a saved preference. This breaks the V2
  AC-3 default-highest behavior during an edition change. The stub reproduction
  is in `remaining-v2-repro.log`.
- `readAction` accepts uppercase expected input GUIDs, but the vMix adapter
  compares them verbatim with normalized live keys. The exact fake rejects an
  uppercase key and accepts the same lowercase GUID. This breaks the AC-5
  confirmed Replace when a caller uses the accepted uppercase spelling.
- `node scripts/e2e-affected.mjs --list --files src/control/vmixSetup.ts`
  omits `e2e/publish-output-setup.spec.ts`, whose first-Publish cases use that
  module. This is a test-selection gap for subsequent vMix setup edits.
- A compiled fake preserved the stored Browser GUID and type while assigning
  a different URL and title. The Bridge sent SetInputName and OverlayInput8In
  and reported success. The fake showed the different URL. This conflicts with
  the expected production output URL in AC-4 if real supported retargeting
  preserves the stored GUID. The reproduction in this repair is a fixture only.
  Measured vMix 29 XML exposes the key, type and title and has no Browser URL.
  Earlier real evidence confirms BrowserNavigate reaches another live URL and
  the saved preset kept its original marker URL. This repair did not verify that
  editing the persisted URL in real vMix 29 retains the same GUID. The recorded
  ownership rule explicitly keys the input by vMix port, address and GUID and
  specifies forgetting a missing key. It has no transition for a URL edit.
  Treat changing that ownership rule as a product decision, distinct from XML
  parsing and ordinary reply validation.
