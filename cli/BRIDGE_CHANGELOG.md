# Changelog - NoaCG Bridge

What changed in each NoaCG Bridge release, written for the operator deciding whether to download
the new one. The release workflow puts a version's section on its GitHub Release page under
"What changed", inside the page `cli/BRIDGE_RELEASE.md` describes, and refuses a version that has
no section here (`cli/scripts/release-notes.mjs --bridge`).

The version is `cli/package.json`'s. The Bridge and the NoaCG CLI are built from that one
package, so they share the number; a Bridge release may skip versions that only changed the CLI.

Write a section the way you would tell an operator what they get by downloading again: what was
wrong or missing, what it does now, and anything they have to do. No pull request lists, no
usernames, no internal names, nothing about how the program is built.

## 0.4.0 - unreleased

The first release. NoaCG Bridge lets the NoaCG production page put a production on a CasparCG
channel with one button, list the templates and clips already on the server, and cue them from
the rundown beside your own graphics. It replaces the earlier "caspar agent" from the NoaCG CLI:
pairing is now one click on a page the Bridge opens, and a browser paired with the old agent
stays paired.

Nothing to do after downloading: double-click it and leave its window open while you work.
