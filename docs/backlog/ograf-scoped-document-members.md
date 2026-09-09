---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, altitude AL5 - the orchestrator ruled: file it"
---
# The scoped document's member list has no gate deriving it

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session.

## Why

`scopedDocument` in `src/export/targets/ograf.ts` answers `getElementById`, `querySelector`,
`querySelectorAll`, `body` and `documentElement` with the graphic's element and passes everything
else to the renderer's real document. The list is a hand-maintained copy of "what template
runtimes touch": `document.head` (a template appending a `<style>` there restyles the host page,
unscoped), `window.innerWidth` / `innerHeight`, `document.scrollingElement` and
`document.body.parentElement` all still answer for the renderer. The list grew by two entries
on 2026-09-02, after the defect, which is the pattern.

## What it would take

A gate that derives the list: a grep-style check over `src/templates/**` and `src/blocks/**` for
every `document.<member>` and `window.<viewport member>` a runtime reads, compared against what
the proxy scopes, failing on a new member nobody decided about. Or the document-boundary design
row (a shadow root or per-graphic iframe), which removes the question.

## Evidence

`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md`; the readers named in `src/export/AGENTS.md`.
