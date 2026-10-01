// The What's new notes and the public roadmap: the check refuses the shapes generated text falls
// into, and the roadmap moves with docs/GOALS.md instead of waiting for somebody to copy it.
// guards: docs/whats-new/**, docs/GOALS.md
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildRoadmap, GOALS_FILE, renderRoadmapHtml, WORDING_FILE } from './roadmap.mjs';
import {
  areaOfPath,
  bulletProblems,
  dateOfFile,
  groupLanded,
  loadUpdates,
  parseUpdate,
  problemsIn,
  renderUpdatesHtml,
} from './whats-new.mjs';

const GOALS = readFileSync(GOALS_FILE, 'utf8');
const WORDING = readFileSync(WORDING_FILE, 'utf8');

test('every update in the repository passes the check, and there is at least one', () => {
  const updates = loadUpdates();
  assert.ok(updates.length > 0);
  assert.deepEqual(problemsIn(updates), []);
  assert.match(renderUpdatesHtml(updates), /<article class="wn-update" id="\d{4}-\d{2}-\d{2}">/);
});

test('a plain, short update passes', () => {
  const { areas, problems } = parseUpdate(
    '## Playout systems\n\n- Rundowns have folders, and All out clears everything on air.\n\n' +
      '## NoaCG Bridge\n\n- The Bridge remembers your CasparCG servers and connects to the last one\n  by itself.\n',
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(areas.map((a) => a.name), ['Playout systems', 'NoaCG Bridge']);
  assert.equal(areas[1].bullets[0].text, 'The Bridge remembers your CasparCG servers and connects to the last one by itself.');
});

test('a seeded slop update is refused, for each reason it is slop', () => {
  const slop = [
    '## Editor and templates',
    '',
    '- Add the canvas rotation handle to the new editor (#604)',
    '- Fixed the export in `src/export/ograf.ts` so it works',
    '- A seamless, powerful new timeline — you will love it!',
    '- Row AD landed on claude/ad-obs-real-app with a receipt for outcome 5',
    '- The playoutKeys map now lists every key a production can press',
    '- ' + 'word '.repeat(31).trim(),
    '- Brands are coming soon',
    '',
    '## Release notes',
    '',
    '- Something',
    '',
    '## CLI',
    '',
  ].join('\n');
  const { problems } = parseUpdate(slop);
  const said = (re) => assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}:\n${problems.join('\n')}`);
  said(/line 3: .*pull request;/);
  said(/line 3: .*pull request title/);
  said(/line 4: .*quotes code/);
  said(/line 4: .*file or path/);
  said(/line 5: .*em or en dash/);
  said(/line 5: .*hype word "seamless"/);
  said(/line 5: .*hype word "powerful"/);
  said(/line 5: .*exclamation/);
  said(/line 6: .*internal work/);
  said(/line 6: .*internal word "receipt"/);
  said(/line 7: .*"playoutKeys" looks like a name from the code/);
  said(/line 8: it is 31 words/);
  said(/line 9: .*promises a date/);
  said(/"Release notes" is not an area/);
  said(/"CLI" has no bullets/);
});

test('an update keeps only the biggest changes, in the fixed area order', () => {
  const many = (area, n) => `## ${area}\n\n${Array.from({ length: n }, (_, i) => `- Change number ${i + 1} for the reader.`).join('\n')}\n`;
  assert.ok(parseUpdate(many('CLI', 5)).problems.some((p) => /keep the 4 biggest/.test(p)));
  const thirteen = ['Playout systems', 'Editor and templates', 'CLI', 'MCP server'].map((a, i) => many(a, i < 1 ? 4 : 3)).join('\n');
  assert.ok(parseUpdate(thirteen).problems.some((p) => /13 bullets; keep the 12 biggest/.test(p)));
  assert.ok(parseUpdate(`${many('CLI', 1)}\n${many('Playout systems', 1)}`).problems.some((p) => /out of order/.test(p)));
  assert.ok(parseUpdate('').problems.some((p) => /empty/.test(p)));
  assert.ok(parseUpdate('Some prose\n').problems.some((p) => /only "## <area>" headings/.test(p)));
});

test('product names spelled with an inner capital are not mistaken for code', () => {
  assert.deepEqual(bulletProblems('vMix and macOS hosts now load the output.'), []);
});

test('an update is named for a real day', () => {
  assert.equal(dateOfFile('2026-10-02.md'), '2026-10-02');
  assert.equal(dateOfFile('2026-02-30.md'), null);
  assert.equal(dateOfFile('README.md'), null);
});

