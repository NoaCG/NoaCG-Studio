import type { DragEvent } from 'react';
import type { FolderAir } from '../../control/folderAir';
import { folderAirWords } from '../../control/folderAir';
import { folderMode } from '../../model/showFolders';
import { folderName, rowTestId, type DropMark, type FolderRow as FolderRowModel } from '../../model/rundownRows';
import LibMenu from './LibMenu';

const MODE_WORDS = { manual: 'one by one', through: 'plays through', together: 'all together' } as const;
const MODE_KIND = { manual: 'One by one', through: 'Play through', together: 'All together' } as const;

/**
 * A FOLDER'S HEADER in the cue rundown (docs/CLIP_PLAYBACK_PLAN.md §6.2 and §6.6, phase 4), on one line
 * like every row: the grip that drags the whole folder, the collapse toggle, ▤ with the kind in words,
 * the name - "(continued)" on a later run of a folder an older build split - how it plays, how many
 * cues are under it, and what is on air of it. A header is `.pd-folder`, never `.pd-cue`: specs count
 * cue rows by that class, and the hosted page shares its rules.
 *
 * Props only. Selecting, collapsing, removing and dragging go to the page and the rundown.
 */
export default function FolderRow({
  row,
  air,
  missed,
  selected,
  holdsCursor,
  inRange,
  timed,
  slot,
  clash,
  replaced,
  drop,
  menuOpen,
  onSelect,
  onToggle,
  onMenu,
  onCloseMenu,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  row: FolderRowModel;
  air: FolderAir | undefined;
  /** How many of its cues the last folder Take could not put on air. */
  missed: number;
  selected: boolean;
  /** The selected cue is hidden in this collapsed run: its label, for the header's tooltip. */
  holdsCursor: string | null;
  /** Every cue of the folder is in the shift-click range. */
  inRange: boolean;
  /** The rundown has a length column; the header keeps its place. */
  timed: boolean;
  /** Where a Play-through folder plays, `2-10`; null for the other modes. */
  slot: string | null;
  /** A cue hidden in this collapsed run shares its layer with another graphic: the badge opens the
   *  repair, as the cue's own row would. */
  clash: { title: string; onRepair: () => void } | null;
  /** A cue hidden in this collapsed run was replaced on the server. */
  replaced: string | null;
  drop: DropMark | { refused: true } | null;
  menuOpen: boolean;
  onSelect: (shift: boolean, toggle: boolean) => void;
  onToggle: () => void;
  onMenu: () => void;
  onCloseMenu: () => void;
  onRemove: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const { folder } = row;
  const mode = folderMode(folder);
  const name = folderName(folder);
  const collapsed = folder.collapsed === true;
  const count = row.runCues.length;
  const total = air?.total ?? count;
  const cues = (n: number) => `${n} cue${n === 1 ? '' : 's'}`;
  const kind = `Folder · ${MODE_KIND[mode]} · ${cues(total)}`;
  const words = folderAirWords(air, missed);
  const lit = !!air && air.onAir.length > 0;
  const loops = mode === 'through' && folder.end === 'loop';
  const dropAttr = drop ? ('refused' in drop ? 'refused' : drop.edge) : undefined;
  return (
    <div
      className={`pd-folder${selected ? ' selected' : ''}${holdsCursor ? ' holds-cursor' : ''}${collapsed && lit ? ' on-air' : ''}${inRange ? ' in-range' : ''}`}
      data-testid={rowTestId(row)}
      data-row={row.id}
      title={holdsCursor ? `The selected cue, ${holdsCursor}, is in this folder` : undefined}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // A right-click opens the header's own ⋯ menu (docs/CLIP_PLAYBACK_PLAN.md §20.2).
      onContextMenu={(e) => {
        e.preventDefault();
        if (!menuOpen) onMenu();
      }}
      {...(dropAttr ? { 'data-drop': dropAttr } : {})}
      {...(drop && !('refused' in drop) ? { 'data-drop-inside': String(drop.inside) } : {})}
    >
      <span className="pd-grip" aria-hidden="true">⣿</span>
      <button
        type="button"
        className="pd-folder-toggle"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Open' : 'Collapse'} ${name}`}
        title={collapsed ? `Open ${name}` : `Collapse ${name}`}
        onClick={onToggle}
        data-testid="folder-toggle"
      >
        {collapsed ? '▸' : '▾'}
      </button>
      <span className="pd-cue-kind pd-cue-kind--folder" role="img" aria-label={kind} title={kind} data-testid="folder-kind">
        ▤
      </span>
      <button
        className="pd-cue-label"
        // A shift-click extends the selection; it must not also select the text under the pointer.
        onMouseDown={(e) => e.shiftKey && e.preventDefault()}
        onClick={(e) => onSelect(e.shiftKey, e.ctrlKey || e.metaKey)}
        aria-current={selected ? 'true' : undefined}
        data-testid="select-folder"
      >
        <strong data-testid="folder-name">{name}</strong>
        {/* How many cues are under it, beside the name: a collapsed folder's size stays in sight, and
            the name gives way before it does. */}
        <span className="pd-folder-count" title={count === total ? cues(count) : `${count} of the folder's ${cues(total)}`} data-testid="folder-count">
          {count}
        </span>
        {row.run > 0 && (
          <span className="pd-folder-cont" title="An older build or a teammate's edit split this folder. The next move puts its cues back together.">
            (continued)
          </span>
        )}
        {loops && (
          <span className="pd-cue-mark" role="img" aria-label="Loops the folder until Out" title="Loops the folder until Out" data-testid="folder-loop">
            ⟲
          </span>
        )}
        <span className="pd-cue-sum">{MODE_WORDS[mode]}</span>
        {inRange && <span className="pd-sr">in the selection</span>}
      </button>
      {replaced && (
        <span className="pd-cue-replaced" title={replaced} data-testid="folder-replaced">
          replaced on the server
        </span>
      )}
      {words && (
        <span className={`pd-tag ${words.tone}`} title={words.title} data-testid="folder-air">
          {words.tag}
        </span>
      )}
      {timed && <span className="pd-cue-len" />}
      {clash ? (
        <button className="pd-cue-layer clash" onClick={clash.onRepair} title={clash.title} data-testid="folder-clash">
          Layer
        </button>
      ) : slot ? (
        <span className="pd-cue-layer" title={`${name} plays its clips on ${slot}`} data-testid="folder-slot">
          {slot}
        </span>
      ) : (
        // The slot column stays, empty, so the header's tag stands in the same column as its cues'.
        <span className="pd-cue-layer" aria-hidden="true" />
      )}
      <div className="pd-cue-menu-host">
        <button className="pd-icon pd-cue-more" onClick={onMenu} title="More" aria-label={`More actions for ${name}`} data-testid="folder-menu">
          ⋯
        </button>
        <LibMenu open={menuOpen} onClose={onCloseMenu} testid="folder-actions-menu">
          <button role="menuitem" onClick={onRemove} title={`Remove the folder. Its ${cues(total)} stay in the rundown where they are.`} data-testid="remove-folder">
            Remove folder (keeps its {cues(total)})
          </button>
        </LibMenu>
      </div>
    </div>
  );
}
