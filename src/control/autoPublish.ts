// AUTOMATIC UPDATES: EACH SAVE IS PUBLISHED (docs/work-specs/live-publishing/designs/G3.md section 3).
//
// After a production's first Publish, every saved revision of it reaches the outputs with no press
// (O1). This module decides when a page publishes and what the page says meanwhile; the browser
// (the save layer, the server's small reads, the publish itself, timers and the clock) comes in
// through `io`, so it runs in Node (scripts/auto-publish.test.mjs).
//
//   Single flight, newest wins   at most one publish in flight; a save confirmed meanwhile makes the
//                                publisher owe another, built from the newest record (S3).
//   Its own saves                a publish starts when this page's save is confirmed.
//   Anyone's saves (E4)          the page reads the record's revision and the published one when it
//                                opens (and publishes at once if behind), every 30 s, and after each
//                                publish; a revision another page saved is published here 20 s after
//                                this page first saw it, so the saver goes first.
//   Failures                     transient ones retry after 2, 4, 8, then every 15 s; a refusal waits
//                                for a newer save (or, for an account the row refuses, a new account).
//   Words                        amber while a revision waits under 20 s or a publish runs; red
//                                "Saved, not on the outputs" after two transient failures, a refusal,
//                                or a revision waiting 20 s.
//
// A publish never writes the production record, so publishing never causes a save.

import type { ConfirmedRevision } from '../backend/savedRevision';
import type { PayloadVersion } from './payloadVersion';
import type { LiveEntry } from './livePath';
import type { ExpectedOutput } from './readiness';

/** What a publish attempt came to. */
export type PublishOutcome =
  | { kind: 'published'; rev: number; ver?: PayloadVersion }
  /** A revision at least as new is already published: nothing to do. */
  | { kind: 'superseded' }
  /** No answer, a server error, a lost connection: tried again later. */
  | { kind: 'transient'; reason: string }
  /** A fact about the production or the account: tried again only on a newer save (or account). */
  | { kind: 'refused'; refusal: 'gate' | 'denied' | 'guard'; reason: string }
  /** The production is no longer published: the publisher stops. */
  | { kind: 'gone' };

/** Whether this tab's record is a stored revision (backend/savedRevision.ts). */
export type Confirmed = ConfirmedRevision;

export interface StoredRevisions {
  /** The record's current saved revision. */
  rev: number;
  /** The revision the publication shows, or null: none known. */
  published: number | null;
}

export interface AutoPublishIo {
  now(): number;
  setTimer(ms: number, run: () => void): () => void;
  confirmed(): Promise<Confirmed>;
  stored(): Promise<StoredRevisions | null>;
  /** Bring this tab's record up to the server's newest save. */
  catchUp(): Promise<void>;
  publish(rev: number): Promise<PublishOutcome>;
  /** The view changed. */
  changed(view: AutoPublishView): void;
}

export type AutoPublishTone = 'idle' | 'amber' | 'red';

export interface AutoPublishView {
  tone: AutoPublishTone;
  /** The panel line. */
  line: string | null;
  /** A publish is running. */
  running: boolean;
  /** The newest revision known published by this page or read from the server. */
  published: number | null;
}

/** How long another page's save waits for its own page to publish it. */
export const OTHERS_GRACE_MS = 20_000;
/** A revision waiting this long reads red. */
export const RED_AFTER_MS = 20_000;
/** How often an open page reads the two revisions. */
export const CHECK_EVERY_MS = 30_000;
/** Transient retries: 2, 4, 8, then every 15 s. */
export const RETRY_MS = [2_000, 4_000, 8_000, 15_000] as const;

export const PUBLISHING_LINE = 'Publishing your changes';
export const RED_HEADER = 'Saved, not on the outputs';

/** "Not allowed": the row policy refused this account, by an error or by a write that matched no
 *  row although the stored stamp is the one it named (row-level security filters an update with
 *  no error). */
export const DENIED: PublishOutcome = { kind: 'refused', refusal: 'denied', reason: 'This account cannot publish this production. Open it on a device that can.' };

