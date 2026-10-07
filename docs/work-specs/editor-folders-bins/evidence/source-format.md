# Source-format proof

`node --test scripts/editor-organization.test.mjs` reproduced the metadata-header
ownership defect: 3 passed and the code-string case failed with “Missing expected
exception”. The reader accepted a metadata-shaped string inside an HTML script.

After requiring the organization comment at source offset zero, all 4 native
checks passed. They cover absence migrating on read without a write, exact
artwork/CSS/JS preservation and comment-terminator escaping, future/unknown data
and invalid trees refusing, and the misleading code string refusing.

Focused ESLint passed. These checks prove the source-format boundary; browser
organization, history, reopening and exports have their own acceptance evidence.
