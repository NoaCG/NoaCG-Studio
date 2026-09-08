import { useState } from 'react';
import { ALL_PRESETS } from '../../../blocks/presetRegistry';
import { FONTS } from '../../../model/fonts';
import type { SpxTemplate } from '../../../model/types';
import type { ImportedTemplateResult } from '../../../model/importTemplate';
import type { Show } from '../../../model/shows';
import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { isRenderConfigured } from '../../../render/config';
import { formatProjectSummary } from '../../../model/projectFormat';
import { draftResolution, type WizardDraft, behaviourSummary } from '../draft';

import { BetaFeedbackButton } from '../../feedback/BetaFeedback';
import WizardConfirm from '../WizardConfirm';

/** Which earlier step a summary row was decided on — the target of its Edit link. Named
 *  rather than numbered because the step INDEX differs by mode (import mode carries an extra
 *  Images step before Template), and only the wizard knows the mode. */
export type SummaryStepKey = 'design' | 'format' | 'fields' | 'look' | 'motion';

/** One "here is what you chose" line — the read-back the branch is taken in view of. */
export interface SummaryRow {
  label: string;
  value: string;
  /** Present when the row can be gone back and changed (re-design/handoff.md §2f). */
  step?: SummaryStepKey;
}

/** Where the production door sends the graphic: an existing production, or a new one.
 *  Defined beside the shared save path (model/templateSet.ts); re-exported here because this
 *  step is the surface every wizard door imports it from. */
import type { ProductionDest } from '../../../model/templateSet';
export type { ProductionDest };

interface Props {
  /** The graphic's name (`draft.name`), and what an empty field falls back to. */
  name: string;
  namePlaceholder: string;
  onName: (name: string) => void;
  /** The read-back rows — catalog choices, or the AI result's shape. */
  summary: SummaryRow[];
  /** Go back to the step a row was decided on. Absent = the rows are read-only (the AI
   *  result has no configuring steps behind it to return to). */
  onEditStep?: (step: SummaryStepKey) => void;
  /** The saved productions on offer (live list, loaded by the wizard when Finish shows). */
  productions: Show[];
  /** Preselect: the production the wizard was opened FOR (its page's "+ New graphic"),
   *  else null — the picker then defaults to the most recent, else a new one. */
  defaultProductionId: string | null;
  /** THE PRIMARY DOOR (docs/GOALS_ARCHIVE.md "Student release" step 6): create it, save it, pool it
   *  into the production, land on the production page — the road to air. */
  onAddToProduction: (dest: ProductionDest) => void;
  /** Create the project and land in the editor — the classic ending. Saving stays manual. */
  onOpenEditor: () => void;
  /** ADVANCED MODE only: the editor door renders when true (default studio hides it). */
  showEditorDoor: boolean;
  /** Create it, save it to the library, and go straight to the export window. */
  onExport: () => void;
  /** Disabled while there is nothing built to finish. */
  busy: boolean;
  /** The name of the library record this stretch of wizard has ALREADY made, when the reader
   *  has been here before (walked back in, or pressed a door twice). Finishing under that same
   *  name saves OVER it instead of minting a second record, and the confirmation has to say so
   *  - which production is picked cannot answer that question. Null on a first pass. */
  alreadyMadeName?: string | null;
  /** Every LIVE library name (the wizard reads them when Finish shows). A save under a name
   *  already in here writes over that record rather than minting a second one under it
   *  (model/library.ts `graphicHoldingName`), and this dialog is where that is said. */
  libraryNames?: string[];
  /** The field ids the graphic about to be created carries. Compared against the pool copy
   *  being replaced, so the dialog can name the cue values that stop addressing a field. */
  fields?: string[];
}

/**
 * Catalog-shaped read-back: the design, canvas, fields, look and motion the wizard configured.
 * One line of "here is what you chose", so the two doors are taken with the whole graphic in
 * view rather than from memory of four steps ago.
 */
