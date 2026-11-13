// A NEW OUTPUT CHECKS THE PUBLISHED VERSION ITSELF (live-publishing designs/G3.md section 6).
//
// No page needed: on boot, when its log or command channel joins again, when the browser is back
// online, on a page's prepare request and every 30 s, the output reads the published stamp (two
// small columns, `control_output_version`) and asks its preparer for a version other than the one
// it holds or is taking. A probe that is not answered is asked again after 2, 4 and 8 s, then at the
// next period. An instance without the function stops the checks for this page load: the output then
// does as before (prepare requests only).
//
// Pure: timers, the probe and the preparer come in through `io` (scripts/output-version-check.test.mjs).
// Old CEF: CasparCG 2.3 runs this in Chromium 71 (ES2017).
import { sameVersion } from '../control/payloadVersion';

export interface VersionStamp {
  n: number;
  h: string;
}

export interface VersionCheckIo {
  setTimer(ms: number, run: () => void): () => void;
  /** The published stamp, `absent` (no such function), or null (not answered). */
  probe(): Promise<{ ver: VersionStamp | null } | 'absent' | null>;
  /** The version the output holds or is taking now. */
  current(): VersionStamp | null;
  /** Prepare this version. */
  request(ver: VersionStamp): void;
}

export const CHECK_EVERY_MS = 30_000;
export const PROBE_RETRY_MS = [2_000, 4_000, 8_000];

export interface VersionCheck {
  /** Check now (rejoin, online, a prepare request). */
  poke(): void;
  stop(): void;
}

export function createVersionCheck(io: VersionCheckIo): VersionCheck {
  let stopped = false;
  let running = false;
  let again = false;
  let periodic: (() => void) | null = null;
  let retry: (() => void) | null = null;

  const arm = () => {
    if (periodic) periodic();
    periodic = io.setTimer(CHECK_EVERY_MS, () => {
      periodic = null;
      check(0);
    });
  };

  const check = (failures: number) => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    if (retry) {
      retry();
      retry = null;
    }
    io.probe().then(
      (answer) => settle(answer, failures),
      () => settle(null, failures),
    );
  };

  const settle = (answer: { ver: VersionStamp | null } | 'absent' | null, failures: number) => {
    running = false;
    if (stopped) return;
    if (answer === 'absent') {
      stopped = true;
      if (periodic) periodic();
      return;
    }
    if (answer === null) {
      if (failures < PROBE_RETRY_MS.length) {
        retry = io.setTimer(PROBE_RETRY_MS[failures], () => {
          retry = null;
          check(failures + 1);
        });
      }
      arm();
    } else {
      const ver = answer.ver;
      const held = io.current();
      if (ver && !sameVersion(held, ver)) io.request(ver);
      arm();
    }
    if (again) {
      again = false;
      check(0);
    }
  };

  check(0);
  return {
    poke: () => check(0),
    stop() {
      stopped = true;
      if (periodic) periodic();
      if (retry) retry();
    },
  };
}
