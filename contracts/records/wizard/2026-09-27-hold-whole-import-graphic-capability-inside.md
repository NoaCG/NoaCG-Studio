# wizard/hold-whole-import-graphic-capability-inside

Rule: `wizard/hold-whole-import-graphic-capability-inside`. Recorded 2026-09-27 on `claude/n-spec-covers-headers` at c04a55926.

The e2e map moved out of scripts/e2e-affected.mjs into each spec's leading covers header, so the old clause naming that script as what maps the folder became false; the import road's specs now declare src/components/wizard/import/** themselves.

Why a rule rather than a fix, a mechanism or a check: Only the pointer to where the folder's spec mapping lives changed; the invariant and its mechanisms are unchanged.
