import { useRef, useState } from 'react';
import { useRouter } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import {
  addGraphicToShow,
  addPlayoutItem,
  addShowCue,
  graphicLayer,
  moveShowCue,
  type PlayoutItem,
  type Show,
  type ShowCue,
} from '../../model/shows';
import type { SavedGraphic } from '../../model/packets';
import type { GraphicDoc } from '../../model/library';
import { graphicKindLabel } from '../../model/types';
import {
  channelOf,
  channelTitle,
  defaultChannelFor,
  itemSlot,
  loadPlayoutSettings,
  playoutConfigured,
  slotAddress,
  type PlayoutSettings,
} from '../../control/playoutLink';
import type { LiveCueMap } from '../../control/hostedControl';
import { serverCueLive, type ServerOnAir } from '../../control/serverPlayout';
import { MAX_PICTURES } from '../../templates/picture';
import LibMenu from './LibMenu';
import PlayoutItemPicker from './PlayoutItemPicker';

/** "A, B and C" — a warning an operator reads under pressure has to be a sentence. */
export function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * THE CUE RUNDOWN of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §2): the rows, the drag
 * reorder, each row's ⋯ menu, and the rail foot, which is how graphics, pictures and server items
 * get in. Phase 1 of docs/backlog/production-page-phases.md: moved out of ProductionPage with its
 * behaviour unchanged.
 *
 * It owns only its own menus and pickers. What it changes goes to the record through `setShows`
 * or through the page's callbacks, and what is ON AIR comes in as values it only reads: `liveCue`
 * is the Take contract and never leaves the page, so the rundown is handed this render's map and
 * has no way to change it.
 */
