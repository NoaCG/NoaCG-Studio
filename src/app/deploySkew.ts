// A PAGE THAT WAS OPEN WHEN A DEPLOY WENT OUT (issue #758).
//
// Every build names its code files by content hash, and the host serves only the newest deploy's
// files. A page loaded before a deploy still asks for the OLD names when it loads more code (the
// template browser, the fonts index, the editor's language files), and those now answer 404 for
// good: a retry in the same document cannot fetch them, only the page again can. Vite reports each
// such failure as a `vite:preloadError` event; the caller's own error handling still runs (this
// listener never swallows the failure), and this module reloads the page, at a safe moment:
//
//   Only with nothing on air          a production or control page holding a graphic on air, or
//                                     with a press still on its way, waits. It asks again every
//                                     RETRY_MS and reloads once air is clear; the reloaded page
//                                     restores its surface from the hash route and its air from
//                                     the server, so nothing that was on air is lost.
//   Only once its own URL answers     a reload during an outage would leave the browser's error
//                                     page where the studio was. An answer slower than PROBE_MS
//                                     counts as none, as on the output (../output/reload.ts, which
//                                     this layer may not import).
//   Only once saved work is on disk   pending autosaves are flushed first, and a save that failed
//                                     refuses the reload: the work is still open here, and a
//                                     later failure asks afresh. Work that lives only in memory
//                                     (a wizard draft) registers a hold like air does.
//   Never twice into the same build   a reload that came back on the SAME build and fails again
//                                     within LOOP_MS is not a deploy but a network that blocks the
//                                     file: the page stays, with the caller's own error, instead of
//                                     reloading forever. A reload that came back on a NEW build may
//                                     reload again for the deploy after it.
//
// The output page reloads by its own rules (../output/main.ts, issue #757), so it does not use this.
// Pure apart from the doors: scripts/deploy-skew.test.mjs runs it in Node.

/** How often a held reload asks again whether air is clear. */
export const RETRY_MS = 5_000;
/** A second stale-file reload from the same build within this long of the first is refused. */
export const LOOP_MS = 120_000;
/** How long the page waits for its own URL before it counts as not answering. */
export const PROBE_MS = 10_000;

export interface SkewDoors {
  /** Whether anything on this page holds a reload now: a graphic on air, a press in flight. */
  held: () => boolean;
  /** Whether this page's own URL answers within PROBE_MS; a throw counts as no. */
  probe: () => Promise<boolean>;
  /** Put saved work on disk; false when a save failed. */
  settle: () => Promise<boolean>;
  reload: () => void;
  now: () => number;
  /** The build this page was loaded from. */
  build: string;
  /** When this tab last reloaded for a stale file, and from which build, if it remembers. */
  lastReload: () => { at: number; build: string } | null;
  markReload: (mark: { at: number; build: string }) => void;
  wait: (ms: number) => Promise<void>;
}

export type SkewOutcome = 'reloaded' | 'looped' | 'unsaved';

/** What to do when the page cannot load a code file. One recovery at a time: a second failure
 *  while one waits joins it; a failure after a refused one asks afresh. */
export function createSkewRecovery(doors: SkewDoors): () => Promise<SkewOutcome> {
  let running: Promise<SkewOutcome> | null = null;
  const recover = async (): Promise<SkewOutcome> => {
    const last = doors.lastReload();
    if (last && last.build === doors.build && doors.now() - last.at < LOOP_MS) return 'looped';
    for (;;) {
      if (!doors.held() && (await doors.probe().catch(() => false))) {
        if (!(await doors.settle())) return 'unsaved';
        // Read AGAIN after the round trips: a Take may have landed while they were out.
        if (!doors.held()) {
          doors.markReload({ at: doors.now(), build: doors.build });
          doors.reload();
          return 'reloaded';
        }
      }
      await doors.wait(RETRY_MS);
    }
  };
  return () =>
    (running ??= recover().finally(() => {
      running = null;
    }));
}

// What holds a reload on this page. A production or control page registers while it is mounted.
const holds = new Set<() => boolean>();

/** Register `isHeld` as a reason not to reload; returns the unregister. */
export function holdReload(isHeld: () => boolean): () => void {
  holds.add(isHeld);
  return () => {
    holds.delete(isHeld);
  };
}

export function reloadHeld(): boolean {
  for (const isHeld of holds) if (isHeld()) return true;
  return false;
}

const STAMP_KEY = 'spx-gfx-stale-build-reload';

/** Listen for code files this page can no longer load, in the browser. `build` names the deploy
 *  the page was loaded from; `settle` puts saved work on disk and says whether it landed. */
export function installDeploySkewRecovery(build: string, settle: () => Promise<boolean>): void {
  const recover = createSkewRecovery({
    held: reloadHeld,
    probe: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_MS);
      try {
        return (await fetch(window.location.href, { cache: 'no-store', signal: controller.signal })).ok;
      } finally {
        clearTimeout(timer);
      }
    },
    settle: () => settle().catch(() => false),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    build,
    lastReload: () => {
      try {
        const [at, ...rest] = (window.sessionStorage.getItem(STAMP_KEY) ?? '').split(' ');
        return Number(at) > 0 ? { at: Number(at), build: rest.join(' ') } : null;
      } catch {
        return null;
      }
    },
    markReload: (mark) => {
      try {
        window.sessionStorage.setItem(STAMP_KEY, `${mark.at} ${mark.build}`);
      } catch {
        // No session storage: the loop guard is lost, the reload is not.
      }
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  window.addEventListener('vite:preloadError', () => {
    void recover();
  });
}
