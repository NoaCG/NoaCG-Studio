// WHAT A TAKE OR AN UPDATE SENDS FOR A CUE'S TYPED DATA (docs/work-specs/playout-ograf-contract/
// spec.md, E1.2a): the decision every Take refusal, Take and ✎ Update of the production page asks,
// as a plain module the page wires (components/playout-behaviour-production-page-lands-verb).
//
// The cue's envelope, with each bound declared field's value read from the production tree by the
// typed target adapter (never from text), validated whole (model/ografTyped.ts `typedForSend`);
// then only while every output this page sees on its own production's live topic reads it
// (`typedOutputsRefusal`). A cue with a live candidate takes none, and a published tree not yet
// read sends nothing bound from it.
//
// A press of a foreign OGraf custom action (E2.1, `typedActionSendFor`) asks the same outputs a
// higher capability: each must say it reads typed actions.
//
// Pure, and Node-importable: scripts/ograf-typed-writer.test.mjs and scripts/ograf-form.test.mjs drive it.

import { getPath, type JsonValue } from '../model/productionData.ts';
import { TYPED_ACTIONS_READER, typedActionFor, typedForSend, typedOutputsRefusal, typedTargetValue, type DeclaredRead, type TypedActionSend, type TypedPeer, type TypedSend } from '../model/ografTyped.ts';

/** What the decision reads, all of it from the page's newest state. */
export interface TypedSendFacts {
  /** The cue's graphic's declaration (model/ografTyped.ts `readOgrafDeclared`). */
  declared: DeclaredRead;
  /** The graphic's bound fields, field key to tree path. */
  bindings: Readonly<Record<string, string>> | undefined;
  /** The production tree, and whether a published one has been read yet. */
  tree: unknown;
  treeRead: boolean;
  /** The production is published: it has outputs, which must say they read typed data. */
  published: boolean;
  /** This page's Presence view, and the production this page is on. */
  presence: { showId: string | null; status: string; peers: readonly TypedPeer[] };
  showId: string;
}

/** The decision, for one cue. */
export function typedSendFor(cue: { typed?: unknown; selection?: unknown }, facts: TypedSendFacts): TypedSend {
  if (cue.typed === undefined) return { status: 'none' };
  // A live candidate's values are resolved as text (E7.1): the two do not combine.
  if (cue.selection !== undefined) return { status: 'refused', reason: 'A cue with a live candidate takes no typed data.' };
  const { declared } = facts;
  const nodes = new Map(declared.status === 'ok' && declared.fields ? (declared.fields.properties ?? []).map((p) => [p.key, p.node] as const) : []);
  const bound = new Map<string, { value: JsonValue } | { reason: string }>();
  for (const [field, path] of Object.entries(facts.bindings ?? {})) {
    const node = nodes.get(field);
    if (!node) continue;
    if (facts.published && !facts.treeRead) return { status: 'refused', reason: 'This production’s shared values are still loading.' };
    const value = getPath(facts.tree as JsonValue, path);
    // A path that holds nothing yet writes nothing: the cue's own value stays.
    if (value !== undefined) bound.set(field, typedTargetValue(node, value));
  }
  const send = typedForSend(cue, declared, bound);
  if (send.status !== 'ok') return send;
  // Peers of another production (the view before its rejoin) are not this one's outputs.
  const { presence } = facts;
  const outputs = typedOutputsRefusal(facts.published, presence.showId === facts.showId ? presence.status : 'joining', presence.peers);
  return outputs ? { status: 'refused', reason: outputs } : send;
}

/**
 * The decision, remembered per envelope while its facts are the same objects: every render's Take
 * refusals ask it as well as the press, so a keystroke does not validate an envelope again. A cue
 * whose envelope changes is a new object, and so a new answer.
 */
export function createTypedSendMemo(): (cue: { typed?: unknown; selection?: unknown }, facts: TypedSendFacts) => TypedSend {
  const kept = new WeakMap<object, { facts: TypedSendFacts; selection: unknown; out: TypedSend }>();
  const same = (a: TypedSendFacts, b: TypedSendFacts) =>
    a.declared === b.declared && a.bindings === b.bindings && a.tree === b.tree && a.treeRead === b.treeRead && a.published === b.published &&
    a.presence.showId === b.presence.showId && a.presence.status === b.presence.status && a.presence.peers === b.presence.peers && a.showId === b.showId;
  return (cue, facts) => {
    const key = typeof cue.typed === 'object' && cue.typed !== null ? cue.typed : null;
    const memo = key ? kept.get(key) : undefined;
    if (memo && memo.selection === cue.selection && same(memo.facts, facts)) return memo.out;
    const out = typedSendFor(cue, facts);
    if (key) kept.set(key, { facts, selection: cue.selection, out });
    return out;
  };
}

/** What a press of `action` sends from this cue's kept arguments (E2.1), or from a panel key's own
 *  (`given`, E6.2): the action envelope, validated whole, then only while every output this page
 *  sees reads typed actions. */
export function typedActionSendFor(cue: { typedArgs?: unknown }, action: string, facts: Pick<TypedSendFacts, 'declared' | 'published' | 'presence' | 'showId'>, given?: JsonValue): TypedActionSend {
  const send = typedActionFor(facts.declared, action, cue.typedArgs, given);
  if (send.status !== 'ok') return send;
  const { presence } = facts;
  const outputs = typedOutputsRefusal(facts.published, presence.showId === facts.showId ? presence.status : 'joining', presence.peers, TYPED_ACTIONS_READER);
  return outputs ? { status: 'refused', reason: outputs } : send;
}

/** A typed edit that did not save sends nothing older in its place (E2.1). */
export const TYPED_NOT_SAVED = 'The last typed edit was not saved, so nothing typed was sent. Check the value and try again.';

/** The part of a cue a typed write saves: its values, or one action's arguments (`typedActionPart`). */
export const TYPED_VALUES_PART = 'values';
/** An action's arguments as a part, never the values part whatever the action's id. */
export const typedActionPart = (actionId: string) => `action:${actionId}`;

/**
 * THE TYPED FORM'S SAVES, CUE BY CUE AND PART BY PART (E2.1): a part whose last write failed sends
 * nothing typed, since what is stored is not what the operator typed, until that part's next write
 * lands. A Take or ✎ Update asks for the values; a press for the values and its action's arguments.
 * A write to another part, or another cue, clears nothing.
 */
export function createTypedSaves(): { landed: (cueId: string, part: string, ok: boolean) => void; refusal: (cueId: string, parts: readonly string[]) => string | null } {
  const failed = new Set<string>();
  const key = (cueId: string, part: string) => JSON.stringify([cueId, part]);
  return {
    landed: (cueId, part, ok) => void (ok ? failed.delete(key(cueId, part)) : failed.add(key(cueId, part))),
    refusal: (cueId, parts) => (parts.some((part) => failed.has(key(cueId, part))) ? TYPED_NOT_SAVED : null),
  };
}
