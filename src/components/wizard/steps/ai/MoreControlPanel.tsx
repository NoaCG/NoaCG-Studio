// The "More control" panel of the Create-with-AI step: an optional, progressive structured
// setup (category, data fields, look & references, fonts, animation) that edits ONE
// GenerationSpec. Sections are an accordion — collapsed sections show summary chips and
// keep their values. The panel is a pure view over the spec; the AI step owns the state,
// persists the draft, and threads the spec into the harness as typed data.

import { useRef, useState, type ReactNode } from 'react';
import {
  AI_CATEGORIES,
  aiCategoryById,
  recommendedPresetsFor,
  suggestedFieldsFor,
} from '../../../../ai/spec/categories';
import {
  INTENSITY_PRESETS,
  type AnimationIntensity,
  type GenerationSpec,
  type SpecFieldDef,
} from '../../../../model/generationSpec';
import { TRANSITION_STYLES } from '../../../../blocks/animData';
import { ALL_PRESETS } from '../../../../blocks/presetRegistry';
import { EASINGS, type EasingId } from '../../../../model/easings';
import type { AnimPresetId, AnimSpeed } from '../../../../model/wizard';
import {
  familyFromFileName,
  fontFormatForExt,
  registerAndMeasureFont,
  type CustomFont,
} from '../../../../model/fonts';
import { extOf, fileToDataUrl } from '../../../../assets/assetUtils';
import {
  IMAGE_PURPOSES,
  PURPOSE_LABEL,
  isReferencePurpose,
  type PurposedImage,
} from '../../../../model/imagePurpose';
import type { FieldKind } from '../../../../model/fieldModel';
import FontPicker from '../../FontPicker';
import { pickerHex } from '../StyleStep';

/** The four :root colours, in the Style step's order and words. */
const COLOR_KEYS: { key: 'accent' | 'text' | 'textDim' | 'panel'; label: string }[] = [
  { key: 'accent', label: 'Accent' },
  { key: 'text', label: 'Text' },
  { key: 'textDim', label: 'Text dim' },
  { key: 'panel', label: 'Panel' },
];

interface Props {
  spec: GenerationSpec;
  onSpec: (spec: GenerationSpec) => void;
  /**
   * Everything attached in the step's ONE drop zone, read-only here.
   *
   * This panel used to own a second uploader for style references, which is how the same
   * gesture ended up with two homes: pictures that influence the design were hidden behind an
   * optional accordion while pictures that appear in it were front and centre. Uploading
   * happens once, above; the panel reports what is attached so the summary chip stays honest.
   */
  uploads: PurposedImage[];
  disabled: boolean;
  /** False in Lite, which takes no picture at all — the section must not invite one. */
  allowUploads?: boolean;
  allowedCategories?: readonly GenerationSpec['category'][];
  maxFields?: number;
}

/** The field kinds offered in the field editor, with operator-facing words. */
const FIELD_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'lines', label: 'Multiline text' },
  { kind: 'number', label: 'Number' },
  { kind: 'image', label: 'Image' },
  { kind: 'color', label: 'Colour' },
  { kind: 'toggle', label: 'Yes / no' },
  { kind: 'select', label: 'Selection' },
];

let fieldSeq = 0;
const freshFieldId = (): string => `sf-${Date.now().toString(36)}-${fieldSeq++}`;

// ── The accordion shell ──────────────────────────────────────────────────────

