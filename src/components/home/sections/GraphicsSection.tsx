import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from '../../../app/router';
import {
  deleteGraphics,
  graphicFolders,
  setGraphicsFolder,
  type GraphicDoc,
} from '../../../model/library';
import { createShowNamedChecked, productionsContaining, type Show } from '../../../model/shows';
import { addReadyGraphicToShow as addGraphicToShow } from '../../../control/productionAdmission';
import { raiseStorageAlert } from '../../../store/storageAlert';
import { loadPrefs, savePrefs } from '../../../model/prefs';
import { commitDurableWrites } from '../../../model/durableStore';
import { graphicKindLabel, type TemplateType } from '../../../model/types';
import FolderItem from '../FolderItem';
import GraphicRow from '../GraphicRow';
import LibMenu from '../LibMenu';
import ProductionPicker from '../ProductionPicker';
import RowMenu, { type RowMenuItem } from '../RowMenu';
import { IconFolder, IconGrid, IconList, IconPencil, IconTrash } from '../../icons';

type SortKey = 'newest' | 'oldest' | 'name';

/** Plurals the rule below gets wrong. Everything else pluralises the shared kind word, so a
 *  new TemplateType needs no entry here — and one that reads badly gets a line, not a registry. */
const TYPE_PLURAL: Partial<Record<TemplateType, string>> = {
  quiz: 'Quizzes',
  'public-info': 'Public info',
  'starting-soon': 'Holding screens',
  'imported-design': 'Imported',
  blank: 'Custom',
};

/** The filter chip's word: the SAME kind vocabulary the rows show (model/types.ts
 *  graphicKindLabel), pluralised — a chip saying "Countdowns" over rows saying "Timer"
 *  would be two words for one kind on one screen. */
function typeLabel(type: TemplateType): string {
  const named = TYPE_PLURAL[type];
  if (named) return named;
  const label = graphicKindLabel(type);
  const last = label.split(' ').pop() ?? label;
  if (/(s|x|ch|sh)$/.test(last)) return last.endsWith('s') ? label : `${label}es`;
  return `${label}s`;
}

/**
 * The full Graphics section (docs/SAVED_CONTENT_MODEL.md §6): the library with the organisation
 * tools the dashboard's shelf deliberately does not carry —
 *
 * - ONE HEADER ROW (re-design/handoff.md §5b): title, search, sort, view toggle; then the
 *   TYPE chips, derived from the library so only types someone has appear.
 * - FOLDERS GROUP THE VIEW (owner walk 2026-08-23). Folders come first, then the graphics
 *   filed in none of them; opening a folder shows its contents alone. Until that walk the
 *   folders were a CHIP ROW over a flat list of everything, which the owner overruled after
 *   the first real bulk use — "no point with a folder if I see all the graphics as a list".
 *   They are still the light sorting layer, deliberately not the retired packages: no export
 *   unit, no embedded copies, and a folder is only a name on its graphics.
 * - A SEARCH FLATTENS IT. Typing a name is a question about the whole library, and answering
 *   it with the unfiled graphics alone would be a lie by omission.
 * - MULTI-SELECT: pip + shift-click range over the VISIBLE order, with one bulk bar
 *   (delete, move to folder, add to production, new production from selection). Selection is
 *   UI state over ids; every mutation goes through the model layer's bulk helpers so N rows
 *   cost one storage write.
 */
