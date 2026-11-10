# V2 Bridge reply repair receipt

The one focused Risky repair is at local head
`8397db754f9068719de38a6ab0f2449e2c0b8cde`, base
`e6be4cf3dcbcb103a7ea0372d30d0505845a8ba8`, with 34 changed files.
The product revision was `12d1f13c9e85a1b34f4f81963a88c35a1ed4fbaf`.
Only phase evidence changed after it. The owned worktree is clean.

Draft PR #2293 and its remote branch are still at the pushed pre-code Rules
checkpoint `6efb650efd1b5b244798a306c62981c1a3bd3641`. Its description
includes the independent Rules review corrections. Auto-merge is absent.
The coordinator holds the final independent review and PR decisions.

## Results

- Studio boundary tests passed 15 cases. They cover invalid envelopes on the
  four routes, supported domain failures, recovery, the same-snapshot
  channel count, canonical keys, and action uncertainty.
- The compiled CLI passed 50 vMix cases and 51 Bridge, protocol and CasparCG
  cases. Studio TypeScript and changed-file ESLint passed.
- Changed-file gates passed 578 tests using the exact committed LF bytes of
  three unchanged files that were identical to main. An earlier Windows
  checkout run passed 424/426 with two CRLF-sensitive assertions. The
  original working bytes were restored. Both logs are retained.
- Shared browser job j-5044 finished with exit 0 and 69/69 passing. It ran
  the Bridge connection and Publish setup specs, including the enhanced
  unknown-action recovery journey and all four first-Publish cases. The
  Settings and production panel screenshots were inspected.
- The Windows Bridge 0.11.0 executable passed its health check. SHA-256
  `0058a4bf7654a8aaea560bf20ce6ab484c094142280ab4ab93bec8916543d183`.
  Four serial owned vMix 29.0.0.49 Trial preset checks passed. The scoped
  snapshot reported eight overlays, two inputs and ownership on Overlay 8
  from the same session as the action. Reopen and explicit reload restored
  the same decoded RGB composite. Port mismatch refused Load and allowed
  Unload. Both vMix files were verified after restoration and vMixService
  stayed running.
- The exact Studio-to-real-vMix browser walk remained unrun. The owned
  devices left 3478 MiB free, below the unchanged 3584 MiB shared browser
  floor, so no job was submitted. Both files were restored and verified.

## Blocking result

AC-4 remains failed. On the real packaged baseline, supported off-air
BrowserNavigate changed the visible source while keeping the GUID, type
and title. Ordinary Load put the alternate page on Overlay 8, reported
success and claimed ownership. Preset reopen restored the original URL
and kept the same GUID. The attempted native General > Change probe
confirmed its baseline endpoint and preset but could not operate the
settings control because Windows input geometry was unavailable and window
capture timed out. This is separate from the confirmed transient failure.

Local /check recorded FAIL at the exact evidence head. Review
discarded+inline fixed three of five findings. The original delegated
scope used the prior base. The new base changed only documentation outside
the V2 scope. Simplify and verify ran inline. Browser completion is recorded
in this separate receipt to keep the reviewed head fixed. The coordinator
has the fresh independent full review, including its further findings.
AC-6 exact-merge release and download checks remain open.

Process and port inspection found no owned test process or listener.
The only browser job for the worktree was j-5044, terminal with exit 0.
The scratch Studio browser probe was removed. vMixService was Running.
