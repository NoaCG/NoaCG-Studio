# templates/guard-every-load-time-dom-rebuild

Rule: `templates/guard-every-load-time-dom-rebuild`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 516-518. Generated template.js loads in `<head>` in exported packages - any load-time DOM work (initial rebuild/paint) must use the DOM-ready guard pattern (see shared/clock.ts or the rebuild calls in the credits/tickers/infographics runtimes).
