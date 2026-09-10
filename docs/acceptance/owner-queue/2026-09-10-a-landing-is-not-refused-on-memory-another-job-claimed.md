---
kind: agent
date: 2026-09-10
---
# A landing is no longer refused on memory another job in the same pass claimed

The queue takes ONE free-memory reading per scheduling pass and, since 2026-09-09, subtracts each
job it admits from it - so four browser walks can no longer all start on the same 2.1 GB. Right for
walks, wrong for landings: the subtraction ran for every kind, so a landing queued behind two walks
was refused on a box with 4.3 GB free. A landing is `gh run watch` waiting on GitHub's network, it
costs 0.15 of a suite precisely so that it always gets through, and the budget already exempts it
for that reason. Now the free-memory pass does too. It is tested against the real reading and takes
nothing out of the running figure.

The refusal text was lying about which number it meant, as well. It printed the pass's remainder as
though it were the machine's free memory, so a reader was told `only 0.1 GB RAM free` on a box with
2.1 GB free and went looking for memory that was never missing.

## The route, under a minute

Nothing here queues a real job - it asks the scheduler directly, with the clock and the memory
reading handed to it, so there is nothing to clean up afterwards.

```
node -e "import('./scripts/jobs-store.mjs').then(({schedule})=>{const j=(id,o={})=>({id,kind:'gate',command:'node scripts/some-walk.mjs',checkout:'/wt/'+id,state:'waiting',after:[],enqueuedAt:1,pid:null,...o});const r=schedule([j('j-1'),j('j-2'),j('j-3',{kind:'merge',command:'node scripts/land-watch.mjs --pr 1 --branch b'})],{hour:3,freeMemMb:4300});console.log('started:',r.start.map(x=>x.id));r.waiting.forEach(w=>console.log('waiting:',w.reason));})"
```

**What to look at.** It prints `started: [ 'j-1', 'j-2', 'j-3' ]` and nothing waiting. Before this
change the landing `j-3` was held back with `only 0.2 GB RAM free, needs 0.6`, on a machine with
4.3 GB free. Change `freeMemMb: 4300` to `300` and the landing waits again, saying
`only 0.3 GB RAM free, needs 0.6` - the physical floor is untouched, and it now quotes the real
reading. Change it to `2150` and drop the landing, and the second walk waits with
`only 0.1 GB of 2.1 GB free RAM unclaimed this pass, needs 2.0`, which names both figures instead
of one that sounds like the machine.

Two typing mistakes the same command used to swallow are also refused now. On a throwaway store
(`$env:NOACG_JOBS_DIR = "$env:TEMP\qdir"`, or `export NOACG_JOBS_DIR=/tmp/qdir`):
`node scripts/jobs.mjs add "node -e 0" --cost=0.5` writes `"cost": 0.5` onto the record, where the
equals spelling used to match nothing and queue the job at the queue's own guess while printing
`queued`; and `--kind bogus` answers `--kind is one of gate, merge, sweep: got "bogus".` instead of
a stack trace with a Node version banner under it. Delete the directory when you are done.

Measured 2026-09-10 on branch `claude/ay-per-job-cost`, found by the pre-merge review of that
branch rather than in the wild.
