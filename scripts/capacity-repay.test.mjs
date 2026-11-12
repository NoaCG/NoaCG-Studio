// guards: scripts/capacity-repay.mjs, scripts/alarm-owner.mjs, docs/work-specs/cicd-followup/evidence/land-2-rules.md
// Land-2c (rules C1-C7): a cost refusal becomes one dated repayment item per tier after landing,
// never a blocked landing; later landings add to the open item without moving its due date.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DUE_DAYS, MERGES, CALLS, OPEN_PAGES, itemBody, landedPrs, planRepayments, recordedIn, repaymentItems, repaysIn, repaysOf, titleFor } from './capacity-repay.mjs';

const OWNER = 'miwco (primary); the weekly owner session (backup coverage)';
const landing = (pr, repays, sha = `${String(pr).padStart(4, '0')}${'a'.repeat(36)}`) => ({ pr, sha, repays });
const offline = (cost = '1.9 runner-minutes per landing and 0.4 per day, the offline tier at 123% of its ceiling') => ({ tier: 'offline', cost });

test('only the fixed annotation names a repayment, one per tier', () => {
  const got = repaysIn([
    { message: 'Repay (offline): 1.9/landing 0.4/day, offline at 123%' },
    { message: 'Repay (offline): a second line for the same tier' },
    { message: 'Repay (backend): 6.9/landing' },
    { message: 'E2E capacity line - refuse' },
    { message: 'Repay (table): not a tier' },
    { message: 'Needs the owner (full:offline): ...' },
  ]);
  assert.deepEqual(got, [{ tier: 'offline', cost: '1.9/landing 0.4/day, offline at 123%' }, { tier: 'backend', cost: '6.9/landing' }]);
  assert.deepEqual(repaysIn(null), []);
});

test('the landed pull requests come from main\'s first-parent merge subjects', () => {
  const log = ['91a57833c\tMerge pull request #2381 from NoaCG/claude/growth-ceilings-v3', 'deadbeef\tA direct commit', '9960a904e\tMerge pull request #2408 from NoaCG/claude/plan-live-publishing-4-build', ''].join('\n');
  assert.deepEqual(landedPrs(log), [{ sha: '91a57833c', pr: 2381 }, { sha: '9960a904e', pr: 2408 }]);
});

test('C2: with no open item, one is opened per tier, dated, owned, with each landing\'s cost', () => {
  const actions = planRepayments({ landed: [landing(2410, [offline('second')]), landing(2408, [offline('first'), { tier: 'backend', cost: 'b' }])], items: {}, today: '2026-11-12', owner: OWNER });
  assert.deepEqual(actions.map((a) => [a.kind, a.tier]), [['open', 'offline'], ['open', 'backend']]);
  const o = actions[0];
  assert.equal(o.title, titleFor('offline'));
  assert.match(o.body, /\*\*Due 2026-11-26\.\*\* Owner: miwco/);
  assert.equal(DUE_DAYS, 14);
  assert.ok(o.body.indexOf('#2408') < o.body.indexOf('#2410'), 'oldest landing first');
  assert.deepEqual([...recordedIn([o.body])].sort(), [2408, 2410]);
  assert.match(o.body, /waives nothing/);
});

