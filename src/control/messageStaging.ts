// PREPARING A MESSAGE: the one function both doors use (docs/work-specs/audience-flow/spec.md,
// "The workflow"). Messages ▸ "Prepare cue on <graphic>" and the cue editor's "Fill from… Paste a
// message / Pick a message" both end here, so a message cannot reach a cue by a second route.
//
// What it guarantees, by construction:
//  - A message goes only where it fits. A graphic is a destination when it has a body field
//    (titled Message, Question, Comment, Body, Text or Request), is not a vote board, and neither
//    its body nor its name field is bound to live data. Nothing is chosen by elimination: with no
//    remembered choice the caller asks the operator, and with no compatible graphic it offers the
//    Q&A cards. The old fallback - the production's first graphic and its first text field - put
//    a viewer's question into a scoreboard (#1313).
//  - A prepared cue owns its values. Only the broadcast name and body are copied, by field title;
//    the candidate's Source and Reference never reach a field. The cue records `stagedFrom`, which
//    is what makes `setFieldBinding` refuse a later binding on those fields (model/shows.ts).
//  - One press, one cue. A second prepare of the same candidate while the first is saving does
//    nothing, a used candidate is refused unless "Prepare again" is asked for, and a refused save
//    marks nothing used.
//
// It reaches no command log and airs nothing: it writes a cue, and Take airs cues.

// Pure and Node-importable (production-page spec §5.2): the stores it writes through are handed
// in by the caller, so scripts/message-staging.test.mjs runs it against fakes.
import type { MessageReceipt, Show, ShowCue } from '../model/shows';

/** The field titles a message body may land in, and the ones its name may. */
export const BODY_TITLES = ['message', 'question', 'comment', 'body', 'text', 'request'] as const;
export const NAME_TITLES = ['name', 'author', 'from', 'sender', 'handle', 'asked by'] as const;

/** The Q&A cards offered when no graphic of the production can hold a message
 *  (src/templates/types/audience.ts). By catalog name, since that is what the operator reads. */
export const MESSAGE_CARDS = ['House Q&A', 'Volt Q&A', 'Frost Q&A', 'Clean Q&A'] as const;

type Field = { field: string; title?: string };

/** The LAST field whose title is one of `wanted`. Last, because imported artwork puts its own
 *  recipe fields after the designer's layers (ProductionAudienceWorkspace's `pollFieldMap`). */
export function lastTitled(fields: readonly Field[], wanted: readonly string[]): string | null {
  let found: string | null = null;
  for (const f of fields) {
    if (wanted.includes((f.title ?? '').trim().toLowerCase())) found = f.field;
  }
  return found;
}

/** The FIRST field whose title is one of `wanted`, which is how a message has always chosen. */
function firstTitled(fields: readonly Field[], wanted: readonly string[]): string | null {
  for (const f of fields) {
    if (wanted.includes((f.title ?? '').trim().toLowerCase())) return f.field;
  }
  return null;
}

/** A vote board's question and options fields, or null when the graphic is not one. The vote's
 *  own mapping (`pollFieldMap`) is built on this, so "is a vote board" has one answer. */
export function voteBoardFields(fields: readonly Field[]): { question: string; options: string } | null {
  const question = lastTitled(fields, ['question', 'poll question', 'prompt']);
  const options = lastTitled(fields, ['options', 'answers', 'choices']);
  return question && options ? { question, options } : null;
}

/** Where a message would land on this graphic: its body field and, if it has one, its name field.
 *  Null for a graphic with no body field and for a vote board (its Question is not a message). */
export function messageFields(fields: readonly Field[]): { body: string; name: string | null } | null {
  if (voteBoardFields(fields)) return null;
  const body = firstTitled(fields, BODY_TITLES);
  if (!body) return null;
  return { body, name: firstTitled(fields, NAME_TITLES) };
}

export interface MessageDestination {
  graphicId: string;
  name: string;
  body: string;
  nameField: string | null;
}

/** The pool graphics a message may go to, in pool order. A graphic whose body or name field is
 *  bound is left out: that binding is a live route into what the operator approved. */
export function messageDestinations(show: Pick<Show, 'graphics' | 'bindings'>): MessageDestination[] {
  const out: MessageDestination[] = [];
  for (const g of show.graphics) {
    const at = messageFields(g.template.fields ?? []);
    if (!at) continue;
    const bound = show.bindings?.[g.name] ?? {};
    if (bound[at.body] || (at.name && bound[at.name])) continue;
    out.push({ graphicId: g.id, name: g.name, body: at.body, nameField: at.name });
  }
  return out;
}

/** The remembered destination, while it is still one. Never a guess: null asks the operator. */
export function rememberedDestination(show: Pick<Show, 'graphics' | 'bindings' | 'messageTarget'>): MessageDestination | null {
  if (!show.messageTarget) return null;
  return messageDestinations(show).find((d) => d.graphicId === show.messageTarget) ?? null;
}

/** A graphic that would hold a message but cannot take one now, and why - so the cue editor can
 *  say it rather than hide the door. */
