# V2 pairing repair worker receipt

Candidate 3d8337b59bc8713fd47f5fd292a1de289f0258fa on
codex/plan-vmix-v2-build, merge base 78ce3f35063386fdc7217d0542e3df871fc32b8d.
The clean owned worktree is C:/claude/Temp/vmix-v2-pairing-1110. Local
/check passed on this exact tip. PR #2293 remains with the coordinator.

## What passed

- The worker preflight passed in local active mode. The shared
  live-publishing allocation had landed and the current cf13 hold notice
  permits normal landings. The existing V2 branch merged current main
  without conflicts at fbac86deeb597b705807b1e57aafe138cd271b5b.
- The baseline sent one action to the wrong pairing in each of four
  cases: Load and keyed Unload after a Bridge URL change, and both after
  a token-only change at the same URL. Overlay and Browser key matched.
  The repaired equivalent probes sent zero Bridge requests. The focused
  tests add production-output mismatch, Replace, current pairing recovery
  and fresh First Publish. See pairing-before.log and pairing-after.log.
- When an unreadable reply follows a pairing change, the original Bridge
  host and overlay identify the uncertain action. Losing the vMix choice
  while the same production stays mounted now uses a local feedback-only
  read. Both verbs and both kinds of pairing change preserve one dispatch
  and avoid extra Bridge requests, credentials, path and query. Another
  output and actual navigation keep the generic warning. Known stale
  success and known partial failures continue to use dispatch choice.
  See lost-choice-before.log, lost-choice-after.log and studio-vmix-exact.log.
- Studio TypeScript, changed-file ESLint and all 27 focused vMix Node cases
  passed on the final bytes. The delegated review also compiled the
  unchanged CLI and ran all 63 compiled vMix tests.
- Maintained browser job j-5095, exact candidate, exited 0 with 70/70
  in two minutes. The new case proved zero same-turn Bridge fetches for
  stale Load and Unload, valid recovery on the current pairing, and a
  delayed A /state response after a visibly distinct B observation.
  Both maintained First Publish routes, chosen/unselected cases, Settings
  and pairing, and Load, Unload, Replace and CasparCG cases passed.
- The unchanged changed-file gates passed 590 tests across 22 files
  with the exact matching Git LF blobs for src/output/main.ts,
  src/control/hostedReceiver.ts and src/model/shows.ts. The runner
  verified that each equals both base and HEAD and restored each original
  checkout byte sequence. The worktree is clean. See changed-gates-committed-bytes.log.

## Owned Windows mixer

j-5089 on f97a9c06f1a73a2698dcb4b96e0869586de8835f exited 0. The
packaged Bridge 0.11.0 and owned vMix 29.0.0.49 Trial used synthetic
Program and Preview backing plates. Studio Load and Unload addressed
Overlay 8 and Browser GUID 878eb2de-e8f8-4266-ab5b-2bf01fe0bbe1. The
trace captured AddInput, SetInputName, keyed OverlayInput8In and keyed
OverlayInput8Out. Program and Preview base keys stayed fixed. The
output HTML and local fixture RPCs reached the Browser. The captured
pixels showed the lower third on Load and the original Program backing
pixels on Unload. Studio displayed Source unverified with Unload.
The wrapper stopped its owned processes, restored last.vmix and
user.config and verified both with SHA-256. vMixService stayed Running.

The final delta after this native proof is the browser fixture and
post-dispatch unknown feedback when the current vMix choice is absent.
The exercised successful native path is shared. The package is
byte-identical. All 24 bundled inputs match the previous exact package.
Its embedded JS equals the emitted bundle SHA-256
92639191e827f790ff79f7973babd33333e928fe898d0f59a3b65c7b9d8e67b4.
The initialized Node v24.13.0 runtime bytes match apart from the
packaging fuse. The exact executable SHA-256 is
0e842791ae2943f129db9c79511a611920dc7f040d1bf7d5e5afda78b7f8bf00.
The proof used the prior executable with that hash. See compare-bridge-final.log,
j-5089.log, real-studio-final.log and real-studio-final-visuals/.

## Local check and retained failures

- Review delegated, 36 exact paths against 78ce3f35, model gpt-6.1-sol
  high. Four findings, one direct fix. Inline delta review covered the
  follow-up unknown feedback after a combined adapter and pairing change.
  The coordinator confirmed the after-save old-key rule. The currently
  tracked Browser is eligible for Unload, and reappearance of a displaced
  key stops In without restoring that key's ownership. That case needs
  manual recovery in vMix. The CasparCG after-navigation fallback
  behavior reproduced on both exact source revisions in
  caspar-fallback-exact.log. The isolated First Publish coverage gap
  is recorded and both maintained specs were explicitly named.
- Simplify inline. The browser fixture shares its saved-pairing
  render helper and exercises pending reads by holding and releasing
  the actual route. Verify inline. The exact local stamp is PASS in
  local-check-stamp.json.
- j-5090 on f97a9c06 is retained as failed, 69/70. Its fixture expected
  the next poll to remain A even though the header legitimately
  re-rendered and supplied the saved B pairing before the old tick.
  j-5090-error-context.md shows the new pairing. The corrected fixture
  ran once on the new head as j-5095.
- The plain Windows changed gate hit a line-sensitive assertion on a
  CRLF checkout of an unchanged renderer file. changed-gates.log
  preserves it. The standalone exact E2E protection check is unverified
  locally because Windows refused its temporary directory symlink.
  e2e-protection-exact.log preserves the error. The owned temporary
  detached checkout was removed. No checker or test allowance changed.

Exact PR CI, independent final review, merge and release/download
acceptance remain coordinator-owned.
