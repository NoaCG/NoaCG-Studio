// HOW MANY PLAYWRIGHT WORKERS THIS MACHINE CAN AFFORD RIGHT NOW.
//
// WHY THIS IS NOT A CONSTANT. The limit on a developer laptop is MEMORY, not cores, and the
// amount of memory available is not a property of the machine - it is a property of the moment.
// Measured on the reference box (Ryzen 7 5800H, 8C/16T, 16 GB), one fixed 119-test set, traces
// off - wall time, then the lowest free memory reached during the run:
//
//     from ~4.5 GB free              from ~5.6 GB free
//     3 workers   159.7 s   2472 MB
//     4 workers   151.8 s    651 MB  4 workers   137.7 s   1488 MB
//     6 workers   157.1 s    401 MB  6 workers   125.7 s   1669 MB
//                                    8 workers   145.7 s    293 MB
//
// Read the two columns together, because either alone gives the wrong rule. From 4.5 GB, six
// workers is SLOWER than four - which looked like "four is the ceiling". From 5.6 GB, six is the
// FASTEST of the three and leaves more headroom than four did in the other column. Six did not
// change; the memory available to it did. Eight is slower in both worlds and takes the box down
// to 293 MB, which is the state where everything else on the machine starts paging.
//
// So the rule is not a maximum worker count. It is: SPEND UP TO THE MEMORY CEILING AND STOP.
// A fixed number cannot express that - it is wrong in both directions as conditions move. Open
// Premiere with a project and three is too many; close everything and three leaves the box idle.
// Hence a count derived from free memory at the moment the config loads.
//
// THE RESERVE IS THE POINT, and it is deliberately modest. The brief here was explicit: the
// tests are the priority for this machine, and the headroom only has to be enough to keep email
// and a browser responsive - not to keep a second heavy application comfortable. So the ladder
// spends aggressively and holds back at least a gigabyte. If that is only enough for one worker,
// one worker is the honest answer: a slow suite is an annoyance, a machine that stops responding
// costs the whole session.

import { freemem } from 'node:os';

/**
 * A STEP TABLE, not a formula, because the cost of a worker is not linear and pretending it is
 * produces confident nonsense. From 4535 MB free, 3 workers consumed about 2.0 GB of it while
 * 4 consumed 3.9 GB - the fourth worker cost nearly twice the third, because that is the point
 * where Windows starts reclaiming from other processes to fund the run. Fitting a straight line
 * through those two points yields a negative base cost, which is the arithmetic saying the model
 * is wrong. So each row is anchored on a measurement or a conservative step below one.
 *
 * `minFreeMb` is the free memory at which that many workers still leaves the machine usable.
 * First row that fits wins; anything below the last row gets a single worker.
 */
const LADDER = [
  // 6 workers consumed ~4.1 GB at peak (5794 free -> 1669 free) and was the fastest run measured
  // on this machine. 5300 is that consumption plus the reserve.
  { minFreeMb: 5300, workers: 6 },
  // 4 consumed ~3.1 GB from 4549 free, leaving 1488. On a busier box the same count reached
  // 3.9 GB, which is why this sits above 4.1 rather than at it.
  { minFreeMb: 4200, workers: 4 },
  // The two rungs the job queue's away floor lands on, measured 2026-10-10 with the owner away
  // and other agent sessions live: one 20-test spec through the queue, free memory and the job's
  // process tree sampled every 2 s.
  //
  //     workers   free before -> lowest   took     tree peak   duration
  //     3         3342 -> 986 MB          2356 MB  3.3 GB      44 s
  //     2         2622 -> 508 MB          2114 MB  2.7 GB      57 s
  //     1         3401 -> 1585 MB         1816 MB  2.0 GB      68 s
  //
  // and 2026-10-09 (#854): 3 workers, 4.1 -> 1.3 GB, 2.8 GB taken. The dev server and the runner
  // are most of it; a worker adds 0.3-0.5 GB. A browser job is admitted at 3.5 GB free while away
  // (`POLICY.freeMemFloorMb.away`), where these rungs used to pick 3 and leave 0.7-1.1 GB. Each
  // rung is now its worst measured take plus a gigabyte, so the floor gets two workers and about
  // 1.4 GB stays free; the spec ran 13 s slower for it.
  { minFreeMb: 3900, workers: 3 },
  { minFreeMb: 3200, workers: 2 },
];

/**
 * Below this the run still happens, but it stops competing for what is left. Named separately
 * from the ladder because it is the promise this module makes: the machine stays usable.
 */
const FLOOR_FREE_MB = 1800;

/**
 * Never more than the ladder's top. Eight workers was measured SLOWER than six from the same
 * starting memory (145.7 s against 125.7 s) while driving free memory to 293 MB, so this is a
 * measured ceiling rather than a cautious guess - going higher costs time AND the machine. On a
 * box with substantially more RAM the honest move is to measure again, not to assume; E2E_WORKERS
 * pins any number in the meantime.
 */
const MAX_WORKERS = LADDER[0].workers;

/**
 * Workers to use for a LOCAL run.
 *
 * @param {object} [opts]
 * @param {number} [opts.freeMb]  free memory to decide from; defaults to the real reading
 * @param {string} [opts.override] an explicit E2E_WORKERS value, which always wins
 * @returns {{ workers: number, reason: string }} the count and a one-line explanation to print
 */
export function chooseWorkers({ freeMb = Math.round(freemem() / (1024 * 1024)), override } = {}) {
  const pinned = Number(override);
  if (Number.isInteger(pinned) && pinned > 0) {
    return { workers: pinned, reason: `E2E_WORKERS=${pinned} (pinned)` };
  }

  const step = LADDER.find((row) => freeMb >= row.minFreeMb);
  if (step) {
    const note = step.workers === MAX_WORKERS ? ` (the measured maximum)` : '';
    return { workers: step.workers, reason: `${freeMb} MB free${note}` };
  }
  return {
    workers: 1,
    reason:
      freeMb >= FLOOR_FREE_MB
        ? `${freeMb} MB free - only enough for one worker`
        : `${freeMb} MB free - the machine is nearly full; expect a slow run`,
  };
}

/**
 * The value a Playwright config should use, printing the choice once so a run's duration is
 * always explainable after the fact. A variable worker count that says nothing would turn every
 * "why was that slower?" into a guess.
 *
 * Playwright re-imports the config inside EVERY worker process, so a bare log here prints once
 * per worker plus once for the runner - and each worker reads a different (lower) free-memory
 * figure, because by then the earlier workers are already running. Only the runner's line means
 * anything; the workers' copies are recomputed and discarded. `TEST_WORKER_INDEX` is set only in
 * a worker, which is how we tell them apart.
 */
export function localWorkers() {
  const { workers, reason } = chooseWorkers({ override: process.env.E2E_WORKERS });
  if (process.env.TEST_WORKER_INDEX === undefined) {
    console.log(`[e2e] ${workers} worker${workers === 1 ? '' : 's'} - ${reason}`);
  }
  return workers;
}
