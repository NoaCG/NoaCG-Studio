---
kind: decision
date: 2026-10-02
needs: account
---
# Send the NoaCG Companion module to Bitfocus

You decided on 2026-10-01 that the hardware panel module is published in Bitfocus's repository
under MIT. It is built and tested: `companion-module/` in this repository (Companion 4.3 and
later, the real module paired and ran a show through an isolated Companion on 2026-10-02, see
`docs/work-specs/hardware-panel-control/evidence/companion-end-to-end.md`). Publishing it puts
NoaCG's name on a public repository, so it waits for you rather than a session.

Best sent after the production page answers panels too (the next piece in
`docs/handoffs/2026-10-02-hardware-panel-control.md`), so the module's help matches both pages.

1. **Ask Bitfocus for the repository.** Bitfocus creates `bitfocus/companion-module-noacg-studio`
   on request: open an issue in <https://github.com/bitfocus/companion-module-requests> or ask in
   their Slack's module development channel, naming the module id `noacg-studio` and NoaCG as the
   maintainer (the manifest lists contact.noacg@gmail.com).
2. **When the repository exists, tell a session.** It copies `companion-module/` there, runs
   `yarn install`, `yarn test`, `yarn lint` and `yarn package`, and opens the first release for
   their volunteer review. Their review time is not published.
3. Until it appears in Companion's module list, an operator can import the `.tgz` that
   `yarn package` makes (Companion 5: Modules, Import offline module).
