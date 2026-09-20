import type { SpxTemplate } from '../../model/types';
import { applyOperations, type EditorOperation } from './operations';

export interface Revision { source: number; assets: number }
export interface ViewState { selectedParts: string[]; time: number }
export interface DocumentPort {
  read(): SpxTemplate;
  view(): ViewState;
  restore(view: ViewState): void;
  apply(template: SpxTemplate): void;
  undo(): void;
  redo(): void;
  subscribe(listener: () => void): () => void;
}
export interface OperationRequest {
  documentId: string;
  expected: Revision;
  transactionId: string;
  operations: EditorOperation[];
}
interface Receipt { before: SpxTemplate; after: SpxTemplate; beforeView: ViewState; afterView: ViewState }
interface Gesture { expected: Revision; view: ViewState }
export const sameRevision = (a: Revision, b: Revision) => a.source === b.source && a.assets === b.assets;
const assetEqual = (a: SpxTemplate, b: SpxTemplate) => a.assets.length === b.assets.length &&
  a.assets.every((asset, i) => asset.path === b.assets[i].path && asset.data === b.assets[i].data);

/** One session per document port; history snapshots remain owned by that port.
 * Blobs are immutable, so identity catches changed bytes synchronously. The preview
 * additionally hashes the bytes before declaring readiness. No scene is persisted. */
export class EditorSession {
  private current: SpxTemplate;
  private revision: Revision = { source: 1, assets: 1 };
  private ownWrite = false;
  private disposed = false;
  private past: Receipt[] = [];
  private future: Receipt[] = [];
  private transactions = new Map<string, string>();
  private gesture: Gesture | null = null;
  private disconnect: () => void;
  constructor(readonly documentId: string, readonly port: DocumentPort) {
    this.current = port.read();
    this.disconnect = port.subscribe(() => this.sync());
  }
  dispose() { this.disposed = true; this.gesture = null; this.disconnect(); }
  version(): Revision { this.sync(); return { ...this.revision }; }
  private sync() {
    if (this.disposed) throw new Error('This document session is closed.');
    const next = this.port.read();
    if (next === this.current) return;
    const assetChanged = !assetEqual(this.current, next);
    this.current = next;
    this.revision = { source: this.revision.source + 1, assets: this.revision.assets + Number(assetChanged) };
    if (!this.ownWrite) {
      this.gesture = null;
      this.past = [];
      this.future = [];
    }
  }
  private check(documentId: string, expected: Revision) {
    if (documentId !== this.documentId || !sameRevision(expected, this.version())) {
      throw new Error('The document changed. Inspect it again before applying this edit.');
    }
  }
  begin(expected = this.version()) {
    this.check(this.documentId, expected);
    if (this.gesture) throw new Error('Finish or cancel the active gesture first.');
    this.gesture = { expected, view: structuredClone(this.port.view()) };
  }
  preview(operations: EditorOperation[]) {
    if (!this.gesture) throw new Error('No active gesture.');
    this.check(this.documentId, this.gesture.expected);
    return applyOperations(this.current, operations);
  }
  cancel() {
    if (!this.gesture) return;
    const view = this.gesture.view;
    this.gesture = null;
    this.port.restore(view);
  }
  execute(request: OperationRequest) {
    this.check(request.documentId, request.expected);
    if (!request.transactionId) throw new Error('A transaction identity is required.');
    const identity = JSON.stringify(request);
    if (this.transactions.has(request.transactionId)) throw new Error('This transaction was already submitted.');
    const patch = applyOperations(this.current, request.operations);
    if (!patch.diff.length) { this.cancel(); return { ...patch, revision: this.version() }; }
    const before = this.current;
    const beforeView = this.gesture?.view ?? structuredClone(this.port.view());
    this.ownWrite = true;
    try { this.port.apply(patch.template); this.sync(); } finally { this.ownWrite = false; }
    this.past = [...this.past, { before, after: this.current, beforeView, afterView: structuredClone(this.port.view()) }].slice(-30);
    this.future = [];
    this.gesture = null;
    this.transactions.set(request.transactionId, identity);
    return { ...patch, revision: this.version() };
  }
  canUndo() { this.sync(); return this.past.length > 0; }
  canRedo() { this.sync(); return this.future.length > 0; }
  undo() { this.travel(false); }
  redo() { this.travel(true); }
  private travel(forward: boolean) {
    this.sync();
    this.cancel();
    const from = forward ? this.future : this.past;
    const receipt = from[from.length - 1];
    if (!receipt) return;
    this.ownWrite = true;
    try {
      if (forward) this.port.redo(); else this.port.undo();
      this.sync();
      this.port.restore(structuredClone(forward ? receipt.afterView : receipt.beforeView));
    } finally { this.ownWrite = false; }
    from.pop();
    (forward ? this.past : this.future).push(receipt);
  }
}
