# e2e/wait-preview-rebuild-what-document-shows

Rule: `e2e/wait-preview-rebuild-what-document-shows`. Recorded 2026-09-10 on `claude/ba-ladder-frame-detach` at cd268c57.

The SVG corpus fit-ladder spec reddened main twice on the same sha with `locator.evaluate: Frame was detached`, at the `shrink / short` rung both times (CI runs 34289872217 and 34421430904). Measured on an idle laptop over the whole ladder: `data-doc-pending` lands 6 to 17 ms before the assertion that reads it, and 0 of 28 rungs stamp anything at `shrink / short` against 1 of 28 at every other rung, because the ladder types its datum at the top of each option and again as the first length. Rebuilt against a WizardPreview whose stamp lands 150 ms late instead of 7 ms early, the stamp-waiting spec fails 2 of 2 with readings taken from the previous document, while one waiting on the runtime reading the typed value back out of the document passes 2 of 2.
