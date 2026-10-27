import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { adjustWords, controlName, illegalEventTitle, labelCarriesDelta, type ArrangedControl, type ArrangedControls, type ControlButton, type MachineStateGroup } from '../../control/controlModel';
import { pickButton } from '../../control/liveControls';
import type { FieldDescriptor } from '../../model/fieldModel';
import type { ArrangeEntry, ShowProfile } from '../../model/profile';
import ActionArranger from './ActionArranger';
import { IconPin } from '../icons';
import { PRESS_SAYS, markTitle, type PressMark } from '../../control/pressFeedback';

/** What one graphic's ⚡ buttons are judged and pressed against: whether the layer is up, whether
 *  the machine accepts an event where it stands, the operator's word for a field, what the layer
 *  was last sent, and the press. */
export interface ActionContext {
  live: boolean;
  legal: (event: string) => boolean;
  labelOf: (key: string) => string | undefined;
  aired: Record<string, string> | null;
  fire: (button: ControlButton) => void;
  /** What the button's last press came to on the instance on air now (control/pressFeedback.ts). */
  mark?: (event: string) => PressMark | null;
  /** The cue on air, whose kept arguments a declared OGraf action's press sends. */
  airLabel?: string;
}

/** The mark's attributes: its state for styling and tests, its icon drawn by CSS beside the label. */
const markAttrs = (mark: PressMark | null) => (mark ? { 'data-press': mark.state, 'data-press-icon': PRESS_SAYS[mark.state].icon } : {});

/** One graphic's ⚡ button, drawn the same in its three places (pinned above the fold, inside its
 *  section, under "More"). The DECLARATION decides everything the press does; the arrangement
 *  decides only the word and where it sits. `section` is the heading drawn over the button, which
 *  names it in the hover (`controlName`), so five presses all labelled "+1" are told apart.
 *
 *  A ONE-PRESS PICK (`control.options`, control/liveControls.ts) is the same control drawn as its
 *  label and one button per option: a press sets the field to that option and fires the event in
 *  one send, and the option the layer was last sent reads active. */
export function actionButtonFor(ctx: ActionContext) {
  return ({ button: b, label, named, options }: ArrangedControl, section?: string): ReactNode => {
    const legal = ctx.legal(b.event);
    const name = controlName(label, section);
    // Empty when everything the press moves is a hidden holder, which is the reported-field
    // pattern: the hint then falls through to the payload. The delta is dropped when the BUTTON
    // already carries it, so a "+1" press reads "moves Points 3 with it" rather than saying one
    // twice.
    const moved = adjustWords(b, ctx.labelOf, { delta: !labelCarriesDelta(b, label) });
    const title = !ctx.live
      ? 'The graphic is not on air. Take the cue first.'
      : !legal
        ? illegalEventTitle(label)
        : moved
          ? // An adjust press moves a figure WITH the event (a goal's +1), counted from what air
            // shows; a `set` press puts one back to a declared figure (a reset); an `add` press
            // puts a line on a list - the hint says which, and to what.
            `Fires ${name} on the live graphic and moves ${moved} with it.`
          : b.typed
            ? // A declared OGraf action: the arguments are the on-air cue's, and whether the Graphic
              // takes it is its own, never the machine's confirmed legality (E2.2, AC-3).
              `Fires ${name} on the live graphic with ${ctx.airLabel ? `${ctx.airLabel}’s` : 'its cue’s'} arguments. The graphic decides whether it takes it.`
          : b.payload?.length
            ? // The payload in the OPERATOR'S words, not as `f7`: what makes an action
              // self-explanatory is "it shows the Audience results field, which you type above".
              `Fires ${name} on the live graphic, carrying this cue's ${b.payload.map((key) => ctx.labelOf(key) ?? key).join(', ')}.`
            : `Fires ${name} on the live graphic.`;
    const mark = ctx.mark?.(b.event) ?? null;
    if (options) {
      const active = ctx.aired?.[options.field];
      return (
        <span key={b.event} className="pd-pick" role="group" aria-label={label} data-testid={`cue-action-${b.event}`}>
          <span className="pd-pick-label" title={mark ? markTitle(label, mark) : undefined} {...markAttrs(mark)}>{label}</span>
          {options.options.map((o) => (
            <button
              key={o.value}
              className={`pd-action pd-pick-option${active === o.value ? ' active' : ''}`}
              aria-pressed={active === o.value}
              disabled={!ctx.live || !legal}
              title={!ctx.live || !legal ? title : `Fires ${name} on the live graphic with ${o.label}.`}
              onClick={() => ctx.fire(pickButton(b, options, o.value))}
              data-testid={`cue-pick-${b.event}-${o.value}`}
            >
              {o.label}
            </button>
          ))}
        </span>
      );
    }
    return (
      <button
        key={b.event}
        // A label that names a player holds a FIXED slot, so a name sent mid-show never moves the
        // buttons under the operator's finger; a long one truncates and the hover has it whole.
        className={`pd-action${b.destructive ? ' destructive' : ''}${named ? ' named' : ''}`}
        disabled={!ctx.live || !legal}
        title={markTitle(title, mark)}
        {...markAttrs(mark)}
        onClick={() => ctx.fire(b)}
        data-testid={`cue-action-${b.event}`}
      >
        ⚡ {label}
      </button>
    );
  };
}

