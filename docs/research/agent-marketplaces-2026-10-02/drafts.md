# Local toolkit submission drafts

Updated 2026-10-03 for Agent Toolkit Phase 1. Canonical manifests and READMEs are the listing
source of truth. Nothing here is submitted, approved or published. The approved identifiers
remain noacg and optional noacg-mcp; the main Claude display name is NoaCG Broadcast Graphics
and Playout, and the Codex display name is NoaCG Graphics and Playout.

## 1. Claude: main local toolkit

Use the claude.ai organization that should own the listing permanently. Connect an authorized
GitHub account, then open [the developer portal](https://claude.ai/directory/manage).

| Field | Value |
|---|---|
| Submission type | Plugin bundle |
| Repository | NoaCG/NoaCG-Studio |
| Branch | agent-toolkit-dist, after the generated branch is published by a successful release |
| Plugin path | plugins/noacg |
| Validation | Resolve every Blocking finding; record holds and warnings from the actual portal |
| Display name | NoaCG Broadcast Graphics and Playout |
| Description | Imported from the generated plugin manifest and README |
| Updates | GitHub push webhook on agent-toolkit-dist; request auto-publish passing versions |

Proposed data-handling answers, for the owner to verify and attest:

- Personal data: limited. The plugin stores nothing itself. The local CLI keeps a scoped key
  after browser consent; saved graphics may contain personal names entered in fields.
- Destinations: registry.npmjs.org for the pinned CLI/dependency download and doctor version check;
  noacg.studio or the user's explicitly selected deployment for the bridge page, consent and save.
  Authoring/validation/captures run locally and do not upload the graphic. Separate playout
  commands connect to operator-selected servers after separate setup.
- Retention: saved graphics remain until deleted; the local key remains until logout/revocation.
  npm/browser caches remain subject to their local configuration. See the product privacy policy.
- Audience/age policy, contact email and compliance acknowledgements: the publisher's decisions.

Reviewer setup: Claude Code with local terminal access, Node 20+, npm, system Chrome/Edge and
pinned @noacg/cli matching the manifest. Use the portable setup reference, then scaffold, inspect,
validate and capture. Offline handoff needs no account. Account-backed save needs browser consent.
Ordinary Claude Chat cannot execute this local CLI. Do not describe this as hosted authoring.

## 2. Claude: optional local MCP companion

Separate submission, same repository and branch, path plugins/noacg-mcp. Display name:
NoaCG MCP server. It starts node on the bundled launcher in each enabled local session.
The installed CLI must match the manifest; an absent installation uses pinned npx. Explicit
NOACG_CLI is a disclosed development override, not the reviewed default setup.

The unpinned fallback has been removed. Exact package pins can still be held for dependency
review. The subfolder JavaScript launcher, import chain and package fallback may also be held
because the scanner cannot follow them fully. Only a portal result establishes the actual findings.
Do not say local validation clears security review. Prefer submitting the lazy main plugin first.

## 3. OpenAI: skills-only local toolkit

At [the plugins portal](https://platform.openai.com/plugins), choose the owning organization,
project and verified developer identity. An owner or member with Apps Management Write can
submit. Upload noacg-codex-<version>.zip from the noacg-agent-toolkit-<version> Actions artifact
or a clean-checkout generation. Extract the outer Actions download first; do not upload that
outer archive, the repository ZIP, or the codex-mcp-local ZIP.

| Field | Value |
|---|---|
| Identifier | noacg |
| Display name | NoaCG Graphics and Playout |
| Short description | Make and play out graphics |
| Publisher | NoaCG Studio, matching the verified identity |
| Category | Developer Tools |
| Website / support / privacy / terms | Imported from the canonical Codex manifest |
| Capabilities, icon, prompts | Imported from the canonical Codex manifest |
| Runtime | Local Codex terminal; Node 20+, system Chrome/Edge and the exact CLI pin |

The ZIP contains the Codex compatibility manifest, shared portable skill/references, icon,
README, Apache licence/notice and source provenance. It contains no Claude command or MCP server.
Existing Codex compatibility format remains supported; Phase 1 needs no portable overlay.
Complete metadata/skill scans, resolve findings, submit for review and publish only after approval.
Do not claim ordinary chat can execute this skill or that local stdio supplies hosted MCP.
Adding a hosted MCP later is a separate package/submission decision under the current portal rules.

## 4. Existing MCP Registry listing

The CLI release workflow maintains io.github.NoaCG/noacg in the official MCP Registry from
cli/server.json. This registry record is a local stdio installation route, not Claude/OpenAI
public-directory approval. No additional account action is needed here for Phase 1.

## 5. Remaining materials

Local verification receipts are in the Phase 1 work spec. Portal screenshots, actual scan findings,
publication URLs and post-publication search/install/update evidence must come from the account
step. Do not reuse research screenshots as proof of the generated package's installed behavior.
Optional GitHub MCP discovery remains separate from the two directory submissions.
