# CLI source round-trip qualification

Bounded R1.3b slice. See [spec](spec.md), [reference comparison](reference-comparison.md)
and the actual local CLI receipts: [plain scaffold](initial-cli.json),
[reproduced failure](reproduction-cli.json), [repaired package](fixed-cli.json),
[independent scoreboard](independent-cli.json), [final CLI regeneration](final-cli.json). Package hashes and contents are
in [fixtures.json](fixtures.json); the generated ZIPs live under
`e2e/fixtures/cli-round-trip/` with their bundled font licence notices.

## Concrete changes

- Preserve inline data and module script tags in HTML. JSON metadata previously
  moved into executable JavaScript, causing a syntax error and disabling fields
  and lifecycle. Normal executable scripts still use the JS pane.
- Imported finished templates now offer the shared Edit this graphic door on
  Finish. It applies the existing byte-preserving import handler and enters the
  existing editor, with the same finished-walk guard as other editor doors.
- Visual appearance writes patch the effective declaration in repeated exact
  top-level CSS rules. CLI scaffold
  styles split layout and appearance into repeated selectors; editing the first
  rule left the later appearance in control. Existing first-rule readers and
  nested/unrelated rules keep their semantics, including important priority.
  New declarations stay in the first owned rule for anchor/group readers.

- OGraf browser execution exposed a second loss of the inert JSON block: the body
  extractor dropped head metadata. Retain inert head/body blocks in the graphic's
  scoped DOM, sharing classification with import. [Reproduction](reproduction-ograf.json).

No new model, target registry, export adapter or source conversion layer.

## Executed qualification

This checkout's CLI was built locally and connected to its own offline dev server
on reserved port 5182. Shared jobs j-3977 (dependencies/CLI build), j-3986 (plain
scaffold/validate/inspect), j-3988 (JSON failure) and j-3991 (repaired validation,
inspect and independent scoreboard scaffold/validate/inspect) record the boundary.
Both final packages validated with zero errors or warnings and all readiness
categories passing. Those automatic checks alone are not visual acceptance.

`e2e/editor-cli-round-trip.spec.ts` imports the real generated ZIPs through the
normal Import graphics route. The strap task edits a public default, panel fill
and typography using actual visual controls. It tests exact undo/redo, draft
Escape cancellation, stale-context refusal and unsupported-edit refusal, durable
save/reopen, fields and static exclusions, IDs, font/logo/thumbnail bytes, unchanged
animation/runtime JavaScript, retained JSON and unrelated CSS. It executes In/Out
in SPX, CasparCG and OGraf browser outputs and compares the rendered pose, wording,
font and artwork. The independent scoreboard edits both team names, reopens the
saved graphic, then operates its existing per-graphic control page and exported
machine through Play, Goal A, Clear flag and Out.

SPX and OGraf carry resources as files. CasparCG embeds referenced font/logo bytes
in one HTML file; its unused editor thumbnail is retained in the saved graphic
and folder exports, rather than embedded in executable HTML. No receiving-host
claim follows from Chromium execution.

Final local job j-4018: all six new cases and the existing script-loading import
case passed (7 passed, 3 skipped, 1.1 minutes). The three skips use retired-editor
helpers tracked in #800; no case in this slice skipped. j-4022 repeated all six
cases after main reconciliation. Targeted ESLint/TypeScript and affected gates
passed in j-4016/j-4017 and j-4023. Review reproduced two CSS edge cases: important
priority (j-4010) and first-rule ownership for new properties (j-4033). The final
repair passed nine pure tests, targeted lint/TypeScript and gates with 19 tests
(j-4034), j-4035 printed 17/17 passing browser assertions, but the scheduler reaped it
with no exit verdict. The combined tree passed 17/17 browser cases in j-4040 (exit 0), and lint,
TypeScript and affected gates in j-4041. See [check.md](check.md). Full builds/suites belong to PR/merge-group CI.

| Rendered task | Capture | Machine-readable result |
|---|---|---|
| 1920x1080 | [Desktop](desktop.png) | [Result](desktop.json) |
| 1366x768 | [Laptop](laptop.png) | [Result](laptop.json) |
| 1093x614 proxy, 200% Fit | [Zoom proxy](laptop-125.png) | [Result](laptop-125.json) |
| Independent scoreboard | [Scoreboard](independent-scoreboard.png) | [Result](independent-scoreboard.json) |

All four captures were inspected. The navy panel, mint logo, wording, decorative
label and fonts survive. Desktop shows properties and timeline together. Laptop
properties scroll and its smaller stage makes the strap small. The proxy retains
a reachable timeline and selected text at 200% Fit but remains cramped. Selection
handles obscure some small text. These are explicit usability limits, not broad
owner/workflow acceptance.

Reproduce with the locally built CLI and NOACG_URL set to this worktree's dev
server: scaffold a typeless package with Name:text=Amira Solano and
Role:text=Festival director, then validate and inspect its folder. Riverlight
adds synthetic artwork/static text and an inert JSON block before validation.
Independently scaffold --type scoreboard --name 'Harbor cup', validate and inspect.
Import either committed ZIP through New graphic > Import graphics > Finish >
Edit this graphic, change public text or panel fill, Save, reload and Play/Out.
The scoreboard control page also has Goal A and Clear flag. The focused spec
executes that flow and all three browser exports.

## Boundaries and next step

Custom non-field HTML spans are outside the existing visual target registry.
Their text, identity and source survive; commands refuse edits honestly. The
fixture's decorative RIVERLIGHT span remains excluded from operator fields.
General HTML/CSS cascade authoring, styled text runs and unsupported foreign
behavior are not converted. 1093x614 is the established viewport proxy at 200%
Fit, not physical browser/OS zoom. Actual SPX/CasparCG/OGraf receiving applications,
whole-editor usability, owner acceptance and broader B17/B18/E23 remain open.
Paired live MCP stays R3.2. WebMCP, funding/BYOK and general help stay separate.

Next bounded step: reproduce the October 6 linked-scale/corner/rotation task on
current main, then fix only concrete transform/property gaps. Retain this CLI
round-trip regression when changing those handlers. Leave save/sync work with its
existing ownership and do not jump ahead to R1.5.

Final package regeneration j-4043 repeated validate/inspect against this checkout's
own server after the OGraf repair. Both packages had zero errors/warnings; the
actual CLI-produced graphic.mjs retains festival-config. ZIP hashes were refreshed.
j-4044 passed all six qualification cases against those final bytes (exit 0).
