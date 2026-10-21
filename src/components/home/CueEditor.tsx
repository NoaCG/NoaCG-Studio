import type { Dispatch, ReactNode, Ref, SetStateAction } from 'react';
import { MAX_PLAYOUT_LAYER, MIN_PLAYOUT_LAYER, nextFreeLayer, setShowGraphicLayer, type Show, type ShowCue } from '../../model/shows';
import type { SavedGraphic } from '../../model/packets';
import type { FieldDescriptor, FieldValue } from '../../model/fieldModel';
import type { ResolvedValues } from '../../model/productionData';
import { nextRow, type CueDataRow } from '../../control/cueData';
import { groupHeading, type CueFieldGroup } from '../../control/cueFieldGroups';
import { FieldRow, type FieldImage } from '../fields/FieldControl';
import CueOverflowNote from './CueOverflowNote';
import { nameList } from './CueRundown';
import { CueMessageFill, isMessageBodyField } from './ProductionAudienceWorkspace';

/** The edited cue's text, as the page's draft shows it. */
export interface CueEditorView {
  label: string;
  note: string;
  values: Record<string, string>;
}

/**
 * THE CUE EDITOR of a graphic cue: its title, the unsent line, the setup fold, the data-row
 * loader, the field bands (with the message body's "Fill from…" menu, data-sources C0), the
 * operator note, how the cue ends, the playout layer and the sound.
 *
 * Props only: the page derives every value and owns every piece of state, the draft included;
 * edits go back through `editDraft`, `setShows` and the setters handed in. The ends row and the
 * sound arrive built, because both read and write the record in ways the page decides
 * (docs/work-specs/production-page-refactor/spec.md, phase 13a).
 */
