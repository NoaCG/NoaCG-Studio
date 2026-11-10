#!/usr/bin/env node
// cf16 analysis: reads phase-cf16-records.json (from phase-cf16-collect.mjs --report) and prints
// every figure phase-cf16.md quotes. No network.
//
//   node phase-cf16-analyze.mjs [records.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file =
  process.argv[2] ??
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "phase-cf16-records.json",
  );
const d = JSON.parse(fs.readFileSync(file, "utf8"));
const R = d.records;
const n = R.length;
const count = (f) => R.filter(f).length;
const tally = (f) =>
  R.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
const stats = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const sum = a.reduce((x, y) => x + y, 0);
  return {
    n: a.length,
    median: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    max: +a.at(-1).toFixed(1),
    mean: +(sum / a.length).toFixed(1),
    sum: Math.round(sum),
  };
};
const mins = (a, b) => (Date.parse(b) - Date.parse(a)) / 60_000;
const out = (k, v) =>
  console.log(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);

// A landing that reached main in the same push as the next one has no push run of its own; it
// takes the next landing's time (the ci13 rule R1).
for (let i = n - 1; i >= 0; i -= 1)
  R[i].landed = R[i].landed_at ?? R[i + 1]?.landed;
const fullPush = (r) =>
  r.push?.mode === "full" &&
  r.push.shards > 0 &&
  r.push.shards_finished === r.push.shards;
const greenFullPush = (r) => fullPush(r) && r.push.conclusion === "success";
const days = (Date.parse(d.until) - Date.parse(d.since)) / 86_400_000;

console.log(`window ${d.since} to ${d.until}, collected ${d.collected_at}`);
out("landings", n);
out(
  "landings per day",
  tally((r) => r.landed.slice(0, 10)),
);
out(
  "max landings in one clock hour",
  Math.max(...Object.values(tally((r) => r.landed.slice(0, 13)))),
);

console.log("\n(a) merge group run on the exact landed commit");
out(
  "landings with a merge_group ci.yml run whose head_sha is the landed commit",
  count((r) => r.group),
);
out(
  "of them with CI gate success",
  count((r) => r.group?.gate === "success"),
);
out(
  "more than one merge_group run on that sha",
  count((r) => r.group_runs > 1),
);
out(
  "merge group E2E mode",
  tally((r) => r.group?.mode),
);
out(
  "merge group catalog gate",
  tally((r) => r.group?.catalog),
);
out(
  "merge group configured jobs",
  tally((r) => r.group?.configured_jobs),
);

console.log("\n(a) post-merge runs on the exact landed commit");
out(
  "no push run of its own (landed in the same push as the next)",
  count((r) => !r.push_runs),
);
out("ci.yml push: full suite, every shard finished", count(fullPush));
out("ci.yml push: full suite green", count(greenFullPush));
out(
  "ci.yml push: superseded and cancelled",
  count((r) => r.push && !fullPush(r)),
);
out(
  "ci.yml push conclusion",
  tally((r) => r.push?.conclusion ?? "no run"),
);
out(
  "configured-suite push",
  tally((r) => r.configured?.conclusion ?? "no run"),
);
out(
  "quarantine push",
  tally((r) => r.quarantine?.conclusion ?? "no run"),
);
out(
  "whole-catalog gate ran on the exact commit (group or push)",
  count((r) => r.group?.catalog === "success" || r.push?.catalog === "success"),
);
out(
  "catalog gate group x push",
  tally(
    (r) => `group ${r.group?.catalog} / push ${r.push?.catalog ?? "no run"}`,
  ),
);
const exactAll = (r) =>
  greenFullPush(r) && r.configured?.conclusion === "success";
out(
  "exact commit had green full E2E push AND green configured suite",
  count(exactAll),
);

console.log(
  "\n(a) time to a complete green full-E2E verdict, from landing (minutes)",
);
const own = R.filter(greenFullPush).map((r) =>
  mins(r.landed, r.push.updated_at),
);
const range = [];
for (let i = 0; i < n; i += 1) {
  const j = R.slice(i).find(greenFullPush);
  if (j) range.push(mins(R[i].landed, j.push.updated_at));
}
out("exact (own push run)", stats(own));
out("range (first later green full push run)", stats(range));
out(
  "nightly runs",
  d.nightly.map((x) => `${x.created_at} ${x.conclusion}`),
);