export default function CueRundown({
  show,
  cues,
  graphicByPoolId,
  library,
  playoutSettings,
  liveCue,
  serverOnAir,
  selectedCueId,
  previewCueId,
  selectedGraphicId,
  clashes,
  offstage,
  cueView,
  cueGraphicName,
  playoutItemFor,
  selectCue,
  removeCue,
  removeGraphic,
  uploadPictures,
  flushDraft,
  setShows,
}: {
  show: Show;
  cues: ShowCue[];
  graphicByPoolId: ReadonlyMap<string, SavedGraphic>;
  library: GraphicDoc[];
  playoutSettings: PlayoutSettings;
  /** Which cue is on air on each graphic's layer. Read-only here. */
  liveCue: LiveCueMap;
  /** What this page put up on the playout server, by item id. Read-only here. */
  serverOnAir: ServerOnAir;
  /** The rundown's cursor: the selected cue, or the first when none is. */
  selectedCueId: string | null;
  /** The cue on PREVIEW, which in 'preview-then-take' mode the cursor may have left. */
  previewCueId: string | null;
  /** The selected cue's pool graphic, which ＋ adds a cue on. Null on a server cue. */
  selectedGraphicId: string | null;
  /** Layers two or more graphics share (model/shows `duplicateLayers`). */
  clashes: ReadonlyMap<number, SavedGraphic[]>;
  /** A workspace is in front: the rail stays mounted, out of sight. */
  offstage: boolean;
  cueView: (cue: ShowCue) => { label: string; note: string; values: Record<string, string> };
  cueGraphicName: (cue: ShowCue) => string | null;
  playoutItemFor: (cue: ShowCue) => PlayoutItem | null;
  selectCue: (cueId: string) => void;
  removeCue: (cue: ShowCue) => Promise<void>;
  removeGraphic: (poolId: string) => Promise<void>;
  uploadPictures: (files: File[]) => Promise<void>;
  flushDraft: () => void;
  setShows: (shows: Show[]) => void;
}) {
  const navigate = useRouter((s) => s.navigate);
  const [addPick, setAddPick] = useState('');
  /** The hidden file input behind "＋ Add pictures…". */
  const pictureInput = useRef<HTMLInputElement>(null);
  const [menuCueId, setMenuCueId] = useState<string | null>(null);
  /** Which removal in the open row menu is ARMED (`cue` / `graphic`). A cue holds values somebody
   *  typed and there is no undo behind the rundown, so a removal that also takes uploaded
   *  pictures or a whole graphic's rows asks twice — the same two-step Home's delete uses. */
  const [armedRemove, setArmedRemove] = useState<'cue' | 'graphic' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <aside className={`pd-rail${offstage ? ' pd-offstage' : ''}`}>
      <div className="pd-rail-head">
        <h2>Cue rundown</h2>
        <span className="muted">{cues.length}</span>
        <div className="spacer" />
        <button
          className="pd-icon"
          title="Add a cue on the selected graphic"
          disabled={!selectedGraphicId}
          onClick={() => {
            if (!selectedGraphicId) return;
            const { shows: next, cueId } = addShowCue(show.id, selectedGraphicId);
            setShows(next);
            if (cueId) selectCue(cueId);
          }}
          data-testid="add-cue"
        >
          ＋
        </button>
      </div>

      {cues.length === 0 && (
        <p className="hint" data-testid="no-cues">
          No cues yet. Add a graphic below, then add cues on it.
        </p>
      )}

      <div className="pd-cues" data-testid="cue-list">
        {cues.map((cue, i) => {
          const view = cueView(cue);
          const cueGraphic = cueGraphicName(cue);
          const poolEntry = graphicByPoolId.get(cue.sourceId);
          const playoutItem = playoutItemFor(cue);
          const cueIsLive =
            (!!cueGraphic && liveCue[cueGraphic] === cue.id) || serverCueLive(serverOnAir, playoutItem, cue);
          const isSelected = cue.id === (selectedCueId ?? '');
          // The amber tally is the cue ON PREVIEW - the selection in 'take' mode, and in
          // 'preview-then-take' mode the cue SPACE put there, which the cursor may have left.
          const isPreviewed = cue.id === (previewCueId ?? '');
          // Removal wording, decided per row. How many cues the graphic has says whether this
          // one takes the graphic with it (shows.ts removeShowCue) and whether removing the
          // graphic outright is a distinct gesture at all; pictures live ONLY in their pool
          // graphic, so losing it loses the uploads and the operator has to be told.
          const siblingCues = cues.filter((c) => c.sourceId === cue.sourceId).length;
          const pictures = poolEntry?.type === 'picture' ? poolEntry.template.assets.length : 0;
          const clashWith = poolEntry
            ? (clashes.get(graphicLayer(poolEntry)) ?? []).filter((g) => g.id !== poolEntry.id)
            : [];
          return (
            <div
              key={cue.id}
              className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isPreviewed ? ' on-pvw' : ''}`}
              data-testid={`cue-${cue.id}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/noacg-cue', cue.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData('text/noacg-cue');
                const fromIndex = cues.findIndex((c) => c.id === from);
                if (fromIndex < 0 || fromIndex === i) return;
                flushDraft();
                // moveShowCue steps by one, so walk it to the drop position — the store keeps
                // one mutation shape and the drag stays a pure view concern.
                const step = fromIndex < i ? 1 : -1;
                let next = moveShowCue(show.id, from, step);
                for (let k = fromIndex + step; k !== i; k += step) next = moveShowCue(show.id, from, step);
                setShows(next);
              }}
            >
              <span className="pd-grip" aria-hidden="true">⣿</span>
              <span className="pd-cue-no">{cueIsLive ? '●' : i + 1}</span>
              {/* aria-current, not aria-selected: this is a list of cues the operator moves a
                  cursor through, and "the one I am holding" is exactly what current means. It
                  is also the non-visual half of the ring the CSS draws — a tally colour tells a
                  screen reader nothing. */}
              <button
                className="pd-cue-label"
                onClick={() => selectCue(cue.id)}
                data-testid="select-cue"
                aria-current={isSelected ? 'true' : undefined}
              >
                <strong>{view.label}</strong>
                <span className="muted">
                  {/* The LAYER, and the one place a shared layer is announced now that the
                      layer list is gone (§5): two graphics on one number replace each other on
                      air, so both rows wear the warning colour where the operator is already
                      looking. The repair — the editor's one-click "Move to layer N" — stays
                      beside the number itself. */}
                  {poolEntry && (
                    <span
                      className={`pd-cue-layer${clashWith.length ? ' clash' : ''}`}
                      title={
                        clashWith.length
                          ? `Shares layer ${graphicLayer(poolEntry)} with ${nameList(clashWith.map((g) => g.name))}. On air they replace each other.`
                          : `${poolEntry.name} airs on layer ${graphicLayer(poolEntry)}`
                      }
                      data-testid="cue-layer"
                    >
                      L{graphicLayer(poolEntry)}
                    </span>
                  )}
                  {/* A server item wears its CasparCG address, channel and layer, the way the
                      server itself writes it (`2-10`): a rundown that airs on two channels
                      has to say which one at a glance. The kind word says where it lives,
                      since the label is the operator's and the name is the server's. */}
                  {playoutItem && (
                    <span
                      className="pd-cue-layer"
                      title={`${playoutItem.name} plays on the playout server, ${channelTitle(playoutSettings, channelOf(playoutSettings, playoutItem))}, layer ${playoutItem.layer}`}
                      data-testid="cue-layer"
                    >
                      {slotAddress(itemSlot(playoutSettings, playoutItem))}
                    </span>
                  )}
                  {poolEntry || playoutItem ? ' · ' : ''}
                  {/* The KIND beside the name: the label above is the operator's own word for
                      the cue, so this is what says "that one is the scoreboard" at a glance. */}
                  {poolEntry ? `${graphicKindLabel(poolEntry.type)} · ` : ''}
                  {playoutItem ? `${playoutItem.kind === 'media' ? (playoutItem.loop ? 'Server clip ⟲ loop' : 'Server clip') : 'Server template'} · ` : ''}
                  {view.note || cueGraphic || playoutItem?.name || 'missing graphic'}
                </span>
              </button>
              {cueIsLive ? (
                <span className="pd-tag air">ON AIR</span>
              ) : isPreviewed ? (
                <span className="pd-tag pvw">PVW</span>
              ) : null}
              <div className="pd-cue-menu-host">
                <button
                  className="pd-icon pd-cue-more"
                  onClick={() => {
                    setArmedRemove(null);
                    setMenuCueId((m) => (m === cue.id ? null : cue.id));
                  }}
                  title="More"
                  aria-label={`More actions for ${view.label}`}
                  data-testid="cue-menu"
                >
                  ⋯
                </button>
                {/* The rundown SCROLLS, so the last cue's ⋯ is at the bottom of the rail by
                    arithmetic — the same defect the library's bulk bar had, on the surface an
                    operator uses live. The shell measures which way to open. */}
                <LibMenu
                  open={menuCueId === cue.id}
                  onClose={() => {
                    setArmedRemove(null);
                    setMenuCueId(null);
                  }}
                  testid="cue-actions-menu"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      flushDraft();
                      const v = cueView(cue);
                      const { shows: next, cueId } = addShowCue(show.id, cue.sourceId, {
                        label: `${v.label} copy`,
                        values: v.values,
                        note: v.note || undefined,
                      });
                      setShows(next);
                      setMenuCueId(null);
                      if (cueId) selectCue(cueId);
                    }}
                  >
                    Duplicate
                  </button>
                  {/* Removing the LAST cue removes the graphic too, so the label says so
                      rather than letting it be discovered. A picture graphic carries the
                      uploads themselves, which is the one removal that destroys content
                      with no copy in the library — it asks twice, naming the count. */}
                  <button
                    role="menuitem"
                    onClick={() => {
                      if (siblingCues === 1 && pictures > 0 && armedRemove !== 'cue') {
                        setArmedRemove('cue');
                        return;
                      }
                      void removeCue(cue);
                      setArmedRemove(null);
                      setMenuCueId(null);
                    }}
                    title={
                      siblingCues === 1
                        ? `The last cue on ${cueGraphic ?? playoutItem?.name ?? 'this graphic'}. The graphic leaves the production with it.`
                        : 'Remove this cue; the graphic and its other cues stay'
                    }
                    data-testid="delete-cue"
                  >
                    {armedRemove === 'cue'
                      ? `Also deletes ${pictures} picture${pictures === 1 ? '' : 's'}. Confirm?`
                      : siblingCues === 1
                        ? 'Remove cue and graphic'
                        : 'Remove cue'}
                  </button>
                  {/* One gesture for getting a graphic out of the production. Offered only
                      where it differs from the item above: with a single cue, that one
                      already takes the graphic. */}
                  {siblingCues > 1 && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        if (armedRemove !== 'graphic') {
                          setArmedRemove('graphic');
                          return;
                        }
                        void removeGraphic(cue.sourceId);
                        setArmedRemove(null);
                        setMenuCueId(null);
                      }}
                      title={`Remove ${cueGraphic ?? playoutItem?.name ?? 'this graphic'} from the production, with every cue prepared against it`}
                      data-testid="delete-graphic"
                    >
                      {armedRemove === 'graphic'
                        ? `Remove ${siblingCues} cues${pictures > 0 ? ` and ${pictures} pictures` : ''}. Confirm?`
                        : `Remove graphic and its ${siblingCues} cues`}
                    </button>
                  )}
                </LibMenu>
              </div>
            </div>
          );
        })}
      </div>

      {/* The foot is how graphics GET IN. It used to carry a layer list as well — a second
          list of the same graphics, in a corner the rundown wanted for itself. The layer is
          typed beside the graphic's content, every rundown row wears its number, and removal
          lives in the row's ⋯ menu, so the rundown is the only list (§5). */}
      <div className="pd-rail-foot">
        <div className="row">
          <select value={addPick} onChange={(e) => setAddPick(e.target.value)} data-testid="add-graphic-pick">
            <option value="">Add a graphic from your library…</option>
            {library.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            disabled={!addPick}
            onClick={() => {
              const doc = library.find((g) => g.id === addPick);
              if (!doc) return;
              const { shows: next } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
              setShows(next);
              setAddPick('');
            }}
            data-testid="add-graphic"
          >
            ＋ Add
          </button>
        </div>
        <button
          className="pd-new-graphic"
          onClick={() => {
            useTemplateStore.setState({ pendingProductionId: show.id });
            navigate({ view: 'new' });
          }}
          title="Create a new graphic for this production - the wizard uses its look and adds it here"
          data-testid="production-new-graphic"
        >
          ＋ New graphic for this production…
        </button>
        {/* Pictures, straight into the rundown — one still per cue, on the production's own
            picture layer. The editor is never opened for this, which is the whole point.
            A real <button> driving a hidden input, so it is the same control as its sibling
            rather than a label wearing a button's clothes. */}
        <button
          className="pd-new-graphic"
          onClick={() => pictureInput.current?.click()}
          title={`Add pictures to this production. Each one becomes a cue (up to ${MAX_PICTURES}).`}
          data-testid="add-pictures"
        >
          ＋ Add pictures…
        </button>
        {/* The playout server's own library - templates and clips already on the CasparCG box,
            through NoaCG Bridge (docs/BRIDGE.md §5). Present only once a server is configured
            under Settings -> Playout: a dead door on the busiest surface would be worse than none. */}
        {playoutConfigured(loadPlayoutSettings()) && (
          <div className="pd-links-host">
            <button
              className="pd-new-graphic"
              onClick={() => setPickerOpen((o) => !o)}
              title="Add a template or a clip that is already on the playout server"
              data-testid="add-from-server"
            >
              ＋ From the playout server…
            </button>
            <PlayoutItemPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              library={library}
              onAdd={(item) => {
                // The studio's default channel for its kind: a clip to the clip channel, a
                // template to the graphics one. The graphics channel is stored as NO channel,
                // which is what "graphics channel" has always meant on this record.
                const settings = loadPlayoutSettings();
                const channel = defaultChannelFor(settings, item.kind);
                const { shows: next, cueId } = addPlayoutItem(show.id, {
                  adapter: 'casparcg',
                  ...item,
                  ...(channel === settings.channel ? {} : { channel }),
                });
                setShows(next);
                if (cueId) selectCue(cueId);
              }}
            />
          </div>
        )}
        <input
          ref={pictureInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            // COPIED out of the live FileList first: clearing `value` empties that list in
            // place, so reading it afterwards hands the handler nothing at all.
            const files = Array.from(e.target.files ?? []);
            // Cleared so choosing the SAME file again still fires a change event.
            e.target.value = '';
            void uploadPictures(files);
          }}
          data-testid="add-pictures-input"
        />
      </div>
    </aside>
  );
}
