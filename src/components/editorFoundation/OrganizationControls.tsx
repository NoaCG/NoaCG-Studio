import { useEffect, useMemo, useState } from 'react';
import { inspectOrganization, readOrganization, type LayerFolder } from '../../model/editorOrganization';
import type { TemplatePart } from '../../model/structure';
import type { OrganizationOperation } from '../../blocks/editorOrganization';
import type { EditorSession, Revision } from './session';
import InlineOrganizationName from './InlineOrganizationName';

type Row = { part: TemplatePart; depth: number } | { folder: LayerFolder; depth: number };
type Draft = { id: string | null; name: string; expected: Revision; members: string[]; parent: string | null };
export function useLayerOrganization(session: EditorSession, parts: TemplatePart[], scope: string | null, selection: string[], select: (selector: string | null, toggle: boolean) => void, pause: () => void) {
  const template = session.port.read();
  const organization = useMemo(() => inspectOrganization(template), [template]);
  const folders = organization.folders.filter(folder => folder.scope === scope);
  const [picked, setPicked] = useState<string | null>(null), [collapsed, setCollapsed] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null), [error, setError] = useState('');
  const selectedFolder = !selection.length ? folders.find(folder => folder.id === picked) : undefined;
  const run = (operation: OrganizationOperation, expected = session.version()) => {
    pause(); session.cancel(); setError('');
    try { session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [operation] }); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
  };
  // Only a new artwork selection reveals its containing folders. Collapsing never clears it.
  useEffect(() => {
    const reveal = new Set<string>();
    for (const selector of selection) {
      let folder = organization.folders.find(folder => folder.members.includes(selector));
      while (folder) { reveal.add(folder.id); folder = organization.folders.find(item => item.id === folder!.parent); }
    }
    setCollapsed(current => current.filter(id => !reveal.has(id)));
  }, [selection, organization]);
  const rows: Row[] = [];
  const append = (parent: string | null, depth: number) => {
    for (const folder of folders.filter(folder => folder.parent === parent)) {
      rows.push({ folder, depth });
      if (!collapsed.includes(folder.id)) {
        append(folder.id, depth + 1);
        parts.filter(part => folder.members.includes(part.selector) && part.selector !== scope).forEach(part => rows.push({ part, depth: depth + 1 }));
      }
    }
  };
  parts.filter(part => part.selector === scope).forEach(part => rows.push({ part, depth: 0 }));
  append(null, 0);
  parts.filter(part => part.selector !== scope && !folders.some(folder => folder.members.includes(part.selector))).forEach(part => rows.push({ part, depth: 0 }));
  const begin = (folder?: LayerFolder) => {
    pause(); session.cancel(); setError('');
    setDraft({ id: folder?.id ?? null, name: folder?.name ?? '', expected: session.version(), members: [...selection], parent: selectedFolder?.id ?? null });
  };
  const nameInput = (current: Draft) => <InlineOrganizationName key={current.id ?? 'new'} name={current.name} label="Folder name" cancel={() => setDraft(null)} commit={name => {
    const operation: OrganizationOperation = current.id ? { kind: 'folder.rename', id: current.id, name }
      : { kind: 'folder.create', name, scope, members: current.members, parent: current.parent };
    setDraft(null);
    if (run(operation, current.expected) && !current.id) {
      const folders = readOrganization(session.port.read()).folders;
      setPicked(folders[folders.length - 1].id);
    }
  }} />;
  const controls = <div className="ef-organization-controls" aria-label="Layer organization">
    <button aria-label="New layer folder" disabled={!!organization.reason} onClick={() => begin()}>+ Folder</button>
    {draft?.id === null && nameInput(draft)}
    <select aria-label="Move to layer folder" value="" disabled={!!organization.reason || (!selectedFolder && !selection.length)} onChange={event => {
      if (event.target.value) run({ kind: 'folder.move', members: selectedFolder ? [selectedFolder.id] : selection, folder: event.target.value === '__root__' ? null : event.target.value });
    }}><option value="">Move to folder…</option><option value="__root__">Loose layers</option>{folders.filter(folder => folder.id !== selectedFolder?.id).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
    {selectedFolder && <>
      <button aria-label="Rename layer folder" onClick={() => begin(selectedFolder)}>Rename</button>
      <button aria-label="Move folder up" onClick={() => run({ kind: 'folder.reorder', id: selectedFolder.id, direction: 'up' })}>↑</button>
      <button aria-label="Move folder down" onClick={() => run({ kind: 'folder.reorder', id: selectedFolder.id, direction: 'down' })}>↓</button>
      <button aria-label="Remove layer folder" title="Release the contents; keep all artwork" onClick={() => { if (run({ kind: 'folder.remove', id: selectedFolder.id })) setPicked(null); }}>Remove folder</button>
    </>}
    {(error || organization.reason) && <span role="alert" className="ef-organization-error">{error || organization.reason}</span>}
  </div>;
  const folderRow = (folder: LayerFolder, depth: number) => <div key={folder.id} className={'ef-track ef-folder-row' + (selectedFolder?.id === folder.id ? ' is-selected' : '')} data-folder={folder.id} data-depth={depth}>
    <div className="ef-layer-cell" style={{ paddingInlineStart: depth * 12 }}>
      <button className="ef-twirl" aria-label={(collapsed.includes(folder.id) ? 'Expand' : 'Collapse') + ' folder ' + folder.name} aria-expanded={!collapsed.includes(folder.id)} onClick={() => setCollapsed(current => current.includes(folder.id) ? current.filter(id => id !== folder.id) : [...current, folder.id])}>{collapsed.includes(folder.id) ? '▸' : '▾'}</button>
      {draft?.id === folder.id ? nameInput(draft) : <button className="ef-layer" aria-label={'Folder ' + folder.name} aria-pressed={selectedFolder?.id === folder.id} onClick={() => { setPicked(folder.id); select(null, false); }} onDoubleClick={() => begin(folder)} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); begin(folder); }
      }}><span className="ef-layer-icon">▱</span><span>{folder.name}</span><small>Folder</small></button>}
    </div><div className="ef-folder-description">Organization only · {folder.members.length} {folder.members.length === 1 ? 'layer' : 'layers'}</div>
  </div>;
  return { rows, controls, folderRow };
}
