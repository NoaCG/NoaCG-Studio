# Continue community packs: the design lock, then open submit to every maker

The first slice of [`docs/work-specs/community-packs/spec.md`](../work-specs/community-packs/spec.md)
landed from `claude/k-community-packs-workflow`: migration `0079_community_packs.sql`, the shelf's
Submit a pack, Your packs, Waiting for review and Take down in
`src/components/wizard/steps/CommunityPacks.tsx` and `SubmitPackSheet.tsx`, and the checks,
builder and sources in `src/community/pack*.ts`. Submitting is limited to moderator accounts, on
the server (`community_pack_submit`) and in the UI (`useIsModerator`), because an installed pack
can still be edited (spec D12). The receipt is `evidence/review-loop.md`.

## Slice 2: the design lock (AC-5), a Playout row

Out of bounds for the community row, so it is its own row in `src/control` and the production
page. What it reads is already written: Install stamps every library graphic it creates with
`fromPack: { id, version, author }` (`src/model/graphicDoc.ts`), for seeds (`pub-quiz`) and
shared packs (`community:<row id>`) alike, and a duplicate keeps the stamp. Pool entries reach it
through `SavedGraphic.graphicId`.

- Offer no edit door for a pool graphic whose library record carries `fromPack`; fields and cues
  work as for any graphic. Decide there whether the stamp should also travel inside the template
  so the lock survives a pack export and re-import (AC-5 asks that it survive export and reload).
- Show the attribution once on the production: "From <pack> by <author>, CC BY 4.0".
- Close the copy routes that drop the stamp today: the editor's Save As (`saveGraphicAs` in
  `src/store/saveActions.ts`) and Export a package then Import it (`installPack` from a file is
  unstamped, and `parsePack` ignores the file's `author`). `duplicateGraphic` already keeps it.
  Until then such a copy can reach the submit picker; the admin's review is the backstop.
- Scenario: install a pack, find no Edit on its graphics, change a cue value and take it.

## Slice 3: open to every maker, and updates

- A migration that replaces `community_pack_submit` without the `is_moderator()` gate, and the
  door in `CommunityPacks.tsx` follows (`signedIn && moderator` becomes `signedIn`). Only after
  slice 2 has landed.
- AC-11: Submit an update on a Live row. The table already carries `lineage` and `version`, and
  `community_pack_decide` already moves a lineage's old live row to `replaced` on approval; the
  submit function needs a lineage argument checked against the caller's own live pack.

## Slice 4: research, then the agent door

Both owner asks from 2026-10-08 are research first, recorded in the spec's Slices section: how
users build graphic packs from Home (select a folder or graphics and add them as a pack; never
from Playout), and what share-on-import looks like in the CLI and the plugins under the
only-when-the-user-asks rule (D16, AC-12). Then the observed-request refusal (D5) and a Report link.

## Notes

- Re-run `e2e/configured/community-pack-review.spec.ts` against a local stack first: it passed
  before the branch's review fixes and simplification, and Docker Desktop was down when the final
  tip was ready, so the signed-in walk was not repeated on it (the receipt says which tip each run
  covers). The shelf's previews also download each shared pack's whole file once its card is
  seen; a first-graphic-only read or a stored preview is the cheaper shape once packs are many.

- `e2e/configured/community-pack-review.spec.ts` is new; `e2e/configured/expected-run.json`'s
  `minTests` was not raised because another row was editing that file the same day. Raise it by
  one in the next change that touches it.
- The local Supabase stack is shared between worktrees; a `db reset` from another session drops
  an unlanded migration, so re-apply it before a configured run.
