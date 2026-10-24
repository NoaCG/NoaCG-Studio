// What a `gh issue|pr` write may carry: prompts, owner notes and session ids are refused with the
// rule's text; ordinary product text, hidden repair-owner records and other commands pass.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { githubTextRefusal } from './github-text.mjs';

test('owner notes, prompts and session ids on GitHub are refused with the rule', () => {
  const refused = [
    `gh issue create --title "Bridge downloads" --body "The owner's thinking: one per player."`,
    `gh pr comment 12 --body "Prompt for the next session: finish the walk."`,
    `gh issue comment 5 --body "## Prompt\n\nDo X."`,
    `gh pr comment 12 --body "Repair owner: session_01G2tYJMYPHvnLs4cUDdVALb"`,
    `gh pr edit 12 --body "Copy this pasteable prompt into a new chat."`,
  ];
  for (const command of refused) {
    const refusal = githubTextRefusal(command);
    assert.ok(refusal, `${command} was allowed`);
    assert.match(refusal, /write-everything-github-issues-pull-requests/);
    assert.match(refusal, /outside reader/);
  }
});

test('ordinary product text, hidden records, the escape and other commands pass', () => {
  const allowed = [
    `gh issue create --title "Reload the output after a CasparCG restart" --body "After a restart the slot stays Empty until Load. Expected: it reloads by itself."`,
    `gh pr comment 12 --body "<!-- noacg:repair-owner session_01G2tYJMYPHvnLs4cUDdVALb, attempts 0 -->"`,
    `ALLOW_GITHUB_TEXT=1 gh issue create --title "Teams" --body "Only the owner of a team can invite members."`,
    `gh issue list --label "needs decision"`,
    `git commit -m "Reword the owner's page"`,
  ];
  for (const command of allowed) assert.equal(githubTextRefusal(command), null, command);
});

test('a body passed as a file is read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'github-text-'));
  writeFileSync(join(dir, 'body.md'), 'Next session: pick up row 4.');
  assert.ok(githubTextRefusal('gh pr create --title T --body-file body.md', dir));
  writeFileSync(join(dir, 'clean.md'), 'Adds a vMix adapter to the Bridge.');
  assert.equal(githubTextRefusal('gh pr create --title T --body-file clean.md', dir), null);
});