export function destinationRefusal(show: Pick<Show, 'graphics' | 'bindings'>, graphicId: string): string | null {
  const g = show.graphics.find((x) => x.id === graphicId);
  if (!g) return 'This graphic was removed.';
  const at = messageFields(g.template.fields ?? []);
  if (!at) return `“${g.name}” has no message field.`;
  if (!messageDestinations(show).some((d) => d.graphicId === graphicId)) {
    return `“${g.name}” follows live data on its message or name, so a prepared message could change on air. Add a separate card for messages.`;
  }
  return null;
}

/** The candidate as staging needs it. An AudienceSubmission satisfies this; `air` is its
 *  `broadcastValues`, computed by the caller so there is one definition of what airs. */
export interface StageCandidate {
  id: string;
  usedAt: string | null;
  air: { author: string; body: string };
}

/** The cue values a message fills on a destination: its body, and its name where there is a name
 *  field. Nothing else - Source, Reference and the platform word are provenance, never content. */
export function messageValues(dest: Pick<MessageDestination, 'body' | 'nameField'>, air: { author: string; body: string }): Record<string, string> {
  const values: Record<string, string> = { [dest.body]: air.body };
  if (dest.nameField) values[dest.nameField] = air.author;
  return values;
}

/** A rundown label for a prepared message: its first forty characters. */
export function messageLabel(body: string): string {
  return body.length > 40 ? `${body.slice(0, 40)}…` : body;
}

export type StageResult =
  | { ok: true; cueId: string; label: string; graphic: string }
  | { ok: false; reason: 'pending' | 'used' | 'refused' | 'empty' | 'save'; message: string };

/** What staging needs from its surroundings: the real stores (model/shows.ts `addShowCue` and
 *  `updateShowCueChecked`, model/durableStore.ts `commitDurableWrites`), or a Node test's fakes. */
export interface StageDeps {
  addCue: (
    showId: string,
    sourceId: string,
    seed: { label: string; values: Record<string, string>; stagedFrom: MessageReceipt },
  ) => { shows: Show[]; cueId: string | null; error: string | null };
  updateCue: (
    showId: string,
    cueId: ShowCue['id'],
    patch: { values: Record<string, string>; stagedFrom: MessageReceipt; label?: string },
  ) => { shows: Show[]; error: string | null };
  /** Resolves to a failure message, or null once the write is durable. */
  commit: () => Promise<string | null>;
  /** Mark the candidate used, after the cue has landed. */
  markUsed: (candidateId: string, at: string) => Promise<void>;
  setShows: (shows: Show[]) => void;
  now: () => string;
}

/** Candidates being prepared right now, across both doors, so a double press makes one cue. */
const pending = new Set<string>();

/**
 * Prepare `candidate` on `graphicId`: a new cue at the end of the rundown, or, given `cueId`, the
 * cue the operator is editing (the cue editor's Fill), which keeps its name unless `relabel`.
 * `again` is the deliberate second cue.
 */
export async function stageMessage(
  show: Show,
  candidate: StageCandidate,
  target: { graphicId: string; cueId?: string; again?: boolean; relabel?: boolean },
  deps: Omit<StageDeps, 'now'> & Partial<Pick<StageDeps, 'now'>>,
): Promise<StageResult> {
  const d: StageDeps = { now: () => new Date().toISOString(), ...deps };
  if (pending.has(candidate.id)) return { ok: false, reason: 'pending', message: 'Already preparing this message.' };
  if (candidate.usedAt && !target.again) {
    return { ok: false, reason: 'used', message: 'This message is already in a cue. Choose Prepare again for a second one.' };
  }
  const dest = messageDestinations(show).find((x) => x.graphicId === target.graphicId);
  if (!dest) return { ok: false, reason: 'refused', message: destinationRefusal(show, target.graphicId) ?? 'Not a destination.' };
  if (!candidate.air.body) return { ok: false, reason: 'empty', message: 'This message has no text to put on air.' };
  if (target.cueId && !show.cues?.some((c) => c.id === target.cueId && c.sourceId === target.graphicId)) {
    return { ok: false, reason: 'refused', message: 'This cue was removed.' };
  }

  pending.add(candidate.id);
  try {
    const at = d.now();
    const values = messageValues(dest, candidate.air);
    const stagedFrom: MessageReceipt = { candidateId: candidate.id, fields: Object.keys(values), at };
    const label = messageLabel(candidate.air.body);
    const made = target.cueId
      ? { ...d.updateCue(show.id, target.cueId, { values, stagedFrom, ...(target.relabel ? { label } : {}) }), cueId: target.cueId }
      : d.addCue(show.id, dest.graphicId, { label, values, stagedFrom });
    d.setShows(made.shows);
    const cueId = made.cueId;
    const failure = made.error ?? (cueId ? await d.commit() : 'the cue could not be written.');
    if (failure || !cueId) {
      return { ok: false, reason: 'save', message: `No cue was prepared on “${dest.name}”: ${failure}` };
    }
    await d.markUsed(candidate.id, at);
    return { ok: true, cueId, label, graphic: dest.name };
  } finally {
    pending.delete(candidate.id);
  }
}
