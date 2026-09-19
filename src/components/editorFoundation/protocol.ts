import type { Revision } from './session';
export const EDITOR_MESSAGE = 'noacg-editor-foundation-v1';
export interface Envelope {
  type: typeof EDITOR_MESSAGE; documentId: string; revision: Revision;
  generation: number; requestId: number;
}
export interface RenderedPart {
  selector: string; x: number; y: number; width: number; height: number;
  opacity: number; transform: string;
}
export interface PreviewReply extends Envelope {
  kind: 'ready' | 'pose' | 'error'; parts?: RenderedPart[]; message?: string;
  renderedAt?: number; frameIntervals?: number[]; longTasks?: number[];
}
/** Window identity alone is insufficient: a srcdoc navigation retains its WindowProxy. */
export function acceptsReply(message: PreviewReply, source: MessageEventSource | null,
  currentWindow: Window | null, expected: Envelope): boolean {
  return source === currentWindow && currentWindow !== null &&
    message?.type === EDITOR_MESSAGE && message.documentId === expected.documentId &&
    message.generation === expected.generation && message.requestId === expected.requestId &&
    message.revision?.source === expected.revision.source &&
    message.revision?.assets === expected.revision.assets;
}
