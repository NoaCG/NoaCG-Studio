import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectBrand } from '../../model/brand';
import { createLook, loadLooks, upsertLook, type SavedLook } from '../../model/packets';
import { commitDurableWrites } from '../../model/durableStore';
import { fileToDataUrl } from '../../assets/assetUtils';
import { importSvgMarkup } from '../../assets/svgImport';
import { slug } from '../../model/slug';
import { CatalogLoading, useCatalog } from '../catalogOnDemand';
import { brandPatch, buildDraftTemplate, initialDraft, mergeDraft } from '../wizard/draft';
import MiniPreview from '../wizard/MiniPreview';
import FontPicker from '../wizard/FontPicker';
import ColorField from '../style/ColorField';
import './brand.css';

/** The form owns a draft only. Saving a brand never changes the open graphic or a production. */
const freshBrand = (): ProjectBrand => ({
  styleTag: 'minimal', fontId: 'inter', customFont: null,
  palette: { id: 'custom', name: 'Brand', styleTags: ['minimal'], accent: '#38bdf8',
    text: '#ffffff', textDim: '#b8c4d6', panel: '#142033' },
});
const COLOURS = [
  ['accent', 'Accent'], ['text', 'Primary text'], ['textDim', 'Secondary text'], ['panel', 'Background'],
] as const;
const PREVIEWS = ['lt01', 'card01', 'bug04'];

export default function BrandEditor({ initial, onSaved, onCancel }: {
  initial?: SavedLook; onSaved: (look: SavedLook) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState<ProjectBrand>(() => initial ? structuredClone(initial.brand) : freshBrand());
  const [previewBrand, setPreviewBrand] = useState(brand);
  // Controls and Save use the current draft; expensive template/iframe work waits for quiet.
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewBrand(brand), 150);
    return () => window.clearTimeout(timer);
  }, [brand]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Retry a refused durable write using the same identity, rather than inserting duplicates.
  const record = useRef(initial);
  const persisted = useRef(initial);
  const logoRequest = useRef(0);
  const catalog = useCatalog();
  const previews = useMemo(() => !catalog ? [] : PREVIEWS.flatMap((id) => {
    const variant = catalog.variantById(id);
    return variant ? [{ name: variant.name,
      template: buildDraftTemplate(variant, mergeDraft(initialDraft(), brandPatch(previewBrand))) }] : [];
  }), [catalog, previewBrand]);

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    const request = ++logoRequest.current;
    setError(null);
    if (file.size > 300 * 1024) {
      setError('Choose a logo smaller than 300 KB so it stays quick to load and export.');
      return;
    }
    if (!/\.(png|svg)$/i.test(file.name)) { setError('Choose a PNG or SVG logo.'); return; }
    setUploading(true);
    try {
      const isSvg = /\.svg$/i.test(file.name);
      // Use the existing SVG importer, so an exported logo cannot retain script/external URLs.
      const safeFile = isSvg
        ? new File([importSvgMarkup(await file.text()).markup], file.name, { type: 'image/svg+xml' })
        : file;
      const data = await fileToDataUrl(safeFile);
      const bitmap = new Image();
      bitmap.src = data;
      await bitmap.decode();
      if (logoRequest.current !== request) return;
      setBrand((current) => ({ ...current, logo: {
        path: `images/${slug(file.name.replace(/\.[^.]+$/, '')) || 'brand-logo'}.${isSvg ? 'svg' : 'png'}`, data,
      } }));
    } catch (cause) {
      if (logoRequest.current === request) setError(cause instanceof Error ? cause.message : 'This logo could not be read.');
    } finally {
      if (logoRequest.current === request) setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim() || saving || uploading) return;
    setSaving(true);
    setError(null);
    try {
      if (COLOURS.some(([key]) => !CSS.supports('color', brand.palette[key]))) {
        setError('Enter a valid colour for each role before saving.');
        return;
      }
      const previous = record.current;
      if (previous) {
        const latest = loadLooks().find((look) => look.id === previous.id);
        if (latest?.id !== persisted.current?.id || latest?.updatedAt !== persisted.current?.updatedAt) {
          setError('This brand changed elsewhere. Cancel and open it again before saving.');
          return;
        }
      }
      const next = previous
        ? { ...previous, name: name.trim(), brand, updatedAt: new Date().toISOString() }
        : createLook(name, brand);
      if (previous) upsertLook(next);
      record.current = next;
      const failure = await commitDurableWrites();
      if (failure) { setError(failure); return; }
      persisted.current = next;
      onSaved(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The brand could not be saved.');
    } finally { setSaving(false); }
  };

  return (
    <section className="brand-editor" data-testid="brand-editor">
      <div className="brand-editor-heading">
        <div><h2>{initial ? 'Edit brand' : 'New brand'}</h2>
          <p className="hint">Create your look once, then choose it for any graphic. Saving here leaves existing graphics unchanged.</p></div>
        <button onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="primary" onClick={() => void save()} disabled={!name.trim() || saving || uploading}>
          {saving ? 'Saving...' : 'Save brand'}
        </button>
      </div>
      {error && <p className="status-bad" role="alert">{error}</p>}
      <div className="brand-editor-grid">
        <div className="brand-editor-controls">
          <label className="brand-field">Brand name
            <input value={name} disabled={saving} onChange={(e) => setName(e.target.value)} placeholder="e.g. Channel A" autoFocus />
          </label>
          <fieldset disabled={saving}>
            <legend>Logo</legend>
            <label className="brand-field">PNG or SVG, up to 300 KB
              <input type="file" accept=".png,.svg" aria-label="Brand logo" disabled={uploading}
                onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {brand.logo && <>
              <div className="brand-logo-backgrounds">
                <div><img src={String(brand.logo.data)} alt="Logo on dark background" /></div>
                <div><img src={String(brand.logo.data)} alt="Logo on light background" /></div>
              </div>
              <button onClick={() => { logoRequest.current++; setUploading(false); setBrand({ ...brand, logo: undefined }); }}>Remove logo</button>
            </>}
            {uploading && <p role="status">Reading logo...</p>}
          </fieldset>
          <fieldset disabled={saving}><legend>Colours</legend>
            {COLOURS.map(([key, label]) => <ColorField key={key} label={label} value={brand.palette[key]}
              testId={`brand-colour-${key}`} onChange={(value) => setBrand({ ...brand, palette: { ...brand.palette, [key]: value } })} />)}
          </fieldset>
          <fieldset disabled={saving}><legend>Typeface</legend>
            <FontPicker value={brand.customFont ? 'custom' : brand.fontId} customFont={brand.customFont}
              onPick={(fontId) => setBrand({ ...brand, fontId, customFont: fontId === 'custom' ? brand.customFont : null })}
              onCustomFont={(customFont) => setBrand((current) => ({ ...current, customFont, fontId: 'custom' }))} />
          </fieldset>
          <label className="brand-field">Notes
            <textarea rows={3} disabled={saving} value={brand.notes ?? ''} onChange={(e) => setBrand({ ...brand, notes: e.target.value })}
              placeholder="How should graphics in this brand look?" />
          </label>
        </div>
        <aside className="brand-editor-previews" aria-label="Brand previews">
          <h3>Your brand in use</h3>
          <p className="hint">Live examples. Logos appear only in designs with a logo slot.</p>
          {!catalog && <CatalogLoading />}
          {previews.map(({ name: title, template }) => <div className="brand-preview-card" key={title}>
            <MiniPreview template={template} /><strong>{title}</strong>
          </div>)}
        </aside>
      </div>
    </section>
  );
}
