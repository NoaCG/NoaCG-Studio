#!/usr/bin/env node
// cf16 collector: for every landing on main's first-parent line in a window, which runs of which
// workflow validated that EXACT commit, with what coverage. Read-only (GitHub REST GETs only).
//
//   node phase-cf16-collect.mjs --since <iso> --until <iso> --cache <dir> [--max-calls 100]
//   node phase-cf16-collect.mjs --since <iso> --until <iso> --cache <dir> --report > records.json
//
// Run from a checkout whose origin/main contains the window. Each pass makes at most --max-calls
// API calls and stops; run it again to continue. Run lists are re-read per pass (they can still
// change); the jobs of a COMPLETED run are immutable and cached for good. No log is read, and no
// token or signed URL is written to the cache or the output.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--"))
      acc.push([
        a.slice(2),
        all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true,
      ]);
    return acc;
  }, []),
);
const SINCE = args.since;
const UNTIL = args.until;
const CACHE = args.cache;
const MAX = Number(args["max-calls"] ?? 100);
if (!SINCE || !UNTIL || !CACHE) {
  console.error(
    "usage: --since <iso> --until <iso> --cache <dir> [--max-calls 100] [--report]",
  );
  process.exit(2);
}
fs.mkdirSync(CACHE, { recursive: true });
const REPO = "NoaCG/NoaCG-Studio";
let calls = 0;
class Budget extends Error {}

function api(url) {
  if (calls >= MAX) throw new Budget();
  calls += 1;
  const out = execFileSync(
    "gh",
    ["api", "-H", "Accept: application/vnd.github+json", url],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(out);
}
const cacheFile = (name) =>
  path.join(CACHE, name.replace(/[^a-z0-9._-]/gi, "_") + ".json");
const readCache = (name) =>
  fs.existsSync(cacheFile(name))
    ? JSON.parse(fs.readFileSync(cacheFile(name), "utf8"))
    : null;
const writeCache = (name, v) =>
  fs.writeFileSync(cacheFile(name), JSON.stringify(v));

// Landings: main's first-parent commits whose committer time falls in the window (the queue
// commits the merge group's commit 6 to 13 minutes before it lands; the window edges use it).
function landings() {
  // A shallow clone cuts the first-parent walk short and silently drops landings (it read 95 of
  // 184 here once), so refuse one.
  if (
    execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      encoding: "utf8",
    }).trim() !== "false"
  ) {
    console.error("shallow clone: run `git fetch --unshallow origin` first");
    process.exit(2);
  }
  const out = execFileSync(
    "git",
    [
      "log",
      "--first-parent",
      "--format=%H %cI %s",
      `--since=${SINCE}`,
      `--until=${UNTIL}`,
      "origin/main",
    ],
    { encoding: "utf8" },
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, at, ...s] = l.split(" ");
      return { sha, committed_at: at, subject: s.join(" ") };
    })
    .reverse();
}

// Run lists by workflow and event, created from a day before the window to a day after it.
const LISTS = [
  ["ci.yml", "merge_group"],
  ["ci.yml", "push"],
  ["configured-suite.yml", "push"],
  ["quarantine.yml", "push"],
  ["nightly.yml", "schedule"],
  ["catalog-gates.yml", "schedule"],
];
function day(iso, d) {
  return (
    new Date(Date.parse(iso) + d * 86_400_000).toISOString().slice(0, 19) + "Z"
  );
}
function runList(wf, event) {
  const key = `runs-${wf}-${event}-${SINCE}-${UNTIL}`;
  const cached = readCache(key);
  if (cached?.done) return cached.runs;
  const runs = cached?.runs ?? [];
  let page = cached?.page ?? 1;
  const created = `${day(SINCE, -1)}..${day(UNTIL, 1)}`;
  for (;;) {
    let r;
    try {
      r = api(
        `repos/${REPO}/actions/workflows/${wf}/runs?event=${event}&created=${created}&per_page=100&page=${page}`,
      );
    } catch (e) {
      if (e instanceof Budget) writeCache(key, { runs, page, done: false });
      throw e;
    }
    for (const x of r.workflow_runs) {
      runs.push({
        id: x.id,
        head_sha: x.head_sha,
        head_branch: x.head_branch,
        event: x.event,
        status: x.status,
        conclusion: x.conclusion,
        created_at: x.created_at,
        run_started_at: x.run_started_at,
        updated_at: x.updated_at,
        run_attempt: x.run_attempt,
      });
    }
    if (r.workflow_runs.length < 100) break;
    page += 1;
  }
  // A run list taken while runs in it are still going is re-read next pass.
  const done = runs.every((x) => x.status === "completed");
  writeCache(key, { runs, page, done });
  return runs;
}
function jobs(run) {
  const key = `jobs-${run.id}-a${run.run_attempt}`;
  const cached = readCache(key);
  if (cached) return cached;
  const all = [];
  for (let page = 1; ; page += 1) {
    const r = api(
      `repos/${REPO}/actions/runs/${run.id}/jobs?filter=all&per_page=100&page=${page}`,
    );
    for (const j of r.jobs) {
      all.push({
        name: j.name,
        attempt: j.run_attempt,
        status: j.status,
        conclusion: j.conclusion,
        started_at: j.started_at,
        completed_at: j.completed_at,
      });
    }
    if (r.jobs.length < 100) break;
  }
  if (run.status === "completed") writeCache(key, all);
  return all;
}