export default function GraphicsSection({
  graphics,
  productions,
  productionsByGraphic,
  productionCounts,
  query,
  onQuery,
  productionFilter,
  onProductionFilter,
  onOpen,
  onChanged,
  onPublish,
}: {
  /** Already search-filtered by HomePage — this section applies type, folder and sort on top. */
  graphics: GraphicDoc[];
  /** Live, non-tombstoned productions from HomePage's single model read. */
  productions: Show[];
  /** The one reverse relation used by filtering, counts and row pills. */
  productionsByGraphic: Map<string, { id: string; name: string }[]>;
  /** What each option of the production filter would list. Counted in HomePage, which is the
   *  only place that still holds the SEARCH-filtered set before this section's own filter has
   *  been applied - counting here would count what the filter already narrowed. */
  productionCounts: { counts: Map<string, number>; unassigned: number };
  /** The search box lives in this section's header row, but the query filters in HomePage
   *  (the dashboard searches with the same one), so it arrives as a controlled value. */
  query: string;
  onQuery: (next: string) => void;
  productionFilter: string | null;
  onProductionFilter: (next: string | null) => void;
  onOpen: (g: GraphicDoc) => void;
  onChanged: () => void;
  onPublish?: (g: GraphicDoc) => void;
}) {
  const navigate = useRouter((s) => s.navigate);
  // Cards or table. Device-level and remembered (model/prefs.ts) — which one is right
  // depends on the library's size and the screen, so it is a setting, not a session state.
  const [view, setViewState] = useState<'grid' | 'list'>(() => loadPrefs().libraryView);
  const setView = (next: 'grid' | 'list') => {
    setViewState(next);
    savePrefs({ libraryView: next });
  };
  /** null = the ROOT level (folders, then the unfiled graphics); a name = inside that folder.
   *  Not a filter chip any more: a folder is a place you are IN, and the way out is the
   *  breadcrumb rather than a second press on the thing you opened. */
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  /** null = every type. The chips are DERIVED from the library, so only types someone
   *  actually has appear - a fixed strip would offer 24 filters, most of them empty. */
  const [typeFilter, setTypeFilter] = useState<TemplateType | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  /** A search is a question about the WHOLE library, so it dissolves the grouping for as long
   *  as it stands — otherwise the answer to "where is Strap B" is "not here" whenever Strap B
   *  happens to be filed. */
  const searching = query.trim().length > 0;
  /** A production filter asks the same kind of question a search does - "which graphics are in
   *  the Friday show", not "which of these unfiled ones" - so it dissolves the folder grouping
   *  for exactly as long as it stands, and every row then says which folder it came from. */
  const flat = searching || productionFilter !== null;
  const types = useMemo(() => {
    const counts = new Map<TemplateType, number>();
    for (const g of graphics) counts.set(g.type, (counts.get(g.type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || typeLabel(a[0]).localeCompare(typeLabel(b[0])));
  }, [graphics]);
  // A TYPE CHIP CANNOT OUTLIVE ITS OWN STRIP. The chips are derived from what is left after the
  // search and the production filter, so narrowing to a production of lower thirds while the
  // Tickers chip stands drops that chip off the screen - and the strip itself disappears at one
  // type - while the filter goes on excluding everything. The list then renders nothing with no
  // control on screen able to say why, which reads as "this production is empty". Let it go: a
  // filter the user cannot see is a filter the user cannot undo.
  useEffect(() => {
    if (typeFilter && !types.some(([type]) => type === typeFilter)) setTypeFilter(null);
  }, [typeFilter, types]);
  // `graphics` is the refresh signal, not an input: graphicFolders() reads the model layer
  // fresh, and the prop changing is what says the library changed (HomePage's rev idiom).
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  const folders = useMemo(() => graphicFolders(), [graphics]);
  /** Everything the TYPE chips leave standing. Both the folder counts and the list read this
   *  one set, so a folder can never advertise more graphics than opening it shows. */
  const typed = useMemo(
    () => (typeFilter ? graphics.filter((g) => g.type === typeFilter) : graphics),
    [graphics, typeFilter],
  );
  /** What the item area lists: the current folder's graphics, or — at the root — only the
   *  graphics in no folder, because the folders themselves are listed above them. A search
   *  overrides both and lists every match. */
  const listed = useMemo(() => {
    let out = typed;
    if (!flat) {
      out = folderFilter === null ? out.filter((g) => !g.folder) : out.filter((g) => g.folder === folderFilter);
    }
    const by: Record<SortKey, (a: GraphicDoc, b: GraphicDoc) => number> = {
      newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      oldest: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...out].sort(by[sort]);
  }, [typed, flat, folderFilter, sort]);

  // A folder the user has NAMED but not filled yet. Folders are a name on their graphics, so
  // an empty one has nothing to persist; it lives here until something lands in it (the same
  // ephemeral-empty-folder rule the Assets panel follows) and is gone on reload.
  const [draftFolders, setDraftFolders] = useState<string[]>([]);
  const countIn = (folder: string) => typed.filter((g) => g.folder === folder).length;
  const allFolders = useMemo(() => {
    const names = [...new Set([...folders, ...draftFolders])].sort((a, b) => a.localeCompare(b));
    // With a type chip standing, a folder holding none of that type is not a place to go —
    // the same "derived from what is actually there" rule the chips themselves follow. With no
    // chip standing, every folder shows, including a just-named empty one.
    return typeFilter ? names.filter((f) => typed.some((g) => g.folder === f)) : names;
  }, [folders, draftFolders, typeFilter, typed]);

  // ── Selection: ids + the last toggled index, for shift ranges over the visible order. ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastIndex = useRef<number | null>(null);
  const selectedListed = listed.filter((g) => selected.has(g.id));
  const clearSelection = () => {
    setSelected(new Set());
    lastIndex.current = null;
  };
  const openFolder = (folder: string | null) => {
    setFolderFilter(folder);
    clearSelection();
  };
  // Emptying the folder you are standing in (unfile the lot, drag them elsewhere) would
  // otherwise leave the view inside a place that no longer exists, with a count of zero and no
  // way to tell that from an ordinary empty folder. Walk back out to the root.
  // It reads the model FRESH rather than `allFolders`: that memo is keyed on the `graphics`
  // prop, which lags a synchronous mirror write by one render (model/durableStore.ts), so for
  // that render a folder RENAMED from inside itself does not exist by the memo's reckoning and
  // this guard would walk the user out of the folder they had just named. The read costs what
  // the memo costs, because the effect runs on the same signal — `graphics` is that signal
  // (HomePage's rev idiom), not an input the body reads.
  useEffect(() => {
    if (folderFilter === null) return;
    const live = graphicFolders();
    if (!live.includes(folderFilter) && !draftFolders.includes(folderFilter)) setFolderFilter(null);
  }, [folderFilter, draftFolders, graphics]);
  const toggle = (index: number, shiftKey: boolean) => {
    // Read the anchor BEFORE scheduling: the state updater runs after this function has
    // already advanced lastIndex to the clicked row, so reading the ref inside it compared
    // the click against itself and every shift-range degraded to a plain toggle.
    const anchor = lastIndex.current;
    lastIndex.current = index;
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor !== null && anchor !== index) {
        // Range = anchor..index over the list as displayed; the anchor's current state
        // decides whether the range selects or clears (the convention file managers use).
        const adding = next.has(listed[anchor]?.id ?? '');
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = from; i <= to; i++) {
          const id = listed[i]?.id;
          if (!id) continue;
          if (adding) next.add(id);
          else next.delete(id);
        }
      } else {
        const id = listed[index]?.id;
        if (id) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
      }
      return next;
    });
  };

  // ── Bulk actions (each closes its popover; the model layer announces the change). ──
  const [note, setNote] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [prodOpen, setProdOpen] = useState(false);

  const ids = () => selectedListed.map((g) => g.id);

  const doDelete = () => {
    const inProductions = selectedListed.filter((g) => productionsContaining(g.id).length > 0).length;
    deleteGraphics(ids());
    setNote(
      `✓ Deleted ${selectedListed.length} graphic${selectedListed.length === 1 ? '' : 's'}.` +
        (inProductions
          ? ` ${inProductions} of them were in productions — those keep their own embedded copy and stay operable.`
          : ''),
    );
    setDeleteArmed(false);
    clearSelection();
    onChanged();
  };

  /** Every folder write goes through here. The durable store ACCEPTS a write and confirms it a
   *  moment later (model/durableStore.ts), so the synchronous answer means accepted, not
   *  landed — and each of these verbs then tells the user what happened. */
  const claim = async (action: string, written: string | null, ok: string) => {
    const error = written ?? (await commitDurableWrites());
    if (error) raiseStorageAlert({ action, error, outcome: 'Your graphics are unchanged in the library.' });
    else setNote(ok);
    onChanged();
  };

  const moveTo = async (folder: string | undefined) => {
    const count = selectedListed.length;
    const written = setGraphicsFolder(ids(), folder);
    setFolderOpen(false);
    setNewFolder('');
    clearSelection();
    await claim(
      `Moving ${count} graphics to ${folder ? `“${folder}”` : 'Unfiled'}`,
      written,
      `✓ Moved ${count} to ${folder ? `"${folder}"` : 'Unfiled'}.`,
    );
  };

  // ── The FOLDERS band's own verbs. Every one of them is setGraphicsFolder over the folder's
  //    members — there is no folder record to rename, delete, or orphan. ──
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Which folder's "+ Production" picker is open — one at a time, so two menus can never
   *  stand over each other on a band of eight folders. */
  const [folderProdOpen, setFolderProdOpen] = useState<string | null>(null);

  const idsIn = (folder: string) => graphics.filter((g) => g.folder === folder).map((g) => g.id);

  const commitFolderRename = async (from: string) => {
    const to = folderName.trim();
    setRenamingFolder(null);
    if (!to || to === from) return;
    const written = setGraphicsFolder(idsIn(from), to);
    setDraftFolders((d) => d.map((f) => (f === from ? to : f)));
    if (folderFilter === from) setFolderFilter(to);
    await claim(`Renaming the folder “${from}”`, written, `✓ Renamed "${from}" to "${to}".`);
  };

  const removeFolder = async (folder: string) => {
    const written = setGraphicsFolder(idsIn(folder), undefined);
    setDraftFolders((d) => d.filter((f) => f !== folder));
    if (folderFilter === folder) setFolderFilter(null);
    await claim(
      `Removing the folder “${folder}”`,
      written,
      `✓ Removed the folder "${folder}". Its graphics are unfiled, not deleted.`,
    );
  };

  const commitNewFolder = () => {
    const name = newFolder.trim();
    setNewFolderOpen(false);
    setNewFolder('');
    if (!name) return;
    // With a selection standing, naming a folder is the same gesture as filing into it.
    if (selectedListed.length > 0) void moveTo(name);
    else setDraftFolders((d) => (d.includes(name) ? d : [...d, name]));
  };

  /** A graphic dropped on a folder. Dropping one that is part of the standing selection moves
   *  the WHOLE selection - dragging one of six ticked rows means all six, the way a file
   *  manager does it - and dropping an unticked one moves just that graphic. */
  const dropInto = async (e: DragEvent, folder: string) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData('application/x-noacg-graphic');
    if (!id) return;
    const moving = selected.has(id) ? ids() : [id];
    const written = setGraphicsFolder(moving, folder);
    clearSelection();
    await claim(
      `Moving ${moving.length} graphics to “${folder}”`,
      written,
      `✓ Moved ${moving.length} to "${folder}".`,
    );
  };

  const folderMenu = (folder: string): RowMenuItem[] => [
    {
      label: 'Rename',
      icon: <IconPencil />,
      onClick: () => { setFolderName(folder); setRenamingFolder(folder); },
      testid: 'rename-folder',
    },
    {
      label: 'Remove folder',
      icon: <IconTrash />,
      onClick: () => void removeFolder(folder),
      testid: 'remove-folder',
    },
  ];

  /** Pool every graphic of a list, stopping at the FIRST failure and saying how far it got - a
   *  bulk add that reported "✓ Added 12" after storing three would be worse than the silence it
   *  replaces. Returns how many actually landed. */
  const poolAll = async (showId: string, showName: string, list: GraphicDoc[]): Promise<number> => {
    let added = 0;
    for (const g of list) {
      const { error: written } = addGraphicToShow(showId, g.template, { graphicId: g.id });
      // Confirmed per graphic (model/durableStore.ts's claim protocol): "stop at the first
      // failure and say how far it got" only means anything if each add is actually known to
      // have landed before the next one is attempted.
      const error = written ?? (await commitDurableWrites());
      if (error) {
        raiseStorageAlert({
          action: `Adding ${list.length} graphics to “${showName}”`,
          error,
          outcome:
            added === 0
              ? 'Nothing was added. Your graphics are unchanged in the library.'
              : `${added} of ${list.length} were added before storage ran out; the rest are unchanged in your library.`,
        });
        return added;
      }
      added += 1;
    }
    return added;
  };

  /** THE pooling verb for both doors that carry a set: the bulk bar's selection and a folder
   *  taken whole. Same partial-failure report either way — the honesty of the report is the
   *  part that must not fork. Answers whether the WHOLE set landed, which is what tells the
   *  picker whether to close and confirm. */
  const addListTo = async (showId: string, showName: string, list: GraphicDoc[]): Promise<boolean> => {
    const added = await poolAll(showId, showName, list);
    if (added === list.length) setNote(`✓ Added ${added} to "${showName}".`);
    onChanged();
    return added === list.length;
  };

  const addSelectionTo = async (showId: string, showName: string): Promise<boolean> => {
    const landed = await addListTo(showId, showName, selectedListed);
    if (landed) clearSelection();
    return landed;
  };

  const createProductionFrom = async (list: GraphicDoc[], name: string): Promise<boolean> => {
    const { show, error: written } = createShowNamedChecked(name);
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Creating the production “${show.name}”`,
        error,
        outcome: 'Your graphics are unchanged in the library.',
      });
      return false;
    }
    // The kit flow's primitive: one production, every graphic pooled in list order.
    const added = await poolAll(show.id, show.name, list);
    onChanged();
    if (added > 0) navigate({ view: 'production', id: show.id });
    return added > 0;
  };

  /** Every graphic of a folder, ignoring which level the view is standing on — the folder's
   *  "+ Production" means the folder, and it counts what its own label counts. */
  const graphicsIn = (folder: string) => typed.filter((g) => g.folder === folder);

  const showFolders = !flat && folderFilter === null;

  return (
    <>
      {/* ONE header row (re-design/handoff.md §5b): what this is, what to find in it, how to
          order it, how to look at it. GRID or LIST swaps only the item container — chrome,
          selection, folders and the bulk bar are identical either way, which is what keeps
          this a view preference rather than a second screen. */}
      <div className="lib-viewbar">
        <h2><IconGrid size={18} /> Graphics <span className="muted">({graphics.length})</span></h2>
        <input
          className="lib-search"
          placeholder="Search graphics…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          data-testid="home-search"
        />
        <div className="spacer" />
        {productions.length > 0 && (
          <label className="lib-prodfilter">
            Production
            <select
              value={productionFilter ?? ''}
              onChange={(e) => {
                onProductionFilter(e.target.value || null);
                clearSelection();
              }}
              data-testid="library-production"
            >
              <option value="">All productions</option>
              {productions.map((production) => (
                <option key={production.id} value={production.id}>
                  {production.name} ({productionCounts.counts.get(production.id) ?? 0})
                </option>
              ))}
              <option value="none">Not in a production ({productionCounts.unassigned})</option>
            </select>
          </label>
        )}
        <label className="lib-sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="library-sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <div className="lib-viewtoggle" role="group" aria-label="Library view">
          <button
            className={view === 'grid' ? 'active' : ''}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            title="Cards"
            data-testid="library-view-grid"
          >
            <IconGrid />
          </button>
          <button
            className={view === 'list' ? 'active' : ''}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            title="List"
            data-testid="library-view-list"
          >
            <IconList />
          </button>
        </div>
      </div>

      {/* TYPE chips, derived from the library. One type is no filter at all, so they appear
          from two — a strip reading "All 6 · Lower thirds 6" narrows nothing and costs a row. */}
      {types.length > 1 && (
        <div className="lib-typechips" data-testid="type-chips">
          <button
            className={`lib-type-chip${typeFilter === null ? ' active' : ''}`}
            onClick={() => { setTypeFilter(null); clearSelection(); }}
            data-testid="type-chip-all"
          >
            All <span className="lib-chip-count">{graphics.length}</span>
          </button>
          {types.map(([type, count]) => (
            <button
              key={type}
              className={`lib-type-chip${typeFilter === type ? ' active' : ''}`}
              onClick={() => { setTypeFilter(typeFilter === type ? null : type); clearSelection(); }}
              data-testid={`type-chip-${type}`}
            >
              {typeLabel(type)} <span className="lib-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* THE FOLDERS BAND (owner walk 2026-08-23). Folders come FIRST and the graphics filed in
          none of them follow, in both views — as a chip row over a flat list of everything, a
          folder organised nothing you could see. The band stands whether or not a folder exists
          yet: the dashed item IS how the first one is made, and hiding it until one exists
          leaves the feature reachable only from a bulk-bar menu that needs a selection first.
          It stands down on an empty library, where there is nothing to file. */}
      {showFolders && graphics.length > 0 && (
        <>
          <div className="lib-band-head">
            <h3>Folders</h3>
            <span className="hint">drag graphics here, or select them and use Folder</span>
          </div>
          <div className={`lib-folder-items lib-folder-items--${view}`} data-testid="folder-items">
            {allFolders.map((f) => (
              <FolderItem
                key={f}
                folder={f}
                count={countIn(f)}
                view={view}
                dropping={dropTarget === f}
                onOpen={() => openFolder(f)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(f); }}
                onDragLeave={() => setDropTarget((t) => (t === f ? null : t))}
                onDrop={(e) => void dropInto(e, f)}
                renaming={renamingFolder === f}
                renameValue={folderName}
                onRenameChange={setFolderName}
                onRenameCommit={() => void commitFolderRename(f)}
                onRenameCancel={() => setRenamingFolder(null)}
                menu={folderMenu(f)}
                pickerOpen={folderProdOpen === f}
                onPickerOpenChange={(next) => setFolderProdOpen(next ? f : null)}
                onAddToProduction={(showId, showName) => addListTo(showId, showName, graphicsIn(f))}
                onCreateProduction={(name) => createProductionFrom(graphicsIn(f), name)}
              />
            ))}
            {/* The dashed item. A folder is only a NAME on its graphics (model/library.ts), so
                a brand-new one has no record to write yet — it lives here until something is
                moved into it, exactly as an empty asset folder does in the Assets panel. */}
            <div className={`lib-folder-item lib-folder-item--${view} lib-folder-new`} data-testid="new-folder-card">
              {newFolderOpen ? (
                <input
                  autoFocus
                  value={newFolder}
                  placeholder="Folder name…"
                  onChange={(e) => setNewFolder(e.target.value)}
                  onBlur={() => commitNewFolder()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNewFolder();
                    if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolder(''); }
                  }}
                  data-testid="new-folder-name"
                />
              ) : (
                <button className="link-inline" onClick={() => setNewFolderOpen(true)} data-testid="new-folder">
                  + New folder
                </button>
              )}
            </div>
          </div>
          {/* The second band names itself only once there is a first one to tell it apart
              from. With no folder yet the graphics below ARE the library, and a heading
              saying so costs a band of the fold to repeat the title above it (§5b). */}
          {allFolders.length > 0 && (
            <div className="lib-band-head">
              <h3>Not in a folder</h3>
              <span className="hint">{listed.length} graphic{listed.length === 1 ? '' : 's'}</span>
            </div>
          )}
        </>
      )}

      {/* INSIDE a folder: the way back, what you are in, and the whole folder in one press.
          It carries the folder's OWN verbs too — the band is not on screen at this level, and
          rename/remove reachable only by walking back out is a dead end you have to already
          know the shape of. */}
      {folderFilter !== null && !flat && (
        <div className="lib-folder-head" data-testid="folder-head">
          <button className="link-inline" onClick={() => openFolder(null)} data-testid="folder-back">
            ← All graphics
          </button>
          <span className="lib-folder-crumb">
            <IconFolder />
            {renamingFolder === folderFilter ? (
              <input
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onBlur={() => void commitFolderRename(folderFilter)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitFolderRename(folderFilter);
                  if (e.key === 'Escape') setRenamingFolder(null);
                }}
                data-testid="folder-rename-input"
              />
            ) : (
              <strong>{folderFilter}</strong>
            )}
          </span>
          <span className="muted">
            {listed.length} graphic{listed.length === 1 ? '' : 's'}
          </span>
          <div className="spacer" />
          <ProductionPicker
            open={folderProdOpen === folderFilter}
            onOpenChange={(next) => setFolderProdOpen(next ? folderFilter : null)}
            buttonTitle={`Add every graphic of "${folderFilter}" to a production`}
            buttonTestid="folder-to-production"
            menuTestid="folder-production-menu"
            newNameTestid="folder-new-production-name"
            newSubmitTestid="folder-new-production"
            onAdd={(showId, showName) => addListTo(showId, showName, listed)}
            onCreate={(name) => createProductionFrom(listed, name)}
          />
          <RowMenu items={folderMenu(folderFilter)} label={`More actions for ${folderFilter}`} />
        </div>
      )}

      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="bulk-note">{note}</p>}

      {/* Clicking the empty space around the items clears the selection — the third gesture
          of the selection model, and the one that makes the other two safe to try. */}
      <div
        className={
          view === 'grid'
            ? 'lib-grid'
            : `lib-list${flat ? '' : ' lib-list--nofolder'}${productions.length > 0 ? '' : ' lib-list--noprod'}`
        }
        onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}
      >
        {/* The table's column headings (re-design/handoff.md §5c). Decorative: this is a grid
            of divs, not a <table>, so a header row conveys nothing to a screen reader that the
            cells do not already say — every cell carries its own testid and readable text. */}
        {view === 'list' && listed.length > 0 && (
          <div className="lib-thead" aria-hidden="true" data-testid="library-thead">
            <span>Preview</span>
            <span>Name</span>
            <span>Type</span>
            <span>Edited</span>
            {productions.length > 0 && <span>Productions</span>}
            {flat && <span>Folder</span>}
            <span />
            <span />
          </div>
        )}
        {listed.map((g, i) => (
          <GraphicRow
            key={g.id}
            g={g}
            view={view}
            showFolder={flat}
            productions={productionsByGraphic.get(g.id) ?? []}
            showProductions={productions.length > 0}
            onPickProduction={(id) => {
              onProductionFilter(id);
              clearSelection();
            }}
            onOpen={onOpen}
            onChanged={onChanged}
            onPublish={onPublish}
            selected={selected.has(g.id)}
            onToggleSelect={(shiftKey) => toggle(i, shiftKey)}
          />
        ))}
      </div>
      {/* "Everything is filed" is a real and good state, and an empty area under a full band of
          folders reads as a bug unless it says so. */}
      {showFolders && graphics.length > 0 && listed.length === 0 && (
        <p className="hint" data-testid="all-filed">Every graphic is in a folder — open one above.</p>
      )}

      {/* The bulk bar comes AFTER the items, which is what makes `position: sticky; bottom`
          float it over the bottom of the viewport: a sticky element only lifts off when its
          natural place is out of view, and above the list its natural place is the top.
          Its popovers open UPWARD from there — measured, not assumed (home/LibMenu). */}
      {selectedListed.length > 0 && (
        <div className="lib-bulkbar" data-testid="bulk-bar">
          <strong>{selectedListed.length} selected</strong>
          <button
            className="link-inline"
            onClick={() => {
              setSelected(new Set(listed.map((g) => g.id)));
              lastIndex.current = null;
            }}
          >
            Select all {listed.length}
          </button>

          <div className="spacer" />

          <ProductionPicker
            open={prodOpen}
            onOpenChange={(next) => { setProdOpen(next); if (next) setFolderOpen(false); }}
            buttonTitle="Add every selected graphic to a production"
            buttonTestid="bulk-add-production"
            menuTestid="bulk-production-menu"
            newNameTestid="bulk-new-production-name"
            newSubmitTestid="bulk-new-production"
            onAdd={addSelectionTo}
            onCreate={(name) => createProductionFrom(selectedListed, name)}
          />

          <div className="lib-menu-host">
            <button
              onClick={() => { setFolderOpen((o) => !o); setProdOpen(false); }}
              aria-expanded={folderOpen}
              data-testid="bulk-move-folder"
            >
              <IconFolder /> Folder
            </button>
            <LibMenu open={folderOpen} onClose={() => setFolderOpen(false)} testid="bulk-folder-menu">
              {folders.map((f) => (
                <button key={f} role="menuitem" onClick={() => void moveTo(f)}>
                  <IconFolder /> {f}
                </button>
              ))}
              <button role="menuitem" onClick={() => void moveTo(undefined)} data-testid="bulk-unfile">
                Remove from folder
              </button>
              <div className="lib-menu-new">
                <input
                  value={newFolder}
                  placeholder="New folder…"
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolder.trim()) void moveTo(newFolder.trim());
                  }}
                  data-testid="bulk-new-folder-name"
                />
                <button disabled={!newFolder.trim()} onClick={() => void moveTo(newFolder.trim())} data-testid="bulk-new-folder">
                  Move
                </button>
              </div>
            </LibMenu>
          </div>

          <button
            className="destructive"
            onClick={() => (deleteArmed ? doDelete() : setDeleteArmed(true))}
            title={
              deleteArmed
                ? 'Click again to delete — productions using any of them keep their own copy'
                : 'Delete the selected graphics'
            }
            data-testid="bulk-delete"
          >
            <IconTrash /> {deleteArmed ? `Delete ${selectedListed.length}?` : 'Delete'}
          </button>

          <button onClick={clearSelection} title="Clear the selection" data-testid="bulk-clear">✕</button>
        </div>
      )}
    </>
  );
}
