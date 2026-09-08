---
v: 1
scope: src/blocks/motionPresets.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-easing-offer-rule-over-motion-own.md
---
`easingsForMotions(ids)` is the easing offer and it is a RULE over the motion's own tracks, never a table: `UNCLAMPED_PROPS` names the transform channels the renderer lets a value overshoot into, so an easing whose character IS overshoot or oscillation (`needs: 'displacement'` in `model/easings.ts` - back, bounce, elastic) is offered only on a motion that animates one of them. It takes EVERY phase the one easing setting will land on.
