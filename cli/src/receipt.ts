// THE DELIVERY RECEIPT on this side (docs/AGENT_SAVE.md §9): what `save` and `pack --save` report
// after a write, and what `noacg status` reads back. The server's receipt (api/_lib/me/
// deliveryReceipt.ts) is the source; this module adds the two states only the CLI can know -
// `failed` (the server refused) and `delivery_unverified` (the answer was lost and a readback
// found nothing) - and the words a person reads.
//
// Accepted and verified stay apart: `verified` is true only when a readback found the delivery in
// the account. Nothing here ever claims a browser opened anything.

import { randomUUID } from 'node:crypto';
import { accountLabel, ApiError, explainError, explainFailure, readDelivery, type AccountIdentity, type SetResult } from './auth.js';

export type DeliveryState = 'saved' | 'pending_install' | 'installed' | 'dismissed' | 'missing' | 'failed' | 'delivery_unverified';

export interface ReceiptResource {
  kind: 'graphic' | 'package' | 'production';
  id: string;
  state: DeliveryState;
  link: string;
}

export interface DeliveryReceipt {
  version: 1;
  operationId: string;
  deployment: string;
  /** Null only on a receipt the CLI wrote itself, when the server never named the account. */
  account: AccountIdentity | null;
  destination: 'library' | 'home';
  state: DeliveryState;
  resources: ReceiptResource[];
  link: string | null;
  nextAction: string | null;
  verified: boolean;
  checkedAt: string;
}

export const newOperationId = (): string => randomUUID();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

/** A receipt the CLI writes itself: the refusal, or the answer that never came. */
export function localReceipt(
  operationId: string,
  deployment: string,
  destination: DeliveryReceipt['destination'],
  state: 'failed' | 'delivery_unverified',
  nextAction: string,
): DeliveryReceipt {
  return {
    version: 1,
    operationId,
    deployment,
    account: null,
    destination,
    state,
    resources: [],
    link: null,
    nextAction,
    verified: false,
    checkedAt: new Date().toISOString(),
  };
}

/** The receipt for a write the server acknowledged, from a deployment too old to send one. */
export function acknowledgedReceipt(
  operationId: string,
  deployment: string,
  kind: 'graphic' | 'package',
  saved: { id: string; url: string },
): DeliveryReceipt {
  const state = kind === 'graphic' ? 'saved' : 'pending_install';
  return {
    version: 1,
    operationId,
    deployment,
    account: null,
    destination: kind === 'graphic' ? 'library' : 'home',
    state,
    resources: [{ kind, id: saved.id, state, link: saved.url }],
    link: saved.url,
    nextAction: kind === 'package' ? 'Open the link and press Install on Home → Productions; it is not a production until then.' : null,
    verified: false,
    checkedAt: new Date().toISOString(),
  };
}

export interface Delivered {
  ok: boolean;
  id?: string;
  url?: string;
  receipt: DeliveryReceipt;
  /** Why it is not delivered: the server said no, or the answer was lost and a readback found nothing. */
  reason?: 'refused' | 'unverified';
  /** In the CLI's words; an unverified one already says what to do next. */
  error?: string;
}

/**
 * Write once, then confirm by reading it back. The operation id is named BEFORE the write, so a
 * lost answer can still be asked about: a readback that finds it means it landed, one that does not
 * leaves it `delivery_unverified`. The write is never repeated here - a blind retry is how a set
 * arrives twice.
 */
export async function deliverAndConfirm(
  origin: string,
  key: string,
  kind: 'graphic' | 'package',
  write: (operationId: string) => Promise<{ id: string; url: string; receipt?: DeliveryReceipt }>,
  operationId: string = newOperationId(),
): Promise<Delivered> {
  const destination = kind === 'graphic' ? 'library' : 'home';
  let written: { id: string; url: string; receipt?: DeliveryReceipt };
  try {
    written = await write(operationId);
  } catch (e) {
    // A refusal the server SENT (4xx) is an answer: nothing was written.
    if (e instanceof ApiError && e.failure.status >= 400 && e.failure.status < 500) {
      const error = explainFailure(e.failure);
      return { ok: false, reason: 'refused', error, receipt: localReceipt(operationId, origin, destination, 'failed', error) };
    }
    // Anything else - a 5xx, a dropped connection - may have landed. Ask before saying anything.
    const found = await readDelivery(origin, key, operationId).catch(() => null);
    if (found) {
      const resource = found.resources.find((r) => r.kind === kind);
      return { ok: true, id: resource?.id, url: resource?.link, receipt: found };
    }
    const next = `It may or may not have arrived. Check it with \`noacg status ${operationId}\` before sending it again.`;
    return {
      ok: false,
      reason: 'unverified',
      error: `Unconfirmed: ${explainError(e)} ${next}`,
      receipt: localReceipt(operationId, origin, destination, 'delivery_unverified', next),
    };
  }
  const confirmed = await readDelivery(origin, key, operationId).catch(() => null);
  return {
    ok: true,
    id: written.id,
    url: written.url,
    receipt: confirmed ?? written.receipt ?? acknowledgedReceipt(operationId, origin, kind, written),
  };
}

