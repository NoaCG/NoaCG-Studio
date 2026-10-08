# supabase/widen-returns-table-function-migration-needs

Rule: `supabase/widen-returns-table-function-migration-needs`. Recorded 2026-09-15 on `claude/he-arrange-three-surfaces` at f6bb663e.

0058 deliberately withheld the control_show_by_slug widening on the belief that db:push would refuse its drop-and-create without --allow; its header and [docs/handoffs/2026-09-15-hd-show-profile.md](https://github.com/NoaCG/NoaCG-Studio/blob/285c936ebb0b8b7ab0761501e64e434d27c1876e/docs/handoffs/2026-09-15-hd-show-profile.md) both say so. Measured on 0059, which is exactly that widening: classifyMigration reports 4 statements and no findings. scripts/db-push.mjs createdObjects collects every create function, and the drop rule clears anything in that set because net such a pair removes nothing - which is why 0031 applied the same drop-and-create on the same function unattended. The cost was an extra migration file and an owner-queue instruction naming a command the owner does not need to run.