export function catalogSummaryRows(variant: TemplateVariant, draft: WizardDraft): SummaryRow[] {
  const res = draftResolution(draft);
  const palette = draft.customPalette ?? (draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette);
  const fontId = draft.fontId ?? variant.defaultFontId;
  const font =
    fontId === 'custom'
      ? draft.customFont?.family ?? 'Imported font'
      : FONTS.find((f) => f.id === fontId)?.family ?? 'The design’s font';
  const presetId = draft.animation.presetId ?? variant.animationPresets[0];
  const preset = ALL_PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  const outId = draft.animation.outPresetId;
  const outPreset = outId && outId !== presetId ? ALL_PRESETS.find((p) => p.id === outId)?.name ?? outId : null;

  const rows: SummaryRow[] = [
    { label: 'Design', value: variant.name, step: 'design' },
    { label: 'Project format', value: formatProjectSummary(res, draft.fps), step: 'format' },
  ];
  if (draft.lines.length > 0) {
    rows.push({
      label: 'Fields',
      value: `${draft.lines.length} text ${draft.lines.length === 1 ? 'line' : 'lines'}`,
      step: 'fields',
    });
  }
  // An imported SVG's fields are its own text layers, chosen on the mapping step.
  if (draft.designSvg) {
    const on = draft.svgFields.filter((f) => f.on).length;
    // An outlined-text stand-in is a field too (plan §1.A) — a graphic with only those is
    // editable, not fixed.
    const replaced = draft.svgOutlines.filter((f) => f.on && f.box).length;
    const parts = [
      on > 0 ? `${on} editable text layer${on === 1 ? '' : 's'}` : '',
      replaced > 0 ? `${replaced} outlined text replaced by live text` : '',
    ].filter(Boolean);
    rows.push({
      label: 'Fields',
      value: parts.length > 0 ? parts.join(' · ') : 'None — a fixed graphic',
      step: 'fields',
    });
    // TYPEFACES, and the one thing about them that can differ ON AIR. An unresolved family is
    // never a blocker (the designer may know the playout machine has it), but it is the only
    // way a pixel-exact import stops being pixel-exact, and until now it was stated on the
    // mapping step alone — a step "Next" walks straight past. The last screen before Create is
    // where it has to be readable.
    if (draft.svgFonts.length > 0) {
      const missing = draft.svgFonts.filter((f) => !f.fontId && !f.customFont);
      rows.push({
        label: 'Typefaces',
        value:
          missing.length === 0
            ? `${draft.svgFonts.length} embedded — the graphic looks the same on every machine`
            : `${draft.svgFonts.length - missing.length} embedded · ${missing.length} not embedded (${missing
                .map((f) => f.family)
                .join(', ')}) — playout falls back unless the machine has ${missing.length === 1 ? 'it' : 'them'}`,
        step: 'fields',
      });
    }
  }
  // WHAT THE GRAPHIC DOES - the one thing that makes an imported board different from a still,
  // and the row the 2026-09-01 walk found missing (docs/SVG_STATES_FROM_ARTWORK.md §5.2).
  if (draft.designSvg) {
    const does = behaviourSummary(draft);
    if (does) rows.push({ label: 'Behaviour', value: does, step: 'fields' });
  }
  // An imported SVG carries its own look — the palette/typeface read-back would describe
  // knobs the artwork does not read.
  if (!draft.designSvg) rows.push({ label: 'Look', value: `${palette.name} · ${font}`, step: 'look' });
  rows.push({ label: 'Motion', value: outPreset ? `${preset} in · ${outPreset} out` : preset, step: 'motion' });
  return rows;
}

/**
 * AI-result read-back: the generated design, its canvas, how many operator fields it declared,
 * and the fact it passed the gate. The template is its own source of truth here — there is no
 * catalog variant behind an AI creation — so the numbers come straight off it.
 */
export function aiSummaryRows(template: SpxTemplate, valid: boolean): SummaryRow[] {
  const rows: SummaryRow[] = [
    { label: 'Design', value: template.name },
    {
      label: 'Project format',
      value: formatProjectSummary(template.resolution, template.fps),
    },
  ];
  const fieldCount = template.fields.length;
  if (fieldCount > 0) {
    rows.push({
      label: 'Fields',
      value: `${fieldCount} data ${fieldCount === 1 ? 'field' : 'fields'}`,
    });
  }
  // Only ever shown once the result already passed the gate (the door here is unreachable
  // otherwise), so this states what happened rather than claiming a bench that never ran.
  rows.push({ label: 'Checks', value: valid ? 'Passed validation' : 'Some checks are failing' });
  return rows;
}

