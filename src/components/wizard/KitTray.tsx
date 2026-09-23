import { useEffect, useRef } from 'react';
import MiniPreview from './MiniPreview';
import type { KitPlan } from './kitPlan';

/**
 * THE KIT TRAY - which graphic of the set is open, and the way to any other.
 *
 * The 216px rail already says where you are INSIDE one graphic; the tray says which graphic of
 * the set you are editing, and every chip is a door to another one. Editing a kit is not a
 * walk: jump to any graphic, come back to one edited earlier, and it opens on the SAME step
 * you are on, so comparing two graphics' Style is one click each way. Every graphic keeps its
 * own answers (`KitPlan.drafts`), so nothing is lost by leaving one.
 *
 * Each chip carries a LIVE thumbnail of the graphic as it is built now - the whole promise of a
 * kit is that the set reads as one package, and a row of names cannot show that. It is
 * `MiniPreview` in `lazy` mode: a big kit is thirty-odd templates in one scroller, so a chip
 * mounts its iframe only when it scrolls into view. The open chip carries the rail's amber
 * active treatment, so a reader who has understood the rail has already understood this.
 *
 * "Apply this Style to all" lives here rather than on the Style step because it is about the
 * SET, which is what the tray is for - and it is an action on offer on every editing step, not
 * a question asked once and then gone.
 */
export default function KitTray({
  plan,
  onOpen,
  onHub,
  onApplyStyle,
}: {
  plan: KitPlan;
  /** Open graphic `index` on the step currently shown. */
  onOpen: (index: number) => void;
  /** Back to the kit's hub, where every graphic is laid out and the kit is finished. */
  onHub: () => void;
  /** Offered when there is another graphic to apply the open one's Style to. */
  onApplyStyle?: () => void;
}) {
  const currentRef = useRef<HTMLLIElement>(null);
  // Keep the graphic being worked on in view: past the first handful of chips the strip
  // scrolls, and a tray whose current chip is off to the left reports nothing. Destructured
  // because a `plan.current` dependency is a property read on a prop object, which the hook
  // linter cannot see change.
  const current = plan.current;
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current]);

  const others = plan.items.length - 1;
  return (
    <div className="wz-kit-tray" data-testid="kit-tray">
      <div className="wz-kit-tray-head">
        <p className="wz-kit-tray-label mono">
          {plan.pack.name} · editing {plan.current + 1} of {plan.items.length}
        </p>
        <button className="wz-rail-change" onClick={onHub} data-testid="kit-hub">
          All graphics
        </button>
        {onApplyStyle && (
          <button
            className="wz-kit-tray-adopt"
            onClick={onApplyStyle}
            title="Give every other graphic in the kit the colours, typeface, sizes and motion of the one you are on. Their text stays."
            data-testid="kit-apply-style"
          >
            Apply this Style to all ({others})
          </button>
        )}
      </div>
      <ol className="wz-kit-tray-strip">
        {plan.items.map((item, i) => {
          const isCurrent = i === plan.current;
          return (
            <li key={item.key} ref={isCurrent ? currentRef : undefined}>
              <button
                className={`wz-kit-chip${isCurrent ? ' is-current' : ''}`}
                onClick={() => onOpen(i)}
                data-kit-chip={item.variant.id}
                aria-current={isCurrent ? 'true' : undefined}
                title={isCurrent ? `${item.variant.name} (open)` : `Edit ${item.variant.name}`}
              >
                <span className="wz-kit-chip-thumb">
                  <MiniPreview template={plan.built[i]} lazy />
                </span>
                <span className="wz-kit-chip-mark" aria-hidden="true">{i + 1}</span>
                <span className="wz-kit-chip-name">{item.variant.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
