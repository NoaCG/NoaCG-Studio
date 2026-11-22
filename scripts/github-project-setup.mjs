#!/usr/bin/env node
// THE DEVELOPMENT OVERVIEW PROJECT - create it once, or refresh it, from data GitHub already holds.
//
//   gh auth refresh -s project                          # once: the token needs the `project` scope
//   node scripts/github-project-setup.mjs               # creates the project and prints its link
//   node scripts/github-project-setup.mjs --project 7   # refreshes project 7: items, stages, phase counts
//   node scripts/github-project-setup.mjs --dry-run     # prints what it would do; calls nothing
//
// WHY A SCRIPT. A cloud session cannot reach the Projects API (GraphQL is refused there), so the
// owner's own `gh` builds it. The project stores nothing new about the work: every row is an
// existing issue or pull request, the stage comes from its state and labels, and a plan run's
// phase count is read from its heartbeat comment (scripts/plan-kit.mjs). Deleting the project
// loses nothing: `gh project delete <number> --owner NoaCG`.
//
// GitHub offers no API for views or for the built-in workflows; the six views and the three
// switches are listed at the end of the run and take a few minutes by hand, once.
import { spawnSync } from 'node:child_process';

const OWNER = 'NoaCG';
const REPO = 'NoaCG/NoaCG-Studio';
const TITLE = 'NoaCG Development';
const HEARTBEAT = /noacg:plan-run-heartbeat[\s\S]*?\*\*Phases passed:\*\* (\d+) of (\d+)/;

export const STAGES = Object.freeze([
  { name: 'Proposed', color: 'PURPLE', description: 'An idea or a question that waits for the owner' },
  { name: 'Ready', color: 'BLUE', description: 'Approved or ranked; nobody is on it yet' },
  { name: 'Active', color: 'YELLOW', description: 'Being worked on now' },
  { name: 'In review', color: 'ORANGE', description: 'A pull request that is open, in CI or in the merge queue' },
  { name: 'Shipped', color: 'GREEN', description: 'Landed on main, or finished' },
  { name: 'Later', color: 'GRAY', description: 'Parked on purpose' },
]);
export const KINDS = Object.freeze(['Plan run', 'Delivery', 'Alarm', 'Decision', 'Backlog']);

/** What a row is, from data the issue or pull request already carries. */
export function kindOf(item) {
  const labels = item.labels ?? [];
  if (item.pr) return 'Delivery';
  if (/^plan run\b|\bplan run: /i.test(item.title)) return 'Plan run';
  if (item.author === 'github-actions[bot]' || /\bis red$|^Quarantine incidents|past their age ceiling/.test(item.title)) return 'Alarm';
  if (labels.includes('needs decision')) return 'Decision';
  return 'Backlog';
}

/** Where a row stands. The same reading the views show; nothing here is typed by hand. */
export function stageOf(item, kind = kindOf(item)) {
  const labels = item.labels ?? [];
  if (item.state !== 'open') return 'Shipped';
  if (kind === 'Delivery') return 'In review';
  if (kind === 'Plan run' || kind === 'Alarm') return 'Active';
  if (kind === 'Decision') return 'Proposed';
  if (labels.includes('later')) return 'Later';
  return 'Ready';
}