function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Compact chips shown while collapsed — the entered values stay visible. */
  summary: string | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mc-section">
      <button type="button" className="mc-head" aria-expanded={open} onClick={onToggle}>
        <span className="mc-caret">{open ? '▾' : '▸'}</span>
        <span className="mc-title">{title}</span>
        {!open && summary && <span className="mc-summary">{summary}</span>}
      </button>
      {open && <div className="mc-body">{children}</div>}
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function CategorySection({
  spec,
  onSpec,
  disabled,
  allowedCategories,
}: Pick<Props, 'spec' | 'onSpec' | 'disabled' | 'allowedCategories'>) {
  const pick = (id: GenerationSpec['category']) => {
    const next: GenerationSpec = { ...spec, category: id, categoryInferred: false };
    // A fresh pick seeds the suggested fields — but never clobbers fields the user wrote.
    const cat = id === 'auto' ? undefined : aiCategoryById(id);
    if (cat && spec.fields.length === 0) {
      next.fields = suggestedFieldsFor(cat).map((f) => ({ ...f, id: freshFieldId() }));
    }
    onSpec(next);
  };
  const cat = spec.category === 'auto' ? undefined : aiCategoryById(spec.category);
  const suggested = cat ? suggestedFieldsFor(cat) : [];
  return (
    <>
      <p className="hint">
        What kind of broadcast graphic is this? The choice shapes the structure, the operator
        fields, the state model, and the motion — not just the look.
      </p>
      <div className="mc-cats" role="listbox" aria-label="Graphic category">
        <button
          type="button"
          className={`mc-cat ${spec.category === 'auto' ? 'selected' : ''}`}
          onClick={() => pick('auto')}
          disabled={disabled}
          title="The AI reads the brief and any uploads, picks the best fit, and shows its pick — editable."
        >
          <strong>✦ Let AI decide</strong>
          <span>Inferred from the brief — shown and editable on the result.</span>
        </button>
        {AI_CATEGORIES.filter((category) => !allowedCategories || allowedCategories.includes(category.id)).map((c) => (
          <button
            key={c.id}
            type="button"
            className={`mc-cat ${spec.category === c.id ? 'selected' : ''}`}
            onClick={() => pick(c.id)}
            disabled={disabled}
          >
            <strong>{c.name}</strong>
            <span>{c.blurb}</span>
          </button>
        ))}
      </div>
      {cat && suggested.length > 0 && spec.fields.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          <button
            type="button"
            disabled={disabled}
            title={suggested.map((f) => f.label).join(', ')}
            onClick={() => onSpec({ ...spec, fields: suggested.map((f) => ({ ...f, id: freshFieldId() })) })}
          >
            ↺ Replace fields with {cat.name} suggestions
          </button>
        </div>
      )}
    </>
  );
}