test('C3: an open item gets later landings as a comment, its due date does not move, and nothing is recorded twice', () => {
  const body = itemBody({ tier: 'offline', due: '2026-11-26', owner: OWNER, repays: [{ ...offline('first'), pr: 2408, sha: 'a'.repeat(40) }] });
  const items = { offline: { number: 3001, title: titleFor('offline'), texts: [body] } };
  const actions = planRepayments({ landed: [landing(2412, [offline('later')]), landing(2408, [offline('first')])], items, today: '2026-11-20', owner: OWNER });
  assert.deepEqual(actions.map((a) => [a.kind, a.number]), [['comment', 3001]]);
  assert.match(actions[0].body, /#2412.*later/);
  assert.doesNotMatch(actions[0].body, /#2408/, 'already recorded');
  assert.doesNotMatch(actions[0].body, /Due /, 'no new due date');
  assert.ok(!actions.some((a) => a.kind === 'open'), 'never a second item for the tier');
  // Run again after the comment landed: nothing more.
  assert.deepEqual(planRepayments({ landed: [landing(2412, [offline('later')])], items: { offline: { ...items.offline, texts: [body, actions[0].body] } }, today: '2026-11-20', owner: OWNER }), []);
});

test('C3: past its due date an open item is marked overdue once, routed to the owner', () => {
  const body = itemBody({ tier: 'graphics', due: '2026-11-26', owner: OWNER, repays: [{ tier: 'graphics', cost: 'g', pr: 1, sha: 'b'.repeat(40) }] });
  const item = { number: 3002, title: titleFor('graphics'), texts: [body] };
  assert.deepEqual(planRepayments({ landed: [], items: { graphics: item }, today: '2026-11-26', owner: OWNER }), [], 'the due day itself is not overdue');
  const late = planRepayments({ landed: [], items: { graphics: item }, today: '2026-11-27', owner: OWNER });
  assert.deepEqual(late.map((a) => [a.kind, a.number, a.title]), [['overdue', 3002, 'Capacity repayment: graphics tier (overdue since 2026-11-26)']]);
  assert.deepEqual(planRepayments({ landed: [], items: { graphics: { ...item, texts: [body, late[0].body] } }, today: '2026-12-10', owner: OWNER }), [], 'once');
  // The due date is the body's: a later text naming another date cannot move it.
  const moved = { ...item, texts: [body, '<!-- capacity-repay-due: 2027-01-31 -->'] };
  assert.equal(planRepayments({ landed: [], items: { graphics: moved }, today: '2026-11-27', owner: OWNER })[0]?.kind, 'overdue');
});

test('C2: a landing recorded on an item already closed (repaid) is never opened again', () => {
  const actions = planRepayments({ landed: [landing(2405, [offline('paid')]), landing(2412, [offline('new')])], items: {}, today: '2026-11-20', owner: OWNER, recorded: new Set([2405]) });
  assert.equal(actions.length, 1);
  assert.match(actions[0].body, /#2412/);
  assert.doesNotMatch(actions[0].body, /#2405/);
});

test('C4: it writes only issues and comments, never the ceilings, an exception or a spec line', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./capacity-repay.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /writeFileSync|appendFileSync|growth-ceilings\.json['"`]\s*,\s*['"`]w/);
  assert.equal((src.match(/'-X', '(?:POST|PATCH|PUT|DELETE)'/g) ?? []).length, 4, 'issue create, comment, title, comment');
});

/** A reader over canned GitHub answers, counting calls like makeReader. */
function canned(routes) {
  const reader = { calls: 0, exhausted: false, seen: [] };
  reader.get = (route) => { reader.calls += 1; reader.seen.push(route); const hit = Object.entries(routes).find(([k]) => route.startsWith(k)); return hit ? hit[1] : null; };
  return reader;
}

test('reading GitHub: the open item by title from a bot or member, its comments, and each landing\'s green CI gate annotations', () => {
  const R = 'NoaCG/NoaCG-Studio';
  const reader = canned({
    'search/issues?q=': { total_count: 2, items: [
      { number: 5, title: titleFor('offline'), body: '<!-- capacity-repay: #2405 -->', user: { type: 'Bot' } },
      { number: 6, title: 'Something else', body: '<!-- capacity-repay: #2406 -->', user: { type: 'Bot' } },
    ] },
    [`repos/${R}/issues/5/comments?per_page=100&page=1`]: Array.from({ length: 100 }, () => ({ body: 'progress', user: { type: 'Bot' } })),
    [`repos/${R}/issues/5/comments?per_page=100&page=2`]: [{ body: '<!-- capacity-repay: #2404 -->', user: { type: 'Bot' } }],
    [`repos/${R}/issues?state=open`]: [
      { number: 7, title: titleFor('offline'), body: 'x <!-- capacity-repay: #2408 -->', user: { type: 'Bot' } },
      { number: 8, title: titleFor('backend'), body: '', user: { type: 'User' }, author_association: 'NONE' },
      { number: 9, title: `${titleFor('graphics')} (overdue since 2026-11-01)`, body: '', user: { type: 'User' }, author_association: 'OWNER' },
    ],
    [`repos/${R}/issues/7/comments`]: [{ body: '<!-- capacity-repay: #2410 -->', user: { type: 'Bot' } }, { body: '<!-- capacity-repay: #2412 --> <!-- capacity-repay-overdue -->', user: { type: 'User' }, author_association: 'NONE' }],
    [`repos/${R}/issues/9/comments`]: [],
    // Main's own push run is listed first and has no Repay line; the merge group's run has it.
    [`repos/${R}/commits/s1/check-runs`]: { check_runs: [{ id: 10, name: 'CI gate', conclusion: 'success' }, { id: 11, name: 'CI gate', conclusion: 'success' }] },
    [`repos/${R}/check-runs/10/annotations`]: [{ message: 'All gates passed' }],
    [`repos/${R}/check-runs/11/annotations`]: [{ message: 'Repay (offline): 2/landing' }],
    [`repos/${R}/commits/s4/check-runs`]: { check_runs: [] },
    [`repos/${R}/commits/s2/check-runs`]: { check_runs: [{ id: 12, name: 'CI gate', conclusion: 'failure' }] },
    [`repos/${R}/check-runs/12/annotations`]: [{ message: 'Repay (offline): from a red gate, which landed nothing' }],
  });
  const { items, recorded } = repaymentItems(reader, { repo: R, today: '2026-11-20' });
  assert.deepEqual(Object.keys(items).sort(), ['graphics', 'offline'], 'an outsider\'s issue is never taken for the item');
  assert.deepEqual([...recordedIn(items.offline.texts)].sort(), [2408, 2410], 'an outsider\'s comment marks nothing recorded');
  assert.ok(!items.offline.texts.some((t) => t.includes('overdue')), 'nor overdue');
  assert.deepEqual([...recorded].sort(), [2404, 2405, 2408, 2410], 'a closed repayment item\'s landings count as recorded, its second comment page too');
  const search = decodeURIComponent(reader.seen.find((r) => r.startsWith('search/issues?q=')));
  assert.match(search, /repo:NoaCG\/NoaCG-Studio is:issue is:closed in:title "Capacity repayment:" closed:>=2026-10-21/, 'one search for closed items of the last 30 days');
  const landed = repaysOf(reader, [{ sha: 's1', pr: 2412 }, { sha: 's2', pr: 2413 }, { sha: 's4', pr: 2414 }, { sha: 's3', pr: 2408 }], new Set([2408]), R);
  assert.deepEqual(landed.map((l) => l.repays), [[{ tier: 'offline', cost: '2/landing' }], [], [], []], 'the merge group\'s line is found behind the push run; a red gate landed nothing; a recorded PR is not read');
  assert.ok(!reader.seen.some((r) => r.includes('/commits/s3/')), 'no call for a PR already recorded');
  // A failed read of a landing's CI gate stops the run instead of reading as nothing owed.
  assert.throws(() => repaysOf(reader, [{ sha: 'gone', pr: 2420 }], new Set(), R), /could not be read/);
  // The budget: open pages, one search, per landing one check-run read and two gates' annotations,
  // and what is left for comment pages (3 per item) still covers four open and four closed items.
  assert.ok(OPEN_PAGES + 1 + 3 * MERGES + 3 * 8 <= CALLS, `${OPEN_PAGES + 1 + 3 * MERGES + 3 * 8} calls in the worst case`);
});

test('an unreadable or overfull issue listing, or a failed search, records nothing rather than opening a duplicate', () => {
  const R = 'NoaCG/NoaCG-Studio';
  assert.throws(() => repaymentItems(canned({}), { repo: R, today: '2026-11-20' }), /could not be read/);
  const full = Array.from({ length: 100 }, (_, i) => ({ number: 9000 + i, title: 'x', user: { type: 'Bot' } }));
  // Full pages only up to page 6, so a missing stop fails here instead of looping.
  const pages = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`repos/${R}/issues?state=open&per_page=100&page=${n}`, full]));
  assert.throws(() => repaymentItems(canned(pages), { repo: R, today: '2026-11-20' }), /more than 500 open issues/);
  assert.throws(() => repaymentItems(canned({ [`repos/${R}/issues?state=open`]: [], 'search/issues?q=': { total_count: 0, incomplete_results: true, items: [] } }), { repo: R, today: '2026-11-20' }), /timed out/);
  assert.throws(() => repaymentItems(canned({ [`repos/${R}/issues?state=open`]: [] }), { repo: R, today: '2026-11-20' }), /could not be searched/);
  assert.throws(() => repaymentItems(canned({ [`repos/${R}/issues?state=open`]: [], 'search/issues?q=': { total_count: 101, items: [] } }), { repo: R, today: '2026-11-20' }), /more than one search page/);
});

// THE GATE SIDE (C1, C5): a refusal for cost alone is `repay`; records and evidence still refuse.
const { assess, applyOfflineStop, finalVerdict, growthAssessment, recordRefusalOf, repayments } = await import('./e2e-capacity.mjs');
const overhead = { jobMinutes: 0.42, testFactor: 1.01, medianJobMinutes: 0.3, samples: 10 };
const flat = (total) => ({ source: {}, minutes: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`s${i}.spec.ts`, total / 100])), overhead });
const fullOffline = () => ({ status: 'ok', reasons: [], stops: {}, ledger: [], estimates: { runsPerLanding: { everyRun: 4.75 }, scheduledRunsPerDay: { offline: 1 } }, tiers: { tiers: { offline: { status: 'warn', evidence: 'complete', line: 0.95, share: 1.22, used: { perLanding: 654.3, perDay: 191.5 }, ceiling: { perLanding: 535, perDay: 215 } } } } });

