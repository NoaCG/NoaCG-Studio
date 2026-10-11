import { useState, type DragEvent } from 'react';
import ProductionPicker from './ProductionPicker';
import RowMenu, { type RowMenuItem } from './RowMenu';
import { IconFolder } from '../icons';

/**
 * ONE FOLDER, in the two presentations the Graphics view has (cards and table rows).
 *
 * Since the 2026-08-23 owner walk folders GROUP the view rather than filtering a flat list
 * (docs/SAVED_CONTENT_MODEL.md §6), so this is a CONTAINER you open, not a chip you toggle:
 * the whole item is the door, the ⋯ menu holds rename and remove, and "+ Production" pools the
 * folder whole. One markup, two skins — a card and a row that disagreed about what a folder
 * can do is how the chip row came to offer less than the card grid did.
 *
 * It is also a DROP TARGET in both views: dragging graphics onto a folder is the fastest way
 * to fill one, and it worked in the card grid only for as long as the table had chips.
 *
 * A right-click on the item opens that same ⋯ menu, as a rundown folder's header does
 * (FolderRow.tsx): one list of folder verbs, two ways to reach it.
 */
export default function FolderItem({
  folder,
  count,
  view,
  dropping,
  onOpen,
  onDragOver,
  onDragLeave,
  onDrop,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  menu,
  pickerOpen,
  onPickerOpenChange,
  onAddToProduction,
  onCreateProduction,
}: {
  folder: string;
  /** As COUNTED ON SCREEN — the type chips narrow this the same way they narrow the list. */
  count: number;
  view: 'grid' | 'list';
  dropping: boolean;
  onOpen: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (next: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  menu: RowMenuItem[];
  pickerOpen: boolean;
  onPickerOpenChange: (next: boolean) => void;
  onAddToProduction: (showId: string, showName: string) => Promise<boolean>;
  onCreateProduction: (name: string) => Promise<boolean>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={`lib-folder-item lib-folder-item--${view}${dropping ? ' dropping' : ''}`}
      onClick={(e) => {
        // The item is the door, but never through a control inside it — the same rule
        // GraphicRow follows, and the reason the ⋯ menu can live on the item at all.
        if ((e.target as HTMLElement).closest('button, input, a')) return;
        onOpen();
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onContextMenu={(e) => {
        if (renaming) return;
        e.preventDefault();
        onPickerOpenChange(false);
        setMenuOpen(true);
      }}
      data-testid={`folder-item-${folder}`}
    >
      <span className="lib-folder-mark"><IconFolder /></span>
      <div className="lib-folder-info">
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            data-testid="folder-rename-input"
          />
        ) : (
          <button className="lib-name-link" onClick={onOpen} title={`Open "${folder}"`} data-testid="open-folder">
            <strong>{folder}</strong>
          </button>
        )}
        <span className="muted">{count} graphic{count === 1 ? '' : 's'}</span>
      </div>
      <div className="lib-folder-actions">
        <ProductionPicker
          open={pickerOpen}
          onOpenChange={onPickerOpenChange}
          buttonTitle={`Add all ${count} graphic${count === 1 ? '' : 's'} of "${folder}" to a production`}
          buttonTestid="folder-to-production"
          menuTestid="folder-production-menu"
          newNameTestid="folder-new-production-name"
          newSubmitTestid="folder-new-production"
          onAdd={onAddToProduction}
          onCreate={onCreateProduction}
        />
        <RowMenu items={menu} label={`More actions for ${folder}`} open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
    </div>
  );
}
