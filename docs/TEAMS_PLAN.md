# Teams - the P1 design

**Status: RATIFIED 2026-09-01 by the owner, with all five §8 questions answered - programme P1 is
ACTIVE (`docs/PROGRAMMES.md`). Implementation follows §7's stages in order; §7 records where each
one got to.** The claim it serves is `docs/NORTH_STAR_2027.md` §5 P1; the autumn class is the
first customer.

## 1. Goal, claim, non-claims

**The claim:** three students with separate NoaCG accounts prepare and operate the same
production - same graphics, same rundown - without sharing credentials or coordinating whose
personal account holds the show.

**Non-claims (v1):**

- Simultaneous co-editing of one graphic. LWW plus conflict copies stays, made visible.
- Sharing a personal library. The unit of sharing is a PRODUCTION, never an account's graphics.
- Roles beyond owner/member (no per-graphic permissions, no reviewer/approver tiers).
- Real-time presence ("Anna is editing cue 3"). The design leaves room for it; v1 ships without.

**What already works without teams, and stays:** operating together needs no accounts at all -
the hosted control page, output renderer, join page and presenter view are capability URLs
(`docs/CLOUD_PLAYOUT.md`), so three people can already operate one published production by
sharing links. The gap teams close is upstream of operating: who can EDIT the rundown, who can
REPUBLISH a changed graphic, and whose account the production dies with. Today the answer to all
three is "the one personal account that holds the Show record", which is exactly the
credential-sharing the claim forbids.

## 2. The model decision

**Decision: server-authoritative team productions - a hybrid, not a rewrite.** A team owns
PRODUCTIONS, held in server rows outside the LWW sync mirror. Personal libraries, personal
productions, and the per-user RLS on the existing ~18 tables are untouched. Graphics enter a
team production the way they already enter any production: as pool COPIES
(`Show.graphics: SavedGraphic[]` embeds the template with a `graphicId` back-link), so no
cross-library read is ever needed.

### Why the full team-principal RLS rewrite loses

The alternative was `team_id` on every content table with predicates widened to
`user_id = auth.uid() or is_team_member(team_id)`. It loses on three independent grounds:

1. **It rewrites the security boundary everywhere to share almost nothing.** Of the ~18
   RLS-guarded tables, only production-shaped data needs sharing. `agent_keys`,
   `ai_generations`, `user_grants`, `user_feedback`, personal documents and assets must never
   become team-readable; a rewrite that touches them all to reach the two tables that matter
   maximizes the audit surface for zero claim value. Every migration here is a scope edge
   (`docs/PROGRAMMES.md` P1); the right design minimizes how many there are.