test('the page refuses to render a bad update, and escapes what it renders', () => {
  const bad = [{ file: '2026-10-02.md', date: '2026-10-02', ...parseUpdate('## CLI\n\n- Fix #12\n') }];
  assert.throws(() => renderUpdatesHtml(bad), /not fit to publish/);
  const good = [{ file: '2026-10-02.md', date: '2026-10-02', ...parseUpdate('## CLI\n\n- Names with <b> and & show as typed.\n') }];
  assert.match(renderUpdatesHtml(good), /Names with &lt;b&gt; and &amp; show as typed\./);
  assert.match(renderUpdatesHtml(good), /<time datetime="2026-10-02">2 October 2026<\/time>/);
});

test('the draft groups landed changes under the area most of their files belong to', () => {
  assert.equal(areaOfPath('cli/src/playout/amcp.ts'), 'NoaCG Bridge');
  assert.equal(areaOfPath('cli/src/mcp.ts'), 'MCP server');
  assert.equal(areaOfPath('cli/src/commands/validate.ts'), 'CLI');
  assert.equal(areaOfPath('src/components/control/Rundown.tsx'), 'Playout systems');
  assert.equal(areaOfPath('src/editor/foo.ts'), 'Editor and templates');
  assert.equal(areaOfPath('src/editor/foo.test.ts'), null);
  assert.equal(areaOfPath('scripts/gates.mjs'), null);
  const groups = groupLanded([
    { title: 'Bridge loops', files: ['cli/src/playout/runner.ts', 'cli/src/playout/slots.ts', 'src/editor/x.ts'] },
    { title: 'Tidy CI', files: ['.github/workflows/ci.yml'] },
  ]);
  assert.deepEqual(groups.get('NoaCG Bridge').map((c) => c.title), ['Bridge loops']);
  assert.deepEqual(groups.get(null).map((c) => c.title), ['Tidy CI']);
});

// ── The roadmap ───────────────────────────────────────────────────────────────────────────────

const titlesIn = (roadmap, bucket) => roadmap.columns[bucket].map((i) => i.title);

test('the roadmap is in step with GOALS today, every outcome placed', () => {
  const roadmap = buildRoadmap(GOALS, WORDING);
  assert.deepEqual(roadmap.problems, []);
  const placed = new Set(['now', 'next', 'later'].flatMap((b) => roadmap.columns[b].map((i) => i.outcome)));
  assert.equal(placed.size, roadmap.outcomes);
  assert.match(renderRoadmapHtml(roadmap), /<section class="rm-col" id="now"/);
});

test('changing a priority in GOALS moves the item on the roadmap, with nothing copied', () => {
  const before = buildRoadmap(GOALS, WORDING);
  assert.ok(titlesIn(before, 'later').includes('Live data'));
  const promoted = GOALS.replace(/^### 7\. Data and automation \(later\)$/m, '### 7. Data and automation (now)');
  assert.notEqual(promoted, GOALS, 'outcome 7 heading not found; update this test with GOALS');
  const after = buildRoadmap(promoted, WORDING);
  assert.deepEqual(after.problems, []);
  assert.ok(titlesIn(after, 'now').includes('Live data'));
  assert.ok(!titlesIn(after, 'later').includes('Live data'));
});

test('the build fails when GOALS drops a priority the wording still places an item in', () => {
  const noNext = GOALS.replace(/^(### 6\. .*?) \([^)]*\)$/m, '$1 (now)');
  assert.notEqual(noNext, GOALS);
  const { problems } = buildRoadmap(noNext, WORDING);
  assert.ok(problems.some((p) => /marked next, but GOALS gives outcome 6 only now/.test(p)), problems.join('\n'));
  assert.throws(() => renderRoadmapHtml(buildRoadmap(noNext, WORDING)), /out of step/);
});

test('the build fails when GOALS adds or renames an outcome the wording does not describe', () => {
  const added = `${GOALS.trimEnd()}\n\n### 9. Hardware panels (next)\n\n- **Why:** something.\n`;
  assert.ok(buildRoadmap(added, WORDING).problems.some((p) => /outcome 9 \("Hardware panels"\) has no wording/.test(p)));
  const renamed = GOALS.replace(/^### 3\. Editor \(now\)$/m, '### 3. Editor and timeline (now)');
  assert.notEqual(renamed, GOALS);
  assert.ok(buildRoadmap(renamed, WORDING).problems.some((p) => /outcome 3 is "Editor and timeline" in GOALS but "Editor"/.test(p)));
});
