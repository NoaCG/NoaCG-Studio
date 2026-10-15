// THE DELIVERY RECEIPT (docs/AGENT_SAVE.md §9): one versioned answer to "what did this operation
// deliver, to which account on which deployment, and is it there now?" - the same shape from the
// write (`POST /api/me/graphics`, `/packages`) and from the readback (`GET /api/me/deliveries`).
//
// Pure: no store, no network, so every state rule here runs under `node --test`.
//
// TWO CLAIMS KEPT APART. `verified: false` is the write's own acknowledgement - the server accepted
// and stored it. `verified: true` means a readback just found it in the account. Neither says a
// browser opened it; nothing on the server can know that, and the receipt never implies it.
//
// VERSIONED AND ADDITIVE. `version` is 1; a new field is optional and keeps the version, a change
// in meaning bumps it. The CLI adds two states of its own that the server never records: `failed`
// (the server refused) and `delivery_unverified` (the answer was lost, and a readback could not
// find it either).

import { randomUUID } from 'node:crypto';
import type { AccountIdentity, DeliveryKind, DeliveryRow, RecordedDeliveryState } from '../agentAccessStore.js';

export const DELIVERY_RECEIPT_VERSION = 1;

export type DeliveryState = RecordedDeliveryState | 'missing' | 'failed' | 'delivery_unverified';

export interface ReceiptResource {
  kind: DeliveryKind | 'production';
  id: string;
  state: DeliveryState;
  link: string;
}

export interface DeliveryReceipt {
  version: typeof DELIVERY_RECEIPT_VERSION;
  operationId: string;
  /** The deployment's origin, e.g. https://noacg.studio. */
  deployment: string;
  account: AccountIdentity;
  /** `library`: Home → Graphics. `home`: waiting on Home → Productions for Install. */
  destination: 'library' | 'home';
  state: DeliveryState;
  resources: ReceiptResource[];
  /** The one link to open: the graphic, the waiting package, or the production Install made. */
  link: string | null;
  nextAction: string | null;
  /** True only when a readback found it in the account just now (see the header). */
  verified: boolean;
  checkedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** The operation id the client named (`x-noacg-operation`), or a fresh one. Never trusted as more
 *  than a label: it groups this user's own rows and nothing else. */
export function operationIdOf(req: Request, mint: () => string = randomUUID): string {
  const sent = req.headers.get('x-noacg-operation')?.trim().toLowerCase();
  return isUuid(sent) ? sent : mint();
}

export const graphicLink = (origin: string, id: string): string => `${origin}/app#/graphic/${encodeURIComponent(id)}`;
/** Opens Home → Productions with this package selected (src/app/router.ts `item`). */
export const packageLink = (origin: string, id: string): string => `${origin}/app#/home/productions/${encodeURIComponent(id)}`;
export const productionLink = (origin: string, id: string): string => `${origin}/app#/production/${encodeURIComponent(id)}`;

/** The state a recorded delivery is in NOW, given whether its resource is still there. */
export function currentState(row: Pick<DeliveryRow, 'state'>, present: boolean): DeliveryState {
  if (row.state === 'installed' || row.state === 'dismissed') return row.state;
  return present ? row.state : 'missing';
}

/** Least finished first: a set is only as delivered as its least delivered part. */
const ORDER: DeliveryState[] = ['failed', 'delivery_unverified', 'missing', 'dismissed', 'pending_install', 'saved', 'installed'];

export function overallState(states: DeliveryState[]): DeliveryState {
  for (const state of ORDER) if (states.includes(state)) return state;
  return 'delivery_unverified';
}

export function nextActionFor(state: DeliveryState, operationId: string): string | null {
  switch (state) {
    case 'pending_install':
      return 'Open the link and press Install on Home → Productions; it is not a production until then.';
    case 'dismissed':
      return 'The user dismissed it on Home without installing. Send it again only if they still want it.';
    case 'missing':
      return 'It is no longer in the account: deleted or removed in the studio.';
    case 'delivery_unverified':
      return `Check it with \`noacg status ${operationId}\` before sending it again.`;
    default:
      return null;
  }
}

export interface ReceiptInput {
  operationId: string;
  deployment: string;
  account: AccountIdentity;
  /** Each delivered resource as recorded, with whether it is still there. */
  rows: Array<Pick<DeliveryRow, 'kind' | 'resourceId' | 'state' | 'productionId'> & { present: boolean }>;
  verified: boolean;
  checkedAt: string;
}

export function buildReceipt(input: ReceiptInput): DeliveryReceipt {
  const resources: ReceiptResource[] = [];
  for (const row of input.rows) {
    const state = currentState(row, row.present);
    const link = row.kind === 'graphic' ? graphicLink(input.deployment, row.resourceId) : packageLink(input.deployment, row.resourceId);
    resources.push({ kind: row.kind, id: row.resourceId, state, link });
    if (state === 'installed' && row.productionId) {
      resources.push({ kind: 'production', id: row.productionId, state, link: productionLink(input.deployment, row.productionId) });
    }
  }
  const state = overallState(resources.map((r) => r.state));
  // The link to open is the finished thing: the production over the package it came from.
  const open = resources.find((r) => r.kind === 'production') ?? resources[0];
  return {
    version: DELIVERY_RECEIPT_VERSION,
    operationId: input.operationId,
    deployment: input.deployment,
    account: input.account,
    destination: input.rows.some((r) => r.kind === 'package') ? 'home' : 'library',
    state,
    resources,
    link: open?.link ?? null,
    nextAction: nextActionFor(state, input.operationId),
    verified: input.verified,
    checkedAt: input.checkedAt,
  };
}
