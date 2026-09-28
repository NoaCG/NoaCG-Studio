import { useEffect, useMemo, useRef, useState } from 'react';
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
import { fieldDescriptors } from '../../control/controlModel';
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
import { serverCueLive } from '../../control/serverPlayout';
import type { ServerOwnership, ServerTiming, StorePart } from '../../control/serverPlayoutStore';
import { namesItem } from '../../control/serverState';
import { MAX_PICTURES } from '../../templates/picture';
import LibMenu from './LibMenu';
import { SlotRemaining } from './ClipClock';
import { clipLength } from './clipLength';
import PlayoutItemPicker from './PlayoutItemPicker';

/** "A, B and C" — a warning an operator reads under pressure has to be a sentence. */
export function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** How long the list stays where the operator scrolled it before it follows the air again. */
const FOLLOW_PAUSE_MS = 10_000;

/** Whether a hand scrolled the list within the pause, as of now. */
function scrolledLately(at: number): boolean {
  return Date.now() - at < FOLLOW_PAUSE_MS;
}

/**
 * THE CUE RUNDOWN of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §2 and §4): the rows, the
 * drag reorder, each row's ⋯ menu, and the rail foot, which is how graphics, pictures and server
 * items get in. Moved out of ProductionPage by phase 1 of docs/backlog/production-page-phases.md.
 *
 * It owns only its own menus and pickers, and where the list is scrolled. What it changes goes to
 * the record through `setShows` or through the page's callbacks, and what is ON AIR comes in as
 * values it only reads: `liveCue` is the Take contract and never leaves the page, so the rundown
 * is handed this render's map and has no way to change it.
 *
 * ONE LINE A ROW (docs/CLIP_PLAYBACK_PLAN.md §6.2), so about twenty rows show at 1080p where ten
 * did. What the old second line carried is moved, never dropped: the kind and the graphic's name
 * are the kind icon's accessible name and tooltip, the operator note is the ✎ mark's, the layer
 * or the server address is the slot at the row's end (still the clash warning when two graphics
 * share a layer), and ON AIR / PVW stay as words beside the tint. e2e/playout-rail-width.spec.ts
 * holds that table.
 *
 * THE SERVER'S WORD (plan §6.2 and §6.7, phase 2): a clip that is up counts its remaining time in
 * the length column, a clip waiting on the server behind another wears NEXT ON SERVER, a cue whose
 * slot something else took over says it was replaced on the server, and whatever stands on a
 * rundown slot that no cue here put there is listed above the rows as an unidentified item. The
 * rows read the store's OWNERSHIP part as a prop; each remaining time subscribes to the TIMING
 * part itself, so the list around it never redraws with the clock.
 */
