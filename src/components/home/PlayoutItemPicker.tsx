import { useEffect, useMemo, useRef, useState } from 'react';
import LibMenu from './LibMenu';
import { slug } from '../../model/slug';
import type { GraphicDoc } from '../../model/library';
import type { PlayoutField } from '../../model/shows';
import type { ListItem } from '../../control/playoutProtocol';
import {
  libraryThumbnail,
  listLibrary,
  loadPlayoutSettings,
  type PlayoutResult,
} from '../../control/playoutLink';

/**
 * "From the playout server…" - the rundown's door into the PLAYOUT SERVER'S OWN LIBRARY
 * (docs/BRIDGE.md §5): the HTML templates and clips already on the CasparCG box, listed
 * through NoaCG Bridge with the server's own TLS and CLS, never from a disk on this machine.
 * Picking one puts an item in the production and a cue on it; the file never travels.
 *
 * The list is fetched when the popover opens and on Refresh, and kept in this component's
 * state only - what is on the server is the server's fact, so nothing here is written to the
 * show record except the one item the operator picks. Thumbnails come one at a time as rows
 * scroll into view (the GraphicThumb pattern), cached in memory by name and timestamp.
 *
 * FOLDERS, NOT PATHS. CasparCG names a file by its path under the media or template folder
 * (`SPORTS/HOCKEY/GOAL_REPLAY`), and a studio's library is deep. Listed flat, those names grew
 * past the popover and pushed every Add button out of sight. So the list is browsed the way a
 * file manager is: the folders at this level first, then the files here by their own name
 * (the full server name on hover), and a path line above to step back out.
 *
 * HONEST WHEN IT CANNOT LIST. The server answers its own version and still cannot list files
 * when its media scanner is not running; that sentence is shown as itself, with a name box
 * under it, so an operator who knows the template's name is never at a dead end.
 */
