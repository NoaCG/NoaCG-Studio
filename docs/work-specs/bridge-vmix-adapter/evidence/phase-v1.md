# V1 production playout choice

Source for this phase is `df5767458230558e9fdee158e663e9367e58f8e3`. The merge SHA and
independent acceptance belong to the phase pull request and run ledger. To revert the
landed phase, open a pull request with `git revert -m 1 <V1 merge SHA>` through the queue.

AC-2 uses the existing CasparCG inference for saved destinations, cues, account defaults
and legacy activity. The cue's item adapter identifies vMix cues. A legacy vMix Browser
destination still acts as a manual Browser source. The existing setter persists the new
choice through the same output-setup parser.

On the source, `readOutputSetup({ v: 1, destinations: [], caspar: false, vmix: true })`
dropped `vmix`. The focused Node tests exercise the stored precedence and shapes, adapter
counting, a setter and load round trip, and the same first-Publish policy used by the
production hook. First Publish moved to `useProductionPublish.ts` before V1. The page and
the hook use the same model, and the hook awaits the existing durable write before publishing.

V1 changes no playout UI, no existing CasparCG tests and no Bridge behavior. V4 must guard
all routes that can Take a cue for the other adapter before it adds vMix cue authoring.
No real vMix process is required for this phase.