export default function CueRundown({
  show,
  cues,
  graphicByPoolId,
  library,
  playoutSettings,
  liveCue,
  serverOwnership,
  serverTiming,
  selectedCueId,
  previewCueId,
  selectedGraphicId,
  clashes,
  offstage,
  cueView,
  cueGraphicName,
  playoutItemFor,
  selectCue,
  onLayerRepair,
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
  /** What this page put up on the playout server, and what the server says besides. Read-only. */
  serverOwnership: ServerOwnership;
  /** Where each server clip is, for the remaining times - subscribed to by those cells alone. */
  serverTiming: StorePart<ServerTiming>;
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
  /** A row's clash badge was pressed: select that cue and put its layer repair in front. */
  onLayerRepair: (cueId: string) => void;
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

  /** Each pool graphic's WORD fields, in the template's order: what a row's dim summary reads. */
  const wordFields = useMemo(() => {
    const out = new Map<string, { key: string; defaultValue: string }[]>();
    for (const [id, g] of graphicByPoolId) {
      out.set(
        id,
        fieldDescriptors(g.template.fields)
          .filter((d) => d.kind === 'text' || d.kind === 'lines')
          .map((d) => ({ key: d.key, defaultValue: String(d.defaultValue ?? '') })),
      );
    }
    return out;
  }, [graphicByPoolId]);
  /** The length column is there only when the rundown holds a server clip (plan §6.8). */
  const timed = cues.some((c) => playoutItemFor(c)?.kind === 'media');
  const serverOnAir = serverOwnership.onAir;
  const replacedCues = new Map(Object.values(serverOwnership.replaced).map((r) => [r.cueId, r] as const));

  // ── THE LIST FOLLOWS THE AIR (plan §6.2). A cue that goes on air off-screen is scrolled into
  // view, so a take from the keys, a combined control or another operator never leaves the
  // operator hunting for the red row. It holds still while the operator is working IN the list:
  // a row being dragged, a menu open, focus in the rundown, or ten seconds after they scrolled
  // it by hand. Only the list scrolls - never the page, which on a phone is the column the verbs
  // are pinned to.
  const rail = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** The row being dragged, by cue id. An id and not a flag: a row removed mid-drag (a teammate's
   *  save) never gets its dragend, and a flag would then hold the list still for good. */
  const draggingRow = useRef<string | null>(null);
  const scrolledAt = useRef(-Infinity);
  const menuOpen = menuCueId !== null || pickerOpen;
  const liveIds = new Set(
    cues
      .filter((cue) => {
        const graphic = cueGraphicName(cue);
        return (!!graphic && liveCue[graphic] === cue.id) || serverCueLive(serverOnAir, playoutItemFor(cue), cue);
      })
      .map((cue) => cue.id),
  );
  const liveKey = [...liveIds].join(' ');
  const wasLive = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const now = new Set(liveKey ? liveKey.split(' ') : []);
    const arrived = [...now].find((id) => !wasLive.current.has(id));
    wasLive.current = now;
    if (!arrived || offstage) return;
    const dragged = draggingRow.current;
    const held =
      (!!dragged && cues.some((c) => c.id === dragged)) ||
      menuOpen ||
      !!rail.current?.contains(document.activeElement) ||
      scrolledLately(scrolledAt.current);
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-testid="cue-${arrived}"]`);
    if (held || !box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    // `cues` is read for the drag check only, as of this render; following is decided when the
    // live set changes, not whenever the rundown does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, offstage, menuOpen]);

  return (
    <aside ref={rail} id="pd-rundown" className={`pd-rail pd-rundown${offstage ? ' pd-offstage' : ''}`}>
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
        <p className="hint pd-cues-empty" data-testid="no-cues">
          No cues yet. Add a graphic below, then add cues on it.
        </p>
      )}

      {/* UNIDENTIFIED ITEMS (plan §6.7): something plays on a slot this rundown uses, and nothing
          says which cue put it there - another client's take, or this page's own from before a
          Bridge restart. Named by its slot and file, never matched to a cue by its name. */}
      {serverOwnership.unidentified.length > 0 && (
        <div className="pd-unidentified" data-testid="server-unidentified">
          {serverOwnership.unidentified.map((u) => (
            <div
              key={slotAddress(u.slot)}
              className="pd-unidentified-row"
              title={`${slotAddress(u.slot)} plays ${u.file ?? 'something'} on the playout server, and this page cannot say which cue put it there. Take a cue on that slot to replace it.`}
            >
              <span className="pd-unidentified-what">Unidentified item on {slotAddress(u.slot)}</span>
              {u.file && <span className="pd-cue-sum">{u.file}</span>}
              <span className="pd-cue-len">
                <SlotRemaining timing={serverTiming} slot={slotAddress(u.slot)} fallback="" />
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        ref={list}
        className={`pd-cues${timed ? ' pd-cues--timed' : ''}`}
        data-testid="cue-list"
        // A HAND on the list, not the list moving: the follow's own scrolling fires `scroll` too,
        // so only a wheel or a touch counts as the operator having looked somewhere on purpose.
        onWheel={() => (scrolledAt.current = Date.now())}
        onTouchMove={() => (scrolledAt.current = Date.now())}
      >
        {cues.map((cue, i) => {
          const view = cueView(cue);
          const cueGraphic = cueGraphicName(cue);
          const poolEntry = graphicByPoolId.get(cue.sourceId);
          const playoutItem = playoutItemFor(cue);
          const cueIsLive = liveIds.has(cue.id);
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
          const layer = poolEntry ? graphicLayer(poolEntry) : 0;
          const clashWith = poolEntry ? (clashes.get(layer) ?? []).filter((g) => g.id !== poolEntry.id) : [];
          const address = playoutItem ? slotAddress(itemSlot(playoutSettings, playoutItem)) : '';
          // THE KIND, in words for whoever cannot see the glyph: the icon's accessible name and
          // its tooltip carry what the old second line printed ("Lower third · Hairline").
          const kind = poolEntry
            ? { glyph: 'T', tone: 'graphic', name: `${graphicKindLabel(poolEntry.type)} · ${poolEntry.name}` }
            : playoutItem?.kind === 'media'
              ? { glyph: '▶', tone: 'clip', name: `Server clip · ${address}` }
              : playoutItem
                ? { glyph: 'T', tone: 'server', name: `Server template · ${address}` }
                : { glyph: '?', tone: 'missing', name: 'Missing graphic' };
          // THE DIM SUMMARY after the name: what tells two cues of one graphic apart at a glance -
          // a graphic's first words ("Alexandra Riva"), a server item's own name. A graphic with
          // no words (a logo, a picture) falls back to its name, as the old second line did.
          const summary = poolEntry
            ? (wordFields.get(poolEntry.id) ?? [])
                .map((d) => (view.values[d.key] ?? d.defaultValue).split('\n')[0].replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 2)
                .join(' · ') || cueGraphic || ''
            : (playoutItem?.name ?? 'missing graphic');
          const length = playoutItem?.kind === 'media' ? clipLength(playoutItem) : '';
          const loops = playoutItem?.kind === 'media' && !!playoutItem.loop;
          // Where this clip is up, if it is: the slot it was TAKEN to, whatever its editor says now.
          const upAt = cueIsLive && playoutItem?.kind === 'media' ? serverOnAir[playoutItem.id]?.slot : undefined;
          // Waiting on the server behind whatever plays on its slot (`LOADBG`).
          const next = !cueIsLive && playoutItem?.kind === 'media' ? serverOwnership.queued[address] : undefined;
          const nextHere = !!next && !!playoutItem && namesItem(playoutItem.name, next.file);
          const replaced = replacedCues.get(cue.id);
          return (
            <div
              key={cue.id}
              className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isPreviewed ? ' on-pvw' : ''}`}
              data-testid={`cue-${cue.id}`}
              draggable
              onDragStart={(e) => {
                draggingRow.current = cue.id;
                e.dataTransfer.setData('text/noacg-cue', cue.id);
              }}
              onDragEnd={() => (draggingRow.current = null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                draggingRow.current = null;
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
              <span
                className={`pd-cue-kind pd-cue-kind--${kind.tone}`}
                role="img"
                aria-label={kind.name}
                title={kind.name}
                data-testid="cue-kind"
              >
                {kind.glyph}
              </span>
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
                {/* A clip that LOOPS says so after its name: it is what happens at its end, and
                    Out is the only thing that stops it. */}
                {loops && (
                  <span className="pd-cue-mark" role="img" aria-label="Loops until Out" title="Loops until Out" data-testid="cue-loop">
                    ⟲
                  </span>
                )}
                {/* The OPERATOR NOTE ("after the intro") is a mark with the note in its tooltip
                    and its accessible name, so it is announced with the row. */}
                {view.note && (
                  <span className="pd-cue-mark" role="img" aria-label={`Note: ${view.note}`} title={view.note} data-testid="cue-note-mark">
                    ✎
                  </span>
                )}
                {/* NEXT ON SERVER, after the name (plan §6.2): this clip waits behind whatever
                    plays on its slot, and plays by itself at the end when the server says AUTO. */}
                {nextHere && (
                  <span
                    className="pd-cue-next"
                    title={next!.auto ? `Queued on ${address}: it plays by itself when the clip before it ends.` : `Loaded on ${address} behind the clip that plays there.`}
                    data-testid="cue-next-on-server"
                  >
                    NEXT ON SERVER
                  </span>
                )}
                {summary && summary !== view.label && <span className="pd-cue-sum">{summary}</span>}
              </button>
              {/* The row was ON AIR until something else took its slot on the server: said next
                  to where the ON AIR tag stood, so the operator sees it where they last looked -
                  and beside PVW too, since the cue may well be the one on PREVIEW again. */}
              {replaced && !cueIsLive && (
                <span
                  className="pd-cue-replaced"
                  title={`Replaced on the server: ${slotAddress(replaced.slot)} now plays ${replaced.file ?? 'something else'}, which this page did not take. Take the cue again to put it back.`}
                  data-testid="cue-replaced"
                >
                  replaced on the server
                </span>
              )}
              {cueIsLive ? (
                <span className="pd-tag air">ON AIR</span>
              ) : isPreviewed ? (
                <span className="pd-tag pvw">PVW</span>
              ) : null}
              {timed && (
                <span className="pd-cue-len" data-testid="cue-length">
                  {/* While the clip is up, the time it has LEFT, counting between readings. */}
                  {upAt ? <SlotRemaining timing={serverTiming} slot={slotAddress(upAt)} fallback={length} /> : length}
                </span>
              )}
              {/* The LAYER, and the one place a shared layer is announced now that the layer
                  list is gone (§5): two graphics on one number replace each other on air, so both
                  rows wear the warning where the operator is already looking, and the badge IS
                  the door to the repair - it selects the cue and opens its layer under Advanced. */}
              {poolEntry &&
                (clashWith.length ? (
                  <button
                    className="pd-cue-layer clash"
                    onClick={() => onLayerRepair(cue.id)}
                    title={`Shares layer ${layer} with ${nameList(clashWith.map((g) => g.name))}. On air they replace each other. Click to repair.`}
                    data-testid="cue-layer"
                  >
                    L{layer}
                  </button>
                ) : (
                  <span
                    className="pd-cue-layer"
                    title={`${poolEntry.name} airs on layer ${layer}`}
                    data-testid="cue-layer"
                  >
                    L{layer}
                  </span>
                ))}
              {/* A server item wears its CasparCG address, channel and layer, the way the
                  server itself writes it (`2-10`): a rundown that airs on two channels has to
                  say which one at a glance. */}
              {playoutItem && (
                <span
                  className="pd-cue-layer"
                  title={`${playoutItem.name} plays on the playout server, ${channelTitle(playoutSettings, channelOf(playoutSettings, playoutItem))}, layer ${playoutItem.layer}`}
                  data-testid="cue-layer"
                >
                  {address}
                </span>
              )}
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
        {playoutConfigured(playoutSettings) && (
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
