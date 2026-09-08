# model/adopts-regenerated-input-set-while-keeping

Rule: `model/adopts-regenerated-input-set-while-keeping`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From `src/model/AGENTS.md`, corrected against the code. The contract said a provider must send `null`, not `[]`, or the merge empties the panel - as if `mergeVideoInputs` took the null. It does not: its signature is `(prev: VideoInput[], next: VideoInput[])`, and the decision lives at the call site, `src/components/video/VideoAiChatPanel.tsx` - `inputs: result.inputs ? mergeVideoInputs(p.inputs, result.inputs) : p.inputs`. The provider contract is unchanged (see ai/video/claudeVideoProvider.ts); the rule now names where it is enforced.
