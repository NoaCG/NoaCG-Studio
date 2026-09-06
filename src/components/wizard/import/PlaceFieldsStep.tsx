import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DesignArt } from '../../../model/wizard';
import { FONTS, fontById, type CustomFont } from '../../../model/fonts';
import { uuid } from '../../../model/id';
import FontPicker, { ensureAppFontFace } from '../FontPicker';
import AnalyzeProposalPanel from './AnalyzeProposalPanel';
import { suggestFieldsForArtwork } from '../../../assets/suggestFields';
import { proposeEraseRect } from '../../../assets/eraseRegion';
import type { DraftPatch, WizardDraft } from '../draft/core';
import type { DesignFieldSpec } from './draft';

interface Props {
  art: DesignArt;
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  /** The still-baked note's door back to the Prepare step (the wizard owns navigation). */
  onBackToPrepare: () => void;
}

type Tool = 'select' | 'text' | 'area' | 'image';

/** What a new field is called, matching the erase seeds: the lower-third words first. */
function nextTitle(existing: number): string {
  return existing === 0 ? 'Name' : existing === 1 ? 'Title' : `Text ${existing + 1}`;
}

function sampleText(title: string): string {
  return title === 'Name' ? 'Alexandra Riva' : title === 'Title' ? 'Correspondent' : 'Your text here';
}

/**
 * The Import Graphic wizard's TEXT step (docs/IMPORT_MVP.md): place editable text fields
 * directly on the artwork — click for point text, drag for an area box — then move, resize,
 * and style them (family / size / weight / color / align / line-height / tracking) with a
 * live render on the artwork itself. Every spec becomes a REAL placed field at build
 * (draft.ts withDesignFieldSpecs), so this canvas, the editor, and the export agree by
 * construction. The right-hand WizardPreview stays the ground truth of the created code.
 */
