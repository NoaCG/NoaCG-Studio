/**
 * WHEN A DROPPED REALTIME SOCKET TRIES AGAIN: supabase-js's own steps, spread.
 *
 * realtime-js retries 1, 2, 5 and 10 s after a drop and every 10 s after that, with no jitter
 * (`RECONNECT_INTERVALS` in RealtimeClient.js). So every page that lost its socket to the same
 * event - a Realtime node restarting under every output of every production - retries at the same
 * instants: measured, ten outputs within about 120 ms of each other on every round
 * (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.7). Each rejoin of a private channel is a Postgres query,
 * so at scale that is a synchronized burst against the database at the moment it is least welcome.
 *
 * Each step is scaled by a random factor in [0.5, 1.5), so the average wait is unchanged and the
 * herd spreads over a whole step. The steps themselves stay the library's.
 */
const STEPS_MS = [1_000, 2_000, 5_000, 10_000];

export function realtimeReconnectAfterMs(tries: number, random: () => number = Math.random): number {
  const step = STEPS_MS[tries - 1] ?? STEPS_MS[STEPS_MS.length - 1];
  return Math.floor(step * (0.5 + random()));
}
