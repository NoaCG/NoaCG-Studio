# E4 receiving rehearsal kit

These [four export packages](../../../e2e/fixtures/editor-projects/receiving/) were
built by the shipped exporters from [this saved source](../../../e2e/fixtures/editor-projects/receiving/source.json).
The [manifest](../../../e2e/fixtures/editor-projects/receiving/receiving-manifest.json)
records source-file and canonical-source SHA256 separately, each ZIP's SHA256,
contents, expected values and browser runtime observations. Recreate with the
`e2e/editor-projects.spec.ts` receiving journey. The staged instance is job j-0071
on the E4 implementation; it is a browser rehearsal, not real-host acceptance.

| Package | Verified here | Still required at E6 |
| --- | --- | --- |
| SPX | Bundled font/logo/GSAP bytes; browser update/play/next/stop/replay | Named SPX host/version, installation and actual operator |
| CasparCG | Self-contained HTML loads; browser data/In/Next/Out/replay | Named CasparCG server/client/version and actual operator |
| Browser overlay | Self-contained HTML loads; browser data/In/Next/Out/replay | Named receiving browser/OBS environment and operator |
| OGraf | Exporter schema/manifest, files, font/logo and GSAP bytes | Named OGraf renderer/version and lifecycle integration; no renderer runtime PASS here |

The SPX, CasparCG and browser rehearsals assert `Harbour bulletin`, Oswald, the
32px natural-width Harbour logo, 1920×1080 source at 25fps, entrance counter 1,
Next counter 2, public Off state with root opacity 0, and replay counter 1.
The production operator walk asserts `Live harbour update`, the same In/Next/Out
sequence and two total entrances. A later red master edit leaves the already
installed green on-air copy and its operator data intact. Static receiving serves
the optional `/relay/ping` probe as 404; no required asset may be missing.

Before a receiving trial:

- Record the named operator, host product/version, OS, renderer, resolution/fps,
  installation path, package SHA256 and trial time. Work in an off-air sandbox.
- Verify ZIP and source hashes against the manifest. Read each package's bundled
  README/getting-on-air instructions and font licences. Preserve notices.
- Import/install the package using that host's supported path. Verify heading,
  logo, Oswald and green accent against the source and manifest. The retained
  browser screenshots live beside the packages; they are reference frames only.
- Update `f0` to `Live harbour update`; operate In, Next, Out and replay. Record
  visible output, alpha/opacity, step state and any missing asset/console error.
- Interrupt while entering and replay, then interrupt during Out and replay.
  Record whether the host's lifecycle matches the package's documented contract.
- Install selected saved graphics into two test rundowns; record their exact
  subsets. Retry an interrupted install and count source/cue identities. Make a
  newer rundown edit, request rollback and verify the conflict preserves it.
- Edit the master and verify existing/on-air copies and operator values remain
  unchanged until the operator explicitly replaces a design in that production.
- Retain every failure and unsupported feature with the host/version. A missing
  operator or host keeps E6 pending; it does not change E4 engineering results.

Artwork, logo and fixture text are NoaCG-authored; catalog designs are the shipped
registry, with bundled OFL font files and font notices retained. GSAP is the
unchanged shipped 3.15.0 runtime, SHA256
`92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb`.
Its written redistribution disposition remains OW1 in [the owner request](gsap.md).
Staging these fixtures makes no new licence, engine or release decision.