export default function PlaceFieldsStep({ art, draft, onDraft, onBackToPrepare }: Props) {
  const [tool, setTool] = useState<Tool>('text');
  const [selectedId, setSelectedId] = useState<string | null>(draft.designFields[0]?.id ?? null);
  const [fontOpen, setFontOpen] = useState<'field' | 'design' | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // A live drag: move (dx/dy from the pressed field's origin), area-draw, or width-resize.
  const drag = useRef<
    | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
    | { kind: 'draw'; startX: number; startY: number; x: number; y: number; w: number; h: number }
    | { kind: 'resize'; id: string; startX: number; origW: number }
    | null
  >(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const fields = draft.designFields;
  const selected = fields.find((f) => f.id === selectedId) ?? null;

  // The design's default font family (what fontId: null renders as).
  const designFamily =
    draft.fontId === 'custom' && draft.customFont
      ? draft.customFont.family
      : fontById(draft.fontId ?? 'inter').family;
  useEffect(() => {
    for (const f of fields) {
      const bundled = f.fontId ? FONTS.find((b) => b.id === f.fontId) : null;
      if (bundled) ensureAppFontFace(bundled);
    }
    const def = FONTS.find((b) => b.family === designFamily);
    if (def) ensureAppFontFace(def);
  }, [fields, designFamily]);

  /** Display scale: design px -> canvas CSS px. The stage takes the width its pane actually
   *  offers rather than a fixed 520 — this is the surface you PLACE text on, and every pixel
   *  of it is precision you get back. Clamped so a very wide modal cannot blow the artwork up
   *  past its own resolution, and it falls back to the old width until measured. */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(520);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setPaneWidth(Math.max(320, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stageWidth = Math.min(paneWidth, art.width);
  const s = stageWidth / art.width;

  const patchFields = (next: DesignFieldSpec[]) => onDraft({ designFields: next });
  const patchField = (id: string, patch: Partial<DesignFieldSpec>) =>
    patchFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addField = (spec: Omit<DesignFieldSpec, 'id'>) => {
    const field = { ...spec, id: uuid() };
    patchFields([...fields, field]);
    setSelectedId(field.id);
    setTool('select');
    return field;
  };

  const removeField = (id: string) => {
    patchFields(fields.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Delete removes the selected field — but never while typing in an input. The handler
  // closes over this render's state, so it re-subscribes per render (cheap, and always
  // current — no stale-selection deletes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeField(selectedId);
      }
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const designPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(art.width, (e.clientX - rect.left) / s)),
      y: Math.max(0, Math.min(art.height, (e.clientY - rect.top) / s)),
    };
  };

  /** Capture so a drag keeps reporting outside the stage. Defensive: a synthetic pointer
   *  (tests, automation) has no active id and setPointerCapture throws NotFoundError. */
  const capture = (e: React.PointerEvent) => {
    try {
      (stageRef.current as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* uncaptured drags still work while the pointer stays over the stage */
    }
  };

  const defaultSize = Math.max(14, Math.round(art.width * 0.016));

  /**
   * AUTO-PLACEMENT (free, deterministic — assets/suggestFields.ts). An empty backplate is
   * artwork with a large flat panel drawn to hold words, and that panel is measurable, so
   * the common case needs no placement work at all: the step opens with Name and Title
   * already sitting in the panel, ready to be dragged if the guess is off. It runs ONCE, and
   * only into an empty step — a user who placed a field has said where text goes, and a
   * suggestion arriving on top of that would be an edit, not an offer. Busy artwork refuses
   * out loud and the manual tools stand exactly as they always have.
   */
  const artworkUrl = typeof draft.importedImages[0]?.data === 'string' ? draft.importedImages[0].data : null;
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  // STILL-BAKED TEXT, carried forward honestly: the Prepare step's scan is an offer the
  // wizard never blocks on, so a user can walk past it - and fields placed here would then
  // sit ON TOP of the baked words with nothing saying so (the Yle-demo "text is not being
  // removed" walk). Re-scan the CURRENT artwork (an erased design comes back clean, so a
  // completed erase never nags) and stand down for the standing "it's meant to be there"
  // answer (draft.designKeepBakedText). Same one-scan-per-artwork guard as Prepare's.
  const [bakedLines, setBakedLines] = useState<number | null>(null);
  const bakedScanned = useRef<string | null>(null);
  useEffect(() => {
    if (!artworkUrl || bakedScanned.current === artworkUrl) return;
    bakedScanned.current = artworkUrl;
    void proposeEraseRect(artworkUrl).then((result) => {
      if (bakedScanned.current !== artworkUrl) return;
      setBakedLines(result.proposal ? result.proposal.lines : null);
    });
  }, [artworkUrl]);
  const bakedNote = bakedLines !== null && !draft.designKeepBakedText;
  const [suggesting, setSuggesting] = useState(false);
  const suggest = useCallback(
    async (auto: boolean) => {
      if (!artworkUrl || suggesting) return;
      setSuggesting(true);
      setSuggestNote(null);
      try {
        const result = await suggestFieldsForArtwork(artworkUrl, art.width, art.height);
        if (result.refusal || result.fields.length === 0) {
          setSuggestNote(result.refusal ?? 'Nothing obvious to suggest here.');
          return;
        }
        const placed = result.fields.map((f) => ({
          id: uuid(),
          title: f.title,
          text: f.text,
          x: f.x,
          y: f.y,
          kind: 'point' as const,
          fontId: null,
          fontSize: f.fontSize,
          weight: f.weight,
          color: f.color,
          align: 'left' as const,
          lineHeight: null,
          letterSpacing: null,
        }));
        onDraft({ designFields: [...fields, ...placed] });
        setSelectedId(placed[0].id);
        setTool('select');
        setSuggestNote(
          auto
            ? 'Placed in the empty panel we found — drag to adjust, or delete what you don’t need.'
            : `Added ${placed.length} field${placed.length === 1 ? '' : 's'} in the empty panel.`,
        );
      } finally {
        setSuggesting(false);
      }
    },
    // `fields` is read through the closure on purpose: the auto run is gated on there being
    // none, and the manual button appends to whatever is there when it is pressed.
    [artworkUrl, art.width, art.height, fields, onDraft, suggesting],
  );

  // The ref is the guard, not the dependency list: a re-render mid-suggestion must not
  // re-fire it, and the effect still declares everything it reads.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !artworkUrl || draft.designFields.length > 0) return;
    autoRan.current = true;
    void suggest(true);
  }, [artworkUrl, draft.designFields.length, suggest]);

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = designPoint(e);
    capture(e);
    if (tool === 'text') {
      const title = nextTitle(fields.length);
      addField({
        title,
        text: sampleText(title),
        x: Math.round(p.x),
        y: Math.round(p.y),
        kind: 'point',
        fontId: null,
        fontSize: defaultSize,
        weight: null,
        color: '#ffffff',
        align: 'left',
        lineHeight: null,
        letterSpacing: null,
      });
    } else if (tool === 'area' || tool === 'image') {
      drag.current = { kind: 'draw', startX: p.x, startY: p.y, x: p.x, y: p.y, w: 0, h: 0 };
      setDrawRect({ x: p.x, y: p.y, w: 0, h: 0 });
    } else {
      setSelectedId(null);
    }
  };

  const onFieldDown = (e: React.PointerEvent, f: DesignFieldSpec) => {
    if (tool !== 'select') return; // an armed text tool clicks THROUGH to place
    e.stopPropagation();
    capture(e);
    setSelectedId(f.id);
    const p = designPoint(e);
    drag.current = { kind: 'move', id: f.id, startX: p.x, startY: p.y, origX: f.x, origY: f.y };
  };

  const onResizeDown = (e: React.PointerEvent, f: DesignFieldSpec) => {
    e.stopPropagation();
    capture(e);
    const p = designPoint(e);
    drag.current = { kind: 'resize', id: f.id, startX: p.x, origW: f.width ?? 200 };
  };

  const onStageMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = designPoint(e);
    if (d.kind === 'move') {
      patchField(d.id, { x: Math.round(d.origX + p.x - d.startX), y: Math.round(d.origY + p.y - d.startY) });
    } else if (d.kind === 'draw') {
      const x = Math.min(d.startX, p.x);
      const w = Math.abs(p.x - d.startX);
      d.x = x; d.y = Math.min(d.startY, p.y); d.w = w; d.h = Math.abs(p.y - d.startY);
      setDrawRect({ x, y: d.y, w, h: d.h });
    } else {
      patchField(d.id, { width: Math.max(60, Math.round(d.origW + p.x - d.startX)) });
    }
  };

  const onStageUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'draw') {
      setDrawRect(null);
      // A picture SLOT: a box the operator drops a crest, a headshot or a sponsor mark into.
      // Both dimensions are the user's, because a slot's shape is a design decision the
      // artwork was drawn around — unlike a text box, where only the width means anything.
      if (tool === 'image' && d.w >= 24 && d.h >= 24) {
        const count = fields.filter((f) => f.kind === 'image').length;
        addField({
          title: count === 0 ? 'Logo' : `Image ${count + 1}`,
          text: '',
          x: Math.round(d.x),
          y: Math.round(d.y),
          kind: 'image',
          width: Math.round(d.w),
          height: Math.round(d.h),
          fontId: null,
          fontSize: defaultSize,
          weight: null,
          color: '#ffffff',
          align: 'left',
          lineHeight: null,
          letterSpacing: null,
        });
        return;
      }
      // A real drag becomes an area box; a bare click in area mode does nothing.
      if (tool === 'area' && d.w >= 40) {
        const title = nextTitle(fields.length);
        addField({
          title,
          text: sampleText(title),
          x: Math.round(d.x),
          y: Math.round(d.y),
          kind: 'area',
          width: Math.round(d.w),
          fontId: null,
          fontSize: defaultSize,
          weight: null,
          color: '#ffffff',
          align: 'left',
          lineHeight: null,
          letterSpacing: null,
        });
      }
    }
  };

  const familyOf = (f: DesignFieldSpec) =>
    f.fontId ? `"${FONTS.find((b) => b.id === f.fontId)?.family ?? designFamily}"` : `"${designFamily}"`;

  const anchorTransform = (align: DesignFieldSpec['align']) =>
    align === 'center' ? 'translateX(-50%)' : align === 'right' ? 'translateX(-100%)' : 'none';

  const weights = useMemo(() => [300, 400, 500, 600, 700, 800, 900], []);

  return (
    <div className="place-fields" ref={wrapRef}>
      <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span className="hint" style={{ marginRight: 4 }}>Tool:</span>
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select / move fields" data-testid="tool-select">↖ Select</button>
        <button className={tool === 'text' ? 'active' : ''} onClick={() => setTool('text')} title="Click the artwork to place point text" data-testid="tool-text">T Text</button>
        <button className={tool === 'area' ? 'active' : ''} onClick={() => setTool('area')} title="Drag a box — text wraps inside its width" data-testid="tool-area">⬚ Area text</button>
        <button className={tool === 'image' ? 'active' : ''} onClick={() => setTool('image')} title="Drag a box the operator drops a picture into (a crest, a headshot, a sponsor mark)" data-testid="tool-image">🖼 Image slot</button>
        <button
          onClick={() => void suggest(false)}
          disabled={suggesting || !artworkUrl}
          title="Measure the artwork's empty panel and place Name and Title inside it"
          data-testid="suggest-fields"
        >
          {suggesting ? 'Measuring…' : '✨ Suggest fields'}
        </button>
        <div className="spacer" />
        <span className="hint">{fields.length} field{fields.length === 1 ? '' : 's'}</span>
      </div>
      {suggestNote && (
        <p className="hint" style={{ marginTop: -4, marginBottom: 8 }} data-testid="suggest-note">{suggestNote}</p>
      )}
      {bakedNote && (
        <div className="wz-prep-verdict bad" data-testid="placefields-baked-note">
          <p>
            Baked-in text is still part of the artwork
            {bakedLines !== null && bakedLines > 1 ? ` (${bakedLines} lines of it)` : ''} — it
            cannot be edited on air, and fields placed here will sit on top of it. Erase it on
            the Prepare step, or keep it if it is part of the design.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="primary" data-testid="placefields-baked-back" onClick={onBackToPrepare}>
              ← Erase it on Prepare
            </button>
            <button
              data-testid="placefields-baked-keep"
              onClick={() => onDraft({ designKeepBakedText: true })}
            >
              It's meant to be there
            </button>
          </div>
        </div>
      )}

      {/* Optional, proposal-only AI assistance - renders nothing when the server task is
          off, offline, or before artwork lands. The manual tools above never depend on it. */}
      <AnalyzeProposalPanel art={art} draft={draft} onDraft={onDraft} />

      <div
        ref={stageRef}
        className={`place-stage place-stage-${tool}`}
        style={{ width: stageWidth, height: Math.round(art.height * s) }}
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        data-testid="place-stage"
      >
        <img src={typeof draft.importedImages[0]?.data === 'string' ? draft.importedImages[0].data : undefined} alt="" draggable={false} />
        {fields.map((f) => (
          <div
            key={f.id}
            className={`place-field ${f.id === selectedId ? 'selected' : ''} ${f.kind}`}
            style={{
              left: f.x * s,
              top: f.y * s,
              width: f.kind !== 'point' && f.width ? f.width * s : undefined,
              height: f.kind === 'image' && f.height ? f.height * s : undefined,
              transform: f.kind === 'image' ? 'none' : anchorTransform(f.align),
            }}
            onPointerDown={(e) => onFieldDown(e, f)}
            data-testid={`place-field-${f.title}`}
          >
            {/* An empty slot is drawn as what it IS — a reserved rectangle with its operator
                name in it — which is exactly what the built template shows before a file
                lands in it. */}
            {f.kind === 'image' && <span className="place-field-slot">{f.title}</span>}
            {f.kind !== 'image' && <span
              className="place-field-text"
              style={{
                fontFamily: familyOf(f),
                fontSize: f.fontSize * s,
                fontWeight: f.weight ?? 700,
                color: f.color,
                lineHeight: f.lineHeight ?? undefined,
                letterSpacing: f.letterSpacing !== null ? `${f.letterSpacing * s}px` : undefined,
                whiteSpace: f.kind === 'area' ? 'normal' : 'nowrap',
                textAlign: f.kind === 'area' ? f.align : undefined,
                display: f.kind === 'area' ? 'block' : undefined,
              }}
            >
              {f.text || f.title}
            </span>}
            {f.id === selectedId && f.kind === 'area' && (
              <span className="place-field-resize" onPointerDown={(e) => onResizeDown(e, f)} title="Drag to set the wrap width" />
            )}
          </div>
        ))}
        {drawRect && (
          <div
            className="place-draw"
            style={{
              left: drawRect.x * s,
              top: drawRect.y * s,
              width: drawRect.w * s,
              height: tool === 'image' ? drawRect.h * s : undefined,
            }}
          />
        )}
        {fields.length === 0 && !drawRect && (
          <div className="place-empty hint">
            Click the artwork to place text — drag with ⬚ for a wrapping box, or 🖼 for a
            picture slot.
          </div>
        )}
      </div>

      {fields.length > 1 && (
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {fields.map((f) => (
            <button key={f.id} className={f.id === selectedId ? 'active' : ''} onClick={() => { setSelectedId(f.id); setTool('select'); }}>
              {f.title}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="panel-section place-editor" data-testid="place-editor">
          <div className="row" style={{ gap: 10 }}>
            <label className="save-field grow">
              <span>Field name <span className="muted">(shown to the operator)</span></span>
              <input value={selected.title} onChange={(e) => patchField(selected.id, { title: e.target.value })} data-testid="field-title" />
            </label>
            {/* A picture slot has no preview text: what the operator types is a FILE. */}
            {selected.kind !== 'image' && (
              <label className="save-field grow">
                <span>Preview text</span>
                <input value={selected.text} onChange={(e) => patchField(selected.id, { text: e.target.value })} data-testid="field-text" />
              </label>
            )}
            {selected.kind === 'image' && (
              <>
                <label className="save-field">
                  <span>Slot width</span>
                  <input
                    type="number"
                    min={16}
                    value={selected.width ?? 0}
                    onChange={(e) => patchField(selected.id, { width: Math.max(16, parseInt(e.target.value, 10) || 16) })}
                    style={{ width: 90 }}
                    data-testid="field-slot-width"
                  />
                </label>
                <label className="save-field">
                  <span>Slot height</span>
                  <input
                    type="number"
                    min={16}
                    value={selected.height ?? 0}
                    onChange={(e) => patchField(selected.id, { height: Math.max(16, parseInt(e.target.value, 10) || 16) })}
                    style={{ width: 90 }}
                    data-testid="field-slot-height"
                  />
                </label>
              </>
            )}
            <button onClick={() => removeField(selected.id)} title="Remove this field (Delete)" style={{ alignSelf: 'flex-end' }}>🗑</button>
          </div>

          {selected.kind === 'image' && (
            <p className="hint" style={{ marginTop: 8 }}>
              The operator picks a file for this slot from the control panel; the picture is
              fitted inside the box without being cropped. Nothing is baked into the design.
            </p>
          )}

          {/* CONDITIONAL, never `hidden`: `.row` declares `display: flex`, and an author rule
              setting display beats the attribute's UA rule - the same trap a closed
              `<details>` has here (wizard/AGENTS.md). */}
          {selected.kind !== 'image' && (
          <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="save-field">
              <span>Typeface</span>
              <button onClick={() => setFontOpen(fontOpen === 'field' ? null : 'field')} data-testid="field-font" style={{ fontFamily: familyOf(selected) }}>
                {selected.fontId ? FONTS.find((b) => b.id === selected.fontId)?.family : `Design typeface (${designFamily})`} ▾
              </button>
            </label>
            <label className="save-field">
              <span>Size</span>
              <input
                type="number"
                min={8}
                max={400}
                value={selected.fontSize}
                onChange={(e) => patchField(selected.id, { fontSize: Math.max(4, parseInt(e.target.value, 10) || selected.fontSize) })}
                style={{ width: 76 }}
                data-testid="field-size"
              />
            </label>
            <label className="save-field">
              <span>Weight</span>
              <select
                value={selected.weight ?? ''}
                onChange={(e) => patchField(selected.id, { weight: e.target.value ? parseInt(e.target.value, 10) : null })}
                style={{ width: 96 }}
              >
                <option value="">Auto</option>
                {weights.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label className="save-field">
              <span>Color</span>
              <span className="row" style={{ gap: 4 }}>
                <input
                  type="color"
                  value={/^#([0-9a-f]{6})$/i.test(selected.color) ? selected.color : '#ffffff'}
                  onChange={(e) => patchField(selected.id, { color: e.target.value })}
                  style={{ width: 40, padding: 2 }}
                  data-testid="field-color"
                />
                <input
                  value={selected.color}
                  onChange={(e) => patchField(selected.id, { color: e.target.value })}
                  style={{ width: 90 }}
                />
              </span>
            </label>
            <label className="save-field">
              <span>Align</span>
              <span className="row" style={{ gap: 2 }}>
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} className={selected.align === a ? 'active' : ''} onClick={() => patchField(selected.id, { align: a })} title={a}>
                    {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
                  </button>
                ))}
              </span>
            </label>
            <label className="save-field">
              <span>Line height</span>
              <input
                type="number"
                step={0.05}
                min={0.7}
                max={3}
                value={selected.lineHeight ?? ''}
                placeholder="auto"
                onChange={(e) => patchField(selected.id, { lineHeight: e.target.value ? parseFloat(e.target.value) : null })}
                style={{ width: 76 }}
              />
            </label>
            <label className="save-field">
              <span>Tracking px</span>
              <input
                type="number"
                step={0.5}
                min={-10}
                max={40}
                value={selected.letterSpacing ?? ''}
                placeholder="0"
                onChange={(e) => patchField(selected.id, { letterSpacing: e.target.value ? parseFloat(e.target.value) : null })}
                style={{ width: 76 }}
              />
            </label>
          </div>
          )}

          {fontOpen === 'field' && selected.kind !== 'image' && (
            <div className="place-font-pop">
              <FontPicker
                value={selected.fontId}
                customFont={draft.customFont}
                defaultLabel={`Design typeface (${designFamily})`}
                onPick={(fontId) => { patchField(selected.id, { fontId }); setFontOpen(null); }}
                onCustomFont={(font: CustomFont) => {
                  // An uploaded/installed font becomes the DESIGN default (it ships once,
                  // every fontId:null field renders in it); this field inherits it.
                  onDraft({ fontId: 'custom', customFont: font });
                  patchField(selected.id, { fontId: null });
                  setFontOpen(null);
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="panel-section">
          <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
            <label className="save-field">
              <span>Design typeface <span className="muted">(what every field inherits)</span></span>
              <button onClick={() => setFontOpen(fontOpen === 'design' ? null : 'design')} style={{ fontFamily: `"${designFamily}"` }} data-testid="design-font">
                {designFamily} ▾
              </button>
            </label>
            <p className="hint" style={{ margin: 0 }}>
              Select a field to edit its text, font, size, color, and alignment. You can refine
              everything later in the editor too.
            </p>
          </div>
          {fontOpen === 'design' && (
            <div className="place-font-pop">
              <FontPicker
                value={draft.fontId === 'custom' ? 'custom' : draft.fontId}
                customFont={draft.customFont}
                defaultLabel="Inter (the default)"
                onPick={(fontId) => { onDraft({ fontId }); setFontOpen(null); }}
                onCustomFont={(font: CustomFont) => { onDraft({ fontId: 'custom', customFont: font }); setFontOpen(null); }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