/**
 * Imported-file read-back: a template somebody else's tool wrote. It reports what was FOUND,
 * never what was configured — nothing here was chosen in this wizard — and leads with the
 * operator fields, because those are what decides whether the file is usable on air or just
 * a picture that plays.
 */
export function importedSummaryRows(imported: ImportedTemplateResult): SummaryRow[] {
  const { template, detection } = imported;
  const count = template.fields.length;
  return [
    { label: 'Template', value: template.name },
    {
      label: 'Project format',
      value: `${formatProjectSummary(template.resolution, template.fps)}${detection.certain ? '' : ' (assumed)'}`,
    },
    {
      label: 'Operator fields',
      value: count > 0 ? `${count} — ${template.fields.map((f) => f.title || f.field).join(', ')}` : 'None found',
    },
    { label: 'Code', value: 'Kept exactly as written' },
  ];
}

/**
 * The Finish step — the wizard's one branch point, shared by every creation mode. Everything
 * before it configures the graphic; this step names it and asks the only question left:
 * where does it go?
 *
 * THE PRIMARY DOOR is a production (docs/GOALS_ARCHIVE.md "Student release" step 6) — the wizard's
 * whole promise ends on air, so the door that leads there leads. "Export" stays for the
 * download-and-run-locally workflow, and "Open in the editor" is Advanced mode's continuation
 * (the default studio does not offer it).
 */
