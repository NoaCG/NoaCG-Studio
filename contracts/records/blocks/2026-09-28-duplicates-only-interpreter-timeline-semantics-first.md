# blocks/duplicates-only-interpreter-timeline-semantics-first

Rule: `blocks/duplicates-only-interpreter-timeline-semantics-first`. Recorded 2026-09-28 on `claude/editor-g01-easing-76aa37` at 9abefff6c.

G01: the linear sampler read -40 where the runtime showed -10 for power2.out, and the executed simulator differed from editor sampling by 269.4 px before the shared evaluator; after it, sampler and simulator/SPX/CasparCG/OGraf/single-file agree within 2e-3 on dense samples (e2e/editor-ease.spec.ts).

Why a rule rather than a fix, a mechanism or a check: The old rule told sessions to interpolate linearly, which is now false; the node test pins curve parity but cannot stop a second curve implementation being written beside the shared one.
