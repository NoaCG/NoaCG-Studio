// KEEPING PHONES ON THE PRODUCTION'S PAGE (interaction spec phase 2; phase notes, rules P1 to P5).
//
// What phones show around the question (the look, logo, title and waiting text) is the join
// state's `brand`. Publish writes it; between publishes, Interaction keeps it in step:
//
//   P1. It READS what phones get and sends the production's page only when that differs, so
//       opening Interaction repairs a change that never reached phones and otherwise sends nothing.
//   P2. A change is sent a moment after it is made (`delayMs`), even if the operator has left the
//       tab: the wait and the send live here, not in the component.
//   P3. Syncs for one production run one at a time, and a sync that a newer one superseded stops
//       before it sends, so phones end on the latest saved page.
//   P4. A logo already published under its file's hash is not uploaded again. A logo that cannot
//       be published now keeps the one phones have, and the rest of the page (the words, the
//       colours) still goes; the failure is reported.
//   P5. Publish writes the page through this same queue, so it reads the production as saved when
//       its turn runs and never overtakes, or is overtaken by, Interaction's sync in this tab.
//
// Every effect goes through `io`, so scripts/join-page-sync.test.mjs drives it with fakes.

import { joinPageBrand, type AudienceBrand } from '../audience/audienceBrand';
import type { ProjectBrand } from '../model/brand';

export interface JoinPageShow {
  id: string;
  look?: ProjectBrand;
  joinPage?: { title?: string; waiting?: string };
}

export interface JoinPageSyncIo {
  /** The production as saved now (read when the sync runs, not when it was asked for). */
  readShow(): JoinPageShow | null;
  /** What phones get now. */
  readBrand(): Promise<AudienceBrand | null | undefined>;
  /** The look's logo as a public URL, given the one phones have (P4); throws when it cannot be published. */
  publishLogo(show: JoinPageShow, known: string | null): Promise<string | null>;
  send(brand: AudienceBrand): Promise<void>;
  /** A sync failed (the latest one only). */
  onError?(error: unknown): void;
  /** A sync sent the page. */
  onSent?(): void;
}

/** The fields phones read, in one order, absent as null. */
const FIELDS = ['accent', 'text', 'panel', 'font', 'logo', 'title', 'waiting'] as const;
export function sameBrand(a: AudienceBrand | null | undefined, b: AudienceBrand | null | undefined): boolean {
  return FIELDS.every((k) => ((a?.[k] as unknown) ?? null) === ((b?.[k] as unknown) ?? null));
}

interface Run {
  gen: number;
  timer?: ReturnType<typeof setTimeout>;
  chain: Promise<void>;
  /** Callers waiting for the queue to catch up with what they asked for. */
  waiting: Array<() => void>;
}
const runs = new Map<string, Run>();

/** Release the waiters once the latest ask has run (a superseded ask waits for the one after it). */
function caughtUp(run: Run, gen: number): void {
  if (gen !== run.gen || run.timer !== undefined) return;
  for (const done of run.waiting.splice(0)) done();
}

/**
 * Ask for a sync of this production's page in `delayMs`; a later ask replaces an earlier one. The
 * promise settles once the queue has run the latest ask (publish awaits it; Interaction does not).
 */
export function syncJoinPage(showId: string, io: JoinPageSyncIo, delayMs: number): Promise<void> {
  const run = runs.get(showId) ?? { gen: 0, chain: Promise.resolve(), waiting: [] };
  runs.set(showId, run);
  const gen = ++run.gen;
  if (run.timer !== undefined) clearTimeout(run.timer);
  const current = () => gen === run.gen;
  const settled = new Promise<void>((resolve) => run.waiting.push(resolve));
  run.timer = setTimeout(() => {
    run.timer = undefined;
    run.chain = run.chain.then(async () => {
      if (!current()) return;
      try {
        const show = io.readShow();
        if (!show) return;
        const now = await io.readBrand();
        if (!current()) return;
        const known = typeof now?.logo === 'string' ? now.logo : null;
        let logo = known;
        let logoFailed: unknown = null;
        try {
          logo = await io.publishLogo(show, known);
        } catch (error) {
          logoFailed = error;
        }
        if (!current()) return;
        // Not knowing what phones have AND not being able to publish the logo: sending now could
        // clear a logo phones have, so nothing goes and the failure is reported (P4).
        if (logoFailed && !now) {
          io.onError?.(logoFailed);
          return;
        }
        const brand = joinPageBrand(show, logo);
        if (sameBrand(brand, now)) {
          if (logoFailed) io.onError?.(logoFailed);
          return;
        }
        await io.send(brand);
        io.onSent?.();
        if (logoFailed) io.onError?.(logoFailed);
      } catch (error) {
        if (current()) io.onError?.(error);
      }
    }).finally(() => caughtUp(run, gen));
  }, delayMs);
  return settled;
}

/** Wait for every sync asked for so far to finish (tests). */
export async function joinPageSyncSettled(showId: string): Promise<void> {
  for (;;) {
    const run = runs.get(showId);
    if (!run) return;
    if (run.timer !== undefined) {
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }
    const chain = run.chain;
    await chain;
    if (run.chain === chain && run.timer === undefined) return;
  }
}
