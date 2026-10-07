// The What's new notes and the public roadmap: the check refuses the shapes generated text falls
// into, and the roadmap moves with docs/GOALS.md instead of waiting for somebody to copy it.
// guards: docs/whats-new/**, docs/GOALS.md
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildRoadmap, GOALS_FILE, renderNowHtml, renderRoadmapHtml, WORDING_FILE } from './roadmap.mjs';
import {
  bulletProblems,
  dateOfFile,
  escapeHtml,
  groupLanded,
  loadUpdates,
  parseUpdate,
  problemsIn,
  renderLatestHtml,
  renderUpdatesHtml,
  topicOfPath,
  TOPICS,
} from './whats-new.mjs';

const GOALS = readFileSync(GOALS_FILE, 'utf8');
const WORDING = readFileSync(WORDING_FILE, 'utf8');

test('every update in the repository passes the check, and there is at least one', () => {
  const updates = loadUpdates();
  assert.ok(updates.length > 0);
  assert.deepEqual(problemsIn(updates), []);
  assert.match(renderUpdatesHtml(updates), /<article class="up-row wn-update" id="\d{4}-\d{2}-\d{2}">/);
});

test('an update names only the three topics, in their order', () => {
  assert.deepEqual(TOPICS, ['Playout and Bridge', 'Editor and templates', 'AI workflows']);
  for (const old of ['Playout systems', 'NoaCG Bridge', 'CLI', 'MCP server']) {
    assert.ok(parseUpdate(`## ${old}\n\n- Something: A reader can now do it.\n`).problems.some((p) => /is not a topic/.test(p)), old);
  }
});

