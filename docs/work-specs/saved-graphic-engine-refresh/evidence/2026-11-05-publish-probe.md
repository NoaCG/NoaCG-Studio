# Publish probe for #2182, 2026-11-05

Local Supabase stack (scripts/configured-stack.mjs, slot 1), one fresh account, Playwright with
playwright.live.config.ts. The probe spec was a throwaway and is not in the repository.

1. Old code, worktree at 391a9e3e (main before #2173): `bootstrapGraphic` Debate Floor, saved with
   `createGraphic` as "Probe Debate Floor", synced. Library record dd2a666b-...:
   `template.js` length 131304, contains `debateMachinePlay`: false. The cloud `documents` row
   for it: contains `debateMachinePlay`: false.
2. Main at a00505d5, a fresh browser on the same account: the library pulled dd2a666b-... (record
   contains `debateMachinePlay`: false). A new production holding it (`addGraphicToShow` with its
   `graphicId`), published through the page's Publish button.
   `select position('debateMachinePlay' in output::text) > 0 from control_shows where id =
   '59401a13-...'` returned false; the payload holds the graphic (156313 characters).
3. Control on main: a Debate Floor made from the catalog and saved: length 133952, contains
   `debateMachinePlay`: true.

Conclusion: a publish sends the saved record's engine; nothing rebuilds it from the catalog.
