# ai/measure-defect-dimension-before-claiming-deterministic

Rule: `ai/measure-defect-dimension-before-claiming-deterministic`. Recorded 2026-09-07 on `claude/ai-contract-migration` at 31caedac.

Migrated from src/ai/AGENTS.md, paragraph 11 (zero-based blank-line inventory). Checked against code: structuralKindFindings checks variant identity separately from parts; tasteCheck reports visual dimensions independently of runtime validity. Source prose (historical evidence; only the rule above is authoritative): - **A deterministic gate cannot catch a defect in a dimension it does not measure** - so either   measure that dimension or forbid the construct. Machine-valid is not good. - **Write a constraint as INSPECTION, never as a list of named failures**, and let ABSENCE be its   first failure. A prohibition suppresses the behaviour it constrains. When a teaching change moves a   rate, suspect the FRAMING before the rule.