/** A server answer, in the publisher's classes (G3 section 3). A 401 that outlived one session
 *  refresh is the session, not the account: transient, so the next attempt runs with whatever
 *  session the page holds by then. */
export function classifyFailure(e: unknown): PublishOutcome {
  const err = e as { message?: string; code?: string; status?: number };
  const message = String(err?.message ?? e);
  if (message === 'This publication names a save that does not exist') return { kind: 'refused', refusal: 'guard', reason: 'This save could not be published. The next save tries again.' };
  if (err?.code === '42501' || err?.status === 403 || /row-level security|permission denied/i.test(message)) return DENIED;
  return { kind: 'transient', reason: 'the server did not answer' };
}

export interface AutoPublisher {
  /** This page's save of the production was confirmed. */
  saved(): void;
  /** Ask the server now (on open, after a reconnect). `opened`: the page has just opened, so a
   *  revision behind is published at once. */
  check(opened?: boolean): void;
  view(): AutoPublishView;
  stop(): void;
}

export function retryDelay(failures: number): number {
  return RETRY_MS[Math.min(Math.max(failures, 1), RETRY_MS.length) - 1];
}

export function createAutoPublisher(io: AutoPublishIo): AutoPublisher {
  let stopped = false;
  let running = false;
  let owed = false;
  /** When the oldest revision not yet published was first seen here, and whether it was this
   *  page's own save (no grace). */
  let pendingSince: number | null = null;
  let pendingOwn = false;
  /** This page's own save was just confirmed: a revision behind is its own (no grace). */
  let ownHint = false;
  /** The newest record revision seen, and the newest known published. */
  let newest: number | null = null;
  let published: number | null = null;
  let transientFailures = 0;
  let lastReason: string | null = null;
  /** A refusal holds until a revision newer than this one (or a new account, for `denied`). */
  let refusedAt: { rev: number | null; refusal: 'gate' | 'denied' | 'guard'; reason: string } | null = null;
  let retryCancel: (() => void) | null = null;
  let graceCancel: (() => void) | null = null;
  let current: AutoPublishView = { tone: 'idle', line: null, running: false, published: null };

  const pending = () => pendingSince !== null;
  const view = (): AutoPublishView => {
    let tone: AutoPublishTone = 'idle';
    let line: string | null = null;
    if (pending()) {
      const waited = pendingSince === null ? 0 : io.now() - pendingSince;
      const red = refusedAt !== null || transientFailures >= 2 || waited >= RED_AFTER_MS;
      tone = red ? 'red' : 'amber';
      line = refusedAt
        ? refusedAt.reason
        : red
          ? `The newest save is not on the outputs yet: ${lastReason ?? 'it has not been published'}.`
          : PUBLISHING_LINE;
    }
    return { tone, line, running, published };
  };
  const emit = () => {
    const next = view();
    if (next.tone === current.tone && next.line === current.line && next.running === current.running && next.published === current.published) return;
    current = next;
    io.changed(next);
  };

  const markPending = (own: boolean) => {
    if (pendingSince === null) {
      pendingSince = io.now();
      pendingOwn = own;
      // Red after RED_AFTER_MS whatever else happens: the light must not wait for a poll.
      io.setTimer(RED_AFTER_MS, emit);
    } else if (own) pendingOwn = true;
  };
  const markPublished = (rev: number) => {
    published = published === null ? rev : Math.max(published, rev);
    if (newest === null || published >= newest) {
      pendingSince = null;
      pendingOwn = false;
      transientFailures = 0;
      lastReason = null;
      refusedAt = null;
    }
  };

  const schedule = (ms: number) => {
    if (retryCancel) retryCancel();
    retryCancel = io.setTimer(ms, () => {
      retryCancel = null;
      run();
    });
  };

  const run = () => {
    if (stopped) return;
    if (running) {
      owed = true;
      return;
    }
    running = true;
    owed = false;
    emit();
    void attempt().finally(() => {
      running = false;
      emit();
      if (owed && !stopped) run();
    });
  };

  const attempt = async (): Promise<void> => {
    let confirmed = await io.confirmed();
    if (confirmed && 'wait' in confirmed && confirmed.wait === 'server') {
      await io.catchUp();
      confirmed = await io.confirmed();
    }
    if (!confirmed || 'wait' in confirmed) {
      // A save of this page is on its way (it calls `saved` when confirmed), or the revision cannot
      // be known now: the next check asks again.
      return;
    }
    const rev = confirmed.rev;
    newest = newest === null ? rev : Math.max(newest, rev);
    if (published !== null && published >= rev) {
      markPublished(published);
      return;
    }
    // A refusal holds: "not allowed" until another account (a fresh publisher), the others until a
    // newer save.
    if (refusedAt && (refusedAt.refusal === 'denied' || (refusedAt.rev !== null && rev <= refusedAt.rev))) return;
    markPending(ownHint);
    ownHint = false;
    emit();
    const outcome = await io.publish(rev);
    if (stopped) return;
    switch (outcome.kind) {
      case 'published':
        markPublished(outcome.rev);
        return;
      case 'superseded':
        markPublished(rev);
        return;
      case 'gone':
        stopped = true;
        pendingSince = null;
        return;
      case 'refused':
        refusedAt = { rev: outcome.refusal === 'denied' ? null : rev, refusal: outcome.refusal, reason: outcome.reason };
        lastReason = outcome.reason;
        return;
      case 'transient':
        transientFailures += 1;
        lastReason = outcome.reason;
        schedule(retryDelay(transientFailures));
        return;
    }
  };

  const check = async (opened: boolean) => {
    if (stopped) return;
    const stored = await io.stored();
    if (!stored || stopped) return;
    if (stored.published !== null) published = published === null ? stored.published : Math.max(published, stored.published);
    newest = newest === null ? stored.rev : Math.max(newest, stored.rev);
    if (published !== null && published >= stored.rev) {
      markPublished(published);
      emit();
      return;
    }
    if (refusedAt && (refusedAt.refusal === 'denied' || (refusedAt.rev !== null && stored.rev <= refusedAt.rev))) {
      emit();
      return;
    }
    const first = pendingSince === null;
    markPending(false);
    emit();
    if (opened || pendingOwn) {
      run();
      return;
    }
    // Another page's save: it publishes first; this page steps in after the grace.
    const waited = io.now() - (pendingSince ?? io.now());
    if (waited >= OTHERS_GRACE_MS) run();
    else if (first || !graceCancel) {
      if (graceCancel) graceCancel();
      graceCancel = io.setTimer(OTHERS_GRACE_MS - waited, () => {
        graceCancel = null;
        void check(false);
      });
    }
  };

  const poll = () => {
    if (stopped) return;
    io.setTimer(CHECK_EVERY_MS, () => {
      void check(false);
      poll();
    });
  };
  poll();

  return {
    saved() {
      if (stopped) return;
      ownHint = true;
      if (refusedAt && refusedAt.refusal !== 'denied') refusedAt = null;
      transientFailures = 0;
      run();
    },
    check(opened = false) {
      void check(opened);
    },
    view: () => current,
    stop() {
      stopped = true;
      if (retryCancel) retryCancel();
      if (graceCancel) graceCancel();
    },
  };
}

/** The expected outputs whose newest entry is from a build before automatic updates (no `au`):
 *  they take changes only while a page asks, and switch over by reloading when nothing is on air
 *  there (G3 section 7). An output not present now says nothing either way. */
export function oldOutputNames(peers: readonly LiveEntry[], expected: readonly ExpectedOutput[]): string[] {
  const names: string[] = [];
  for (const out of expected) {
    const entry = peers.filter((p) => p.kind === 'output' && p.id === out.id).sort((a, b) => b.at - a.at)[0];
    if (entry && entry.au !== 1) names.push(out.name);
  }
  return names;
}
