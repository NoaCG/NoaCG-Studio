# Codex planned-run execution

Owner authorization: “Okay, let's implement the plan.” in this chat, following the revised
autonomous-Codex-runs proposal. Implement separate Codex execution guidance using the existing
runner, preserving working Claude behavior. Product plans, model/credential changes and new hosting
are outside this implementation. Active delivery and unattended recovery are separate claims.

## Observable rules before implementation

- Only the supervisor admits project phases. A launch intent is not native acceptance.
- Persist the exact request before dispatch. An uncertain acknowledgement remains one pending
  action, never permission to launch another worker. Safe stopping is acceptable.
- Native acceptance must match original action/hash/provider/session/environment/revision/policy;
  the observed worker identity becomes the phase actor. A builder cannot check its own phase.
- Pause/cancel/expiry stop new work. Read-only reconciliation can still account for an old launch;
  it cannot resume authority or erase attempts. A superseded coordinator cannot publish.
- Kit restoration preserves unresolved actions, native identities and the old return destination
  until the new coordinator explicitly reconciles it. Git ownership does not fence native actions.
- Claude procedures, brief templates and default kit behavior remain unchanged. Codex behavior
  is selected only by explicit execution metadata; instruction mappings remain narrowly guarded.

## Acceptance

### AC-1: Harness-specific execution loads without changing Claude defaults

The existing invocation names load separate Codex references and tailored briefs. Only plan-create
and plan-run may use the explicit alternate instruction mapping; missing/stale/wrong targets and
missing critical contracts fail the guard. Claude targets/templates remain byte-identical.
Layer: instruction guard mutation tests, fresh root/nested Codex reads and kit rendering tests.

### AC-2: Active and unattended modes preserve shared run authority

Active mode retains the current owner through acceptance and terminal landing results and arms
no wake. Unattended mode requires actual native wake/re-entry evidence. New instructions preserve
authorization, phase order, independent acceptance, checks, repair limits and owner dispositions.
Layer: independent instruction review and kit behavior tests. No new editor scope is authorized here.

### AC-3: Unknown plan-worker delivery cannot cause duplicate work

The optional launch receipt on supervisor build/repair/check persists exact brief bytes, source,
branch, native binding, block, action ID and request hash in the existing pending record before
dispatch. Unknown/mismatched observations retain it and block phase advancement and renewal.
Matching acceptance records the native actor and clears uncertainty without resetting phase history.
Publication failure permits no dispatch; recovery retains and reconciles the same pending action.
Layer: continuing-project and Git-backed recovery fault-injection tests.

Launch detail uses the existing JSON actor receipt with an additional opt-in field:

```json
{"actor":"builder-nonce","launch":{"sourceSha":"<40-hex>","branch":"codex/plan-example-p1-build","brief":"briefs/<saved-file>.txt","native":{"provider":"codex","sessionId":"<coordinator>","environmentId":"<observed environment>","policySha256":"<64-hex effective policy hash>"}}}
```

After supervisor record returns, immediately run `node scripts/run-supervisor.mjs ready-launch
<db> <id> <block.json>` to recheck authority and durably reserve exactly one dispatch. Dispatch only
that returned request; a repeated call refuses. Native execution must respect the supplied block end;
this operational check does not provide a remote fence against an intervening owner pause. Observe with
`node scripts/run-supervisor.mjs observe-launch <db> <id> <observation.json>`.
Observation binds provider/sessionId/environmentId/revision/policySha256/actionId/requestSha256,
`state: "accepted"`, `nativeId` and evidence. Unknown is not absence. Authoritative, final
not-delivered evidence is retained as a safe stop, not an automatic retry or a fresh phase allowance.

### AC-4: Codex renewal wakes remain inside current block authority

An opted-in unattended Codex kit selects a pre-expiry wake accepted by native-recovery guards;
its coordinator checkpoints and remains active until authorized renewal. Pauses/fixed deadlines
still refuse renewal; workers never receive a future block's authority. Legacy timing is unchanged.
Layer: joined plan-kit/native guard/continuing-project tests; native recovery remains separately observed.

### AC-5: Actual delivery and recovery qualifications are reported separately

A useful change passes required reviews, actual approval, merge queue, independent exact-merge
acceptance and post-land results. A supported coding wake/re-entry, bounded renewal and terminal
stop qualify only their observed interruption class. A policy refusal or missing platform route
remains a concrete blocker; no alternate stamp, fake identity or local fixture supplies native proof.
Layer: actual PR/run receipts. Source tests cannot pass this criterion on their own.
