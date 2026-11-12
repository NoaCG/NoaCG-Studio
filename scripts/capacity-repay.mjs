#!/usr/bin/env node
// A COST REFUSAL BECOMES A DATED REPAYMENT ITEM, NOT A BLOCKED LANDING (cicd-followup land-2c).
//
//   node scripts/capacity-repay.mjs [--issue] [--today YYYY-MM-DD]
//
// Owner, 2026-11-12: "A cost ceiling must never be able to block a landing." Where the capacity
// line (scripts/e2e-capacity.mjs) would still be right to refuse a change for its cost, the change
// lands and its merge group's `CI gate` prints one fixed annotation per tier:
//
//   Repay (<tier>): <what it added>
//
// After each landing (post-land.yml, the delivery-age alarm's job) this reads the `CI gate`
// annotations of the last MERGES pull requests merged into main and records each repayment once,
// in one GitHub issue per tier assigned to the owner scripts/growth-ceilings.json records
// (scripts/alarm-owner.mjs). At most one is open per tier. A later landing that adds cost to a tier
// whose item is open is added to that item as a comment, and the item's due date does not move:
// the debt accumulates on one dated item, so the pressure stays real. Once the due date passes,
// the item is marked overdue once, in its title and a comment. It never writes the ceilings file,
// a budget exception or a work-spec line, and it waives nothing: the tier stays over its line in
// every later warning and weekly report. The owner closes the item when the tier is back in its
// line. Rules C1-C7: docs/work-specs/cicd-followup/evidence/land-2-rules.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { alarmOwner, issueNumber, makeReader, routeOrWarn, trustedAuthor } from './alarm-owner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || 'NoaCG/NoaCG-Studio';
const DAY = 86_400_000;

export const TIERS = ['offline', 'backend', 'graphics', 'overhead'];
/** Days from an item's opening to its due date. */
export const DUE_DAYS = 14;
/** First-parent merges into main read on each run, so a cancelled post-land run is caught up. */
export const MERGES = 20;
/** GitHub API calls per run, reads and writes together. */
export const CALLS = 100;
export const TITLE_PREFIX = 'Capacity repayment:';
export const titleFor = (tier) => `${TITLE_PREFIX} ${tier} tier`;
/** The annotation the CI gate prints for a repayment, and nothing else matches it. */
export const REPAY_LINE = /^Repay \((offline|backend|graphics|overhead)\): (.+)$/;
const RECORDED = /<!-- capacity-repay: #(\d+) -->/g;
const DUE = /<!-- capacity-repay-due: (\d{4}-\d{2}-\d{2}) -->/;
const OVERDUE = '<!-- capacity-repay-overdue -->';

/** The repayments a CI gate's annotations name, one per tier at most. Pure. */
export function repaysIn(annotations) {
  const out = new Map();
  for (const a of annotations ?? []) {
    const m = REPAY_LINE.exec(String(a?.message ?? '').trim());
    if (m && !out.has(m[1])) out.set(m[1], m[2].trim());
  }
  return [...out].map(([tier, cost]) => ({ tier, cost }));
}

/** The pull requests merged into main, newest first, from `git log --first-parent --format=%H%x09%s`. Pure. */
export function landedPrs(log) {
  const out = [];
  for (const line of String(log ?? '').split('\n')) {
    const [sha, subject = ''] = line.split('\t');
    const m = /^Merge pull request #(\d+) /.exec(subject);
    if (sha && m) out.push({ sha: sha.trim(), pr: Number(m[1]) });
  }
  return out;
}