2. **It breaks the sync engine's core assumption.** `src/backend/supabaseProvider.ts` lists
   records with no user filter - RLS IS the filter - and `src/backend/sync.ts` reconciles the
   entire visible set as "this account's library". Widen visibility and every member's device
   pulls every teammate's shared rows into its local mirror as its own; two members editing
   concurrently is the NORMAL case for a team, so the conflict-copy machinery (designed for one
   person's devices racing occasionally) would spray "(conflicted copy)" records across three
   accounts, and the denied-put re-mint path (`remintRecord`) would misfire on rows the member
   can see but not update. LWW cannot carry shared ownership; the audit said so and the code
   confirms it.
3. **Slugs and publish state already live server-side.** `control_shows` holds the published
   panel, staged/live state, the capability slugs, and the event log; publish pins a payload.
   The server side of a production is already authoritative - the team model only has to move
   the PREPARATION document to where the publish document already lives, not invent a new plane.

### Why "references into personal libraries" loses

A team production that referenced members' library graphics (instead of copying) would need
cross-library read policies so member B can render member A's graphic - which is option A again,
through the back door, plus dangling references when A deletes or leaves. The pool-copy model
the product already has (`docs/SAVED_CONTENT_MODEL.md` §1) makes the production self-contained:
the copy travels with the production, the original stays personal, and "update from library" is
an explicit act by the graphic's owner, exactly as today.

### What the hybrid costs, honestly

- Team preparation is **online-only in v1**. A team production is not in the sync mirror, so
  there is no offline edit-and-merge for it. This is the honest trade: the alternative is
  multi-user offline merge, which is the co-editing non-claim wearing a different hat. The
  production page says so when the backend is unreachable (read-only view from the last fetch).
- A second storage pattern for Show records exists (personal = durable store + LWW mirror,
  team = server row). Mitigated by sharing the document shape: the server row's `doc` IS a
  `Show` (same version stamp, same migrations on read), and `model/shows.ts` normalization is
  the one reader for both.

## 3. Schema sketch

Three new tables and one column, two migrations. Numbers are assigned at implementation time
after a `merge-order` check (never mint a number a sibling branch already holds); the sketch
uses M1/M2. Both migrations follow `supabase/AGENTS.md`: `revoke all ... from public, anon,
authenticated` before narrow grants, extensions qualified, self-checks that CALL every function
against throwaway rows, and only additive statements so the fail-closed classifier passes them.

### M1 - teams and membership

```sql
create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  -- The join capability: a short URL-safe code, rotatable. Same minting idiom as the
  -- capability slugs (translate(encode(extensions.gen_random_bytes(6),'base64'),'+/','-_')).
  join_code    text not null unique,
  created_at   timestamptz not null default now()
);

create table public.team_members (
  team_id      uuid not null references public.teams (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Display name snapshotted at join (the member types it). auth.users emails never
  -- leave the server; teammates see the name a member chose to show them.
  display_name text not null,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (team_id, user_id)
);
```

- **`is_team_member(p_team uuid)`** - `security definer` helper returning whether
  `auth.uid()` is in `team_members` for that team. Policies on `teams`, `team_members` and
  `team_productions` call it; a plain subquery on `team_members` inside its own policy
  recurses. Per `supabase/AGENTS.md`: the caller needs EXECUTE (granted to `authenticated`),
  and the self-check calls it, not just shape-checks it.
- Policies: a member sees their teams and the member list of their teams; only the team owner
  updates/deletes the team and removes members; a member may delete their own membership row
  (leave). Joining goes through an RPC, not an INSERT policy:
- **`team_join(p_code text, p_display_name text)`** - `security definer`: resolves the code,
  inserts the membership, returns the team. The code is a capability; holding it is the
  authorization, consistent with the product's capability-URL doctrine. No email delivery
  needed - decisive, because SMTP is not provisioned (`docs/DEPLOYMENT.md` "Auth email").
- **`team_rotate_code(p_team uuid)`** - owner-only; a leaked code is rotated, existing members
  unaffected (membership rows persist; the code only gates JOINING).

### M2 - team productions

```sql
create table public.team_productions (
  id          uuid primary key,          -- = the Show.id, client-supplied like control_shows
  team_id     uuid not null references public.teams (id) on delete cascade,
  -- The PREPARATION document: the Show record (pool copies, cues, datasets, look, data,
  -- bindings) - the same shape model/shows.ts normalizes, version stamp included.
  doc         jsonb not null,
  -- Who wrote doc last, for the "edited by Anna 12:03" affordance.
  updated_by  uuid not null references auth.users (id),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.control_shows add column team_id uuid null references public.teams (id);
```

- `team_productions` policies: select/insert/update/delete for `authenticated` where
  `is_team_member(team_id)` (delete may tighten to owner - open question §8).
- `control_shows` gains OR-branches on its owner policy: a row with `team_id` set is
  manageable by `is_team_member(team_id)` as well as its `owner_id`. This is the ONE existing
  table whose predicate changes, and it is the entire "member B republishes" story: publishing
  is already an upsert on `control_shows` keyed by the Show id
  (`src/control/hostedControl.ts publishControlShow`), so the same row keeps the same
  capability slugs whoever republishes - links handed to CasparCG/OBS never move. The 0029
  RPC-internal owner checks (`s.owner_id = auth.uid()`) widen the same way.
- **Writes are compare-and-swap, not blind LWW.** `team_production_save(p_id, p_expected
  timestamptz, p_doc jsonb)` updates only if `updated_at = p_expected`, else returns the
  current row. The client re-reads, re-applies its verb (add cue, edit values, reorder - the
  mutations are already verb-shaped) and retries, bounded; if the verb no longer applies it
  reports "Ben saved a newer rundown" instead of silently eating his edit. Whole-doc LWW would
  lose a teammate's concurrent cue edits with nothing on screen - the one failure mode the
  conflict-copy doctrine exists to prevent, so team saves get CAS where personal saves keep LWW.
- Deleting a team production is a real delete plus the existing unpublish path; no tombstone
  needed because there is no offline mirror to propagate a delete to.

### What does NOT change

`documents`, `assets`, storage policies, `agent_keys`, entitlement tables, community,
audience, render - every other per-user predicate stays exactly as written. `SYNC_KINDS` does
not grow; `reconcile()` and the conflict-copy machinery are untouched.

## 4. Sync and conflict story

- **Personal records: unchanged.** LWW, conflict copies, tombstones, re-mint - as today.
- **Team productions: server-resident, fetched live.** The productions section lists them by
  querying `team_productions` (RLS scopes the answer); the production page holds the fetched
  `doc`, edits apply verbs locally and save through the CAS RPC. No bookmark, no pending sets,
  no mirror entry.
- **Concurrent rundown edits:** CAS + verb re-apply (§3). Made visible: the page shows
  "edited by <name> <time>" from `updated_by`, and a failed re-apply names the teammate.
- **Graphics:** a member adds THEIR OWN library graphic; the pool copy embeds the template.
  Updating the design later = the same "update from library" the personal flow has, done by
  whoever owns the source graphic; any member may then republish. A graphic's source stays in
  exactly one personal library, so the co-editing non-claim is structural, not policed.
- **Moving a production to a team** copies the local Show record into `team_productions`,
  stamps `control_shows.team_id` if published, and tombstones the personal record (one home
  per production - two authorities for one rundown is the split-brain this design exists to
  avoid). Moving it back out is owner-only and the reverse operation.

## 5. Entitlements

- **The acting user's entitlement gates every verb.** Publishing a team production requires
  the actor's `control.hosted`; hosted AI, render and sync gates stay personal. No team-level
  plan object in v1 - the resolver (`src/entitlements/contract.ts`) stays per-uid and pure,
  and no second decider appears.
- **A class gets capability through `plan_email_domains`** (migration 0045): the institution's
  domain auto-assigns the plan, so every student who signs up already holds what team verbs
  need. This is the existing mechanism, not new work.
- Storage/projects limits are observe-only today; team payloads change nothing enforceable.
  When enforcement arrives, team production bytes count against the TEAM OWNER (the account
  that can also delete them) - recorded here so the later change has a decided answer.
- **Dependency, named not done:** real multi-account classes need account provisioning to work
  at scale - custom SMTP (password resets at class volume, the 30-users/hour cap) and Google
  OAuth provisioning. Both are owner-console actions documented in `docs/DEPLOYMENT.md`; P1
  implementation does not touch them but the autumn class date does.

## 6. UX - what the owner should see

Repo law holds: **no sign-in wall, and a solo user sees ZERO team machinery.** Teams are an
account feature that gates only itself. Offline builds grow no team UI (the
`isBackendConfigured` feature-detection point already carries this).

Mockups (single-file HTML, dark control-room, amber accent, under `docs/design/teams/`):

| Screen | File | Artifact |
|---|---|---|
| Home productions with a team | `docs/design/teams/teams-home.html` | https://claude.ai/code/artifact/2d5384eb-341e-4a87-ba67-96a76045b69d |
| Share dialog: create team / invite / join | `docs/design/teams/teams-share-dialog.html` | https://claude.ai/code/artifact/e37cd169-0140-46c4-a2ae-e862a3fbec63 |
| Team production page header + activity | `docs/design/teams/teams-production.html` | https://claude.ai/code/artifact/cf733b9a-37b6-40b4-be39-7f2e9480499c |

The flows:

- **Entry point - one, inside the production surface.** A signed-in user's production page
  (and the productions section's per-card menu) gains "Share with a team...". That dialog is
  the only door: create a team (name it, get the join code) or pick an existing team. A user
  who never opens it never sees the word "team" anywhere. Signed-out or offline builds do not
  render the item.
- **Invite/join: a join code and link.** Creating a team shows a short code (e.g.
  `K7M-Q2R`) and a copyable link (`/app#/join-team/<code>`); the teacher reads the code out or
  pastes the link in the class chat. Joining asks one thing: the display name teammates will
  see. Owner can rotate the code. No email invitations in v1 (no SMTP; §5 dependency).
- **Team productions in Home.** The productions section lists team productions after personal
  ones, each wearing a team chip (team name, amber-outlined) and "edited by <name>" in the
  meta line. Opening one is the same production page.
- **"Who owns this" affordances.** The production page header shows the team chip, the member
  list (display names, owner starred), and "Published by <name> <time>" next to the publish
  state. Every rundown save updates "edited by". A personal production shows none of this.
- **Leaving/removing.** A member leaves from the member list; the owner removes members and
  rotates the code there too. Productions stay with the TEAM, which is the survivability the
  claim asks for.

## 7. Stages toward the claim

Each stage lands alone, verified, before the next.

1. **M1 - teams + membership.** Migration with self-checks that call `team_join`,
   `team_rotate_code` and `is_team_member` against throwaway rows; classifier-clean
   (additive only). Evidence: migration applies to a fresh local stack; grant/absence
   self-checks pass; `scripts/db-push.test.mjs` still green.
2. **M2 - team productions + control_shows.team_id + CAS RPC + widened publish checks.**
   Evidence: same migration bar, plus a CAS test (two writers, one expected-stale save
   refused and returned current).
3. **Client: create/join/leave, share dialog, team chip.** Evidence: `npm run build`;
   offline build renders zero team UI (extend `e2e/auth.spec.ts`'s zero-auth assertion).
   **LANDED 2026-09-02** - see below.
4. **Client: team production list + open + verb saves over CAS + republish by member.**
   Evidence: the three-context e2e (below). **LANDED 2026-09-25** with a two-context walk -
   see below.
5. **The named verification build-out: multi-context e2e in `e2e/configured/`** -
   `teams.spec.ts`, three authenticated browser contexts against the real backend: A creates
   a team and a production and publishes; B joins by code, edits a cue, republishes; C joins
   and operates via the production page; assert all three read the same rundown and the
   capability slugs never changed. This is the scenario-proven rung for the claim.
6. **Owner walk** - the three-student scenario end to end (kind: walk, owner-queue item).
   Owner acceptance is the rung above scenario-proven; production-proven is the autumn class.

**Stages 1 and 2 LANDED 2026-09-01** as `supabase/migrations/0053_teams_and_membership.sql` and
`0054_team_productions.sql`; stage 3 is next. Where the migrations are deliberately different from
the §3 sketch, each argued in the file's own header:

- **Tighter than the sketch.** `team_productions` has no UPDATE policy and `authenticated` no
  UPDATE privilege, so the CAS function is the only write path rather than the recommended one.
  The widened `control_shows` WITH CHECK is a CASE, not the USING expression repeated - written as
  an OR it would let anyone stamp a row they own with any team's uuid, including one they were
  removed from. A restrictive INSERT policy keeps `owner_id = auth.uid()` true on the way in.
  Deleting a team production is the TEAM owner's call on both planes, not the row owner's -
  `control_shows.owner_id` is whoever published first, and any member may be that. Both new tables
  carry 0020's suspension absolute, with the same test repeated inside `team_join` and
  `team_production_save` because a definer function never meets a policy.
- **Repairs.** `updated_by` is nullable `on delete set null` and `control_shows.team_id` is
  `on delete set null`; the sketch's bare references would have made deleting an account or a team
  fail. The CAS token advances strictly (`greatest(…, updated_at + 1ms)`): two writers holding the
  same token, with the first committing inside the millisecond the row was last written in, would
  otherwise both have matched.
- **Rulings 2 and 3.** Ruling 3 is a restrictive delete policy on each plane. Ruling 2 needs a
  BEFORE UPDATE trigger, because RLS sees the old row or the new one and never both, so it cannot
  say "this column did not change". That trigger is also the only thing closing a hole the
  OR-branch opens on its own: permissive policies are OR-ed, so a teammate could otherwise pass
  WITH CHECK by claiming the row on the way out.

**Stage 3 LANDED 2026-09-02** as `src/backend/teams.ts`, `src/components/teams/`,
`src/styles/teams.css` and the `#/join-team/<code>` route, with NO migration - every verb it calls
already existed. What it does and deliberately does not do:

- **The door is one dialog**, reached from the production page header and the productions
  section's per-card overflow menu. Both, and the join dialog, are gated on ONE hook,
  `useTeamsAvailable()` = `backendConfigured && status === 'signed-in'`. The trap it closes is
  worth naming here because it will be met again: `useAuthState().signedIn` is TRUE offline (so a
  misconfigured gate cannot trap a user in an app that has no login), so a team surface reading
  it would render its door in exactly the build that must grow none.
- **The card menu is drawn only when it has something in it**, so offline a production card has
  no overflow menu at all. Delete stays a visible button on the card: moving a control people
  already know, to tidy up, is not this stage's business.
- **MOVING a production into a team is still off** - the button is present, disabled, and a
  sentence above the footer says why. The move writes `team_productions` and tombstones the
  personal record, and until stage 4's list exists a moved production would leave the personal
  list and appear nowhere. Stage 4 enables it, makes it the primary again (it is a plain
  secondary today, because the loudest control on a screen has to be one that works), and deletes
  the `.team-staged` sentence.
- **Creating a team is two statements**, deliberately: the INSERT mints the row (`owner_id` and
  `join_code` both from their defaults), then `team_join` writes the creator's membership row -
  because `team_members` grants `authenticated` no INSERT at all, and the function is what
  decides the `owner` label from `teams.owner_id`.
- **Both open questions were built as G left them**: every member sees the join code (any member
  can invite; rotation stays owner-only), and the member list is display names only. The mockups
  agree with both; nothing in them implied otherwise.
- **One deviation from the mockups, named as the plan asks.** Mockup screen 2 shows the code
  screen but no create FORM, and the owner needs a display name to appear in the member list at
  all - so the create form asks for the team name AND "Your name, as teammates see it",
  prefilled from the address before the @ and editable. Everything else follows the mockups,
  including the member count on each pick row.

Evidence: `npm run build`; `e2e/auth.spec.ts` gained two offline pins, each paired with a
presence assertion and each checked by breaking its gate and watching it fail;
`e2e/configured/teams.spec.ts` walks the signed-out and signed-in shapes against the real backend
and is green. Four defects only the live walk could find were fixed in it - a second join link
showing the first team's success screen, the share dialog surviving navigation, the dialog
inheriting the wizard's fixed height, and `destructive` having no global rule so the delete
controls looked like every other button.

Two things for stage 4 to know. The CAS token is a `timestamptz` written truncated to
milliseconds, so a JavaScript `Date` round-trip is lossless - do not re-format it. And moving a
team production back to personal is ONE statement by the team owner that sets `owner_id` to
themselves AND clears `team_id`: writing either alone is refused.

**Stage 4 LANDED 2026-09-25**, prompted by a defect found in testing that day: somebody invited to
a team could not find the team or anything it held. A team was reachable only through a
production's Share door, and a new member owns no production to open one from. What landed:

- **Where a team is FOUND.** Home's productions list splits into "My productions" and "Shared with
  my teams", one band per team headed by the team's chip, member count and role, with its
  productions under it (each wearing the chip and "edited by <name>, <time>"). Home's nav gains a
  **Teams** section - one card per team: members, productions, the door to its join code. Both
  exist only for an account that is in a team, so §6's rule holds: a user who never opened the
  door never sees the word. The share dialog also opens straight on a team (`openTeam`), for the
  bands, the cards and the production header.
- **"Appears immediately" is a fetch, not a subscription.** `backend/teamProductions.ts` fetches
  teams, members and every production's head as soon as a session exists (`components/teams/
  TeamSync.tsx`, mounted once in App), again on every return to the tab, straight after this tab
  joins, leaves, creates or moves anything, and every 15 s while the tab is in view. A tick reads
  heads only; a document is fetched only when its token moved. Realtime on `team_productions`
  would need the table in the publication - a migration - for a latency the tick already meets.
- **One store, not a forked production page.** Team records live IN MEMORY in
  `model/teamShows.ts`, beside the personal list rather than in it: `model/shows.ts` reads both
  (`readEditable`), and its save envelope routes a record carrying `teamId` back to the team store,
  which announces the edit to the save pump. So every existing mutator and the whole production
  page edit a team production unchanged, while `loadAllShows` - what the LWW sync engine reads -
  stays personal-only and `SYNC_KINDS` did not grow. Signing out reloads the page, which empties
  the store: nothing of a team is left on a lab computer's disk.
- **The CAS re-apply is a three-way merge, where §3 sketched re-applying verbs.** The mutators edit
  records in place rather than logging verbs, so a refused save is merged instead
  (`model/teamShowMerge.ts`): base (what this tab last saw), ours, theirs, per top-level field and
  PER ITEM in the id-keyed lists (graphics, cues, datasets, playout items) - Anna adding a cue and
  Ben retyping another both survive, and a reorder on one side survives an edit on the other. Only
  the same field or item changed differently on both sides is a conflict; theirs stands and the
  production page says so, naming who saved. A poll never replaces the merge base under an edit
  still on its way up, which is the one way a merge could silently drop a teammate's change.
- **Moving** writes `team_productions`, stamps a published `control_shows` row with the team, and
  tombstones the personal record - same id, so the page stays put and the four links never move.
  Publishing a team production sends `team_id` (`control/hostedControl.ts`), which is what lets a
  member who publishes FIRST create a team-stamped row rather than a personal one. Only the team
  owner is offered Delete, and a member who presses Unpublish is told it is the owner's call -
  the database refuses them without an error, so the page says it instead.
- **Migration 0067**, the one schema change: the 0061 unpublish sweep skipped team rows only when
  the publisher and the tombstone's owner differed, and after a move they are the same person - so
  a day after a published production moved into a team, the sweep would have taken it off air. A
  team-stamped row is now never swept; the self-check runs the sweep against a team row and a
  personal one and rolls both back.
- **Not built, still open:** moving a team production back to personal (owner-only, the one
  statement described above), the member list and "Published by" in the production header (the
  team's button opens the dialog that has the list), and the stage 5 THREE-context walk. The
  two-context walk in `e2e/configured/teams.spec.ts` covers join, find, move, a member's edit and
  its "edited by" read back cold by the owner.

## 8. Risks, scope edges, open questions

**Scope edges** (each returns to the owner per `docs/PROGRAMMES.md`): every migration - M1 and
M2 are ratified BY this plan, anything beyond them is a new ask; SMTP/Google OAuth provisioning
(owner consoles); any change touching a per-user predicate other than the `control_shows`
OR-branch named in §3.

**Risks:**

- RLS recursion on `team_members` policies - mitigated by the `security definer` helper, with
  the EXECUTE-grant trap (`supabase/AGENTS.md`) handled in the same migration and CALLED in
  its self-check.
- Widening `control_shows` policies is a security-boundary edit on a table that fronts live
  playout. Mitigation: the OR-branch is the only edit, the migration self-check asserts a
  non-member still cannot select/update a team row, and stage 5's e2e asserts the slugs held.
- CAS re-apply logic is small but subtle; it gets its own unit-style test in stage 4 before
  the e2e leans on it.
- A member with a stale open page publishing over a newer publish - already the personal
  flow's "changes not yet published" model; the hint reads `team_productions.updated_at`
  against `publishedAt`, same as today.

**Open questions - ANSWERED by the owner 2026-09-01 (the plan is ratified; these bind):**

1. **Owner/member is enough for v1.** No distinct teacher role; the teacher is the team owner.
   A role can be added later without schema pain.
2. **Owner only** may move a team production back to personal.
3. **Owner only** may delete a team production - this TIGHTENS the draft (which allowed any
   member); apply the one-line policy change in the delete predicate before stage 5's e2e.
4. **Team bytes count against the team owner's quota** (§5 stands) - decided now so the schema
   never blocks it; enforcement itself arrives whenever storage enforcement does.
5. **SMTP + Google OAuth provisioning starts THIS WEEK** (owner action - tracked in
   `docs/acceptance/owner-queue/2026-09-01-smtp-oauth-provisioning.md`); DNS verification is the
   weeks-long step and the class is this autumn.
