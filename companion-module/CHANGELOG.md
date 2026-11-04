# Changelog - NoaCG Companion module

What changed in each release of the module, written for the operator deciding whether to import the new file. The release workflow in the NoaCG Studio repository puts a version's section on its GitHub Release page and refuses a version that has no section here.

To release, move `version` in `package.json`, write its section at the top and land that on NoaCG Studio's `main`, then run its Release NoaCG Companion module workflow with dry run off. Changes not ready to release wait under `## Unreleased`, which releases nothing and holds up a release until they are moved into a version.

Write a section the way you would tell an operator what they get by importing again: what was wrong or missing, what it does now, and anything they have to do. No pull request lists, no usernames, no internal names.

## Unreleased

## 0.2.0 - 2026-11-04

The first release you can download yourself, from the NoaCG Downloads page. The module runs a production from a Stream Deck or any Companion surface: Take, Out, Next, cues, the server clip clock and the live controls of a pinned graphic, with what is on air, what is selected and what is allowed shown on the keys.

In Companion 4.3 or later, open **Modules**, press **Import module package** and choose the file, then pair it from the production page's **Setup** menu. If you already imported a 0.2.0 file by hand, this is the same module with only its install help changed, so you do not need to import it again.