export default function PlayoutItemPicker({
  open,
  onClose,
  library,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  /** NoaCG's own library: a server template NoaCG exported is matched here, which gives the
   *  cue editor its fields without anyone typing them. */
  library: GraphicDoc[];
  onAdd: (item: { kind: 'template' | 'media'; name: string; frames?: number; fps?: number; fields?: PlayoutField[] }) => void;
}) {
  const [kind, setKind] = useState<'template' | 'media'>('template');
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [result, setResult] = useState<PlayoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState('');
  const [fieldIds, setFieldIds] = useState('f0');
  /** The folder being browsed, as its path segments; [] is the top of the library. */
  const [folder, setFolder] = useState<string[]>([]);

  const refresh = async (which = kind) => {
    setLoading(true);
    setResult(null);
    try {
      const settings = loadPlayoutSettings();
      const r = await listLibrary(settings, which);
      setResult(r.result);
      setItems(r.items ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setFolder([]);
    void refresh(kind);
    // The list is the server's answer for THIS kind; a re-fetch belongs to Refresh or a tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  /** NoaCG-made templates by their export slug: `HOUSE_STRAP/HOUSE_STRAP` on the server was
   *  exported from a graphic whose slug is `house_strap`, and its fields are that graphic's. */
  const bySlug = useMemo(() => {
    const map = new Map<string, GraphicDoc>();
    for (const g of library) map.set(slug(g.name).toLowerCase(), g);
    return map;
  }, [library]);

  const fieldsFor = (name: string): PlayoutField[] | undefined => {
    const leaf = (name.split('/').pop() ?? name).toLowerCase();
    const doc = bySlug.get(leaf) ?? bySlug.get(leaf.replace(/-/g, '_'));
    if (!doc) return undefined;
    return doc.template.fields.map((f) => ({ field: f.field, title: f.title, value: f.value }));
  };

  const typedFields = (): PlayoutField[] =>
    fieldIds
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ field: id, title: id.toUpperCase(), value: '' }));

  const add = (item: ListItem) => {
    if (kind === 'media') onAdd({ kind, name: item.name, frames: item.frames, fps: item.fps });
    else onAdd({ kind, name: item.name, fields: fieldsFor(item.name) ?? typedFields() });
    onClose();
  };

  const addTyped = () => {
    const name = typed.trim();
    if (!name) return;
    if (kind === 'media') onAdd({ kind, name });
    else onAdd({ kind, name, fields: fieldsFor(name) ?? typedFields() });
    setTyped('');
    onClose();
  };

  const cannotList = result && result.state !== 'ok';
  const view = items ? folderView(items, folder) : null;

  return (
    <LibMenu open={open} onClose={onClose} surface="pd-picker" role="none" testid="playout-picker">
      <div className="pd-picker-head">
        <div className="pd-picker-tabs" role="tablist">
          <button role="tab" aria-selected={kind === 'template'} onClick={() => setKind('template')} data-testid="picker-templates">
            Templates
          </button>
          <button role="tab" aria-selected={kind === 'media'} onClick={() => setKind('media')} data-testid="picker-media">
            Media
          </button>
        </div>
        <div className="spacer" />
        <button className="pd-icon" onClick={() => void refresh()} disabled={loading} title="Ask the server again" data-testid="picker-refresh">
          ⟳
        </button>
      </div>

      {loading && !items && (
        <p className="hint" data-testid="picker-loading">
          Asking the playout server…
        </p>
      )}

      {cannotList && (
        <p className="status-bad" data-testid="picker-error" data-state={result.state}>
          {result.detail}
        </p>
      )}

      {items && items.length === 0 && (
        <p className="hint" data-testid="picker-empty">
          The server lists no {kind === 'template' ? 'templates' : 'media'}. Files go in its own
          {kind === 'template' ? ' template' : ' media'} folder, on the server machine.
        </p>
      )}

      {items && items.length > 0 && view && (
        <>
          {/* Where in the library this is, and the way back out. Each crumb is a button, so a
              deep folder is one click from any level above it. */}
          <nav className="pd-picker-path" aria-label="Folder" data-testid="picker-path">
            <button
              className="pd-icon"
              onClick={() => setFolder(folder.slice(0, -1))}
              disabled={folder.length === 0}
              title="Up one folder"
              aria-label="Up one folder"
              data-testid="picker-up"
            >
              ←
            </button>
            <button className="pd-picker-crumb" onClick={() => setFolder([])} aria-current={folder.length === 0 ? 'location' : undefined}>
              {kind === 'template' ? 'All templates' : 'All media'}
            </button>
            {folder.map((part, i) => (
              <span key={i} className="pd-picker-crumb-wrap">
                <span aria-hidden="true">/</span>
                <button
                  className="pd-picker-crumb"
                  onClick={() => setFolder(folder.slice(0, i + 1))}
                  aria-current={i === folder.length - 1 ? 'location' : undefined}
                  title={folder.slice(0, i + 1).join('/')}
                >
                  {part}
                </button>
              </span>
            ))}
          </nav>
          <ul className="pd-picker-list" data-testid="picker-list">
            {view.folders.map((f) => (
              <li key={`dir:${f.name}`} className="pd-picker-row">
                <button
                  className="pd-picker-folder"
                  onClick={() => setFolder([...folder, f.name])}
                  title={[...folder, f.name].join('/')}
                  data-testid="picker-folder"
                  data-name={f.name}
                >
                  <span className="pd-picker-folder-icon" aria-hidden="true">
                    ▸
                  </span>
                  <span className="pd-picker-name">
                    <strong>{f.name}</strong>
                    <span className="muted">
                      folder · {f.count} {f.count === 1 ? 'file' : 'files'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {view.files.map(({ item, leaf }) => (
              <PickerRow
                key={item.name}
                item={item}
                leaf={leaf}
                kind={kind}
                known={kind === 'template' && !!fieldsFor(item.name)}
                onAdd={() => add(item)}
              />
            ))}
          </ul>
        </>
      )}

      {/* The name box: the route that needs no list at all - for a server whose scanner is not
          running, and for an operator who knows the name. */}
      <div className="pd-picker-typed">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTyped();
          }}
          placeholder={kind === 'template' ? 'Or type a template name, e.g. FOLDER/NAME' : 'Or type a clip name'}
          spellCheck={false}
          data-testid="picker-typed"
        />
        {kind === 'template' && (
          <input
            value={fieldIds}
            onChange={(e) => setFieldIds(e.target.value)}
            title="The field ids the template takes, when NoaCG did not make it: f0, f1, ..."
            aria-label="Field ids"
            spellCheck={false}
            data-testid="picker-field-ids"
          />
        )}
        <button onClick={addTyped} disabled={!typed.trim()} data-testid="picker-add-typed">
          ＋ Add
        </button>
      </div>
      <p className="hint pd-picker-foot">
        {kind === 'template'
          ? 'A template NoaCG exported brings its fields with it. For any other template, the field ids are the ones its FIELDS.md or its author names.'
          : 'Clips play on the shared clip layer, below every graphic. No Bridge? The Downloads page has it.'}
      </p>
    </LibMenu>
  );
}

/**
 * One folder of a server library: the subfolders directly inside it (with how many files each
 * holds, all the way down) and the files that sit in it, each with the name it has THERE. The
 * server's names use `/` between folders on every platform (CasparCG normalises Windows
 * paths), and a name is matched case-insensitively because the server upper-cases it on some
 * builds and not others. Folders sort before files, each alphabetically, like a file manager.
 */
export function folderView(
  items: ListItem[],
  folder: string[],
): { folders: { name: string; count: number }[]; files: { item: ListItem; leaf: string }[] } {
  const prefix = folder.map((part) => part.toLowerCase());
  const folders = new Map<string, { name: string; count: number }>();
  const files: { item: ListItem; leaf: string }[] = [];
  for (const item of items) {
    const parts = item.name.split('/').filter(Boolean);
    if (parts.length <= prefix.length) continue;
    if (!prefix.every((part, i) => parts[i].toLowerCase() === part)) continue;
    const rest = parts.slice(prefix.length);
    if (rest.length === 1) {
      files.push({ item, leaf: rest[0] });
      continue;
    }
    const key = rest[0].toLowerCase();
    const entry = folders.get(key) ?? { name: rest[0], count: 0 };
    entry.count += 1;
    folders.set(key, entry);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return {
    folders: [...folders.values()].sort((a, b) => byName(a.name, b.name)),
    files: files.sort((a, b) => byName(a.leaf, b.leaf)),
  };
}

/** The in-memory thumbnail cache: by name and the server's own timestamp, so a re-encoded
 *  clip gets a fresh picture and an unchanged one costs nothing on the next open. */
const thumbs = new Map<string, Promise<string | null>>();

function PickerRow({
  item,
  leaf,
  kind,
  known,
  onAdd,
}: {
  item: ListItem;
  /** The file's own name inside the folder being browsed; the full server name is the hover. */
  leaf: string;
  kind: 'template' | 'media';
  known: boolean;
  onAdd: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [thumb, setThumb] = useState<string | null | undefined>(undefined);

  // A thumbnail is asked for only once the row is on screen: a media folder can hold hundreds
  // of clips, and THUMBNAIL RETRIEVE is about 160 KB each.
  useEffect(() => {
    if (kind !== 'media' || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const key = `${item.name}:${item.changed ?? ''}`;
      let p = thumbs.get(key);
      if (!p) {
        p = libraryThumbnail(loadPlayoutSettings(), item.name);
        thumbs.set(key, p);
      }
      void p.then((url) => setThumb(url));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [item.name, item.changed, kind]);

  const seconds = item.frames && item.fps ? item.frames / item.fps : 0;
  const duration = seconds ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : '';

  return (
    <li ref={ref} className="pd-picker-row" data-testid="picker-row" data-name={item.name}>
      {kind === 'media' && (
        <span className="pd-picker-thumb" aria-hidden="true">
          {thumb ? <img src={thumb} alt="" /> : null}
        </span>
      )}
      <span className="pd-picker-name" title={item.name}>
        <strong>{leaf}</strong>
        <span className="muted">
          {kind === 'template' ? (known ? 'template · fields known from your library' : 'template') : `${item.kind}${duration ? ` · ${duration}` : ''}`}
        </span>
      </span>
      <button onClick={onAdd} title={`Add ${item.name}`} data-testid="picker-add">
        ＋ Add
      </button>
    </li>
  );
}
