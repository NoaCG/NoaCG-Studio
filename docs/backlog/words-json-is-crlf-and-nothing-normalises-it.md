# `words.json` is CRLF and unnormalised, so a splice into it writes a mixed-endings file

**Filed:** 2026-09-09, carried out of `docs/handoffs/2026-09-06-add-control-row-set.md` during the
handoff drain.

## Why

`src/templates/behaviours/words.json` is the tokenizer's vocabulary, and it is edited by scripts as
often as by hand - a new role or behaviour means splicing entries into it. The file on disk is CRLF,
and `.gitattributes` does not normalise it: line 59 mentions it only as the SOURCE of the generated
behaviour tables, and the `text eol=lf` rules there cover generated files. So a splice that writes
`\n` produces a file with both endings, and the diff is the whole file rather than the entry that
changed.

That is small until it hides something. A whole-file diff is a review nobody reads, and this
particular file feeds `check:behaviour-docs`, whose value is that a human can see what changed in
the vocabulary.

## What it would take

One line in `.gitattributes` and one normalising commit, or the same effect from the other end by
making whatever writes the file match its existing endings. The first is better: the ending should
be a property of the file, not something every writer has to remember.

Check the siblings in the same pass - any other hand-and-script-edited JSON under `src/` with the
same shape has the same defect waiting.

## Evidence

Hit on 2026-09-06 while adding the bingo caller's vocabulary, landed as `47b7b1dc`. A repo-wide grep
during the 2026-09-09 drain found the observation in that handoff and nowhere else;
`.gitattributes:59` names the file only as a generated-table source.
