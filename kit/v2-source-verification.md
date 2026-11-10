# V2 Browser source and reply repair worker receipt

The clean local candidate is `c0ce9c0ff422f3dc1ffa28923a8f92564d5cd6ff`,
based on `e6be4cf3dcbcb103a7ea0372d30d0505845a8ba8`. The product commit
`dc3cb2f9981dfb2f10e6bf0c347148f4d68ff463` and its evidence-only successor
are local. Draft PR #2293 remains at the published Rules checkpoint
`a628eda0882c9fc3c37203d1a79b10a2320468c7`. The coordinator owns the
independent review and final PR disposition.

## Open product blocker

The later independent review reproduced additional malformed `/act`
envelopes on this candidate. HTTP 401 with a v2 target error carrying
`uncertain` is reported as a definite token refusal. HTTP 403 with
`{ok:false,v:999,error:null}` is reported as a definite origin refusal.
A normally shaped `/act` success with `renderers:[]` or `expiresIn:120`
also passes because those known wrong-route fields are missing from the
allowance check. This is open product work. V2 has no overall PASS, and
the candidate was not pushed or queued. The exact independent verdict
is the coordinator's receipt.

## Local verification

- AC-1. The installed CLI compiled, and the exact combined vMix, Bridge,
  CasparCG and server selection passed 105 of 105 tests. It includes the
  strict XML cases, the 1/4/8 overlay counts, delayed final XML and keyed
  Unload. The local Windows Bridge 0.11.0 health check advertised vMix
  and keyed actions. Its SHA-256 was
  `fb74e0c6299a2649161e6a0d75c9987e2fd373bfa92b8be54545447a2714abc8`.
- AC-3. Studio boundary tests passed 18 of 18. Malformed linked records,
  overlay counts and Connect rows fail closed. The maintained pairing
  and Settings journey verified the edition, channel count, Try again,
  and saved overlay. Studio TypeScript and changed-file ESLint passed.
- AC-4. The exact Windows executable ran against an owned blank vMix
  29.0.0.49 Trial. The wire trace showed first AddInput, SetInputName and
  keyed In. Native BrowserNavigate changed the rendered page while
  preserving the GUID, title and type. Repeat Load on and off overlay,
  after reopening the preset, and at a mismatched Bridge port refused
  with no mixer functions and no store write. Keyed Unload sent only the
  exact overlay's Out. The source after reopening the saved preset
  matched the original decoded RGB hash. The alternate source decoded
  differently. Program and Preview selections stayed 1/2, both native
  files were restored by SHA-256, and vMixService stayed Running.
- AC-5. Shared browser job j-5045 ran the maintained Bridge connection
  and Publish setup specs at the fixed local head. It finished exit 0
  with 69 of 69 passing in 3.0 minutes on a five-minute cap. It checked
  Source unverified, Unload, Replace, unknown action feedback, and all
  four first-Publish cases. Settings, the production panel and
  Interaction Publish screenshots were inspected. The exact combined
  Studio-to-real-vMix browser walk did not run. The host had 3663 MiB
  free after the checks, below the existing 4200 MiB preflight for the
  devices and shared browser floor. The later independent reply blocker
  remains open.
- AC-6. The Windows package passed its local health check. The exact
  merge release and download checks remain open.
- The root-only CLI layout reproduced the configured `--version`
  failure from the Rules checkpoint. The changed CLI emitted from the
  same root-only dependency layout printed 0.12.4 with exit 0. That
  deliberate layout still reports TypeScript diagnostics from omitted
  CLI dependencies. The installed CLI build succeeds.
- Changed-file gates passed 581 of 581 tests in 22 files. The harness
  temporarily used exact HEAD/main LF bytes for three unchanged
  Windows checkout files and restored their original bytes. Standalone
  E2E protection could not create its baseline dependency directory
  symlink under this Windows permission configuration. Its temporary
  baseline worktree was removed.
- The local `/check` stamp recorded PASS for its own scope at the
  exact head, with delegated review 2/2 fixed, inline simplify and
  inline verify. It predates the independent malformed-action finding
  and does not establish a phase PASS or queue authority.

## Evidence

The retained files include `reply-before.log`, `reply-after.log`,
`root-only-before/result.log`, `root-only-after-exact.log`,
`check-review.log`, `compiled-exact.log`, `studio-node.log`,
`changed-gates.log`, `build-exe.log`, `native-navigation/result.log`,
`j-5045.json`, `j-5045.log`, `browser-visuals`, and
`local-check-stamp.json`. The local worktree is clean. The shared
browser job is terminal and no owned vMix or Bridge process remains.
