---
v: 2
source: owner
kind: ask
raised: 2026-10-02
state: advanced
note: "claude/bv-community-packs landed the record (docs/work-specs/community-packs/spec.md), the wizard's Community packs shelf, Install and the seeded Pub Quiz (AC-1 to AC-4). Still missing: the design lock (AC-5), sharing (AC-6), the automatic checks (AC-7), admin approval (AC-8) and takedown (AC-9)."
asked: "Paraphrase, owner 2026-10-02: three categories in the template workflow - Templates, Kits, Community packs. A community pack is finished, installed and used at once, never modified. The community makes and shares them; a shared pack is reviewed by automatic checks and then a NoaCG admin before anyone else sees it. NoaCG seeds the shelf first."
serves: NOW
size: large
touches: supabase/, api/, src/components/wizard/steps/CommunityPacks.tsx, src/control/, cli/src/commands/pack.ts
covered-by: community-packs.spec.ts
needs-owner: none
---
# Community packs: share, review, takedown and the design lock

**Filed:** 2026-10-02. **Source:** owner ruling, recorded in `docs/work-specs/community-packs/spec.md`

## Why

The first slice put the shelf in the wizard and seeded it with NoaCG's own pack. The ruling's
point is that the COMMUNITY grows the collection: every good graphic anyone makes should be one
Share away from everyone else, safely. That needs the server half, which the first slice could not
touch (`supabase/` was reserved for the playout session that day).

## What it would take

Each step is an acceptance criterion in the spec, so a row can take one or several:

1. **AC-5, the design lock** (`src/control`, the production page). Install stamps each graphic with
   its pack id and version; the production page shows no edit door for a stamped graphic, and the
   stamp survives export and reload. Smallest and independent of the server: a good first row.
2. **AC-6, Share** (`api/`, a migration, the studio, `noacg pack --share`). A `community_packs`
   table: the pack file, name, description, preview frame, author, state
   (checking / waiting / published / refused / taken down) and reason. Writes only through the
   service role; the shelf reads only published rows. The wizard shelf lists them beside the
   static seeds.
3. **AC-7, the automatic checks.** Export gate and bench per graphic, plus the outside-request
   refusal (a static scan and the bench's observed requests). It needs a browser, so it runs as a
   job, not in the API function; decide where (a queue worker or a scheduled function driving the
   bridge) when the row starts.
4. **AC-8, admin approval.** An admin-only review page: preview, check results, a live play of
   each graphic, approve or reject with a reason. Admin is a server-side role check, never a
   client flag.
5. **AC-9, takedown.** Admin unlists with a reason; installs already made stay.

## Open for the owner (decide when AC-6 starts, not before)

- What a sharer grants: the licence other users get, and whether NoaCG may feature a pack. This is
  a legal and taste call the spec deliberately leaves open.

## Related

Uutishuone and Fight Night are finished packs too. `rebuild-shipped-packs-as-wizard-kits.md`
plans to rebuild them as kits; seeding them on this shelf as they are would be the cheaper way to
bring them back, and is worth weighing when either item starts.