export default function FinishStep({
  name,
  namePlaceholder,
  onName,
  summary,
  onEditStep,
  productions,
  defaultProductionId,
  onAddToProduction,
  onOpenEditor,
  showEditorDoor,
  onExport,
  busy,
  alreadyMadeName = null,
  libraryNames = [],
  fields = [],
}: Props) {
  // The picker's selection: an existing production's id, or 'new'. Preselect the context
  // production (opened FOR one, or walked back into), else the first saved one, else a new one
  // named after the graphic.
  const [dest, setDest] = useState<string>(() =>
    defaultProductionId && productions.some((p) => p.id === defaultProductionId)
      ? defaultProductionId
      : productions[0]?.id ?? 'new',
  );
  const [newName, setNewName] = useState('');
  const resolvedDest = (): ProductionDest =>
    dest === 'new'
      ? { kind: 'new', name: newName.trim() || (name.trim() || namePlaceholder) }
      : { kind: 'existing', id: dest };

  // THE DESTINATION, HELD FOR ONE QUESTION. The primary door does two irreversible-feeling
  // things at once — the graphic joins a rundown picked in a dropdown, and the wizard is left
  // behind — and until now it did both silently while the door beside it opened a window and
  // asked. The owner pressed it by mistake for exactly that reason (walk, 2026-09-02: "It needs
  // to verify: are you sure you want to add it to this playout and go there?"). Holding the
  // resolved destination here rather than a bare `true` is what lets the dialog PRINT it: the
  // value is stating back the production he skipped, not asking "are you sure".
  const [pendingDest, setPendingDest] = useState<ProductionDest | null>(null);
  const pendingShow =
    pendingDest?.kind === 'existing' ? productions.find((p) => p.id === pendingDest.id) : undefined;
  const graphicName = name.trim() || namePlaceholder;
  // The production already holds a graphic under this name, so this press REPLACES it rather
  // than adding a second (model/shows.ts addGraphicToShow matches by name, and keeps the pool
  // entry's id so its cues survive). It is the ordinary case for anyone who walked back into
  // the wizard to change one thing, and a confirmation that said "adding" would be lying to
  // exactly the reader this dialog was built for.
  const replacedCopy = pendingShow?.graphics.find((g) => g.name === graphicName);
  const replacing = !!replacedCopy;
  // The LIBRARY half of the same question, and it is not the same lookup: walking back in and
  // then picking a DIFFERENT production still saves over the record the first pass made, and a
  // name the library ALREADY holds is that graphic whoever made it and whenever
  // (model/library.ts `graphicHoldingName` - the save writes over it rather than minting a
  // second row nobody can tell from the first).
  const savingOver =
    (alreadyMadeName !== null && alreadyMadeName === graphicName) || libraryNames.includes(graphicName);
  // WHAT THE REPLACEMENT DOES TO THE CUES ALREADY PREPARED. A cue's values are a flat map by
  // field id, and the payload a take sends is exactly that map: a key the new version has no
  // field for is ignored on air, and a field it adds starts from its own default. So the cues
  // survive - and are partially addressed - and a student who is told only that they "stay"
  // would find out on air. Named, because a count is not something anyone can act on.
  const strandedFields = (replacedCopy?.template.fields ?? [])
    .filter((f) => !fields.includes(f.field))
    .map((f) => f.title || f.field);

  return (
    <div className="wz-finish">
      <div className="panel-section">
        <h3>Name this graphic</h3>
        <input
          className="wz-finish-name"
          value={name}
          placeholder={namePlaceholder}
          onChange={(e) => onName(e.target.value)}
          data-testid="wz-finish-name"
          aria-label="Graphic name"
        />
        {/* Not cosmetic on the export branch: this name slugs the zip and, for the SPX and
            CasparCG packages, the template FOLDER inside it — what the operator picks from
            in the playout server. */}
        {/* One line. The field already SHOWS what an empty name falls back to, as its
            placeholder, so spending a second line to say so again cost the doors below. */}
        <p className="hint">Used in the library, on the topbar, and as the exported folder name.</p>
        {/* WHAT THIS NAME ALREADY MEANS. Every door below saves under it, and only the
            production one raises a dialog that can say so - the export door saves and leaves
            for the export window without asking anything. So the fact belongs on the field all
            three share, stated once, blocking nobody: the reader who meant a second graphic is
            one keystroke from one, and the reader iterating on their own artwork reads a
            sentence and presses the door they were going to press. */}
        {savingOver && (
          <p className="status-warn" data-testid="wz-finish-name-taken">
            Your library already has a graphic called <strong>{graphicName}</strong>. Finishing
            saves over it. Change the name above to keep both.
          </p>
        )}
      </div>

      <div className="panel-section">
        <h3>What you built</h3>
        <dl className="wz-finish-summary">
          {summary.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
              {/* Each decision is one click from the step it was made on — a read-back you
                  cannot act on makes the reader walk Back through four steps to change one
                  line (re-design/handoff.md §2f). */}
              {r.step && onEditStep && (
                <button className="wz-finish-edit" onClick={() => onEditStep(r.step!)}>Edit</button>
              )}
            </div>
          ))}
        </dl>
      </div>

      {/* Where the graphic joins a show: the primary door's one decision. */}
      <div className="panel-section" data-testid="wz-finish-production-pick">
        <h3>Production</h3>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="grow"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            data-testid="wz-finish-production"
            aria-label="Which production this graphic joins"
          >
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.graphics.length} graphic{p.graphics.length === 1 ? '' : 's'})
              </option>
            ))}
            <option value="new">＋ New production…</option>
          </select>
          {dest === 'new' && (
            <input
              className="grow"
              placeholder={`Production name — e.g. Friday Show (empty = "${name.trim() || namePlaceholder}")`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid="wz-finish-production-name"
            />
          )}
        </div>
        <p className="hint">
          A production is what airs: its graphics, the cue rundown, the output URL, and the
          control page.
        </p>
      </div>

      {/* Each door wears the shared card anatomy: a title row, then a short description block.
          At 1366x768 the pair used to sit BELOW THE FOLD — the primary door's title was cut
          through the middle on the one step whose whole job is to offer a choice — so every
          block above them says its piece in fewer lines and the doors' own copy is one line of
          what happens, not a paragraph about where it leads. They stay side by side (the
          measured decision above `.wz-finish-doors`); stacking them costs more height than it
          buys. */}
      <div className="wz-finish-doors">
        <button
          className="wz-entry-card wz-entry-card--primary"
          onClick={() => setPendingDest(resolvedDest())}
          disabled={busy}
          data-testid="wz-finish-production-go"
        >
          <span className="wz-entry-head">
            <span className="wz-entry-icon">▶</span>
            <strong>Add to the production — go live</strong>
          </span>
          <span className="hint">
            Saves it to your library, pools it into the production with its first cue ready.
          </span>
        </button>
        <button
          className="wz-entry-card"
          onClick={onExport}
          disabled={busy}
          data-testid="wz-finish-export"
        >
          <span className="wz-entry-head">
            <span className="wz-entry-icon">⬇</span>
            <strong>Export it</strong>
          </span>
          <span className="hint">
            Just the files — OGraf, CasparCG, SPX, LiveOS, an OBS/vMix overlay
            {isRenderConfigured() ? ', or a rendered video' : ''}. Saved to your library first.
          </span>
        </button>
        {showEditorDoor && (
          <button
            className="wz-entry-card"
            onClick={onOpenEditor}
            disabled={busy}
            data-testid="wz-finish-editor"
          >
            <span className="wz-entry-head">
              <span className="wz-entry-icon">‹›</span>
              {/* Named ALPHA on the door itself, not in a note somebody reads afterwards: the
                  editor is real and useful, and it is also the surface most likely to behave
                  in ways a student did not expect. Saying so here is what keeps that a known
                  trade rather than a broken promise. */}
              {/* `.wz-beta-tag` is the shared MATURITY-TAG style (the video strip's Beta chip
                  wears it too); the word in it is what says which stage this is. */}
              <strong>Open in the editor <span className="wz-beta-tag">Alpha</span></strong>
            </span>
            <span className="hint">
              Fine-tune fields, motion and code on the canvas and timeline. Still rough — expect
              sharp edges. Nothing is written to your library until you press Save.
            </span>
          </button>
        )}
      </div>

      <div className="panel-section" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px' }}>
          {/* --text, not --fg: there has never been a `--fg` token, so this line rendered in
              whatever colour it inherited rather than the brightest one it asked for. */}
          <strong style={{ display: 'block', color: 'var(--text)' }}>How did we do?</strong>
          <span className="hint">Let us know if you ran into any issues creating your graphic.</span>
        </div>
        <BetaFeedbackButton area="wizard" />
      </div>

      {pendingDest && (
        <WizardConfirm
          title={
            replacing
              ? 'Replace it in this production?'
              : savingOver
              ? `Save over ${graphicName} and add it here?`
              : 'Add it to this production?'
          }
          confirmLabel={
            replacing
              ? 'Replace it and go there'
              : savingOver
              ? 'Save over it and go there'
              : 'Add it and go there'
          }
          cancelLabel="Cancel"
          onConfirm={() => {
            setPendingDest(null);
            onAddToProduction(pendingDest);
          }}
          onCancel={() => setPendingDest(null)}
          testid="wz-finish-production-confirm"
        >
          <p className="wz-confirm-lead">
            <strong>{graphicName}</strong> {replacing ? 'goes back into' : 'goes into'} this production:
          </p>
          {/* THE PART THAT EARNS THE DIALOG. The dropdown above can be walked past without
              being read; this cannot. */}
          <div className="wz-confirm-dest" data-testid="wz-finish-production-confirm-dest">
            <span className="wz-confirm-dest-name">
              {pendingShow ? pendingShow.name : pendingDest.kind === 'new' ? pendingDest.name : 'This production'}
            </span>
            <p className="hint">
              {replacing
                ? `Already holds a graphic called ${graphicName}. This one takes its place.`
                : pendingShow
                ? `Already has ${pendingShow.graphics.length} graphic${pendingShow.graphics.length === 1 ? '' : 's'}.`
                : 'A new production. This is its first graphic.'}
            </p>
          </div>
          <ul>
            <li>
              {savingOver
                ? `${graphicName} is saved over the version in your library. Its data rows stay.`
                : `${graphicName} is saved to your library.`}
            </li>
            <li>
              {replacing
                ? 'The copy in the production is replaced. Its cues and its playout layer stay.'
                : 'A copy joins the production, with its first cue ready to take.'}
              {replacing && strandedFields.length > 0 && (
                <>
                  {' '}
                  Cue values for {strandedFields.join(', ')} no longer match a field in this
                  version and are ignored on air; new fields start from their defaults.
                </>
              )}
            </li>
            <li>The wizard closes and you land on that production, ready to run it.</li>
          </ul>
          <p className="hint">
            Wrong production? Cancel and pick another one before you go.
            {savingOver && ' Meant a NEW graphic? Cancel and give it its own name above.'}
          </p>
        </WizardConfirm>
      )}
    </div>
  );
}
