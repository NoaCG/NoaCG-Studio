import { useRef, type ComponentProps } from 'react';
import CueActions from './CueActions';

/** One block of the LIVE region: a graphic's ⚡ actions and ± numbers, its pin, and whether it is
 *  the selected cue's graphic. */
export interface LiveBlockView {
  graphic: string;
  pinned: boolean;
  selected: boolean;
  /** The cue live on its layer, or null off air. */
  cue: string | null;
  actions: Omit<ComponentProps<typeof CueActions>, 'pin' | 'heading'>;
}

/**
 * THE LIVE REGION (docs/work-specs/pinned-live-controls/spec.md): one block per pinned graphic, in
 * pin order, then the selected cue's graphic (control/liveControls.ts `liveBlocks`). Props only:
 * every block's values and presses are the page's, built for that block's graphic. With nothing
 * pinned it is today's one block, unwrapped, with the pin on its head.
 */
export default function LiveControls({ blocks, onPin, readOnly }: { blocks: LiveBlockView[]; onPin: (graphic: string, pinned: boolean) => void; readOnly: boolean }) {
  /** How many times the stack has rendered, published as `data-renders`: typing in PREP must not
   *  render it (e2e/playout-air-contract.spec.ts). */
  const renders = useRef(0);
  renders.current += 1;
  const pin = (b: LiveBlockView) => ({ pinned: b.pinned, disabled: readOnly, toggle: () => onPin(b.graphic, !b.pinned) });
  if (!blocks.some((b) => b.pinned)) {
    const only = blocks[0];
    return only ? <CueActions {...only.actions} pin={pin(only)} /> : null;
  }
  return (
    <div className="pd-live-stack" data-testid="live-stack" data-renders={renders.current}>
      {blocks.map((b) => (
        <div
          key={b.graphic}
          className={`pd-live-block${b.selected ? ' selected' : ''}${b.pinned ? ' pinned' : ''}`}
          data-testid="live-block"
          data-graphic={b.graphic}
          data-selected={b.selected || undefined}
        >
          <CueActions {...b.actions} pin={pin(b)} heading={{ graphic: b.graphic, cue: b.cue }} />
        </div>
      ))}
    </div>
  );
}