test('C1: #2408\'s shape with a genuinely new spec, the offline tier at 122%: it lands and owes the offline tier', () => {
  const t = flat(100);
  const result = assess({ table: t, suite: [...Object.keys(t.minutes), 'new.spec.ts'].sort(), changed: ['e2e/new.spec.ts'], today: '2026-11-12' });
  const growth = applyOfflineStop(fullOffline(), result);
  assert.equal(growth.status, 'refuse', 'still a correct refusal for cost');
  const v = finalVerdict({ result, growth });
  assert.equal(v.status, 'repay');
  assert.equal(v.owner, '');
  assert.deepEqual(v.repay.map((r) => r.tier), ['offline']);
  assert.match(v.repay[0].cost, /taking the offline tier to \d+% of its ceiling/);
  assert.doesNotMatch(v.repay[0].cost, /\n/);
});

test('C1: the table line and every refused tier each owe; a confirmed stop is a cost refusal too', () => {
  const t = flat(204);
  const result = assess({ table: t, suite: [...Object.keys(t.minutes), 'new.spec.ts'].sort(), changed: ['e2e/new.spec.ts'], today: '2026-11-12' });
  assert.equal(result.status, 'refuse');
  const growth = { status: 'refuse', reasons: ['backend tier refuse: growth stopped: B1'], stops: { backend: 'B1' }, ledger: [], tiers: { tiers: { backend: { status: 'refuse', why: 'growth stopped: B1' }, graphics: { status: 'warn', why: 'w' } } } };
  const v = finalVerdict({ result, growth });
  assert.equal(v.status, 'repay');
  assert.deepEqual(v.repay.map((r) => r.tier).sort(), ['backend', 'offline']);
  assert.match(v.repay.find((r) => r.tier === 'offline').cost, /^the table line: /);
  assert.deepEqual(repayments({ result: { ...result, status: 'warn' }, growth: { ...growth, tiers: { tiers: {} } } }), []);
});

