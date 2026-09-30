import type { Revision } from './session';
import type { NumericPose } from '../../blocks/editorAnimation';
export const EDITOR_MESSAGE = 'noacg-editor-foundation-v1';
export interface Envelope {
  type: typeof EDITOR_MESSAGE; documentId: string; revision: Revision;
  generation: number; requestId: number;
}
export interface RenderedPart {
  selector: string; x: number; y: number; width: number; height: number;
  opacity: number; transform: string;
  /** Parent vectors in composition pixels, including authored document scaling. */
  parent?: [number, number, number, number];
  corners?: { x: number; y: number }[];
  anchor?: { x: number; y: number };
  appearance?: { cue?: number; exiting?: boolean; fontFamily: string; fontSize: number; color: string; fill: string; opacity: number; motion?: NumericPose; initialMotion?: NumericPose; unit?: number;
    /** The border box xPercent and yPercent resolve against, in the motion's pixels (R1.2a.6). */
    size?: [number, number]; time?: number; revision?: Revision };
}
export interface PreviewReply extends Envelope {
  drawingSpace?: [number, number, number, number, number, number] | null;
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
