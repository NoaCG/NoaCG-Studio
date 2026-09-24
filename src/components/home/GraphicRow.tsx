import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../../app/router';
import { syncSampleData } from '../../store/templateStore';
import { useExportUi } from '../ExportWindow';
import { deleteGraphic, duplicateGraphic, updateGraphic, type GraphicDoc } from '../../model/library';
import { graphicKindLabel } from '../../model/types';
import { addGraphicToShow, createShowNamedChecked } from '../../model/shows';
import { raiseStorageAlert } from '../../store/storageAlert';
import { commitDurableWrites } from '../../model/durableStore';
import GraphicThumb from './GraphicThumb';
import ProductionPicker from './ProductionPicker';
import RowMenu, { type RowMenuItem } from './RowMenu';
import { IconControl, IconCopy, IconDownload, IconFolder, IconGlobe, IconPencil, IconTrash, IconTv } from '../icons';

/** A saved graphic's thumbnail shows the data an operator last selected, when there is one.
 *  Exported because the dashboard's shelf renders the same graphic and must show it the same
 *  way — two answers to "what does this card show" is how the two surfaces come to disagree. */
export function activeValues(g: GraphicDoc): Record<string, string> | undefined {
  return g.entries.find((e) => e.id === g.activeEntryId)?.values;
}

/** A graphic may feed several productions, so membership stays a set of direct doors rather
 *  than being collapsed into one grouping label. The caller derives the relation once for the
 *  whole library; a row only renders the answer it is given.
 *
 *  `max` is how many NAMES the container can print without ellipsizing them into stubs, and it
 *  differs by view for a real reason: a card can stack two pills across its own width, while the
 *  table's 150px track cut two production names down to "Frid…" and "Bas…" - two stubs answer
 *  less than one name and a `+1`. Whatever is not printed is still readable, because the
 *  wrapper's tooltip names every production the graphic is in. */
function ProductionTags({
  productions,
  max,
  onPickProduction,
}: {
  productions: { id: string; name: string }[];
  max: number;
  onPickProduction?: (id: string) => void;
}) {
  const shown = productions.slice(0, max);
  return (
    <>
      {shown.map((production) => (
        <button
          key={production.id}
          type="button"
          className="lib-prod-tag"
          onClick={() => onPickProduction?.(production.id)}
          title={`Show graphics in ${production.name}`}
        >
          <IconTv /> <span>{production.name}</span>
        </button>
      ))}
      {productions.length > shown.length && (
        <span className="lib-prod-more">+{productions.length - shown.length}</span>
      )}
    </>
  );
}

/** Every production the graphic is in, for the tooltip that backs up a truncated pill row. */
const productionNames = (productions: { name: string }[]): string =>
  `In ${productions.map((production) => production.name).join(', ')}`;

/**
 * One library row (docs/GOALS_ARCHIVE.md "Student release" step 8). THREE visible actions — Open,
 * "+ Production" (the popover below), and the ⋯ overflow menu — because the row's job is the
 * student workflow: open it, or put it in the production that airs it. Export, rename,
 * duplicate, publish and delete are real but rarer, so they live behind ⋯ where they cannot
 * crowd the two that matter. The two-step delete stays two-step inside the menu.
 */