test('C5: refusals of the records or of the change\'s own evidence still refuse, and only `revision` is the owner\'s', () => {
  const t = flat(204);
  const result = assess({ table: t, suite: [...Object.keys(t.minutes), 'new.spec.ts'].sort(), changed: ['e2e/new.spec.ts'], today: '2026-11-12' });
  const records = (o) => ({ status: 'refuse', reasons: ['x'], stops: {}, ledger: [], tiers: { tiers: {} }, ...o });
  for (const g of [records({ recordRefusal: true }), records({ ledger: ['exception E9 was edited'] })]) {
    const v = finalVerdict({ result, growth: g });
    assert.equal(v.status, 'refuse');
    assert.deepEqual(v.repay, []);
    assert.doesNotMatch(v.owner, /full:|stopped:/, 'a full table is never the owner\'s refusal now');
  }
  // What counts as a record refusal, each part on its own; and an unreadable diff, end to end.
  assert.equal(recordRefusalOf({}), false);
  for (const part of [{ ledger: ['x'] }, { offline: ['an exception line was removed'] }, { diffFailed: true }]) assert.equal(recordRefusalOf(part), true, JSON.stringify(part));
  const unreadable = growthAssessment({ base: 'no-such-base-land-2c', reportPath: null, table: { source: { recordedAt: '2026-11-12' } }, today: '2026-11-12' });
  assert.equal(unreadable.recordRefusal, true);
  assert.equal(finalVerdict({ result, growth: unreadable }).status, 'refuse', 'an unreadable diff is refused, never landed as a repayment (B6)');
  const ok = { status: 'ok', reasons: [], stops: {}, ledger: [], tiers: { tiers: {} } };
  assert.equal(finalVerdict({ result: { ...result, status: 'warn' }, growth: ok }).status, 'warn', 'no refusal, no repayment');
});

