import { useRef } from 'react';
import { uniqueAssetPath } from '../../../assets/assetUtils';
import { importImageFile } from '../../../assets/imageImport';
import { fieldPlanOf, type FieldPlan, type TemplateVariant } from '../../../model/wizard';
import { setupFields } from '../../../templates/types/graphicType';
import { typeById } from '../../../templates/types/registry';
import { FieldControl } from '../../fields/FieldControl';
import type { DraftPatch, WizardDraft } from '../draft';

interface Props {
  variant: TemplateVariant;
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
}

/** Step 3 — the data fields: the visible text lines plus the design's logo slot, offered
 *  EXACTLY as the design's field plan declares (fieldPlanOf, docs/GOALS_ARCHIVE.md "Student
 *  release" step 5): the standard contract adds/removes lines, a fixed contract edits but
 *  never restructures, and a list design gets ONE control over its one source field - a rows
 *  editor when a line is an item, a paste box when the lines have structure across them.
 *  (An imported design never reaches this step: it creates bare from the Design step and
 *  its fields are added in the editor's Data tab as real placed layers.) */
export default function FieldsStep({ variant, draft, onDraft }: Props) {
  const lines = draft.lines;
  const plan = fieldPlanOf(variant);
  const logoInput = useRef<HTMLInputElement>(null);
  // The design's SETUP values - the non-line decisions that belong to building the graphic
  // rather than to running it (setupFields derives that from the machine: a field an operator
  // event carries as payload is live state, and nobody has picked one yet). Only a
  // type-compiled design has any; everything else renders exactly what it rendered before.
  const type = variant.typeId ? typeById(variant.typeId) : undefined;
  const setup = type ? setupFields(type) : [];

  const setLine = (i: number, key: 'title' | 'sample', value: string) => {
    onDraft({ lines: lines.map((l, k) => (k === i ? { ...l, [key]: value } : l)) });
  };

  /** The 'list' plan's SOURCE line: the one whose suggested sample is multi-row (the same
   *  code-derived signal the textarea render below always keyed on). */
  const listLineIndex =
    plan.kind === 'list' ? variant.suggestedLines.findIndex((l) => l.sample.includes('\n')) : -1;

  // The logo slot: built-in designs always carry one; optional designs get a toggle.
  // Unset (null) follows "a logo image exists" — the import flow pre-fills it.
  // A chosen brand's mark counts as "a logo image exists" here exactly as it does in
  // `draftToOptions` - otherwise this toggle reads OFF beside a preview that is showing the
  // mark, and the two surfaces disagree about the same graphic.
  const brandMark = variant.imageSlot === 'picture' ? null : draft.brandLogo;
  const logoOn =
    variant.logo === 'built-in' ||
    (draft.logoEnabled ?? variant.defaultLogo ?? (draft.logoAssetPath !== null || brandMark !== null));
  const logoImage =
    draft.importedImages.find((a) => a.path === draft.logoAssetPath) ?? brandMark ?? undefined;

  /** Upload a custom logo: embed it as a data-URL asset and point the slot at it. */
  const uploadLogo = async (file: File) => {
    // Shrunk to the frame at the door (assets/imageImport.ts) - a club crest exported for
    // print is routinely 4000px wide, and every pixel past 1920 costs storage for nothing.
    const dataUrl = (await importImageFile(file)).data;
    const path = uniqueAssetPath(file.name, draft.importedImages);
    onDraft({
      importedImages: [...draft.importedImages, { path, data: dataUrl }],
      logoAssetPath: path,
      logoEnabled: true,
    });
  };

  return (
    <div>
      <div className="panel-section">
        <h3>
          {plan.kind === 'fixed' ? 'Data fields' : 'Text lines'}{' '}
          <span className="muted">
            {plan.kind === 'lines'
              ? `(the design adapts — ${variant.maxLines} max for ${variant.name})`
              : plan.kind === 'list'
                ? plan.editor === 'paste'
                  ? '(paste the whole list — the design builds itself from it)'
                  : '(rows are content — the design builds itself from them)'
                : `(this design's field set is fixed)`}
          </span>
        </h3>
        {lines.map((line, i) => (
          // A row whose value box is a TEXTAREA is top-aligned: the row centres by default, which
          // floats a one-line label in the middle of a twelve-line box's empty space.
          <div
            className={`wz-line-row${isTallValue(variant, plan, listLineIndex, i) ? ' wz-line-row--tall' : ''}`}
            key={i}
          >
            <span className="wz-fid">f{i}</span>
            <input
              placeholder="Label shown to the operator"
              value={line.title}
              onChange={(e) => setLine(i, 'title', e.target.value)}
            />
            {i === listLineIndex && plan.kind === 'list' && plan.editor === 'paste' ? (
              // The whole list as ONE box, because that is how it arrives: pasted out of a
              // document or a spreadsheet, with structure running across the lines. A rows
              // grid cannot take that paste and shows one box per person besides.
              <textarea
                className="grow"
                rows={12}
                data-testid="list-paste-editor"
                placeholder={plan.itemHint}
                value={line.sample}
                onChange={(e) => setLine(i, 'sample', e.target.value)}
              />
            ) : i === listLineIndex && plan.kind === 'list' ? (
              <ListRowsEditor
                value={line.sample}
                itemHint={plan.itemHint}
                maxItems={plan.maxItems}
                onChange={(sample) => setLine(i, 'sample', sample)}
              />
            ) : variant.suggestedLines[i]?.sample.includes('\n') ? (
              <textarea
                rows={5}
                placeholder="One entry per line"
                value={line.sample}
                onChange={(e) => setLine(i, 'sample', e.target.value)}
              />
            ) : (
              <input
                placeholder="Sample text shown in the design"
                value={line.sample}
                onChange={(e) => setLine(i, 'sample', e.target.value)}
              />
            )}
            {plan.kind === 'lines' && (
              <button
                disabled={lines.length <= Math.max(1, plan.min)}
                title="Remove this line"
                onClick={() => onDraft({ lines: lines.filter((_, k) => k !== i) })}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {plan.kind === 'lines' && lines.length < variant.maxLines && (
          <button
            onClick={() =>
              onDraft({ lines: [...lines, { title: `Line ${lines.length + 1}`, sample: 'More text' }] })
            }
          >
            + Add a line
          </button>
        )}
        {/* Why the structure stops where it does. Prose, not a control - it answers a real
            question without presenting itself as something to do. */}
        <p className="hint" style={{ marginTop: 10 }} data-testid="field-plan-hint">
          {plan.kind === 'lines' && (
            <>
              The wizard keeps to the lines this design actually shows. Extra fields and custom
              layouts come after creating, where the design can adapt to them — the Data tab
              adds a field, and AI editing or the canvas works it into the graphic.
            </>
          )}
          {plan.kind === 'fixed' && plan.reason}
          {plan.kind === 'list' && plan.editor === 'paste' && (
            <>
              This is ONE field, not a field per person: paste the whole list in and the design
              rebuilds itself from it — here, and again on air. A line ending in a colon is a
              role and every line under it is one of that role&rsquo;s names, so one
              &ldquo;Camera Operators:&rdquo; credits as many people as the show had. A tab or
              a <code>|</code> works too, which is what a paste from a spreadsheet gives you.
            </>
          )}
          {plan.kind === 'list' && plan.editor !== 'paste' && (
            <>
              Rows here are CONTENT, not fields: on air you edit them as one value and the
              design rebuilds itself — add as many as the show needs.
            </>
          )}
          {/* The list's own TEXT FORMAT, when it has one. A format stated only in docs/ is a
              format nobody uses: this step is where a person decides whether the template
              suits their show. */}
          {plan.kind === 'list' && plan.formatNote && (
            <>
              {' '}
              <span data-testid="list-format-note">{plan.formatNote}</span>
            </>
          )}
        </p>
      </div>

      {setup.length > 0 && (
        <div className="panel-section" data-testid="wz-setup">
          <h3>
            Setup{' '}
            <span className="muted">
              decided now - what an operator sends it on air stays theirs
            </span>
          </h3>
          {setup.map((field) => (
            <div className="wz-setup-row" key={field.key}>
              <span className="wz-setup-label">{field.label}</span>
              <FieldControl
                descriptor={{
                  key: field.key,
                  label: field.label,
                  kind: field.kind,
                  defaultValue: field.value,
                  ...(field.options ? { options: field.options } : {}),
                }}
                value={draft.content[field.key] ?? field.value}
                testId={`wz-setup-${field.key}`}
                onChange={(value) =>
                  onDraft({ content: { ...draft.content, [field.key]: String(value) } })
                }
              />
            </div>
          ))}
        </div>
      )}

      {variant.logo !== 'none' && (
        <div className="panel-section">
          <h3>Logo <span className="muted">a real image field — swap the file at playout</span></h3>
          {/* The one checkbox row (re-design/handoff.md §6). */}
          <label className="dlg-check" style={{ cursor: variant.logo === 'built-in' ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={logoOn}
              disabled={variant.logo === 'built-in'}
              onChange={(e) => onDraft({ logoEnabled: e.target.checked })}
            />
            <span className="dlg-check-text">
              <span className="dlg-check-title">Include a logo slot</span>
              <span className="dlg-check-desc">
                {variant.logo === 'built-in'
                  ? 'This design always carries its logo slot — upload yours or pick a file later at playout.'
                  : 'Adds an image field to the design; leave it empty for a clean placeholder.'}
              </span>
            </span>
          </label>
          {logoOn && (
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.[0]) void uploadLogo(e.target.files[0]); e.target.value = ''; }}
              />
              <button onClick={() => logoInput.current?.click()}>⬆ Upload a logo…</button>
              {logoImage && typeof logoImage.data === 'string' && (
                <>
                  <img
                    src={logoImage.data}
                    alt="Logo preview"
                    style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6 }}
                  />
                  <span className="hint">{logoImage.path.replace('images/', '')}</span>
                  <button
                    title="Remove the uploaded logo (the slot keeps its placeholder)"
                    onClick={() => onDraft({ logoAssetPath: null })}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

/** Does this line's value render as a multi-line box? Mirrors the branch below it, so the row's
 *  alignment and the control it holds cannot disagree. */
function isTallValue(
  variant: TemplateVariant,
  plan: FieldPlan,
  listLineIndex: number,
  i: number,
): boolean {
  if (i === listLineIndex && plan.kind === 'list') return plan.editor === 'paste';
  return !!variant.suggestedLines[i]?.sample.includes('\n');
}

/**
 * The 'list' plan's rows editor: one row input per line of the ONE source field's value.
 * Editing rows edits that value - the design's runtime rebuilds from it, exactly as an
 * operator's update() does on air - so this is a friendlier face on the same field, never
 * a second data model.
 */
function ListRowsEditor({
  value,
  itemHint,
  maxItems,
  onChange,
}: {
  value: string;
  itemHint: string;
  maxItems?: number;
  onChange: (value: string) => void;
}) {
  const rows = value.split('\n');
  const setRow = (i: number, v: string) => onChange(rows.map((r, k) => (k === i ? v : r)).join('\n'));
  const removeRow = (i: number) => onChange(rows.filter((_, k) => k !== i).join('\n'));
  const addRow = () => onChange([...rows, ''].join('\n'));
  return (
    <div className="wz-list-rows" data-testid="list-rows-editor">
      {rows.map((row, i) => (
        <div className="row" style={{ gap: 6, marginBottom: 4 }} key={i}>
          <input
            className="grow"
            placeholder={itemHint}
            value={row}
            onChange={(e) => setRow(i, e.target.value)}
            data-testid={`list-row-${i}`}
          />
          <button disabled={rows.length <= 1} title="Remove this row" onClick={() => removeRow(i)}>
            ✕
          </button>
        </div>
      ))}
      <button
        disabled={maxItems !== undefined && rows.length >= maxItems}
        onClick={addRow}
        data-testid="list-row-add"
      >
        + Add a row
      </button>
    </div>
  );
}