export default function GraphicRow({
  g,
  onOpen,
  onChanged,
  onPublish,
  selected,
  onToggleSelect,
  view = 'list',
  showFolder = true,
  productions,
  onPickProduction,
  showProductions = false,
}: {
  g: GraphicDoc;
  onOpen: (g: GraphicDoc) => void;
  onChanged: () => void;
  /** Present only when community publishing is available (backend + signed in). */
  onPublish?: (g: GraphicDoc) => void;
  /** Multi-select (the Graphics section's bulk bar). Present = the row offers a checkbox;
   *  shift-click range logic lives with the LIST, which knows the visible order. */
  selected?: boolean;
  onToggleSelect?: (shiftKey: boolean) => void;
  /** Card ('grid') or table row ('list') — the same item, two containers, one behaviour
   *  (re-design/handoff.md §5b/§5c). Defaults to the row every other section renders. */
  view?: 'grid' | 'list';
  /** The table's FOLDER column. Off wherever the answer is already known — at the root every
   *  row is unfiled and inside a folder every row is in it, so the column printed one value
   *  twelve times. It earns its 160px during a SEARCH, which is the one view that crosses
   *  folders. The column track is dropped in the same breath (`.lib-list--nofolder`), or the
   *  headings would slide off the values under them. */
  showFolder?: boolean;
  /** Production membership is derived by the list owner from the shows it already loaded. */
  productions: { id: string; name: string }[];
  /** Picking a membership pill narrows the library without opening the production dashboard. */
  onPickProduction?: (id: string) => void;
  /** The table column is absent when there are no productions; cards need no separate track. */
  showProductions?: boolean;
}) {
  const navigate = useRouter((s) => s.navigate);
  const openExport = useExportUi((s) => s.openExport);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(g.name);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);

  // ── The "+ Production" popover: the row's door into the unit that airs. The picker itself
  //    is SHARED (home/ProductionPicker) — a folder, a bulk selection and the control panel all
  //    open the same one, so "it closes on a successful pick" is one rule, not four. ──
  const [addOpen, setAddOpen] = useState(false);
  /** Returns whether the graphic actually reached the production. A FAILED add used to leave
   *  the ✓ off and say nothing else, so on a full quota the button simply did nothing - the
   *  acceptance pass reported it as "I can't add anything to even ongoing productions". */
  const addTo = async (showId: string, showName?: string): Promise<boolean> => {
    const { error: written } = addGraphicToShow(showId, g.template, { graphicId: g.id });
    // The durable store confirms a write after the call returns, so "did it land?" is one
    // await (model/durableStore.ts). Claiming the failure keeps THIS message, which names the
    // graphic and the production, instead of the generic app-level announcement.
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Adding “${g.name}” to ${showName ? `“${showName}”` : 'the production'}`,
        error,
        outcome: 'The graphic itself is unchanged in your library.',
      });
      onChanged();
      return false;
    }
    onChanged();
    return true;
  };

  /** Create a production and put this graphic in it - both halves checked, because on a full
   *  quota the row never persists and the navigation would land on a production that is not
   *  there. */
  const addToNewProduction = async (rawName: string): Promise<boolean> => {
    const { show, error: written } = createShowNamedChecked(rawName);
    const error = written ?? (await commitDurableWrites());
    if (error) {
      raiseStorageAlert({
        action: `Creating the production “${show.name}”`,
        error,
        outcome: 'The graphic itself is unchanged in your library.',
      });
      return false;
    }
    const ok = await addTo(show.id, show.name);
    if (ok) navigate({ view: 'production', id: show.id });
    return ok;
  };

  const commitRename = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== g.name) {
      updateGraphic(g.id, { name: name.trim() });
      // The open working copy keeps its own name until re-opened; the row updates now.
      onChanged();
    }
  };

  const menu: RowMenuItem[] = [
    // The per-graphic operator panel stays one step from every row — in the default studio
    // Open already leads there, but the Advanced row's Open means the editor.
    {
      label: 'Control panel',
      icon: <IconControl />,
      onClick: () => navigate({ view: 'control', id: g.id }),
      testid: 'open-control',
    },
    {
      label: 'Export…',
      icon: <IconDownload />,
      onClick: () =>
        openExport({
          template: g.template,
          sampleData: syncSampleData(g.template, activeValues(g) ?? {}),
          graphicId: g.id,
        }),
      testid: 'export-graphic',
    },
    { label: 'Rename', icon: <IconPencil />, onClick: () => { setName(g.name); setRenaming(true); }, testid: 'rename-graphic' },
    { label: 'Duplicate', icon: <IconCopy />, onClick: () => { duplicateGraphic(g.id); onChanged(); }, testid: 'duplicate-graphic' },
    ...(onPublish
      ? [{ label: 'Publish to community…', icon: <IconGlobe />, onClick: () => onPublish(g), testid: 'publish-graphic' }]
      : []),
    {
      label: deleteArmed ? 'Delete? (click to confirm)' : 'Delete',
      icon: <IconTrash />,
      destructive: true,
      keepOpen: !deleteArmed,
      testid: 'delete-graphic',
      onClick: () => {
        if (deleteArmed) {
          if (deleteTimer.current) clearTimeout(deleteTimer.current);
          setDeleteArmed(false);
          deleteGraphic(g.id);
          onChanged();
        } else {
          setDeleteArmed(true);
          if (deleteTimer.current) clearTimeout(deleteTimer.current);
          deleteTimer.current = setTimeout(() => setDeleteArmed(false), 3500);
        }
      },
    },
  ];

  return (
    <div
      className={`lib-row lib-row--${view}${onToggleSelect ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      data-testid={`graphic-row-${g.id}`}
      // Dragged onto a folder card (GraphicsSection) — the gesture the FOLDERS band offers.
      // Only the id travels: the drop calls the same setGraphicsFolder the bulk bar does.
      draggable={!!onToggleSelect}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-noacg-graphic', g.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      // Clicking the item selects it, the way a file manager does — but only on the item's
      // own background, never through a control inside it. The pip and the row are the same
      // gesture, so shift-click ranges work from either.
      onClick={(e) => {
        if (!onToggleSelect) return;
        if ((e.target as HTMLElement).closest('button, input, a')) return;
        onToggleSelect(e.shiftKey);
      }}
    >
      {/* A card's thumbnail fills its width; a table row's is the 100px PREVIEW column. */}
      <GraphicThumb
        template={g.template}
        values={activeValues(g)}
        label={g.name}
        fixedBox={view === 'list'}
        fill={view === 'grid'}
      />
      <div className="lib-info">
        {onToggleSelect && (
          // A PIP, not a checkbox (re-design/handoff.md §5). A library of graphics is picked
          // from the way files are: the row is the target and the mark reports the state. A
          // column of tick boxes puts a permanent control beside every row for an action most
          // visits never take. It stays a real button — keyboard-reachable, and the thing a
          // shift-click lands on — so range selection works exactly as before. It sits with
          // the NAME (the card absolutely positions it over the thumbnail), never in a column
          // of its own, which is what would make it a checkbox again.
          <button
            className="lib-select"
            aria-pressed={!!selected}
            onClick={(e) => onToggleSelect(e.shiftKey)}
            title="Select (Shift-click selects a range)"
            aria-label={`Select ${g.name}`}
            data-testid="select-graphic"
          >
            <span aria-hidden="true">✓</span>
          </button>
        )}
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setName(g.name); setRenaming(false); }
            }}
            data-testid="rename-input"
          />
        ) : (
          // The NAME is the row's own door, exactly as a production row's is — reaching for
          // "Open" on the far right of every row was the same acceptance-round papercut twice.
          <button
            className="lib-name-link"
            onClick={() => onOpen(g)}
            title={`Open "${g.name}" to preview, edit data and operate`}
            data-testid="open-graphic-name"
          >
            <strong>{g.name}</strong>
          </button>
        )}
        {/* On a CARD the type and date ride under the name; the table gives each its own
            column, so repeating them here would print every value twice. */}
        {view === 'grid' && (
          <span className="muted">
            {graphicKindLabel(g.type)}
            {' · '}
            {new Date(g.updatedAt).toLocaleDateString()}
          </span>
        )}
        {view === 'grid' && productions.length > 0 && (
          <span className="lib-prod-tags" data-testid="row-productions" title={productionNames(productions)}>
            <ProductionTags productions={productions} max={2} onPickProduction={onPickProduction} />
          </span>
        )}
        {/* WHERE THE MATCH LIVES. A search crosses folders, so a result that does not say which
            folder it came from answers half the question — and the card is the DEFAULT view
            (model/prefs libraryView), so table-only was the same as nowhere for most people.
            An UNFILED match carries no tag: the table prints an em dash because a column must
            fill its cell, while on a card a lone dash in the meta line reads as a typo, and
            "no tag" is already the unambiguous answer once any sibling shows one. */}
        {view === 'grid' && showFolder && g.folder && (
          <span className="lib-folder-tag" data-testid="row-folder">
            <IconFolder /> {g.folder}
          </span>
        )}
      </div>
      {view === 'list' && (
        <>
          <span className="lib-cell lib-cell-mono" data-testid="row-type">{graphicKindLabel(g.type)}</span>
          <span className="lib-cell lib-cell-mono" data-testid="row-edited">
            {new Date(g.updatedAt).toLocaleDateString()}
          </span>
          {showProductions && (
            <span
              className="lib-cell lib-prod-tags"
              data-testid="row-productions"
              title={productions.length > 0 ? productionNames(productions) : undefined}
            >
              {productions.length > 0 ? (
                <ProductionTags productions={productions} max={1} onPickProduction={onPickProduction} />
              ) : (
                <span className="muted" aria-hidden="true">{'\u2014'}</span>
              )}
            </span>
          )}
          {showFolder && (
            <span className="lib-cell" data-testid="row-folder">
              {g.folder ? (
                <span className="lib-folder-tag"><IconFolder /> {g.folder}</span>
              ) : (
                <span className="muted" aria-hidden="true">—</span>
              )}
            </span>
          )}
        </>
      )}
      <div className="lib-actions">
        <button className="primary" onClick={() => onOpen(g)} title="Open to preview, edit data and operate" data-testid="open-graphic">
          Open
        </button>
        <ProductionPicker
          open={addOpen}
          onOpenChange={setAddOpen}
          markGraphicId={g.id}
          buttonTitle="Add this graphic to a production"
          buttonTestid="add-to-production"
          menuTestid="add-to-production-menu"
          newNameTestid="add-to-new-production-name"
          newSubmitTestid="add-to-new-production"
          onAdd={(showId, showName) => addTo(showId, showName)}
          onCreate={(name) => addToNewProduction(name)}
        />
      </div>
      <RowMenu items={menu} />
    </div>
  );
}