test('a plain, short update passes', () => {
  const { topics, problems } = parseUpdate(
    '## Playout and Bridge\n\n- Rundown folders: Group cues into folders, and All out clears everything on air.\n' +
      '- Saved servers: The Bridge remembers your CasparCG servers and connects to the last\n  one by itself.\n\n' +
      '## AI workflows\n\n- Productions over MCP: The MCP server lists your productions.\n',
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(topics.map((t) => t.name), ['Playout and Bridge', 'AI workflows']);
  assert.equal(topics[0].bullets[1].text, 'Saved servers: The Bridge remembers your CasparCG servers and connects to the last one by itself.');
});

test('a bullet is a short label, a colon and one short sentence', () => {
  const problemsOf = (bullet) => parseUpdate(`## AI workflows\n\n- ${bullet}\n`).problems;
  assert.deepEqual(problemsOf('Timed cues: Set how long a graphic stays on air and what happens when the timer ends.'), []);
  assert.ok(problemsOf('Set how long a graphic stays on air.').some((p) => /start with a short label and a colon/.test(p)));
  assert.ok(problemsOf('A much longer label than allowed: Set how long it stays.').some((p) => /label is 6 words; keep it to 4/.test(p)));
  assert.ok(problemsOf('timed cues: Set how long it stays.').some((p) => /label with a capital/.test(p)));
  assert.ok(problemsOf(`Timed cues: ${'word '.repeat(19).trim()}.`).some((p) => /19 words after the label; keep it to 18/.test(p)));
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
    '## AI workflows',
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
  said(/"Release notes" is not a topic/);
  said(/"AI workflows" has no bullets/);
});

test('an update keeps only the biggest changes, in the fixed topic order', () => {
  const many = (topic, n) => `## ${topic}\n\n${Array.from({ length: n }, (_, i) => `- Change ${i + 1}: Something new for the reader.`).join('\n')}\n`;
  assert.deepEqual(parseUpdate(many('AI workflows', 5)).problems, []);
  assert.ok(parseUpdate(many('AI workflows', 6)).problems.some((p) => /keep the 5 biggest/.test(p)));
  const thirteen = TOPICS.map((t, i) => many(t, i < 1 ? 5 : 4)).join('\n');
  assert.ok(parseUpdate(thirteen).problems.some((p) => /13 bullets; keep the 12 biggest/.test(p)));
  assert.ok(parseUpdate(`${many('AI workflows', 1)}\n${many('Playout and Bridge', 1)}`).problems.some((p) => /out of order/.test(p)));
  assert.ok(parseUpdate('').problems.some((p) => /empty/.test(p)));
  assert.ok(parseUpdate('Some prose\n').problems.some((p) => /only "## <topic>" headings/.test(p)));
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
  const bad = [{ file: '2026-10-02.md', date: '2026-10-02', ...parseUpdate('## AI workflows\n\n- Fix #12\n') }];
  assert.throws(() => renderUpdatesHtml(bad), /not fit to publish/);
  assert.throws(() => renderLatestHtml(bad), /not fit to publish/);
  const good = [{ file: '2026-10-02.md', date: '2026-10-02', ...parseUpdate('## AI workflows\n\n- Names <i>: Names with <b> and & show as typed.\n') }];
  assert.match(renderUpdatesHtml(good), /<li><strong>Names &lt;i&gt;:<\/strong> Names with &lt;b&gt; and &amp; show as typed\.<\/li>/);
  assert.match(renderUpdatesHtml(good), /<time datetime="2026-10-02">2 October 2026<\/time>/);
});

test('the landing shows the newest update alone, in the list the page uses', () => {
  const update = (date, topic) => ({ file: `${date}.md`, date, ...parseUpdate(`## ${topic}\n\n- Something new: Shipped on ${date}.\n`) });
  const html = renderLatestHtml([update('2026-10-06', 'Editor and templates'), update('2026-10-02', 'AI workflows')]);
  assert.match(html, /<time datetime="2026-10-06">6 October 2026<\/time>/);
  assert.match(html, /<div class="up-topic">\s*<h4>Editor and templates<\/h4>\s*<ul>\s*<li><strong>Something new:<\/strong> Shipped on 2026-10-06\.<\/li>/);
  assert.doesNotMatch(html, /2026-10-02/);
});

test('the draft groups landed changes under the topic most of their files belong to', () => {
  assert.equal(topicOfPath('cli/src/playout/amcp.ts'), 'Playout and Bridge');
  assert.equal(topicOfPath('cli/BRIDGE_CHANGELOG.md'), 'Playout and Bridge');
  assert.equal(topicOfPath('src/bridge/main.ts'), 'Playout and Bridge');
  assert.equal(topicOfPath('src/components/control/Rundown.tsx'), 'Playout and Bridge');
  assert.equal(topicOfPath('cli/src/mcp.ts'), 'AI workflows');
  assert.equal(topicOfPath('cli/src/commands/validate.ts'), 'AI workflows');
  assert.equal(topicOfPath('cli/plugin/skills/noacg-graphic/SKILL.md'), 'AI workflows');
  assert.equal(topicOfPath('src/ai/agent.ts'), 'AI workflows');
  assert.equal(topicOfPath('src/editor/foo.ts'), 'Editor and templates');
  assert.equal(topicOfPath('src/editor/foo.test.ts'), null);
  assert.equal(topicOfPath('scripts/gates.mjs'), null);
  const groups = groupLanded([
    { title: 'Bridge loops', files: ['cli/src/playout/runner.ts', 'cli/src/playout/slots.ts', 'src/editor/x.ts'] },
    { title: 'Tidy CI', files: ['.github/workflows/ci.yml'] },
  ]);
  assert.deepEqual([...groups.keys()], [...TOPICS, null]);
  assert.deepEqual(groups.get('Playout and Bridge').map((c) => c.title), ['Bridge loops']);
  assert.deepEqual(groups.get(null).map((c) => c.title), ['Tidy CI']);
});

// ── The roadmap ───────────────────────────────────────────────────────────────────────────────

const titlesIn = (roadmap, bucket) => roadmap.columns[bucket].map((i) => i.title);

test('the roadmap is in step with GOALS today, every outcome placed', () => {
  const roadmap = buildRoadmap(GOALS, WORDING);
  assert.deepEqual(roadmap.problems, []);
  const placed = new Set(['now', 'next', 'later'].flatMap((b) => roadmap.columns[b].map((i) => i.outcome)));
  assert.equal(placed.size, roadmap.outcomes);
  assert.match(renderRoadmapHtml(roadmap), /<section class="up-row rm-col" id="now"/);
});

test('the landing shows the roadmap\'s Now items alone, each with its first bullet', () => {
  const roadmap = buildRoadmap(GOALS, WORDING);
  const html = renderNowHtml(roadmap);
  const shown = [...html.matchAll(/<h4>([^<]+)<\/h4>/g)].map((m) => m[1]);
  assert.deepEqual(shown, titlesIn(roadmap, 'now').map(escapeHtml));
  const bullets = [...html.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(bullets, roadmap.columns.now.map((i) => escapeHtml(i.bullets[0])));
  for (const later of [...titlesIn(roadmap, 'next'), ...titlesIn(roadmap, 'later')]) assert.ok(!html.includes(later), later);
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

test('a roadmap item is one capability in a line or two, never a task list', () => {
  const listed = WORDING.replace(/^### Live data\n\n(- .*\n)/m, '### Live data\n\n$1- One.\n- Two.\n');
  assert.notEqual(listed, WORDING, 'the Live data item not found; update this test with the wording');
  assert.ok(buildRoadmap(GOALS, listed).problems.some((p) => /"Live data" has 3 bullets; say it in 2 or fewer/.test(p)));
});

test('the build fails when GOALS adds or renames an outcome the wording does not describe', () => {
  const added = `${GOALS.trimEnd()}\n\n### 9. Hardware panels (next)\n\n- **Why:** something.\n`;
  assert.ok(buildRoadmap(added, WORDING).problems.some((p) => /outcome 9 \("Hardware panels"\) has no wording/.test(p)));
  const renamed = GOALS.replace(/^### 3\. Editor \(/m, '### 3. Editor and timeline (');
  assert.notEqual(renamed, GOALS);
  assert.ok(buildRoadmap(renamed, WORDING).problems.some((p) => /outcome 3 is "Editor and timeline" in GOALS but "Editor"/.test(p)));
});
