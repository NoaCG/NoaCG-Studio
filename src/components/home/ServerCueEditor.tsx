import { useEffect, useState } from 'react';
import {
  MAX_PLAYOUT_LAYER,
  MIN_PLAYOUT_LAYER,
  setCuePlayback,
  setPlayoutItemChannel,
  setPlayoutItemFields,
  setPlayoutItemLayer,
  setPlayoutItemMediaKind,
  type ClipFade,
  type CuePlayback,
  type PlayoutItem,
  type PlayoutMediaKind,
  type Show,
  type ShowCue,
} from '../../model/shows';
import {
  asFolderMember,
  clockOf,
  dbText,
  effectiveEnd,
  FADE_SECONDS,
  fileSeconds,
  MAX_LEVEL_DB,
  MIN_LEVEL_DB,
  NEEDS,
  offerBlocked,
  parseClock,
  trimProblem,
  type ClipEnd,
  type PlaybackAbility,
} from '../../control/cuePlayback';
import { channelLabel, channelOf, itemSlot, slotAddress, type PlayoutResult, type PlayoutSettings } from '../../control/playoutLink';
import { nextClipWords, type PlayNext } from '../../control/serverPlayout';
import { FieldRow } from '../fields/FieldControl';
import { THROUGH_END, type ThroughRole } from '../../control/serverPlayout';

/** A clip in a Play-through folder: the folder's name, the slot it plays on, and the clip's place. */
export interface ThroughPlace {
  folderName: string;
  slot: string;
  role: ThroughRole;
}

/**
 * A cue over the PLAYOUT SERVER'S OWN LIBRARY (docs/BRIDGE.md §5): a template or a clip that
 * lives on the CasparCG box and airs through NoaCG Bridge. Its editor is the same shape as a
 * graphic's - the title, the fields, the note and the layer - with the server's state where the
 * unsent line would be, because "connected" or "not answering" is the fact an operator needs
 * before pressing Take on something nothing here shows.
 *
 * A CLIP OR AN AUDIO FILE gets its settings (docs/CLIP_PLAYBACK_PLAN.md §6.5): At the end, Fade and
 * Level always visible, channel and layer beside the note, and the trim under Advanced. Each belongs to THIS cue,
 * except the channel and layer, which belong to the file every cue of it shares. A control is
 * offered only when the Bridge and its server can both honour it (§6.9); going back to a default
 * always is, so a cue nobody here can play is never stuck that way.
 *
 * Props only: the cue's text edits go to the page's draft through `onEdit`, its settings and the
 * item's to the record through `setShows`, and Pause and Resume back to the page as named verbs,
 * since the page owns every verb.
 */
