import './projects.css';
import { useMemo, useState } from 'react';
import { createAuthoringBlankTemplate } from '../../templates/blank';
import MiniPreview from '../wizard/MiniPreview';
import { PACKS } from '../../templates/packs';
import { kitItems, kitSelection } from '../../templates/kit';
import { initialDraft, brandPatch, mergeDraft, buildDraftTemplate } from '../wizard/draft';
import { typeById } from '../../templates/types/registry';
import { CATEGORIES, paletteById } from '../../model/wizard';
import { loadLooks } from '../../model/packets';
import { applyDocumentBrand } from '../../model/brandApplication';
import { createAuthoringProject, useAuthoringProjects } from '../../store/authoringProjects';
import { useSaveUi } from '../../store/saveActions';
import { openNewEditor } from './openNewEditor';
import BrandEditor from '../brand/BrandEditor';
import { useModalGate } from '../spaceKey';

export default function ProjectStarter({ close }: { close: () => void }) {
  useModalGate();
  const [packId, setPackId] = useState(''), [name, setName] = useState('');
  const pack = PACKS.find(p => p.id === packId);
  const items = useMemo(() => pack ? kitItems(pack) : [], [pack]);
  const [selected, setSelected] = useState<string[]>([]);
  const [brand, setBrand] = useState(''), [editingBrand, setEditingBrand] = useState(false);
  const [looks, setLooks] = useState(loadLooks);
  const busy = useAuthoringProjects(s => s.busy), error = useAuthoringProjects(s => s.error);
  const create = () => {
    const look = looks.find(l => l.id === brand);
    const templates = pack ? kitSelection(pack, selected).map(({ variant }) => {
      const paletteId = pack.paletteId && paletteById(pack.paletteId).styleTags.includes(variant.styleTag) ? pack.paletteId : null;
      const draft = mergeDraft(initialDraft(), { category: variant.category, variantId: variant.id,
        lines: variant.suggestedLines.map(line => ({ ...line })), paletteId, ...(look ? brandPatch(look.brand) : {}) });
      return buildDraftTemplate(variant, draft);
    }) : [createAuthoringBlankTemplate()];
    useSaveUi.getState().requestSwitch(() => {
      void createAuthoringProject(name.trim() || pack?.name || 'Untitled project', look ? templates.map(t => applyDocumentBrand(t, look)) : templates).then(ok => {
        if (ok) { close(); openNewEditor(); }
      });
    });
  };
  return <div className="gallery-backdrop"><section className="wz-modal project-starter" role="dialog" aria-modal="true" aria-label="New project" data-testid="project-starter">
    <header className="wz-header"><h2>New project</h2><button className="gallery-close" onClick={close} aria-label="Close new project">×</button></header>
    <div className="project-starter-body">
      {editingBrand ? <BrandEditor onCancel={() => setEditingBrand(false)} onSaved={look => { setLooks(loadLooks()); setBrand(look.id); setEditingBrand(false); }} /> : <>
        <label className="dlg-row">Project name<input aria-label="Project name" placeholder={pack?.name ?? 'Untitled project'} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="dlg-row">Starter collection<select aria-label="Starter collection" value={packId} onChange={e => { const next = PACKS.find(p => p.id === e.target.value); setPackId(next?.id ?? ''); setSelected(next?.starter.slice(0, 3) ?? []); }}>
          <option value="">Blank project</option>{PACKS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        {pack && <p className="hint">{pack.description}</p>}
        <div className="project-starter-list">{items.map(item => <label className="dlg-check" key={item.key}>
          <input type="checkbox" checked={selected.includes(item.key)} onChange={e => setSelected(e.target.checked ? [...selected, item.key] : selected.filter(k => k !== item.key))} />
          <span><span aria-hidden="true"><MiniPreview variant={item.variant} /></span><strong>{typeById(item.typeId ?? '')?.name ?? CATEGORIES.find(c => c.id === item.variant.category)?.name}</strong><small>{item.variant.name}</small></span>
        </label>)}</div>
        <label className="dlg-row">Brand<select aria-label="Project brand" value={brand} onChange={e => setBrand(e.target.value)}><option value="">None</option>{looks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button onClick={() => setEditingBrand(true)}>New brand</button>
        {error && <p role="alert">{error}</p>}
      </>}
    </div>
    {!editingBrand && <footer className="dlg-foot"><button onClick={close} disabled={busy}>Cancel</button><button onClick={create} disabled={busy || !!pack && !selected.length}>{busy ? 'Saving…' : pack ? `Create project · ${selected.length}` : 'Create blank project'}</button></footer>}
  </section></div>;
}
