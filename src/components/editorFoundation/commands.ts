import { z } from 'zod';
import { artworkText } from '../../blocks/artworkEdits';
import { baseValues } from '../../blocks/baseEdits';
import { animationSource, sequenceAuthoringReason, writeChannel } from '../../blocks/editorAnimation';
import type { SpxTemplate } from '../../model/types';
import { readTimeline, ownerOf } from './timelineView';
import type { EditorOperation, OperationPatch } from './operations';
import { applyOperations } from './operations';
import { sameRevision, type EditorSession } from './session';
import type { PreviewController } from './PreviewController';

const coordinate = z.number().finite().min(-100000).max(100000);
const time = z.number().finite().nonnegative();
const targetId = z.string().min(1).max(200);
const revision = z.strictObject({ source: z.number().int().positive(), assets: z.number().int().positive() });
const context = z.strictObject({ documentId: z.string().min(1), sessionId: z.string().min(1), revision, contextToken: z.string().min(1), historyHead: z.number().int().nonnegative() });
const schemas = {
  'layer.create': z.strictObject({ geometry: z.strictObject({ shape: z.enum(['rectangle', 'ellipse', 'text']), x: coordinate, y: coordinate,
    width: coordinate.positive(), height: coordinate.positive(), box: z.boolean().optional() }) }),
  'text.set': z.strictObject({ targetId, text: z.string().max(10000) }),
  'base.set': z.strictObject({ targetId, values: z.union([z.strictObject({ x: coordinate, y: coordinate.optional() }), z.strictObject({ x: coordinate.optional(), y: coordinate })]) }),
  'animation.key': z.strictObject({ targetId, step: z.number().int().nonnegative(), property: z.enum(['x', 'y']), time, value: coordinate, action: z.literal('set') }),
  'step.add': z.strictObject({ time }),
  'out.set': z.strictObject({ time }),
};
export type CommandId = keyof typeof schemas;
const descriptions: Record<CommandId, string> = {
  'layer.create': 'Create root artwork in parent pixels. New text has a public field.',
  'text.set': 'Set a public text default or plain static wording; preserve rehearsal samples and field exclusions.',
  'base.set': 'Set base position in parent pixels, preserving motion.',
  'animation.key': 'Set a runtime position key at explicit stored seconds within a cue; values use runtime pixels.',
  'step.add': 'Add a Next cue at composition seconds, preserving absolute motion.',
  'out.set': 'Set the permanent Out flag at composition seconds using the existing exact split policy.',
};
const commandIds = Object.keys(schemas) as CommandId[];
const command = z.union(commandIds.map(id => z.strictObject({ id: z.literal(id), args: schemas[id] })));
export const editorProposalSchema = z.strictObject({ summary: z.string().min(1).max(1000), commands: z.array(command).max(100) });
export type EditorProposal = z.infer<typeof editorProposalSchema>;
const applySchema = z.strictObject({ expected: context, transactionId: z.string().min(1).max(200), commands: z.array(command).min(1).max(100) });
const historySchema = z.strictObject({ expected: context, direction: z.enum(['undo', 'redo']) });
const viewSchema = z.discriminatedUnion('action', [
  z.strictObject({ expected: context, action: z.literal('select'), targetIds: z.array(targetId).max(20) }),
  z.strictObject({ expected: context, action: z.literal('seek'), time, cue: z.number().int().nonnegative().optional() }),
]);
const inspectSchema = z.strictObject({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) });
export const discoverCommands = () => ({ version: 1, commands: commandIds.map(id => ({ id, description: descriptions[id], effect: 'reversible_source_edit', inputSchema: z.toJSONSchema(schemas[id]) })),
  inspectSchema: z.toJSONSchema(inspectSchema), applySchema: z.toJSONSchema(applySchema), historySchema: z.toJSONSchema(historySchema), viewSchema: z.toJSONSchema(viewSchema) });