function FieldsSection({
  spec,
  onSpec,
  disabled,
  maxFields,
}: Pick<Props, 'spec' | 'onSpec' | 'disabled' | 'maxFields'>) {
  const setFields = (fields: SpecFieldDef[]) => onSpec({ ...spec, fields });
  const patch = (id: string, p: Partial<SpecFieldDef>) =>
    setFields(spec.fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...spec.fields];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };
  return (
    <>
      <p className="hint">
        The editable data fields the graphic carries — each becomes a real operator field.
        The first text fields are the visible lines.
      </p>
      {spec.fields.map((f, i) => (
        <div key={f.id} className="mc-field">
          <div className="row">
            <input
              className="grow"
              placeholder="Label (e.g. Home team)"
              aria-label="Field label"
              value={f.label}
              onChange={(e) => patch(f.id, { label: e.target.value })}
              disabled={disabled}
            />
            <select
              aria-label="Field type"
              value={f.kind}
              onChange={(e) => patch(f.id, { kind: e.target.value as FieldKind })}
              disabled={disabled}
            >
              {FIELD_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>{k.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} title="Move up" aria-label="Move field up">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === spec.fields.length - 1} title="Move down" aria-label="Move field down">↓</button>
            <button type="button" onClick={() => setFields(spec.fields.filter((x) => x.id !== f.id))} disabled={disabled} title="Remove field" aria-label="Remove field">✕</button>
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <input
              className="grow"
              placeholder="Example value (shown in the design)"
              aria-label="Example value"
              value={f.example ?? ''}
              onChange={(e) => patch(f.id, { example: e.target.value })}
              disabled={disabled}
            />
            <input
              className="grow"
              placeholder="How it should be used (optional)"
              aria-label="Field description"
              value={f.description ?? ''}
              onChange={(e) => patch(f.id, { description: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 6 }}>
        <button
          type="button"
          disabled={disabled || (maxFields !== undefined && spec.fields.length >= maxFields)}
          onClick={() => setFields([...spec.fields, { id: freshFieldId(), label: '', kind: 'text' }])}
        >
          + Add field
        </button>
        {maxFields !== undefined && <span className="hint">{spec.fields.length} of {maxFields} fields</span>}
      </div>
    </>
  );
}

function LookSection({ spec, onSpec, uploads, disabled, allowUploads = true }: Props) {
  const colors = spec.brandColors;
  const setColor = (key: 'accent' | 'text' | 'textDim' | 'panel', value: string) =>
    onSpec({
      ...spec,
      brandColors: { accent: '#f6a623', text: '#ffffff', textDim: 'rgba(255,255,255,0.72)', panel: 'rgba(10,12,16,0.9)', ...colors, [key]: value },
    });
  return (
    <>
      <label>Visual style</label>
      <input
        placeholder='e.g. "clean editorial, thin keylines, no gradients"'
        value={spec.styleNotes ?? ''}
        onChange={(e) => onSpec({ ...spec, styleNotes: e.target.value })}
        disabled={disabled}
      />
      <label style={{ marginTop: 6 }}>Mood / atmosphere</label>
      <input
        placeholder='e.g. "serious late-night news" or "playful kids game show"'
        value={spec.mood ?? ''}
        onChange={(e) => onSpec({ ...spec, mood: e.target.value })}
        disabled={disabled}
      />
      <label style={{ marginTop: 6 }}>Do not copy / avoid</label>
      <input
        placeholder='e.g. "no neon glow; do not copy the reference layout"'
        value={spec.avoidNotes ?? ''}
        onChange={(e) => onSpec({ ...spec, avoidNotes: e.target.value })}
        disabled={disabled}
      />

      <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
        <label className="wz-match" style={{ margin: 0 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={!!colors}
            onChange={(e) => onSpec({ ...spec, brandColors: e.target.checked ? { accent: '#f6a623', text: '#ffffff', textDim: 'rgba(255,255,255,0.72)', panel: 'rgba(10,12,16,0.9)' } : null })}
            disabled={disabled}
          />
          Use exact brand colours
        </label>
      </div>
      {colors && (
        <div className="row wrap" style={{ marginTop: 6, gap: 10 }}>
          {COLOR_KEYS.map(({ key, label }) => (
            <div key={key} className="mc-color">
              <label style={{ margin: 0 }}>{label}</label>
              {/* The Style step's exact idiom: a native swatch beside the written value, so
                  rgba() stays typeable (panels need alpha) and the colour is still visible. */}
              <div className="row">
                <input
                  type="color"
                  style={{ width: 44, padding: 2 }}
                  value={pickerHex(colors[key])}
                  onChange={(e) => setColor(key, e.target.value)}
                  disabled={disabled}
                  aria-label={`${label} colour swatch`}
                />
                <input
                  className="grow"
                  value={colors[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  disabled={disabled}
                  placeholder="#hex or rgba(…)"
                  aria-label={`${label} colour value`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!allowUploads ? (
        <p className="hint" style={{ marginTop: 10 }}>
          Image and logo input is paused while Create with AI concentrates on lower-third quality.
        </p>
      ) : (
        <>
          <label style={{ marginTop: 10 }}>Pictures attached</label>
          {uploads.length ? (
            <p className="hint" style={{ marginTop: 2 }} data-testid="mc-uploads">
              {uploadSummary(uploads)}. Change what any of them is for in the drop zone above.
            </p>
          ) : (
            <p className="hint" style={{ marginTop: 2 }}>
              None yet. Drop a logo, a design to follow, a mood board or a shot of your real
              background above, then say what each one is for.
            </p>
          )}
        </>
      )}
    </>
  );
}

/** "1 used as it is · 2 references" — the same words the cards use, counted. */
function uploadSummary(uploads: PurposedImage[]): string {
  return IMAGE_PURPOSES.filter((purpose) => uploads.some((u) => u.purpose === purpose))
    .map((purpose) => {
      const n = uploads.filter((u) => u.purpose === purpose).length;
      return `${n} × ${PURPOSE_LABEL[purpose].toLowerCase()}`;
    })
    .join(' · ');
}

/** A slim uploaded-font control for the secondary/numeric slots (the primary slot gets the
 *  full FontPicker). Uploads become the same CustomFont shape the whole platform embeds. */
function FontUpload({
  label,
  choice,
  onChoice,
  disabled,
}: {
  label: string;
  choice: NonNullable<GenerationSpec['fonts']>['secondary'];
  onChoice: (c: NonNullable<GenerationSpec['fonts']>['secondary']) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const ext = extOf(file.name);
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) return;
    const data = await fileToDataUrl(file);
    const family = familyFromFileName(file.name);
    const tabularFigures = await registerAndMeasureFont(family, data);
    const font: CustomFont = {
      family,
      format: fontFormatForExt(ext),
      asset: { path: `fonts/${file.name}`, data },
      tabularFigures,
    };
    onChoice({ ...choice, customFont: font });
  };
  return (
    <div className="row wrap" style={{ alignItems: 'center', gap: 6, marginTop: 6 }}>
      <span className="mc-font-slot">{label}</span>
      {choice?.customFont ? (
        <span className="wz-file-chip">
          {choice.customFont.family}
          <button type="button" style={{ marginLeft: 6, padding: '0 6px' }} onClick={() => onChoice(undefined)} title="Remove typeface">✕</button>
        </span>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            style={{ display: 'none' }}
            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button type="button" onClick={() => input.current?.click()} disabled={disabled}>Upload typeface…</button>
        </>
      )}
      {choice?.customFont && (
        <input
          className="grow"
          placeholder="Where to use it (e.g. all numerals)"
          aria-label={`${label} usage`}
          value={choice.note ?? ''}
          onChange={(e) => onChoice({ ...choice, note: e.target.value })}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function FontsSection({ spec, onSpec, disabled }: Pick<Props, 'spec' | 'onSpec' | 'disabled'>) {
  const fonts = spec.fonts ?? {};
  const primary = fonts.primary;
  return (
    <>
      <p className="hint">
        The primary font is fully wired into the generated template (its file ships embedded).
        Secondary and numeric typefaces are embedded too and taught to the AI — the house style
        carries one main face, so they apply where the design genuinely uses them.
      </p>
      <label>Primary typeface</label>
      <FontPicker
        value={primary?.customFont ? 'custom' : primary?.fontId ?? null}
        customFont={primary?.customFont ?? null}
        defaultLabel="Let the AI choose"
        onPick={(fontId) =>
          onSpec({
            ...spec,
            fonts: {
              ...fonts,
              primary:
                fontId === null
                  ? undefined
                  : fontId === 'custom'
                    ? primary
                    : { ...primary, fontId, customFont: undefined },
            },
          })
        }
        onCustomFont={(font) => onSpec({ ...spec, fonts: { ...fonts, primary: { ...primary, fontId: undefined, customFont: font } } })}
      />
      <FontUpload
        label="Secondary typeface"
        choice={fonts.secondary}
        onChoice={(secondary) => onSpec({ ...spec, fonts: { ...fonts, secondary } })}
        disabled={disabled}
      />
      <FontUpload
        label="Numeric typeface"
        choice={fonts.numeric}
        onChoice={(numeric) => onSpec({ ...spec, fonts: { ...fonts, numeric } })}
        disabled={disabled}
      />
    </>
  );
}

function AnimationSection({ spec, onSpec, disabled }: Pick<Props, 'spec' | 'onSpec' | 'disabled'>) {
  const a = spec.animation ?? {};
  const patch = (p: Partial<NonNullable<GenerationSpec['animation']>>) =>
    onSpec({ ...spec, animation: { ...a, ...p } });
  const cat = spec.category === 'auto' ? undefined : aiCategoryById(spec.category);
  const recommended = cat ? recommendedPresetsFor(cat) : [];
  const pool = recommended.length
    ? ALL_PRESETS.filter((p) => recommended.includes(p.id))
    : ALL_PRESETS;
  const presetSelect = (
    value: AnimPresetId | undefined,
    onChange: (id: AnimPresetId | undefined) => void,
    ariaLabel: string,
  ) => (
    <select
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || undefined) as AnimPresetId | undefined)}
      disabled={disabled}
    >
      <option value="">Let the AI choose</option>
      {pool.map((p) => (
        <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
      ))}
    </select>
  );
  const inPreset = a.inPresetId ? pool.find((p) => p.id === a.inPresetId) : undefined;
  return (
    <>
      <label>Character</label>
      <div className="mc-intensity">
        {(Object.keys(INTENSITY_PRESETS) as AnimationIntensity[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`mc-cat ${a.intensity === key ? 'selected' : ''}`}
            onClick={() => patch({ intensity: a.intensity === key ? undefined : key })}
            disabled={disabled}
          >
            <strong>{key[0].toUpperCase() + key.slice(1)}</strong>
            <span>{INTENSITY_PRESETS[key].blurb}</span>
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ marginTop: 8, gap: 10, alignItems: 'center' }}>
        <label style={{ margin: 0 }}>In</label>
        {presetSelect(a.inPresetId, (inPresetId) => patch({ inPresetId }), 'Entrance preset')}
        <label style={{ margin: 0 }}>Out</label>
        {presetSelect(a.outPresetId, (outPresetId) => patch({ outPresetId }), 'Exit preset')}
      </div>
      {inPreset && <p className="hint" style={{ marginTop: 4 }}>{inPreset.description}</p>}
      <div className="row wrap" style={{ marginTop: 8, gap: 10, alignItems: 'center' }}>
        <label style={{ margin: 0 }}>State change</label>
        <select
          aria-label="Transition style"
          value={a.transition ?? ''}
          onChange={(e) => patch({ transition: e.target.value || undefined })}
          disabled={disabled}
          title="How a state-machine graphic changes between states (only used where the graphic has states)"
        >
          <option value="">Let the AI choose</option>
          {TRANSITION_STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label style={{ margin: 0 }}>Speed</label>
        <select
          aria-label="Motion speed"
          value={a.speed ?? ''}
          onChange={(e) => patch({ speed: e.target.value ? (Number(e.target.value) as AnimSpeed) : undefined })}
          disabled={disabled}
        >
          <option value="">Auto</option>
          {/* The same steps the wizard's Speed buttons write (model/wizard.ts AnimSpeed:
              ±33% read as "no change" on the owner's walk, ±80% does not). A saved spec
              carrying 0.75/1.5 still resolves - the union keeps them. */}
          <option value="0.6">Slower</option>
          <option value="1">Normal</option>
          <option value="1.8">Faster</option>
          {/* A value the buttons no longer write (a saved spec from before the widening)
              stays selectable rather than being silently rewritten by the render. */}
          {a.speed !== undefined && ![0.6, 1, 1.8].includes(a.speed) && (
            <option value={String(a.speed)}>{a.speed}×</option>
          )}
        </select>
        <label style={{ margin: 0 }}>Easing</label>
        <select
          aria-label="Easing"
          value={a.easing ?? ''}
          onChange={(e) => patch({ easing: (e.target.value || undefined) as EasingId | undefined })}
          disabled={disabled}
        >
          <option value="">Auto</option>
          {EASINGS.map((e2) => (
            <option key={e2.id} value={e2.id}>{e2.name}</option>
          ))}
        </select>
        <label className="wz-match" style={{ margin: 0 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={a.steps ?? false}
            onChange={(e) => patch({ steps: e.target.checked ? true : undefined })}
            disabled={disabled}
          />
          Reveal in steps
        </label>
      </div>
    </>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────

const presetName = (id: AnimPresetId | undefined): string | null =>
  id ? ALL_PRESETS.find((p) => p.id === id)?.name ?? id : null;

export default function MoreControlPanel(props: Props) {
  const { spec, uploads } = props;
  const [open, setOpen] = useState<string | null>('category');
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  const cat = spec.category === 'auto' ? undefined : aiCategoryById(spec.category);
  const fontBits = [
    props.spec.fonts?.primary?.customFont?.family ?? props.spec.fonts?.primary?.fontId,
    props.spec.fonts?.secondary?.customFont?.family,
    props.spec.fonts?.numeric?.customFont?.family,
  ].filter(Boolean);
  const a = spec.animation;
  const animBits = [
    presetName(a?.inPresetId) && `In: ${presetName(a?.inPresetId)}`,
    presetName(a?.outPresetId) && `Out: ${presetName(a?.outPresetId)}`,
    a?.intensity,
  ].filter(Boolean);
  const lookBits = [
    spec.styleNotes?.trim() && 'style',
    spec.mood?.trim() && 'mood',
    spec.brandColors && 'brand colours',
    (() => {
      const refs = uploads.filter((u) => isReferencePurpose(u.purpose)).length;
      return refs ? `${refs} reference${refs > 1 ? 's' : ''}` : null;
    })(),
  ].filter(Boolean);

  return (
    <div className="mc-panel" data-testid="more-control">
      <Section title="Graphic category" summary={cat?.name ?? 'Let AI decide'} open={open === 'category'} onToggle={() => toggle('category')}>
        <CategorySection {...props} />
      </Section>
      <Section
        title="Data fields"
        summary={spec.fields.length ? `${spec.fields.length} field${spec.fields.length > 1 ? 's' : ''}` : null}
        open={open === 'fields'}
        onToggle={() => toggle('fields')}
      >
        <FieldsSection {...props} />
      </Section>
      <Section title="Look & references" summary={lookBits.length ? lookBits.join(' · ') : null} open={open === 'look'} onToggle={() => toggle('look')}>
        <LookSection {...props} />
      </Section>
      <Section title="Typefaces" summary={fontBits.length ? fontBits.join(' · ') : null} open={open === 'fonts'} onToggle={() => toggle('fonts')}>
        <FontsSection {...props} />
      </Section>
      <Section title="Animation" summary={animBits.length ? animBits.join(' · ') : null} open={open === 'anim'} onToggle={() => toggle('anim')}>
        <AnimationSection {...props} />
      </Section>
    </div>
  );
}
