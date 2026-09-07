# components/settle-contested-key-never-claiming-listeners

Rule: `components/settle-contested-key-never-claiming-listeners`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

The old handshake had the pan call preventDefault and the timeline stand down on defaultPrevented. It covered only the first keydown, so every repeat of a held Space slipped through and replayed the graphic under the pan.