/** "5 of 9" from a run issue's heartbeat comment, or null when it has none. */
export function phasesFrom(comments) {
  for (const body of [...comments].reverse()) {
    const m = HEARTBEAT.exec(body ?? '');
    if (m) return `${m[1]} of ${m[2]}`;
  }
  return null;
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const at = args.indexOf('--project');
const GIVEN = at >= 0 ? Number(args[at + 1]) : null;

function gh(argv, { read = false } = {}) {
  if (DRY && !read) { console.log(`  would run: gh ${argv.join(' ')}`); return ''; }
  const r = spawnSync('gh', argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`gh ${argv.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}
const json = (argv, options) => JSON.parse(gh(argv, options) || 'null');
const graphql = (query, fields = {}) => json(['api', 'graphql', '-f', `query=${query}`,
  ...Object.entries(fields).flatMap(([k, v]) => ['-f', `${k}=${v}`])]);

/** The rows: every open plan run, alarm, decision and pull request, the P1 backlog, and what landed lately. */
function collect() {
  const search = (q) => json(['api', '-X', 'GET', 'search/issues', '-f', `q=repo:${REPO} ${q}`, '-f', 'per_page=50',
    '--jq', '[.items[] | {number, title, url: .html_url, state, author: .user.login, pr: (.pull_request != null), labels: [.labels[].name]}]'], { read: true });
  const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const since = day(14), week = day(3);
  const groups = [
    '"Plan run" in:title is:issue is:open',
    `"Plan run" in:title is:issue is:closed closed:>=${since}`,
    'is:issue is:open author:app/github-actions',
    'is:issue is:open label:"needs decision"',
    'is:issue is:open label:P1',
    'is:pr is:open',
    // Landed work a person or an agent wrote; the bot's quarantine and refresh pull requests are noise here.
    `is:pr is:merged merged:>=${week} -author:app/noacg-automation-ci-prs -author:app/github-actions`,
  ];
  const seen = new Map();
  for (const q of groups) for (const item of search(q)) seen.set(item.number, item);
  // A title search also finds issues ABOUT plan runs; only a real run issue or a real class stays.
  return [...seen.values()].filter((item) => item.pr || kindOf(item) !== 'Backlog' || item.labels.includes('P1'));
}

function main() {
  const rows = collect();
  console.log(`${rows.length} rows from ${REPO}.`);

  let number = GIVEN;
  if (!number) {
    number = json(['project', 'create', '--owner', OWNER, '--title', TITLE, '--format', 'json'])?.number ?? 0;
    gh(['project', 'link', String(number), '--owner', OWNER, '--repo', REPO]);
    gh(['project', 'edit', String(number), '--owner', OWNER, '--description',
      'What is being built, what waits on the owner, what is red and what shipped. Every row is an existing issue or pull request.']);
    gh(['project', 'field-create', String(number), '--owner', OWNER, '--name', 'Kind', '--data-type', 'SINGLE_SELECT', '--single-select-options', KINDS.join(',')]);
    gh(['project', 'field-create', String(number), '--owner', OWNER, '--name', 'Phases', '--data-type', 'TEXT']);
  }
  if (DRY) {
    for (const item of rows) console.log(`  #${item.number}  ${kindOf(item).padEnd(9)} ${stageOf(item).padEnd(9)} ${item.title.slice(0, 70)}`);
    return;
  }

  const project = json(['project', 'view', String(number), '--owner', OWNER, '--format', 'json']);
  let fields = json(['project', 'field-list', String(number), '--owner', OWNER, '--format', 'json']).fields;
  const field = (name) => fields.find((f) => f.name === name) ?? (() => { throw new Error(`the project has no ${name} field`); })();
  if (STAGES.some((s) => !field('Status').options.some((o) => o.name === s.name))) {
    const options = STAGES.map((s) => `{name: ${JSON.stringify(s.name)}, color: ${s.color}, description: ${JSON.stringify(s.description)}}`).join(', ');
    graphql(`mutation($field: ID!) { updateProjectV2Field(input: {fieldId: $field, singleSelectOptions: [${options}]}) { clientMutationId } }`, { field: field('Status').id });
    fields = json(['project', 'field-list', String(number), '--owner', OWNER, '--format', 'json']).fields;
  }
  const option = (name, value) => field(name).options.find((o) => o.name === value).id;
  const set = (id, name, value) => gh(['project', 'item-edit', '--id', id, '--project-id', project.id, '--field-id', field(name).id, ...value]);

  for (const item of rows) {
    const kind = kindOf(item), stage = stageOf(item, kind);
    const id = json(['project', 'item-add', String(number), '--owner', OWNER, '--url', item.url, '--format', 'json']).id;
    set(id, 'Kind', ['--single-select-option-id', option('Kind', kind)]);
    set(id, 'Status', ['--single-select-option-id', option('Status', stage)]);
    if (kind === 'Plan run') {
      const phases = phasesFrom(json(['api', `repos/${REPO}/issues/${item.number}/comments`, '--paginate', '--jq', '[.[].body]']));
      if (phases) set(id, 'Phases', ['--text', phases]);
    }
    console.log(`  #${item.number}  ${kind.padEnd(9)} ${stage}`);
  }

  console.log(`\nProject: ${project.url}\n
Once, by hand (GitHub has no API for these):
  Views (the "New view" tab; paste the filter, then Save):
    1. Now          Board, columns by Status      filter: -status:Later
    2. Needs me     Table, group by Kind          filter: kind:Alarm,Decision is:open
    3. Runs         Table, group by Status        filter: kind:"Plan run"     show: Phases, Sub-issues progress
    4. Deliveries   Table, group by Status        filter: is:pr               show: Linked issues, Reviewers
    5. Shipped      Table, group by Kind          filter: status:Shipped
    6. Roadmap      Board, columns by Status      filter: status:Proposed,Ready,Later
  Workflows (the "..." menu, Workflows):
    - Item closed          -> set Status to Shipped
    - Pull request merged  -> set Status to Shipped
    - Auto-add to project  -> repository ${REPO}, filter: is:pr   (and "Item added" -> Status: In review)`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  try { main(); } catch (error) { console.error(String(error.message ?? error)); process.exit(1); }
}