const L = landings();
const shas = new Set(L.map((l) => l.sha));
const lists = {};
let complete = true;
try {
  for (const [wf, ev] of LISTS) lists[`${wf}:${ev}`] = runList(wf, ev);
  // Jobs for every run on a landing commit, plus every nightly and catalog-gates run.
  const wanted = [];
  for (const [k, runs] of Object.entries(lists)) {
    for (const r of runs) {
      if (
        k.startsWith("nightly") ||
        k.startsWith("catalog-gates") ||
        shas.has(r.head_sha)
      )
        wanted.push(r);
    }
  }
  for (const r of wanted) jobs(r);
} catch (e) {
  if (!(e instanceof Budget)) throw e;
  complete = false;
}
console.error(
  `landings ${L.length}, API calls this pass ${calls}, ${complete ? "COMPLETE" : "INCOMPLETE: run again"}`,
);
if (!args.report) process.exit(complete ? 0 : 3);
if (!complete) process.exit(3);

// ---- Report: one record per landing ----
const min = (a, b) => (Date.parse(b) - Date.parse(a)) / 60_000;
function jobMinutes(js) {
  // A re-run attempt lists the jobs it did not re-run again, with the same times: count once.
  const seen = new Set();
  let m = 0;
  for (const j of js) {
    if (!j.started_at || !j.completed_at) continue;
    const k = `${j.name}|${j.started_at}|${j.completed_at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    m += Math.max(0, min(j.started_at, j.completed_at));
  }
  return Math.round(m * 100) / 100;
}
function latestAttempt(js) {
  const a = Math.max(0, ...js.map((j) => j.attempt ?? 1));
  return js.filter((j) => (j.attempt ?? 1) === a);
}
function summarize(run) {
  if (!run) return null;
  const js = readCache(`jobs-${run.id}-a${run.run_attempt}`) ?? [];
  const last = latestAttempt(js);
  const e2e = last.filter((j) => /^E2E \d+\/\d+ \(/.test(j.name));
  const mode =
    e2e[0]?.name.match(/\((\w+)\)$/)?.[1] ??
    (last.some((j) => j.name === "E2E plan") ? "none" : null);
  const total = Number(e2e[0]?.name.match(/\/(\d+) /)?.[1] ?? 0);
  const catalog = last.find((j) => j.name === "Catalog calibration gate");
  const gate = last.find((j) => j.name === "CI gate");
  const configured = last.filter((j) => /^Configured E2E \d/.test(j.name));
  const catJobs = js.filter((j) => j.name === "Catalog calibration gate");
  return {
    id: run.id,
    conclusion: run.conclusion,
    created_at: run.created_at,
    updated_at: run.updated_at,
    attempts: run.run_attempt,
    mode,
    shards: total,
    shards_finished: e2e.filter((j) =>
      ["success", "failure"].includes(j.conclusion),
    ).length,
    catalog: catalog?.conclusion ?? "absent",
    catalog_minutes: jobMinutes(catJobs),
    gate: gate?.conclusion ?? "absent",
    configured_jobs: configured.length,
    jobs: last.length,
    minutes: jobMinutes(js),
  };
}
const by = (k) => {
  const m = new Map();
  for (const r of lists[k]) {
    if (!m.has(r.head_sha)) m.set(r.head_sha, []);
    m.get(r.head_sha).push(r);
  }
  return m;
};
const group = by("ci.yml:merge_group");
const push = by("ci.yml:push");
const conf = by("configured-suite.yml:push");
const quar = by("quarantine.yml:push");
const records = L.map((l) => {
  const groups = (group.get(l.sha) ?? []).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const pushes = (push.get(l.sha) ?? []).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const cs = (conf.get(l.sha) ?? []).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const qs = quar.get(l.sha) ?? [];
  return {
    sha: l.sha,
    committed_at: l.committed_at,
    subject: l.subject,
    // The push run is created when the commit reaches main: the landing time.
    landed_at: pushes[0]?.created_at ?? cs[0]?.created_at ?? null,
    group_runs: groups.length,
    group: summarize(
      groups.find((g) => g.conclusion === "success") ?? groups.at(-1),
    ),
    push_runs: pushes.length,
    push: summarize(pushes.at(-1)),
    configured: cs.at(-1)
      ? {
          id: cs.at(-1).id,
          conclusion: cs.at(-1).conclusion,
          minutes: jobMinutes(
            readCache(`jobs-${cs.at(-1).id}-a${cs.at(-1).run_attempt}`) ?? [],
          ),
        }
      : null,
    quarantine: qs.at(-1)
      ? { id: qs.at(-1).id, conclusion: qs.at(-1).conclusion }
      : null,
  };
});
const sched = (k) =>
  lists[k].map((r) => {
    const js = readCache(`jobs-${r.id}-a${r.run_attempt}`) ?? [];
    const last = latestAttempt(js);
    return {
      id: r.id,
      head_sha: r.head_sha,
      created_at: r.created_at,
      updated_at: r.updated_at,
      conclusion: r.conclusion,
      minutes: jobMinutes(js),
      jobs: last.map((j) => ({
        name: j.name,
        conclusion: j.conclusion,
        minutes:
          j.started_at && j.completed_at
            ? Math.round(min(j.started_at, j.completed_at) * 100) / 100
            : null,
      })),
    };
  });
console.log(
  JSON.stringify(
    {
      since: SINCE,
      until: UNTIL,
      collected_at: new Date().toISOString(),
      records,
      nightly: sched("nightly.yml:schedule"),
      catalog_gates: sched("catalog-gates.yml:schedule"),
    },
    null,
    1,
  ),
);