export default function ServerCueEditor({
  showId,
  item,
  cue,
  view,
  live,
  cueNo,
  bridgeStatus,
  ability,
  playoutSettings,
  takeBlocked,
  playNext,
  through,
  onEdit,
  onTransport,
  setShows,
}: {
  showId: string;
  item: PlayoutItem;
  /** The cue as saved: its playback settings are written straight to the record. */
  cue: ShowCue;
  /** The cue as the operator currently sees it - draft over record. */
  view: { label: string; note: string; values: Record<string, string> };
  /** This cue is the one the page put up on the server. */
  live: boolean;
  /** Its place in the rundown, 1-based; 0 when there is none to name. */
  cueNo: number;
  /** The Bridge's last word on the playout server; null while it is still being asked. */
  bridgeStatus: PlayoutResult | null;
  /** What the Bridge and its server can do, for the clip's settings; null while it is being asked. */
  ability: PlaybackAbility | null;
  playoutSettings: PlayoutSettings;
  /** Why Take is off for this cue with this Bridge and server, or null. */
  takeBlocked: string | null;
  /** Where Play next would go from this cue, found in the rundown as it stands; null for a template. */
  playNext: PlayNext | null;
  /** The clip plays in a Play-through folder, which decides its end and its slot. */
  through: ThroughPlace | null;
  onEdit: (patch: { label?: string; note?: string; values?: Record<string, string> }) => void;
  /** Pause and Resume, as NAMED verbs through the page's one dispatcher (`onVerb`), so a key or a
   *  hardware panel reaches them the same way this button does. */
  onTransport: (verb: 'pause' | 'resume') => void;
  setShows: (shows: Show[]) => void;
}) {
  /** The channel it is set to play on, for the pick. */
  const channel = channelOf(playoutSettings, item);
  const media = item.kind === 'media';
  const channelPick = (
    <label className="pd-field pd-field-channel">
      <span>Channel</span>
      <select
        value={channel}
        onChange={(e) => setShows(setPlayoutItemChannel(showId, item.id, Number(e.target.value)))}
        data-testid="playout-channel"
      >
        {playoutSettings.channels.map((row) => (
          <option key={row.channel} value={row.channel}>
            {channelLabel(playoutSettings, row.channel)}
          </option>
        ))}
        {!playoutSettings.channels.some((row) => row.channel === channel) && (
          <option value={channel}>
            {channel} · not in Settings
          </option>
        )}
      </select>
    </label>
  );
  const layerBox = (
    <label className="pd-field pd-field-layer">
      <span>Layer</span>
      <input
        type="number"
        min={MIN_PLAYOUT_LAYER}
        max={MAX_PLAYOUT_LAYER}
        value={item.layer}
        onChange={(e) => setShows(setPlayoutItemLayer(showId, item.id, Number(e.target.value)))}
        data-testid="playout-layer"
      />
    </label>
  );
  return (
    <div className={`pd-editor${live ? ' live' : ''}`} data-testid="playout-cue-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">
          {media ? (item.mediaKind === 'audio' ? 'SERVER AUDIO' : 'SERVER CLIP') : 'SERVER TEMPLATE'}
          {live ? ' · ON AIR' : ''}
          {cueNo > 0 ? ` · ${cueNo}` : ''}
        </span>
        <input
          className="pd-cue-title"
          value={view.label}
          onChange={(e) => onEdit({ label: e.target.value })}
          aria-label="Cue name"
          data-testid="cue-label"
        />
        <span
          className={bridgeStatus && bridgeStatus.state !== 'ok' ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
          data-testid="playout-cue-status"
          data-state={bridgeStatus?.state ?? 'pending'}
        >
          {bridgeStatus === null
            ? 'asking the playout server…'
            : bridgeStatus.state === 'ok'
              ? `CasparCG${bridgeStatus.version ? ` ${bridgeStatus.version}` : ''} · connected`
              : bridgeStatus.detail}
        </span>
      </div>
      <p className="hint pd-server-where" data-testid="playout-cue-where">
        {through ? (
          <>
            <code>{item.name}</code> plays on the playout server on <code>{through.slot}</code>, the slot of {through.folderName}, through NoaCG Bridge. A
            Take here plays {through.folderName} from this clip to its end
            {through.role === 'loop-last' || through.role === 'loop-alone' ? ', and starts it over after its last clip until Out' : ''}.{' '}
          </>
        ) : (
          <>
            <code>{item.name}</code> plays on the playout server, on{' '}
            <code>{slotAddress(itemSlot(playoutSettings, item))}</code>, through NoaCG
            Bridge.{' '}
          </>
        )}
        {media
          ? 'The monitors here show its still picture, marked STILL, never the moving video.'
          : 'It is not shown on the PROGRAM monitor here.'}
      </p>
      {/* Why Take is off: a setting this Bridge or server cannot honour is never dropped on the
          way to air (plan §6.9), so the cue waits, and says what would let it go. */}
      {takeBlocked && (
        <p className="pd-unsent-note pd-take-blocked" data-testid="playout-take-blocked">
          {takeBlocked}
        </p>
      )}
      {item.kind === 'template' && (
        <div className="pd-band-fields" data-testid="playout-cue-fields">
          {(item.fields ?? []).map((f) => (
            <FieldRow
              key={f.field}
              descriptor={{ key: f.field, label: `${f.field.toUpperCase()} · ${f.title}`, kind: 'text', defaultValue: f.value }}
              value={String(view.values[f.field] ?? f.value)}
              onChange={(v) => onEdit({ values: { [f.field]: String(v) } })}
              testIdPrefix="cue-field"
            />
          ))}
          <AddFieldRow
            onAdd={(id) =>
              setShows(
                setPlayoutItemFields(showId, item.id, [
                  ...(item.fields ?? []).filter((f) => f.field !== id),
                  { field: id, title: id.toUpperCase(), value: '' },
                ]),
              )
            }
          />
        </div>
      )}
      {media && (
        <ClipSettings
          item={item}
          cue={cue}
          live={live}
          ability={ability}
          playNext={playNext}
          through={through}
          set={(patch) => setShows(setCuePlayback(showId, cue.id, patch))}
        />
      )}
      {media && live && (
        <div className="row pd-clip-transport" data-testid="playout-clip-transport">
          <button onClick={() => onTransport('pause')} data-testid="playout-pause">
            ⏸ Pause <kbd>P</kbd>
          </button>
          <button onClick={() => onTransport('resume')} data-testid="playout-resume">
            ▶ Resume
          </button>
        </div>
      )}
      {/* WHERE IT PLAYS, as a CasparCG client puts it: the channel, then the layer. The
          channel is a pick from the channels Settings names, never a typed number; a
          channel this studio does not name (a production made elsewhere, a row removed
          since) stays listed as itself rather than silently moving the cue. Every server item
          shows both here, beside its note, so moving a clip to another channel is as easy as
          moving it to another layer (owner, 2026-10-01). */}
      <div className="pd-cue-meta pd-cue-meta--slot" data-testid="cue-meta">
        <label className="pd-field pd-field-note">
          <span>Operator note</span>
          <input
            value={view.note}
            placeholder="e.g. after the intro"
            onChange={(e) => onEdit({ note: e.target.value })}
            data-testid="cue-note"
          />
        </label>
        {channelPick}
        {layerBox}
      </div>
      {through && (
        <p className="muted pd-clip-trim-note" data-testid="clip-folder-slot">
          In {through.folderName} it plays on {through.slot}. Its own slot is for a Take outside the folder.
        </p>
      )}
      {media && (
        <ClipAdvanced
          item={item}
          cue={cue}
          ability={ability}
          setTrim={(trim) => setShows(setCuePlayback(showId, cue.id, trim))}
          setKind={(kind) => setShows(setPlayoutItemMediaKind(showId, item.id, kind))}
        />
      )}
    </div>
  );
}

const END_WORDS: Record<ClipEnd, string> = { hold: 'Hold last frame', clear: 'Clear', loop: 'Loop', next: 'Play next' };

const FADE_WORDS: { value: ClipFade | undefined; word: string }[] = [
  { value: undefined, word: 'Cut' },
  { value: 'short', word: 'Short' },
  { value: 'long', word: 'Long' },
];


/**
 * At the end, Fade and Level (plan §6.5): what the operator changes most, always in view. Each
 * applies at the next Take, which the controls say while the cue is on air, as Loop always did.
 */
function ClipSettings({
  item,
  cue,
  live,
  ability,
  playNext,
  through,
  set,
}: {
  item: PlayoutItem;
  cue: ShowCue;
  live: boolean;
  ability: PlaybackAbility | null;
  playNext: PlayNext | null;
  through: ThroughPlace | null;
  set: (patch: { [K in keyof CuePlayback]?: CuePlayback[K] | null }) => void;
}) {
  // The last clip of a Play-through folder keeps its own ending, but Play next never leaves the
  // folder, so a stored Play next reads as Hold there; the record is not rewritten.
  const lastInFolder = through?.role === 'last';
  const end = lastInFolder ? effectiveEnd(asFolderMember(cue, item, true), item) : effectiveEnd(cue, item);
  const folderEnd = through ? THROUGH_END[through.role] : undefined;
  const ends = (Object.keys(END_WORDS) as ClipEnd[]).filter((e) => !lastInFolder || e !== 'next');
  const still = item.mediaKind === 'still';
  const p = cue.playback ?? {};
  const levelDb = p.levelDb ?? 0;
  // The slider moves a draft while it is dragged and writes once when it is let go: one save per
  // change, not one per pixel.
  const [dragDb, setDragDb] = useState<number | null>(null);
  const shownDb = dragDb ?? levelDb;
  const commitLevel = () => {
    if (dragDb === null) return;
    set({ levelDb: dragDb === 0 ? null : dragDb });
    setDragDb(null);
  };
  const nextApplies = live ? ' · applies at the next Take' : '';
  const offEnd = (e: ClipEnd): string | null => {
    if (e === 'hold' || e === end) return null;
    if (e === 'loop') return null;
    if (e === 'clear') return offerBlocked(ability, NEEDS.clear);
    return offerBlocked(ability, NEEDS.next) ?? (playNext && !playNext.ok ? `Play next is off: ${playNext.reason}.` : null);
  };
  const fadeOff = offerBlocked(ability, NEEDS.fade);
  const levelOff = offerBlocked(ability, NEEDS.level);
  const fadeOutWords = p.fadeOut ? `, fading out over its last ${FADE_SECONDS[p.fadeOut]} s` : '';
  const hint =
    end === 'hold'
      ? 'Holds its last frame until Out'
      : end === 'clear'
        ? `Clears the layer at its end${fadeOutWords}`
        : end === 'loop'
          ? 'Repeats until Out'
          : playNext?.ok
            ? `Then plays ${nextClipWords(playNext.next)}`
            : `Plays the next clip, but ${playNext?.reason ?? 'none is found'}`;
  const nextOff = !still && !through && end !== 'next' && playNext && !playNext.ok ? ` · Play next is off: ${playNext.reason}` : '';
  const storedNext = lastInFolder && cue.playback?.end === 'next' ? ' · Play next does not leave the folder' : '';
  return (
    <div className="pd-clip-settings" data-testid="clip-settings">
      <div className="pd-clip-row">
        <span className="pd-clip-label" id={`clip-end-${cue.id}`}>
          At the end
        </span>
        {still ? (
          <span className="muted pd-clip-hint" data-testid="clip-end-still">
            A still has no end: it holds until Out.
          </span>
        ) : folderEnd ? (
          <span className="pd-clip-hint" data-testid="clip-end-folder">
            {folderEnd.glyph} {folderEnd.words}
          </span>
        ) : (
          <div className="ctl-segmented" role="radiogroup" aria-labelledby={`clip-end-${cue.id}`} data-testid="clip-end">
            {ends.map((e) => {
              const off = offEnd(e);
              return (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={end === e}
                  className={end === e ? 'on' : ''}
                  disabled={!!off}
                  title={off ?? undefined}
                  onClick={() => set({ end: e })}
                  data-testid={`clip-end-${e}`}
                >
                  {END_WORDS[e]}
                </button>
              );
            })}
          </div>
        )}
        {!still && !folderEnd && (
          <span className="muted pd-clip-hint" data-testid="clip-end-hint">
            {hint}
            {storedNext}
            {nextOff}
            {nextApplies}
          </span>
        )}
      </div>
      <div className="pd-clip-row" data-testid="clip-fade">
        <span className="pd-clip-label">Fade</span>
        {(['fadeIn', 'fadeOut'] as const).map((which) => (
          <span key={which} className="pd-clip-pair">
            <span className="pd-clip-sub" id={`clip-${which}-${cue.id}`}>
              {which === 'fadeIn' ? 'In' : 'Out'}
            </span>
            <span className="ctl-segmented" role="radiogroup" aria-labelledby={`clip-${which}-${cue.id}`}>
              {FADE_WORDS.map((f) => {
                const on = p[which] === f.value;
                // Cut is always there: it is how a fade this Bridge cannot play is taken off.
                const off = f.value && !on ? fadeOff : null;
                return (
                  <button
                    key={f.word}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={on ? 'on' : ''}
                    disabled={!!off}
                    title={off ?? (f.value ? `${FADE_SECONDS[f.value]} s` : 'No fade')}
                    onClick={() => set({ [which]: f.value ?? null })}
                    data-testid={`clip-${which === 'fadeIn' ? 'fade-in' : 'fade-out'}-${f.word.toLowerCase()}`}
                  >
                    {f.word}
                  </button>
                );
              })}
            </span>
          </span>
        ))}
        {live && (p.fadeIn || p.fadeOut) && <span className="muted pd-clip-hint">the fade in applies at the next Take</span>}
      </div>
      <div className="pd-clip-row">
        <label className="pd-clip-label" htmlFor={`clip-level-${cue.id}`}>
          Level
        </label>
        <input
          id={`clip-level-${cue.id}`}
          className="pd-clip-level"
          type="range"
          min={MIN_LEVEL_DB}
          max={MAX_LEVEL_DB}
          step={1}
          value={shownDb}
          disabled={!!levelOff && levelDb === 0}
          title={levelOff ?? undefined}
          aria-valuetext={dbText(shownDb)}
          onChange={(e) => {
            const db = Number(e.target.value);
            // Without the capability the slider only goes back toward 0 dB, never further from it.
            if (levelOff && Math.abs(db) > Math.abs(levelDb)) return;
            setDragDb(db);
          }}
          onPointerUp={commitLevel}
          onKeyUp={commitLevel}
          onBlur={commitLevel}
          data-testid="clip-level"
        />
        <output className="pd-clip-db" htmlFor={`clip-level-${cue.id}`} data-testid="clip-level-value">
          {dbText(shownDb)}
        </output>
        <button type="button" disabled={shownDb === 0} onClick={() => { setDragDb(null); set({ levelDb: null }); }} data-testid="clip-level-reset">
          Reset
        </button>
        {live && levelDb !== 0 && <span className="muted pd-clip-hint">applies at the next Take</span>}
      </div>
    </div>
  );
}

/** The kinds an operator may name for an older item the server's list did not resolve. */
const KIND_WORDS: { value: PlayoutMediaKind; word: string }[] = [
  { value: 'movie', word: 'Movie' },
  { value: 'audio', word: 'Audio' },
  { value: 'still', word: 'Still' },
];

/**
 * ADVANCED for a clip (plan §6.5): the start and end in the file, and - on an item saved before the
 * server's kind was kept - the kind. Closed by default, with a one-line summary of what is inside
 * (`whole clip`). Its channel and layer sit beside the note, always visible.
 */
function ClipAdvanced({
  item,
  cue,
  ability,
  setTrim,
  setKind,
}: {
  item: PlayoutItem;
  cue: ShowCue;
  ability: PlaybackAbility | null;
  setTrim: (trim: { trimIn: number | null; trimOut: number | null }) => void;
  setKind: (kind: PlayoutMediaKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const trimIn = cue.playback?.trimIn;
  const trimOut = cue.playback?.trimOut;
  const [start, setStart] = useState(trimIn === undefined ? '' : clockOf(trimIn));
  const [end, setEnd] = useState(trimOut === undefined ? '' : clockOf(trimOut));
  const [problem, setProblem] = useState<string | null>(null);
  // The record moved under the boxes (another tab, an undo): show what it holds now.
  useEffect(() => {
    setStart(trimIn === undefined ? '' : clockOf(trimIn));
    setEnd(trimOut === undefined ? '' : clockOf(trimOut));
    setProblem(null);
  }, [trimIn, trimOut]);
  const whole = fileSeconds(item);
  const trimmed = trimIn !== undefined || trimOut !== undefined;
  const trimOff = trimmed ? null : offerBlocked(ability, NEEDS.trim);
  const summary = `${trimmed ? `${clockOf(trimIn ?? 0)}–${trimOut !== undefined ? clockOf(trimOut) : 'end'}` : 'whole clip'}${item.mediaKind ? '' : ' · kind not known'}`;
  /** Read both boxes, check them against each other and the file, and keep them only when they hold. */
  const commit = () => {
    const readBox = (text: string): number | null | 'bad' => (text.trim() === '' ? null : (parseClock(text) ?? 'bad'));
    const a = readBox(start);
    const b = readBox(end);
    if (a === 'bad' || b === 'bad') {
      setProblem('Write a time as 0:05, 1:05.5 or 65.5.');
      return;
    }
    const why = trimProblem({ trimIn: a ?? undefined, trimOut: b ?? undefined }, item);
    setProblem(why);
    if (why) return;
    if ((a ?? undefined) === trimIn && (b ?? undefined) === trimOut) return;
    // A start at the very beginning is no trim at all.
    setTrim({ trimIn: a === 0 ? null : a, trimOut: b !== null && whole !== undefined && Math.abs(b - whole) < 0.001 ? null : b });
  };
  return (
    <div className="pd-advanced" data-testid="clip-advanced">
      <button
        type="button"
        className="pd-advanced-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="clip-advanced-toggle"
      >
        <span className="pd-advanced-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        Advanced
        <span className="pd-advanced-sum" data-testid="clip-advanced-summary">
          {summary}
        </span>
      </button>
      {open && (
        <div className="pd-advanced-body pd-clip-advanced">
          <div className="pd-clip-trim" title={trimOff ?? undefined}>
            <label className="pd-field">
              <span>Start at</span>
              <input
                value={start}
                placeholder="0:00"
                disabled={!!trimOff}
                onChange={(e) => setStart(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
                data-testid="clip-trim-in"
              />
            </label>
            <label className="pd-field">
              <span>End at</span>
              <input
                value={end}
                placeholder={whole !== undefined ? clockOf(whole) : 'the end'}
                disabled={!!trimOff}
                onChange={(e) => setEnd(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
                data-testid="clip-trim-out"
              />
            </label>
            {trimmed && (
              <button
                type="button"
                onClick={() => {
                  setProblem(null);
                  setTrim({ trimIn: null, trimOut: null });
                }}
                data-testid="clip-trim-clear"
              >
                Whole clip
              </button>
            )}
          </div>
          {(problem || trimOff) && (
            <p className={problem ? 'status-bad pd-clip-trim-note' : 'muted pd-clip-trim-note'} data-testid="clip-trim-problem">
              {problem ?? trimOff}
            </p>
          )}
          {!item.mediaKind && (
            <label className="pd-field pd-clip-kind">
              <span>Kind</span>
              <select value="" onChange={(e) => e.target.value && setKind(e.target.value as PlayoutMediaKind)} data-testid="clip-kind">
                <option value="">Not known: plays as a movie</option>
                {KIND_WORDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.word}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** One box to name a field a server template takes when NoaCG did not make it - the id on the
 *  wire, as FIELDS.md or the template's author names it. */
function AddFieldRow({ onAdd }: { onAdd: (id: string) => void }) {
  const [id, setId] = useState('');
  const submit = () => {
    const clean = id.trim();
    if (!clean) return;
    onAdd(clean);
    setId('');
  };
  return (
    <div className="field-row pd-add-field">
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Add a field id, e.g. f2"
        spellCheck={false}
        aria-label="Field id"
        data-testid="playout-add-field"
      />
      <button onClick={submit} disabled={!id.trim()} data-testid="playout-add-field-go">
        ＋ Field
      </button>
    </div>
  );
}
