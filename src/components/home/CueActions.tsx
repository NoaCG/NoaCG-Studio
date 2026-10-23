import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ArrangedControl, ArrangedControls, ControlButton, MachineStateGroup } from '../../control/controlModel';
import type { FieldDescriptor } from '../../model/fieldModel';
import type { ArrangeEntry, ShowProfile } from '../../model/profile';
import ActionArranger from './ActionArranger';

/** The selected graphic's ⚡ GRAPHIC ACTIONS and ± LIVE NUMBERS, as the production page draws
 *  them. Props only: every value is the page's, worked out there, and every press runs the page's
 *  verb (phase 3 of docs/work-specs/production-page-refactor). One ⚡ button is the page's
 *  `actionButton`, because its greying and its hover read the page's machine state. */
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
  bumpLive: (fieldKey: string, delta: number) => Promise<void>;
}) {
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
              ⚡ GRAPHIC ACTIONS
            </span>
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
            ± LIVE NUMBERS
          </span>
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
        </div>
      )}
    </>
  );
}
