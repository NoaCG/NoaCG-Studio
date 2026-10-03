# Saved controls before PR #671

`qz01.json` (Arena Quiz) and `sb26.json` (Sticker Score) are complete templates
generated from the full source tree at `f48659e95`, the first parent of merge
`648a92157fef8d9a6570d3c35a2a3590cbafdfff` (PR #671). They retain the actual old
labels, field ids, machine declarations and runtime code. They are not current
templates with manually substituted labels.

Generation: export that revision's `src/` with `git archive`, serve it from an
isolated directory on the worktree dev server, import its `templates/catalog.ts`
in Chromium and serialize `variantById('qz01').create({})` and
`variantById('sb26').create({})`. The temporary capture ran as queued browser
job `j-3162`, one test passed. The regression saves these unchanged templates in
a production, waits for durable writes, reopens the production, fires the actions,
and checks the saved template JS remains unchanged.
