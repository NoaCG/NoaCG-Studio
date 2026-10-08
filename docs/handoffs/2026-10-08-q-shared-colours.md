# Record the Linux pictures of the public chrome

`claude/q-shared-colours` moved the site chrome onto the brand values (`src/brandCore.css`, which
the app's `src/brandTokens.css` imports) and added `e2e/public-chrome-baseline.spec.ts`: the top bar
and footer of every public page, and the whole /ograf page, at desktop and phone width.

Only the `-win32` pictures are recorded. The spec skips any test whose picture is missing for the
platform it runs on, so CI (Linux) skips it today and nothing there guards the chrome's look.

To finish, once the branch has landed, from a fresh branch off `main`:

    gh workflow run rerecord-screenshots.yml --ref <branch> -f spec=public-chrome-baseline.spec.ts
    gh run download <run-id> -n linux-screenshots -D e2e/public-chrome-baseline.spec.ts-snapshots

Look at the 34 pictures before committing them (they should match the `-win32` set in layout and
colour). With them committed, CI runs the spec on its own; no code change is needed.
