# wizard/give-kit-community-packs-shelf-door

Rule: `wizard/give-kit-community-packs-shelf-door`. Recorded 2026-10-02 on `claude/bv-community-packs` at 612b208b6.

Owner ruling: the template workflow has three categories, Templates, Kits and Community packs. Browse's control gained Community packs as its third option on claude/bv-community-packs (docs/work-specs/community-packs/spec.md AC-1).

Why a rule rather than a fix, a mechanism or a check: The behaviour is pinned by e2e/community-packs.spec.ts, but the old rule names only two bodies and would mislead an editor of the switch; this restates it with the third answer the owner ruled on.