export type RefusalCode = 'invalid_input' | 'unsupported_target' | 'stale_context' | 'busy' | 'session_closed' | 'duplicate_transaction' | 'validation_failed';
class Refusal extends Error { constructor(readonly code: RefusalCode, message: string) { super(message); } }
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
function decode<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Refusal('invalid_input', parsed.error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '));
  return parsed.data;
}
function outcome(cause: unknown) {
  const text = message(cause);
  const code: RefusalCode = cause instanceof Refusal ? cause.code : /session is closed/.test(text) ? 'session_closed'
    : /already submitted/.test(text) ? 'duplicate_transaction' : 'validation_failed';
  return { ok: false as const, refusal: { code, message: text, recovery: code === 'busy' ? 'Finish or cancel the human gesture, then inspect again.'
    : code === 'session_closed' ? 'Open the current document and inspect its new session.' : 'Inspect current capabilities and correct the request before submitting a new transaction.' } };
}
function selectorFor(template: SpxTemplate, id: string): string {
  // Resolve from the source-derived list, never accept an arbitrary caller selector.
  const matches = readTimeline(template).parts.filter(p => p.selector === '#' + id);
  const nodes = new DOMParser().parseFromString(template.html, 'text/html').querySelectorAll('[id]');
  if (matches.length !== 1 || [...nodes].filter(n => n.id === id).length !== 1) {
    throw new Refusal('unsupported_target', 'Use a unique source-owned layer ID from inspection. Edit an unnamed layer through the UI first to commit its identity.');
  }
  return matches[0].selector;
}
function operation(template: SpxTemplate, id: CommandId, raw: unknown): EditorOperation {
  const args = raw as Record<string, unknown>; // The complete request was decoded by applySchema.
  if (id === 'layer.create') return { kind: id, geometry: args.geometry } as EditorOperation;
  if (id === 'step.add' || id === 'out.set') return { kind: id, time: args.time } as EditorOperation;
  const selector = selectorFor(template, args.targetId as string);
  if (id === 'text.set' && !artworkText(template, selector)) throw new Refusal('unsupported_target', 'Use a plain text layer. Styled runs, outlined and driven values retain their source.');
  if (id === 'animation.key') {
    const data = animationSource(template), reason = sequenceAuthoringReason(data);
    if (reason) throw new Refusal('unsupported_target', reason);
    const owner = ownerOf(readTimeline(template), selector);
    if (writeChannel(data, owner, args.property as 'x' | 'y') !== args.property) throw new Refusal('unsupported_target', 'This layer uses percent position. Use its existing UI channel control.');
  }
  const values = { ...args }; delete values.targetId;
  return { kind: id, selector, ...values } as EditorOperation;
}
const capability = (run: () => unknown) => {
  try { run(); return { supported: true as const }; }
  catch (cause) { return { supported: false as const, reason: message(cause) }; }
};
/** Browser-local qualification seam. No transport, UI clicking or independent mutation engine. */
export interface CommandView { select(selectors: string[]): void; seek(time: number, cue?: number): void; afterWrite(): void }
export class EditorCommands {
  // Command bindings end on unmount; the document session may survive navigation.
  private readonly bindingId = crypto.randomUUID();
  private closed = false;
  close() { this.closed = true; }
  constructor(readonly session: EditorSession, private preview: () => PreviewController | null = () => null, private views?: CommandView) {}
  private snapshot() {
    if (this.closed) throw new Refusal('session_closed', 'This editor command session is closed.');
    const state = this.session.commandState();
    return { documentId: this.session.documentId, sessionId: this.bindingId, revision: state.revision,
      contextToken: state.contextToken, historyHead: state.historyHead };
  }
  private guard(expected: z.infer<typeof context>) {
    const current = this.snapshot();
    if (expected.sessionId !== current.sessionId || expected.documentId !== current.documentId ||
      !sameRevision(expected.revision, current.revision) || expected.contextToken !== current.contextToken || expected.historyHead !== current.historyHead) {
      throw new Refusal('stale_context', 'The document, session, selection, playhead, samples or history changed. Inspect again before editing.');
    }
    if (this.session.commandState().gestureActive) throw new Refusal('busy', 'A human gesture is active. Its draft and history are preserved.');
  }
  private refreshView() {
    try { this.views?.afterWrite(); return null; }
    catch (cause) { return { state: 'failed' as const, message: message(cause) }; }
  }
  private previewReceipt() {
    const state = this.session.commandState();
    if (state.gestureActive) return { state: 'pending' as const };
    return this.preview()?.receipt(state.revision, this.session.port.view()) ?? { state: 'unavailable' as const };
  }
  inspect(input: unknown = {}) {
    try {
      const { offset, limit } = decode(inspectSchema, input);
      const expected = this.snapshot(), template = this.session.port.read(), view = readTimeline(template);
      const targets = view.parts.slice(offset, offset + limit).map(part => {
        const stable = part.selector.startsWith('#') && part.selector.length <= 201 && capability(() => selectorFor(template, part.selector.slice(1))).supported;
        const id = stable ? part.selector.slice(1) : null;
        const info = capability(() => { const text = artworkText(template, part.selector); if (!text) throw new Error('Use plain text. Styled runs, outlined and driven text retain their source.'); applyOperations(template, [{ kind: 'text.set', selector: part.selector, text: text.text }], false); return text; });
        const text = info.supported ? artworkText(template, part.selector) : null;
        const base = capability(() => { const value = baseValues(template, part.selector); applyOperations(template, [{ kind: 'base.set', selector: part.selector, values: { x: value.x + 1, y: value.y + 1 } }], false); return value; });
        const position = capability(() => { const data = animationSource(template); const reason = sequenceAuthoringReason(data); if (reason) throw new Error(reason);
          const owner = ownerOf(view, part.selector); if (!base.supported) throw new Error(base.reason);
          for (const p of ['x', 'y'] as const) { if (writeChannel(data, owner, p) !== p) throw new Error('This layer uses percent position. Use its existing UI channel control.'); applyOperations(template, [{ kind: 'animation.key', selector: part.selector, step: 0, time: 0, property: p, value: 0, action: 'set' }], false); } });
        const unstable = { supported: false as const, reason: 'Commit a unique source ID through the existing UI before semantic edits.' };
        return { id, label: part.label, stable: !!stable, text: text ? { default: text.text.slice(0, 10000), fieldId: text.field } : null,
          position: base.supported ? baseValues(template, part.selector) : null,
          capabilities: { 'text.set': stable ? info : unstable, 'base.set': stable ? base : unstable, 'animation.key': stable ? position : unstable } };
      });
      const global = Object.fromEntries(['rectangle', 'ellipse', 'text'].map(shape => [shape, capability(() => applyOperations(template,
        [{ kind: 'layer.create', geometry: { shape, x: 0, y: 0, width: 100, height: 100 } } as EditorOperation], false))]));
      const timeline = capability(() => { const reason = sequenceAuthoringReason(animationSource(template)); if (reason) throw new Error(reason); });
      return { ok: true as const, expected, view: { selectedIds: this.session.port.view().selectedParts.map(s => s.startsWith('#') ? s.slice(1) : null),
        time: this.session.port.view().time, cue: this.session.port.view().cue ?? null }, history: this.session.commandState().history,
        document: { name: template.name, resolution: template.resolution, fps: template.fps },
        targets, nextOffset: offset + limit < view.parts.length ? offset + limit : null,
        capabilities: { 'layer.create': global, 'step.add': timeline, 'out.set': timeline },
        timeline: { speed: view.data?.speed, segments: view.segments.slice(0, 100), totalSegments: view.segments.length, reason: view.reason }, preview: this.previewReceipt() };
    } catch (cause) { return outcome(cause); }
  }
  /** Validate a reviewable patch without opening a gesture or writing source/history. */
  prepare(input: unknown) {
    try {
      const request = decode(applySchema, input); this.guard(request.expected);
      const template = this.session.port.read();
      const operations = request.commands.map(c => operation(template, c.id, c.args));
      const patch = applyOperations(template, operations, false);
      this.guard(request.expected);
      return { ok: true as const, expected: request.expected,
        changedIds: patch.changedTargets.map(s => s.startsWith('#') ? s.slice(1) : s),
        files: patch.diff.map(p => p.file) };
    } catch (cause) { return outcome(cause); }
  }
  apply(input: unknown) {
    try {
      const request = decode(applySchema, input); this.guard(request.expected);
      const template = this.session.port.read();
      const operations = request.commands.map(c => operation(template, c.id, c.args));
      // The existing pipeline validates the entire patch before the single session commit.
      // Guard once more at commit; source handlers contain no asynchronous gap.
      this.guard(request.expected);
      const patch = this.session.execute({ documentId: request.expected.documentId, expected: request.expected.revision,
        transactionId: request.transactionId, operations });
      const previewFailure = this.refreshView();
      return { ok: true as const, state: patch.diff.length ? 'committed' as const : 'unchanged' as const, transactionId: request.transactionId,
        expected: this.snapshot(), changedIds: patch.changedTargets.map(s => s.startsWith('#') ? s.slice(1) : s),
        identities: patch.identities, patches: patch.diff, history: this.session.commandState().history, preview: previewFailure ?? this.previewReceipt() };
    } catch (cause) { return outcome(cause); }
  }
  view(input: unknown) {
    try {
      const request = decode(viewSchema, input); this.guard(request.expected);
      if (!this.views) throw new Refusal('validation_failed', 'This editor view is unavailable.');
      const template = this.session.port.read();
      if (request.action === 'select') this.views.select(request.targetIds.map(id => selectorFor(template, id)));
      else {
        const timeline = readTimeline(template);
        if (request.time > timeline.duration || (request.cue !== undefined && !timeline.segments[request.cue])) throw new Refusal('invalid_input', 'Seek within the inspected timeline and an existing cue.');
        this.views.seek(request.time, request.cue);
      }
      return { ok: true as const, expected: this.snapshot(), preview: this.previewReceipt() };
    } catch (cause) { return outcome(cause); }
  }
  history(input: unknown) {
    try {
      const request = decode(historySchema, input); this.guard(request.expected);
      const before = this.session.port.read();
      if (request.direction === 'undo') this.session.undo(); else this.session.redo();
      const previewFailure = this.refreshView();
      const after = this.session.port.read();
      const patches: OperationPatch['diff'] = (['html', 'css', 'js'] as const).filter(f => before[f] !== after[f]).map(file => ({ file, before: before[file], after: after[file] }));
      if (before.assets !== after.assets) patches.push({ file: 'assets', before: before.assets.map(a => a.path).join('\n'), after: after.assets.map(a => a.path).join('\n') });
      return { ok: true as const, direction: request.direction, expected: this.snapshot(), patches,
        history: this.session.commandState().history, preview: previewFailure ?? this.previewReceipt() };
    } catch (cause) { return outcome(cause); }
  }
}