export default function CueEditor({
  show,
  setShows,
  poolGraphic,
  editingCue,
  editingView,
  editingCueNo,
  editingIsLive,
  rehearsing,
  selectedCue,
  selectedCueStaged,
  selectedGraphic,
  airCue,
  editTarget,
  setEditTarget,
  authoringAllowed,
  editDraft,
  flushDraft,
  history,
  updateLive,
  hasUnsent,
  unsentFields,
  keptStates,
  overflowKeys,
  overflowSet,
  descriptors,
  descriptorByKey,
  fieldGroups,
  headingValues,
  boundFields,
  resolved,
  cueImages,
  liveFirst,
  fieldsFolded,
  setFoldedFields,
  setupSummary,
  dataRows,
  loadableRows,
  hasSides,
  loadSide,
  setLoadSide,
  lastLoaded,
  loadRow,
  layerClash,
  sharingLayer,
  editedLayer,
  advancedOpen,
  setAdvancedFor,
  clashFix,
  endsRow,
  sounds,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  poolGraphic: SavedGraphic;
  editingCue: ShowCue;
  editingView: CueEditorView;
  /** Its place in the rundown, 1-based; 0 when there is none. */
  editingCueNo: number;
  editingIsLive: boolean;
  rehearsing: boolean;
  selectedCue: ShowCue | null;
  selectedCueStaged: boolean;
  selectedGraphic: string | null;
  /** The cue on air on the selected cue's layer, which the switch points the editor at. */
  airCue: ShowCue | null;
  editTarget: 'preview' | 'air';
  setEditTarget: Dispatch<SetStateAction<'preview' | 'air'>>;
  authoringAllowed: boolean;
  editDraft: (patch: Partial<Pick<CueEditorView, 'label' | 'note'>> & { values?: Record<string, string> }) => void;
  flushDraft: () => Promise<unknown>;
  /** The rundown history, whose group closes when focus leaves the editor. */
  history: { closeGroup: () => Promise<boolean> };
  updateLive: () => Promise<void>;
  hasUnsent: boolean;
  unsentFields: string[];
  /** The machine states ✎ Update keeps on air, as words; empty when none. */
  keptStates: string;
  overflowKeys: string[];
  overflowSet: ReadonlySet<string>;
  descriptors: FieldDescriptor[];
  descriptorByKey: ReadonlyMap<string, FieldDescriptor>;
  fieldGroups: CueFieldGroup[];
  headingValues: Record<string, FieldValue>;
  boundFields: (graphic: string | null) => Record<string, string>;
  resolved: ResolvedValues;
  cueImages: FieldImage[];
  liveFirst: boolean;
  fieldsFolded: boolean;
  setFoldedFields: Dispatch<SetStateAction<ReadonlySet<string>>>;
  /** What the folded setup fields hold, read back on the fold's bar. */
  setupSummary: string;
  dataRows: CueDataRow[];
  loadableRows: CueDataRow[];
  hasSides: boolean;
  loadSide: 'A' | 'B';
  setLoadSide: (side: 'A' | 'B') => void;
  /** The row each cue last loaded, by cue id. */
  lastLoaded: Record<string, string>;
  loadRow: (id: string) => void;
  layerClash: boolean;
  sharingLayer: SavedGraphic[] | undefined;
  editedLayer: number;
  advancedOpen: boolean;
  setAdvancedFor: (graphicId: string | null) => void;
  clashFix: Ref<HTMLButtonElement>;
  /** How the cue ends (home/CueTiming's CueEndsRow), built by the page. */
  endsRow: ReactNode;
  /** The cue's sound (home/ProductionSounds), built by the page. */
  sounds: ReactNode;
}) {
  return (
    <div className={`pd-editor${editingIsLive ? (rehearsing ? ' up' : ' live') : ''}`} data-testid="cue-editor" inert={!authoringAllowed}
      onBlurCapture={() => { void flushDraft(); void history.closeGroup(); }}>
      <div className="pd-editor-head">
        {/* The cue's POSITION, not just its state. Two cues of the same graphic carry the
            same name and the same tally, so "EDITING ON-AIR CUE" over an editable title
            named them both identically — the operator's own report, 2026-09-05. The number
            is the one thing that is unique per row and is already what the rundown shows. */}
        {/* "PREVIEW CUE" only while the cue IS on PREVIEW: in 'preview-then-take' mode
            the editor follows the cursor, which walks on ahead of the monitor. */}
        <span className="pd-editor-kicker">
          EDITING {editingIsLive ? (rehearsing ? 'UP CUE' : 'ON-AIR CUE') : selectedCueStaged ? 'PREVIEW CUE' : 'SELECTED CUE'}
          {editingCueNo > 0 ? ` · ${editingCueNo}` : ''}
        </span>
        {/* The cue's own title, editable HERE: mislabelling "Guest lower third" as "Host"
            is a live-show mistake and must be fixable without leaving the surface. */}
        <input
          className="pd-cue-title"
          value={editingView.label}
          onChange={(e) => editDraft({ label: e.target.value })}
          aria-label="Cue name"
          data-testid="cue-label"
        />
        <span
          className={hasUnsent ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
          data-testid="cue-unsent"
        >
          {hasUnsent
            ? keptStates
              ? `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not ${rehearsing ? 'on PROGRAM' : 'on air'} yet. ✎ Update keeps ${keptStates} ${rehearsing ? 'up' : 'on air'}, ⟳ Re-take starts over with these values`
              : `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not ${rehearsing ? 'on PROGRAM' : 'on air'} yet. Press ✎ Update`
            : null}
        </span>
        <CueOverflowNote keys={overflowKeys} descriptors={descriptors} />
        {/* Phone only (the bottom bar carries TAKE/Next/Out): Update belongs beside the
            line that names it rather than hidden from the operator entirely. */}
        {editingIsLive && (
          <button className="pd-editor-update" onClick={() => void updateLive()} data-testid="editor-update">
            ✎ Update
          </button>
        )}
        <div className="spacer" />
        {airCue && airCue.id !== selectedCue?.id && (
          <button
            className="pd-editor-switch"
            onClick={() => setEditTarget((t) => (t === 'preview' ? 'air' : 'preview'))}
            data-testid="cue-editor-switch"
          >
            {editTarget === 'preview' ? (rehearsing ? 'switch to up cue ▾' : 'switch to on-air cue ▾') : 'switch to preview cue ▾'}
          </button>
        )}
      </div>

      {/* THE SETUP FOLD, offered only under live actions: a scorebug's team names and a
          quiz's words are set before the cue airs, and once they are the operator works
          from the ⚡ block above. Folded, the bar reads back what is set, so nothing is out
          of sight that the operator cannot check at a glance; the unsent line and the
          too-long warning stay in the head above it. A layer clash keeps it open: that
          repair must never sit behind a closed fold. */}
      {liveFirst && !layerClash && (
        <button
          type="button"
          className="pd-fields-fold"
          aria-expanded={!fieldsFolded}
          aria-controls="pd-setup-fields"
          onClick={() =>
            setFoldedFields((s) => {
              const next = new Set(s);
              if (next.has(poolGraphic.id)) next.delete(poolGraphic.id);
              else next.add(poolGraphic.id);
              return next;
            })
          }
          data-testid="cue-fields-fold"
        >
          <span className="pd-advanced-caret" aria-hidden="true">{fieldsFolded ? '▸' : '▾'}</span>
          Setup fields
          {fieldsFolded && (
            <span className="pd-fields-fold-sum" data-testid="cue-fields-summary">
              {setupSummary}
            </span>
          )}
        </button>
      )}

      {!fieldsFolded && (
      <div id="pd-setup-fields">
      <div className="pd-fields">
        {/* LOAD A DATA ROW (the Data workspace's other half): a table whose column names
            match this graphic's field titles offers its rows here. Loading fills the
            EDITED CUE's draft — data prepares, only Take (or ✎ Update, deliberately)
            airs. Unmatched columns are skipped; untouched fields keep their values. */}
        {loadableRows.length > 0 && (
          <label className="pd-field pd-field-load">
            <span>
              Load data row
              {/* THE SIDE PICKER. Only a board with A/B fields shows it, and it says
                  which side the next load fills — one row is one team, so without it a
                  teams table can only ever describe half the graphic. */}
              {hasSides && (
                <span className="pd-side-pick" data-testid="cue-load-side">
                  {(['A', 'B'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={loadSide === s ? 'active' : ''}
                      onClick={() => setLoadSide(s)}
                      data-testid={`cue-load-side-${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <div className="row">
              <select className="grow" value="" onChange={(e) => loadRow(e.target.value)} data-testid="cue-load-row">
                <option value="">Pick a row from the production's data…</option>
                {loadableRows.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {/* The running-order gesture: next question, next name — one press. Loads
                  the row AFTER the one this cue last loaded (the first, before any). */}
              <button
                onClick={() => {
                  const next = nextRow(dataRows, loadSide, editingCue ? lastLoaded[editingCue.id] ?? null : null);
                  if (next) loadRow(next.id);
                }}
                disabled={
                  !editingCue ||
                  !nextRow(dataRows, loadSide, lastLoaded[editingCue.id] ?? null)
                }
                title="Load the next row of the table into this cue"
                data-testid="cue-load-next"
              >
                Load next row
              </button>
            </div>
          </label>
        )}
        {/* THE BANDS. One per side on a two-sided board, headed by the operator's own
            word for that side; one unlabelled band - today's flat flow - on everything
            else. The grouping is derived, never authored (control/cueFieldGroups.ts). */}
        {fieldGroups.map((group) => {
          // WHAT THE OPERATOR IS LOOKING AT, in the same order the field boxes resolve it:
          // a bound field shows the live tree's value, an unset one its authored default.
          // Reading `editingView.values` alone would head a band "Side A" while the box
          // under it plainly said HOME.
          const heading = groupHeading(group, headingValues);
          return (
            <div
              className={`pd-band${heading ? '' : ' pd-band-plain'}`}
              key={group.id}
              data-testid={`cue-band-${group.id}`}
            >
              {heading && (
                <span className="pd-band-label" data-testid={`cue-band-label-${group.id}`}>
                  {heading}
                </span>
              )}
              <div className="pd-band-fields">
                {group.keys.map((key) => {
                  const d = descriptorByKey.get(key);
                  if (!d) return null;
                  // A BOUND field is not a cue value (plan §2.7): it takes the live tree's
                  // value at Take, at ✎ Update and in the preview, so an editable box here
                  // would show a number nothing will ever air. It reads out instead,
                  // wearing its path — the one override gesture is Unbind, on the Data tab.
                  const path = boundFields(selectedGraphic)[d.key];
                  if (path) {
                    // Built on `.field-row`/`.field-meta` - FieldRow's OWN structure -
                    // rather than on a hand-rolled label. The cue fields lay out in a grid,
                    // so a row of a different height sits its input a few pixels off its
                    // neighbour's; matching the real structure makes them line up by
                    // construction instead of by a number kept in step here.
                    return (
                      <div className="field-row pd-field-bound" key={d.key} data-testid={`cue-bound-${d.key}`}>
                        <div className="field-meta">
                          <label style={{ margin: 0 }}>
                            {d.key.toUpperCase()} · {d.label}
                          </label>
                          <span className="pd-bound-mark" title={`Bound to production data: ${path}`}>
                            🔗 {path}
                          </span>
                        </div>
                        <input value={resolved[selectedGraphic ?? '']?.[d.key] ?? ''} placeholder="not set yet" readOnly tabIndex={-1} />
                      </div>
                    );
                  }
                  const field = (
                    <FieldRow
                      key={d.key}
                      descriptor={{ ...d, label: `${d.key.toUpperCase()} · ${d.label}` }}
                      value={String(editingView.values[d.key] ?? d.defaultValue ?? '')}
                      onChange={(v) => editDraft({ values: { [d.key]: String(v) } })}
                      overflow={overflowSet.has(d.key)}
                      testIdPrefix="cue-field"
                      images={cueImages}
                      imageHint={
                        poolGraphic.type === 'picture'
                          ? 'Add pictures with Upload image…'
                          : "Add pictures in the graphic's Assets tab."
                      }
                    />
                  );
                  // A MESSAGE BODY offers "Fill from…": paste or pick a message into this
                  // cue, through the same staging Messages uses (data-sources C0).
                  if (!editingCue || !isMessageBodyField(show, poolGraphic.id, d.key)) return field;
                  return (
                    <div className="pd-field-with-fill" key={d.key}>
                      {field}
                      <CueMessageFill show={show} setShows={setShows} cueId={editingCue.id} graphicId={poolGraphic.id} beforeFill={flushDraft} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* CUE SETTINGS, under a rule and not in the content grid. The note is the cue's; it is
          not something the graphic SHOWS, and flowing it in beside the content fields is
          what left settings alone on a second row looking like a field nobody finished
          (owner, 2026-08-21). */}
      <div className="pd-cue-meta" data-testid="cue-meta">
        <label className="pd-field pd-field-note">
          <span>Operator note</span>
          <input
            value={editingView.note}
            placeholder="e.g. after the intro"
            onChange={(e) => editDraft({ note: e.target.value })}
            data-testid="cue-note"
          />
        </label>
        {/* HOW THE CUE ENDS (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, §2.1): by hand, or after so many
            seconds on air, then Out, the next cue, or both. Phase 1 runs it unpublished only. */}
        {endsRow}
      </div>


      {/* ADVANCED: the graphic's PLAYOUT LAYER (docs/CLIP_PLAYBACK_PLAN.md §6.5). Closed by
          default with the number in its summary, because most productions never change it
          (§5 counts from 20, distinct by construction). WHEN IT CLASHES it is open and
          cannot be closed: two graphics on one layer replace each other on air, so the
          repair must never be one click away behind a closed disclosure. The rundown's
          clash badge lands here too (`openLayerRepair`). */}
      <div className={`pd-advanced${layerClash ? ' clash' : ''}`} data-testid="cue-advanced">
        <button
          type="button"
          className="pd-advanced-toggle"
          aria-expanded={advancedOpen}
          aria-controls="pd-advanced-graphic"
          disabled={layerClash}
          onClick={() => setAdvancedFor(advancedOpen ? null : poolGraphic.id)}
          title={layerClash ? 'Two graphics share this layer' : undefined}
          data-testid="cue-advanced-toggle"
        >
          <span className="pd-advanced-caret" aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
          Advanced
          <span className="pd-advanced-sum" data-testid="cue-advanced-summary">
            Layer {editedLayer}
            {layerClash ? ' · shared' : ''}
          </span>
        </button>
        {advancedOpen && (
          <div className="pd-advanced-body" id="pd-advanced-graphic">
            <label className="pd-field pd-field-layer">
              <span>Playout layer</span>
              <input
                type="number"
                min={MIN_PLAYOUT_LAYER}
                max={MAX_PLAYOUT_LAYER}
                value={editedLayer}
                onChange={(e) => setShows(setShowGraphicLayer(show.id, poolGraphic.id, Number(e.target.value)))}
                data-testid="graphic-layer"
              />
            </label>
            {sharingLayer && (
              <p className="status-warn pd-layer-clash" data-testid="layer-clash">
                {nameList(sharingLayer.map((g) => g.name))} share layer {editedLayer}. On air
                they replace each other.
                <button
                  ref={clashFix}
                  onClick={() => setShows(setShowGraphicLayer(show.id, poolGraphic.id, nextFreeLayer(show.graphics)))}
                  data-testid="layer-clash-fix"
                >
                  Move to layer {nextFreeLayer(show.graphics)}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
      </div>
      )}
      {sounds}
    </div>
  );
}