console.log(
  "\n(b) runner-minutes, every attempt, copied re-run jobs counted once",
);
const full = R.filter(fullPush);
out("full push run", stats(full.map((r) => r.push.minutes)));
out(
  "full push run wall (created to updated)",
  stats(full.map((r) => mins(r.push.created_at, r.push.updated_at))),
);
out(
  "full push run less its catalog gate",
  stats(full.map((r) => r.push.minutes - r.push.catalog_minutes)),
);
out(
  "cancelled push runs, total",
  stats(R.filter((r) => r.push && !fullPush(r)).map((r) => r.push.minutes)),
);
out(
  "configured-suite push run",
  stats(R.filter((r) => r.configured).map((r) => r.configured.minutes)),
);
out(
  "merge group run",
  stats(R.filter((r) => r.group).map((r) => r.group.minutes)),
);
out(
  "catalog gate job, merge group",
  stats(
    R.filter((r) => r.group?.catalog === "success").map(
      (r) => r.group.catalog_minutes,
    ),
  ),
);
out(
  "catalog gate job, push",
  stats(
    R.filter((r) => r.push?.catalog === "success").map(
      (r) => r.push.catalog_minutes,
    ),
  ),
);
const nj = (name) =>
  d.nightly.flatMap((x) =>
    x.jobs
      .filter((j) => j.name === name && j.minutes != null)
      .map((j) => j.minutes),
  );
out("nightly catalog tripwire job", stats(nj("Catalog calibration tripwire")));
out(
  "nightly type floor / engine floor job",
  stats(nj("Type floor, overflow sweep and field coverage")),
);
out("nightly run total", stats(d.nightly.map((x) => x.minutes)));
out(
  "catalog-gates (midday) run total",
  stats(d.catalog_gates.map((x) => x.minutes)),
);

// Cost of validating every exact landed commit in full, over the window, against what ran.
const pushE2E = stats(
  full.map((r) => r.push.minutes - r.push.catalog_minutes),
).mean;
const conf = stats(
  R.filter((r) => r.configured).map((r) => r.configured.minutes),
).mean;
const cat = stats([
  ...R.filter((r) => r.group?.catalog === "success").map(
    (r) => r.group.catalog_minutes,
  ),
  ...R.filter((r) => r.push?.catalog === "success").map(
    (r) => r.push.catalog_minutes,
  ),
]).mean;
const floor = stats(nj("Type floor, overflow sweep and field coverage")).mean;
const missingE2E = n - count(fullPush);
const missingConf = count((r) => !r.configured);
const missingCat = n - count((r) => r.push?.catalog === "success");
const add = {
  e2e: missingE2E * pushE2E,
  configured: missingConf * conf,
  catalog: missingCat * cat,
  floor: n * floor,
};
const addTotal = Object.values(add).reduce((a, b) => a + b, 0);
console.log(
  "\n(b) added runner-minutes to validate every exact commit in full (window)",
);
out(
  "unit costs (mean): full E2E push less catalog, configured, catalog gate, type/engine floor",
  [pushE2E, conf, cat, floor].map((x) => +x.toFixed(1)),
);
out(
  "missing on the exact commit: full E2E, configured, whole-catalog post-merge",
  [missingE2E, missingConf, missingCat],
);
out(
  "added minutes by part",
  Object.fromEntries(Object.entries(add).map(([k, v]) => [k, Math.round(v)])),
);
out("added minutes total / per landing / per day", [
  Math.round(addTotal),
  +(addTotal / n).toFixed(1),
  Math.round(addTotal / days),
]);
const catOnly = add.catalog + add.floor;
out(
  "catalog-only carrier (whole catalog + floor per exact commit) total / per landing",
  [Math.round(catOnly), +(catOnly / n).toFixed(1)],
);
const preCat = stats(
  R.filter((r) => r.group?.catalog === "success").map(
    (r) => r.group.catalog_minutes,
  ),
).sum;
out(
  "merge-group catalog gate minutes (narrowing could shrink these) total / per landing",
  [preCat, +(preCat / n).toFixed(1)],
);
const perExact = pushE2E + conf + cat + floor;
out(
  "one complete exact validation (E2E full + configured + catalog + floor), runner-minutes",
  +perExact.toFixed(1),
);