export interface SetDelivered {
  ok: boolean;
  /** The deployment answered this operation's first delivery: nothing new was saved. */
  replayed?: boolean;
  /** In the order sent; the names are the ones sent. */
  graphics?: Array<{ id: string; name: string; url: string }>;
  receipt: DeliveryReceipt;
  /** `conflict`: the operation already delivered different graphics. `unsupported`: the deployment
   *  has no set door (404). `unverified`: no answer, and a readback found nothing. */
  reason?: 'refused' | 'conflict' | 'unsupported' | 'unverified';
  error?: string;
}

/** Waits between sends of the same set when no answer came (the first send is immediate). */
export const SET_RETRY_DELAYS_MS = [1_000, 4_000];

/**
 * Send a set under an operation named BEFORE the write, then confirm it by reading it back. Unlike
 * a single save, a set is safe to send again - the deployment answers the same operation's first
 * delivery and never saves it twice - so a lost answer (a 5xx, a dropped connection) is simply sent
 * again, a few times. Only when every answer is lost does it ask by the operation id, and if that
 * finds nothing either the set is `delivery_unverified`: running the same command again resumes it.
 */
export async function deliverSetAndConfirm(
  origin: string,
  key: string,
  operationId: string,
  names: string[],
  write: () => Promise<SetResult>,
  delays: number[] = SET_RETRY_DELAYS_MS,
): Promise<SetDelivered> {
  let written: SetResult | null = null;
  let lost: unknown = null;
  // Only the FIRST send can be answered with an earlier run's delivery. A replay after this run's
  // own answer was lost is most likely this run's own write.
  let earlier = false;
  for (let attempt = 0; attempt <= delays.length && !written; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    try {
      written = await write();
      earlier = attempt === 0 && written.replayed;
    } catch (e) {
      // A refusal the server SENT is an answer, and so is a deployment with no account backend.
      const answered = e instanceof ApiError && ((e.failure.status >= 400 && e.failure.status < 500) || (e.failure.status === 503 && e.failure.code === 'unavailable'));
      if (e instanceof ApiError && answered) {
        const { status, code, message } = e.failure;
        const reason = status === 409 && code === 'conflict' ? 'conflict' : status === 404 ? 'unsupported' : 'refused';
        const error =
          reason === 'conflict' ? message
          : reason === 'unsupported' ? `The NoaCG at ${origin} does not take a set of graphics in one delivery yet; save them one at a time.`
          : explainFailure(e.failure);
        return { ok: false, reason, error, receipt: localReceipt(operationId, origin, 'library', 'failed', error) };
      }
      lost = e;
    }
  }
  const confirmed = await readDelivery(origin, key, operationId).catch(() => null);
  if (written) {
    return { ok: true, replayed: earlier, graphics: written.graphics, receipt: confirmed ?? written.receipt ?? localReceipt(operationId, origin, 'library', 'delivery_unverified', `Check it with \`noacg status ${operationId}\`.`) };
  }
  if (confirmed) {
    // Every answer was lost, but it is in the account: the readback lists it in the order sent.
    const graphics = confirmed.resources.filter((r) => r.kind === 'graphic').map((r, i) => ({ id: r.id, name: names[i] ?? '', url: r.link }));
    return { ok: true, graphics, receipt: confirmed };
  }
  const next = `Run the same command again: it resumes operation ${operationId} and cannot save the set twice (or check it with \`noacg status ${operationId}\`).`;
  return {
    ok: false,
    reason: 'unverified',
    error: `Unconfirmed: ${explainError(lost)} ${next}`,
    receipt: localReceipt(operationId, origin, 'library', 'delivery_unverified', next),
  };
}

/** Who and where, as one phrase: "maker@example.com on https://noacg.studio". */
export function destinationOf(receipt: Pick<DeliveryReceipt, 'account' | 'deployment'>): string {
  const who = receipt.account ? accountLabel(receipt.account) : 'the logged-in account';
  return `${who} on ${receipt.deployment}`;
}

/** The receipt in a person's words, one line per fact. */
export function describeReceipt(receipt: DeliveryReceipt): string[] {
  const lines: string[] = [];
  const checked = receipt.verified ? 'confirmed by reading it back from the account' : 'accepted by the server, not yet read back';
  switch (receipt.state) {
    case 'saved':
      lines.push(`In the library of ${destinationOf(receipt)} (${checked}) -> ${receipt.link}`);
      break;
    case 'pending_install':
      lines.push(`Waiting on Home → Productions of ${destinationOf(receipt)}, pending Install (${checked}) -> ${receipt.link}`);
      break;
    case 'installed':
      lines.push(`Installed as a production in ${destinationOf(receipt)} -> ${receipt.link}`);
      break;
    case 'dismissed':
    case 'missing':
      lines.push(`No longer there (${receipt.state}) in ${destinationOf(receipt)}.`);
      break;
    case 'failed':
      lines.push(`Not delivered to ${destinationOf(receipt)}.`);
      break;
    case 'delivery_unverified':
      lines.push(`Unconfirmed delivery to ${destinationOf(receipt)}.`);
      break;
  }
  if (receipt.nextAction && receipt.state !== 'failed') lines.push(receipt.nextAction);
  lines.push(`Operation ${receipt.operationId}.`);
  return lines;
}