test('C1: the CI gate passes a repay verdict and prints one fixed annotation per tier; a refuse still fails', async () => {
  const { readFileSync, mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const lines = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').split('\n');
  const at = lines.findIndex((l) => l.trim() === '- name: Require every gate');
  const runAt = lines.findIndex((l, i) => i > at && l.trim() === 'run: |');
  const indent = lines[runAt].indexOf('run:');
  const body = [];
  for (const l of lines.slice(runAt + 1)) { if (l.trim() !== '' && l.length - l.trimStart().length <= indent) break; body.push(l); }
  const pad = Math.min(...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  const script = body.map((l) => l.slice(pad)).join('\n');
  const green = { BUILD_RESULT: 'success', PLAN_RESULT: 'success', E2E_RESULT: 'skipped', RETRY_RESULT: 'skipped', CATALOG_RESULT: 'skipped', FACTORY_RESULT: 'success', GUIDED_MOD_RESULT: 'skipped', EVENT: 'merge_group', CONFIGURED_FLAG: 'false', CONFIGURED_RESULT: 'skipped', CONFIGURED_VERDICT: 'skipped', CAPACITY_REASON: 'r' };
  const run = (env) => {
    const dir = mkdtempSync(join(tmpdir(), 'repay-gate-'));
    try {
      writeFileSync(join(dir, 'out'), '');
      const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', windowsHide: true, env: { PATH: process.env.PATH, HOME: dir, GITHUB_OUTPUT: join(dir, 'out'), GITHUB_STEP_SUMMARY: join(dir, 'out'), ...green, ...env } });
      return { code: r.status, out: r.stdout + r.stderr };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const repay = run({ CAPACITY_RESULT: 'repay', CAPACITY_REPAY: JSON.stringify([{ tier: 'offline', cost: '1.9/landing, offline at 123%' }, { tier: 'backend', cost: 'growth stopped: B1' }]) });
  assert.equal(repay.code, 0, repay.out);
  const annotations = repay.out.split('\n').filter((l) => l.startsWith('::warning title=CI gate::Repay')).map((l) => ({ message: l.replace('::warning title=CI gate::', '') }));
  assert.deepEqual(repaysIn(annotations), [{ tier: 'offline', cost: '1.9/landing, offline at 123%' }, { tier: 'backend', cost: 'growth stopped: B1' }], 'what the gate prints is what post-land reads');
  assert.notEqual(run({ CAPACITY_RESULT: 'refuse', CAPACITY_OWNER: '' }).code, 0);
  assert.match(run({ CAPACITY_RESULT: 'refuse', CAPACITY_OWNER: 'revision' }).out, /Needs the owner \(revision\)/);
});