/** The pull request numbers an item already records (its body and comments). Pure. */
export function recordedIn(texts) {
  const out = new Set();
  for (const t of texts) for (const m of String(t ?? '').matchAll(RECORDED)) out.add(Number(m[1]));
  return out;
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const entry = (r) => `- #${r.pr} (${r.sha.slice(0, 8)}): ${r.cost} <!-- capacity-repay: #${r.pr} -->`;

/** The body of a new repayment item. Pure. */
export function itemBody({ tier, due, owner, repays }) {
  return [
    `The ${tier} tier is over its line, and the landings below were not blocked for it (owner, 2026-11-12: a cost ceiling never blocks a landing). This item records what is owed.`,
    '',
    `**Due ${due}.** Owner: ${owner}.`,
    '',
    ...repays.map(entry),
    '',
    `What to do: bring the ${tier} tier back under its line, by cutting at least what is listed or by a reviewed ceilings revision, then close this issue. A later landing that adds cost to this tier is added here, and the due date does not move. This item waives nothing: the tier stays over its line in every gate warning and weekly report until it is repaid.`,
    '',
    `Raised by \`node scripts/capacity-repay.mjs\` after each landing (post-land.yml). <!-- capacity-repay-due: ${due} -->`,
  ].join('\n');
}

/**
 * What to write. `landed` are the merged pull requests with their repayments, newest first;
 * `items` the open repayment item of each tier ({ number, title, texts }), if any. Every
 * repayment is recorded once, oldest landing first; a tier with no open item gets one; an open
 * item past its due date is marked overdue once. Pure.
 */
export function planRepayments({ landed, items, today, owner, recorded = new Set() }) {
  const actions = [];
  const byTier = new Map();
  for (const l of [...landed].reverse()) for (const r of l.repays) {
    const list = byTier.get(r.tier) ?? [];
    list.push({ ...r, pr: l.pr, sha: l.sha });
    byTier.set(r.tier, list);
  }
  for (const tier of TIERS) {
    const item = items[tier] ?? null;
    // Recorded on the open item, or on an item already closed (repaid): never recorded again.
    const seen = new Set([...recorded, ...(item ? recordedIn(item.texts) : [])]);
    const fresh = (byTier.get(tier) ?? []).filter((r) => !seen.has(r.pr) && (seen.add(r.pr), true));
    if (!item) {
      if (fresh.length) actions.push({ kind: 'open', tier, title: titleFor(tier), body: itemBody({ tier, due: addDays(today, DUE_DAYS), owner, repays: fresh }) });
      continue;
    }
    if (fresh.length) actions.push({ kind: 'comment', tier, number: item.number, body: [`Also owed on this item (its due date does not move):`, '', ...fresh.map(entry)].join('\n') });
    // The due date is the one the item opened with, in its body; no later text can move it.
    const due = DUE.exec(String(item.texts[0] ?? ''))?.[1];
    if (due && today > due && !item.texts.some((t) => String(t ?? '').includes(OVERDUE))) {
      actions.push({ kind: 'overdue', tier, number: item.number, title: `${titleFor(tier)} (overdue since ${due})`, body: `This repayment was due ${due} and is still open. ${owner}: please cut the ${tier} tier back under its line or record a reviewed ceilings revision, then close this issue. ${OVERDUE}` });
    }
  }
  return actions;
}

/** Days back a closed repayment item still counts as having recorded its landings (past MERGES). */
export const CLOSED_DAYS = 30;
/** Pages of open issues read to find the open items; past them the run records nothing. */
export const OPEN_PAGES = 5;
const tierOf = (title) => TIERS.find((t) => title === titleFor(t) || String(title).startsWith(`${titleFor(t)} (`));

/** An item's own texts: its body, then its comments by a bot or member (an outsider's marker counts for nothing). */
function itemTexts(reader, repo, issue) {
  const texts = [issue.body ?? ''];
  for (let page = 1; page <= 3; page++) {
    const comments = reader.get(`repos/${repo}/issues/${issue.number}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(comments)) throw new Error(`the comments of #${issue.number} could not be read: nothing is recorded rather than a duplicate written`);
    texts.push(...comments.filter(trustedAuthor).map((c) => c.body ?? ''));
    if (comments.length < 100) break;
  }
  return texts;
}

/**
 * The open repayment item of each tier (an issue titled for it, by a bot or member), and every
 * pull request already recorded on any repayment item, open or closed in the last CLOSED_DAYS, so
 * a repaid and closed debt is never opened again.
 */
export function repaymentItems(reader, { repo = REPO, today }) {
  const items = {};
  const recorded = new Set();
  const take = (i, open) => {
    const tier = i.pull_request || !trustedAuthor(i) ? null : tierOf(i.title);
    if (!tier) return;
    const texts = itemTexts(reader, repo, i);
    for (const pr of recordedIn(texts)) recorded.add(pr);
    if (open && !items[tier]) items[tier] = { number: i.number, title: i.title, texts };
  };
  // Open items: the exact issue listing (a search index can lag a just-opened item). A listing
  // that runs past its pages, or cannot be read, records nothing rather than open a duplicate.
  for (let page = 1; ; page++) {
    const list = reader.get(`repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    if (!Array.isArray(list)) throw new Error('the open issue listing could not be read: nothing is recorded rather than a duplicate opened');
    for (const i of list) take(i, true);
    if (list.length < 100) break;
    if (page === OPEN_PAGES) throw new Error(`more than ${OPEN_PAGES * 100} open issues: cannot tell whether a repayment item is open, so nothing is recorded`);
  }
  // Closed items: one search by title, so a repaid item is found however many other issues and
  // pull requests closed since (the issue listing would bury it behind them).
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - CLOSED_DAYS * DAY).toISOString().slice(0, 10);
  const q = `repo:${repo} is:issue is:closed in:title "${TITLE_PREFIX}" closed:>=${since}`;
  const found = reader.get(`search/issues?q=${encodeURIComponent(q)}&per_page=100`);
  if (!Array.isArray(found?.items)) throw new Error('the closed repayment items could not be searched: nothing is recorded rather than a repaid debt opened again');
  if (found.total_count > found.items.length) throw new Error(`${found.total_count} closed repayment items in ${CLOSED_DAYS} days, more than one search page: nothing is recorded`);
  for (const i of found.items) take(i, false);
  return { items, recorded };
}

/**
 * The repayments each landed pull request's CI gate named. A landed commit has two green `CI gate`
 * runs, the merge group's (which judged the change and printed any `Repay` line) and main's own
 * push run (which has no capacity verdict), listed in either order, so every green one is read.
 * A commit with no green CI gate names none.
 */
export function repaysOf(reader, landed, skip, repo = REPO) {
  return landed.map((l) => {
    if (skip.has(l.pr)) return { ...l, repays: [] };
    // A read that fails is not "nothing owed": the run stops and the next one catches up.
    const runs = reader.get(`repos/${repo}/commits/${l.sha}/check-runs?check_name=${encodeURIComponent('CI gate')}&per_page=10`);
    if (!Array.isArray(runs?.check_runs)) throw new Error(`the CI gate of #${l.pr} (${l.sha.slice(0, 8)}) could not be read: nothing is recorded this run`);
    const gates = runs.check_runs.filter((r) => r.name === 'CI gate' && r.conclusion === 'success');
    return { ...l, repays: repaysIn(gates.flatMap((g) => {
      const annotations = reader.get(`repos/${repo}/check-runs/${g.id}/annotations?per_page=50`);
      if (!Array.isArray(annotations)) throw new Error(`the CI gate annotations of #${l.pr} could not be read: nothing is recorded this run`);
      return annotations;
    })) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const today = value('--today') ?? new Date().toISOString().slice(0, 10);
  const ceilings = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'growth-ceilings.json'), 'utf8'));
  const { owner, login } = alarmOwner(ceilings);
  const reader = makeReader(CALLS);
  const log = execFileSync('git', ['log', '--first-parent', `-${MERGES}`, '--format=%H%x09%s', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const { items, recorded } = repaymentItems(reader, { today });
  const landed = repaysOf(reader, landedPrs(log), recorded);
  if (reader.exhausted) throw new Error(`more than ${CALLS} API calls needed: nothing is recorded rather than part of it`);
  const actions = planRepayments({ landed, items, today, owner, recorded });
  for (const a of actions) console.log(`${a.kind} ${a.tier}${a.number ? ` #${a.number}` : ''}`);
  if (!actions.length) console.log('no repayment to record');
  if (args.includes('--issue')) {
    const gh = (a) => execFileSync('gh', a, { encoding: 'utf8', windowsHide: true });
    for (const a of actions) {
      if (a.kind === 'open') console.log(routeOrWarn(issueNumber(gh(['api', '-X', 'POST', `repos/${REPO}/issues`, '-f', `title=${a.title}`, '-f', `body=${a.body}`])), { login, gh }));
      else if (a.kind === 'comment') gh(['api', '-X', 'POST', `repos/${REPO}/issues/${a.number}/comments`, '-f', `body=${a.body}`]);
      else if (a.kind === 'overdue') {
        gh(['api', '-X', 'PATCH', `repos/${REPO}/issues/${a.number}`, '-f', `title=${a.title}`]);
        gh(['api', '-X', 'POST', `repos/${REPO}/issues/${a.number}/comments`, '-f', `body=${a.body}`]);
        console.log(routeOrWarn(a.number, { login, gh }));
      }
    }
  }
}