/** The pin on a block's head (pinned live controls): keeps this graphic's live controls on screen
 *  whatever cue is selected. */
export interface BlockPin {
  pinned: boolean;
  disabled: boolean;
  toggle: () => void;
}

/** One graphic's ⚡ GRAPHIC ACTIONS and ± LIVE NUMBERS, as the production page draws them. Props
 *  only: every value is the page's, worked out there, and every press runs the page's verb (phase
 *  3 of docs/work-specs/production-page-refactor). With `heading` it is one block of the LIVE
 *  stack (home/LiveControls.tsx) and names its graphic and the cue on its layer. */
export default function CueActions({
  events,
  arranging,
  stateLabel,
  selectedLayerLive,
  stateGroups,
  snapTo,
  readOnlyProfile,
  setArrangingFor,
  selectedGraphic,
  renderProfile,
  writeArrange,
  clearAllArrangements,
  arranged,
  actionButton,
  liveNumberFields,
  editingIsLive,
  bumpLive,
  pin,
  heading,
}: {
  events: ControlButton[];
  arranging: boolean;
  stateLabel: string | null;
  selectedLayerLive: boolean;
  stateGroups: MachineStateGroup[];
  snapTo: (groupId: string | null, stateId: string) => Promise<void>;
  readOnlyProfile: boolean;
  setArrangingFor: Dispatch<SetStateAction<string | null>>;
  selectedGraphic: string;
  renderProfile: ShowProfile | null;
  writeArrange: (graphic: string, entries: Record<string, ArrangeEntry>) => void;
  clearAllArrangements: () => void;
  arranged: ArrangedControls;
  actionButton: (control: ArrangedControl, section?: string) => ReactNode;
  liveNumberFields: FieldDescriptor[];
  editingIsLive: boolean;
  bumpLive: (fieldKey: string, delta: number) => Promise<unknown>;
  pin?: BlockPin;
  /** In the LIVE stack: the graphic's name and the cue live on its layer. */
  heading?: { graphic: string; cue: string | null };
}) {
  const pinToggle = pin && (
    <button
      type="button"
      className={`pd-pin-toggle${pin.pinned ? ' on' : ''}`}
      aria-pressed={pin.pinned}
      disabled={pin.disabled}
      title={pin.pinned ? 'Unpin live controls' : 'Pin live controls'}
      aria-label={pin.pinned ? 'Unpin live controls' : 'Pin live controls'}
      onClick={pin.toggle}
      data-testid="live-pin"
    >
      <IconPin size={14} />
    </button>
  );
  const named = heading && (
    <span className="pd-live-name" data-testid="live-block-name">
      {heading.graphic}
      {heading.cue && heading.cue !== heading.graphic && <span className="pd-live-cue"> · {heading.cue}</span>}
    </span>
  );
  return (
    <>
      {/* GRAPHIC ACTIONS - the machine's own verbs, rendered from the metadata that travels
          inside the template (docs/CONTROL_LAYER.md; docs/PLAYOUT_DASHBOARD.md §8). Its own
          frame, never the editor's: the fields edit a CUE and air on ⟳ Take / ✎ Update, while
          these act on the LIVE graphic the moment they are pressed, so they follow Update's
          legality and say so in their own header. */}
      {events.length > 0 && (
        <div className={`pd-actions${arranging ? ' arranging' : ''}`} data-testid="cue-actions">
          {/* COMPACT (owner, 2026-10-03: "use the space efficiently ... no explanations"). One
              line of head, the sections side by side under it; what the block is for lives in
              the kicker's hover, and the one on-air status is the state chip. */}
          <div className="pd-actions-head">
            <span
              className="pd-actions-kicker"
              title="These fire the graphic’s own beats on the layer that is on air, immediately, with the on-air cue’s values."
            >
              {heading ? '⚡' : '⚡ GRAPHIC ACTIONS'}
            </span>
            {named}
            <span
              className="pd-state-chip"
              data-testid="machine-state-chip"
              // The tooltip says what the chip is FOR; the full state is in it because a
              // multi-group graphic's label is longer than the chip, which truncates.
              title={
                selectedLayerLive && stateLabel
                  ? `Where the live graphic is now: ${stateLabel}. Greyed actions are judged against this.`
                  : 'Where the live graphic is now. Greyed actions are judged against this.'
              }
            >
              {!selectedLayerLive ? 'not on air' : stateLabel ?? 'no state reported yet'}
            </span>
            <span className="pd-actions-tools">
              {/* RECOVERY, folded closed in the head: the snap is not how a graphic is driven,
                  and a list of every internal state does not belong among the presses of the
                  show (docs/research/control-surfaces-review-2026-10-02 slice 4). */}
              {stateGroups.length > 0 && !arranging && (
                <details className="pd-actions-recovery" data-testid="cue-actions-recovery">
                  <summary title="Jumps the live graphic straight to a state with no animation and re-sends the on-air cue’s values. For when air and this page are out of step (a renderer restart, a missed press).">
                    Recovery
                  </summary>
                  <select
                    className="pd-snap"
                    value=""
                    disabled={!selectedLayerLive}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v === '::reset') void snapTo(null, '');
                      else {
                        const i = v.indexOf(':');
                        void snapTo(v.slice(0, i), v.slice(i + 1));
                      }
                    }}
                    data-testid="machine-snap"
                  >
                    <option value="">Snap to state…</option>
                    <option value="::reset">⟲ Back to start (visual reset)</option>
                    {stateGroups.map((g) =>
                      g.states.map((s) => (
                        <option key={`${g.id}:${s.id}`} value={`${g.id}:${s.id}`}>
                          {stateGroups.length > 1 ? `${g.id}: ${s.name}` : s.name}
                        </option>
                      )),
                    )}
                  </select>
                </details>
              )}
              {/* ARRANGE, on the buttons themselves (home/ActionArranger). The separate Controls
                  panel it replaced was a second block about this one, under it. */}
              {pinToggle}
              <button
                type="button"
                className={`pd-arrange-toggle${arranging ? ' on' : ''}`}
                aria-pressed={arranging}
                disabled={readOnlyProfile && !arranging}
                title={
                  readOnlyProfile
                    ? 'This production’s control profile was written by a newer build, so it is read-only here.'
                    : arranging
                      ? undefined
                      : 'Pin, hide or rename these actions. Nothing fires while arranging.'
                }
                onClick={() => setArrangingFor(arranging ? null : selectedGraphic)}
                data-testid="cue-actions-arrange"
              >
                {arranging ? 'Done' : 'Arrange'}
              </button>
            </span>
          </div>
          {arranging ? (
            <ActionArranger
              // Keyed on the graphic: a half-typed rename must not carry to another graphic's
              // control of the same id.
              key={selectedGraphic}
              graphic={selectedGraphic}
              buttons={events}
              profile={renderProfile}
              onArrange={(entries) => writeArrange(selectedGraphic, entries)}
              onClearAll={clearAllArrangements}
            />
          ) : (
            <>
              {/* PINNED, at the top and above the sections: the handful this show actually
                  presses. Unsectioned on purpose. */}
              {arranged.pinned.length > 0 && (
                <div className="pd-actions-row pd-actions-pinned" data-testid="cue-actions-pinned">
                  {arranged.pinned.map((c) => actionButton(c))}
                </div>
              )}
              {/* The SECTIONS sit side by side and wrap, each a caption and its buttons, so a
                  scorebug's four groups take two rows at 1600 wide rather than eight. */}
              <div className="pd-actions-groups">
                {arranged.sections.map(([section, controls]) => {
                  // ONE expression decides both whether the heading is drawn and whether the hover
                  // borrows it, so a hover can never name a word that is not on screen.
                  const heading = arranged.sections.length > 1 || section !== 'Actions' ? section : undefined;
                  return (
                    <div key={section} className="pd-actions-section">
                      {heading && <h4>{heading}</h4>}
                      <div className="pd-actions-row">{controls.map((c) => actionButton(c, heading))}</div>
                    </div>
                  );
                })}
                {/* HIDDEN, behind one disclosure. A production hiding a control is saying "not in
                    my way", which is not "gone": the machine still accepts it, and an operator who
                    needs it mid-show reaches it here. */}
                {arranged.more.length > 0 && (
                  <details className="pd-actions-more" data-testid="cue-actions-more">
                    <summary>More ({arranged.more.length})</summary>
                    <div className="pd-actions-row">{arranged.more.map((c) => actionButton(c))}</div>
                  </details>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* LIVE NUMBERS - one press changes a figure on the live graphic (a score, a goal total,
          a stock count): a partial update carrying just the bumped field, mirrored into the cue
          so the two never drift. Derived from the template's own `number` fields. One row: the
          caption, then the steppers; what a press does is in the caption's hover. */}
      {liveNumberFields.length > 0 && (
        <div className="pd-actions pd-live-numbers" data-testid="live-numbers">
          <span
            className="pd-actions-kicker"
            title="One press changes the figure on the live graphic and keeps this cue in step, with no ✎ Update needed. Typing a value in the cue’s fields still stages it for ✎ Update instead."
          >
            {heading && events.length > 0 ? '±' : '± LIVE NUMBERS'}
          </span>
          {events.length === 0 && named}
          <div className="pd-actions-row">
            {liveNumberFields.map((d) => {
              const disabled = !selectedLayerLive || !editingIsLive;
              const title = !selectedLayerLive
                ? 'The graphic is not on air. Take the cue first.'
                : !editingIsLive
                  ? 'Another cue is on air. Select the live cue to bump its numbers.'
                  : undefined;
              return (
                <span key={d.key} className="pd-live-number" data-testid={`live-number-${d.key}`}>
                  <span className="pd-live-number-label">{d.label}</span>
                  <button disabled={disabled} title={title} onClick={() => void bumpLive(d.key, -1)} data-testid={`live-number-${d.key}-down`}>
                    −
                  </button>
                  <button disabled={disabled} title={title} onClick={() => void bumpLive(d.key, 1)} data-testid={`live-number-${d.key}-up`}>
                    +
                  </button>
                </span>
              );
            })}
          </div>
          {events.length === 0 && pinToggle}
        </div>
      )}
    </>
  );
}
