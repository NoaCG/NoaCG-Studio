import {readFileSync, existsSync} from 'node:fs';
const label = process.argv[2];
const r = JSON.parse(readFileSync(`/tmp/${label}.json`));
const out = {label, code: r.code, signal: r.signal, timedOut: r.timedOut, wall: +r.wallSeconds.toFixed(1),
  rssGiB: +(r.aggregatePeakRssBytes/2**30).toFixed(2), pssGiB: +(r.aggregatePeakPssBytes/2**30).toFixed(2),
  cgroupPeakGiB: +((r.cgroupSampledPeakBytes||0)/2**30).toFixed(2), monCpu: +(r.monitorCpuSeconds||0).toFixed(2), procs: r.peakProcesses};
const tf = `/tmp/${label}-tests.json`;
if (existsSync(tf)) {
  const t = JSON.parse(readFileSync(tf));
  const c = {planned:0, passed:0, failed:0, skipped:0, unrun:0, flaky:0, timedOut:0, interrupted:0, retries:0};
  const fails = [];
  const walk = s => { for (const sp of s.specs||[]) for (const tt of sp.tests||[]) {
    c.planned++;
    const res = tt.results||[];
    c.retries += Math.max(0, res.length-1);
    if (tt.status==='flaky') c.flaky++;
    if (!res.length) { c.unrun++; continue; }
    const last = res[res.length-1].status;
    if (last==='passed') c.passed++; else if (last==='skipped') c.skipped++;
    else if (last==='timedOut') {c.timedOut++; fails.push(`${sp.file} > ${sp.title} [timedOut]`);} else if (last==='interrupted') c.interrupted++;
    else {c.failed++; fails.push(`${sp.file} > ${sp.title}`);}
  } for (const x of s.suites||[]) walk(x); };
  for (const s of t.suites) walk(s);
  out.tests = c; out.stats = t.stats; out.errors = (t.errors||[]).map(e => (e.message||'').split('\n')[0]); out.failures = fails;
}
console.log(JSON.stringify(out));
