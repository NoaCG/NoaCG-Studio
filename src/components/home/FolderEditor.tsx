import { useEffect, useState } from 'react';
import { MAX_PLAYOUT_LAYER, MIN_PLAYOUT_LAYER, PLAYOUT_CLIP_LAYER, type PlayoutItem, type ShowCue, type ShowFolder } from '../../model/shows';
import { folderMode } from '../../model/showFolders';
import { folderName } from '../../model/rundownRows';
import { NEEDS, offerBlocked, effectiveEnd, type PlaybackAbility } from '../../control/cuePlayback';
import { folderAirWords, type FolderAir } from '../../control/folderAir';
import { channelLabel, type PlayoutSettings } from '../../control/playoutLink';

const MODES: { mode: ShowFolder['mode']; word: string }[] = [
  { mode: 'manual', word: 'One by one' },
  { mode: 'through', word: 'Play through' },
  { mode: 'together', word: 'All together' },
];

const END_AFTER: Record<string, string> = {
  hold: 'holds its last frame',
  clear: 'clears to studio',
  loop: 'loops until Out',
  next: 'holds its last frame',
};

/**
 * A FOLDER'S PANEL (docs/CLIP_PLAYBACK_PLAN.md §6.5), in the cue panel where a cue's settings are, for
 * the folder row the operator holds: its name; how it plays - One by one, Play through, All together;
 * for Play through what happens after the last clip and the one slot it plays on; and what airs where.
 * It sits in the control area, which is the one scroller, and has none of its own.
 *
 * Play through is offered only when the production has a server cue (§6.8), and only when the Bridge
 * and the server can play one file after another; Loop the folder only when the Bridge can loop a
 * sequence. Going back to One by one or to the last clip's own ending is never off.
 *
 * Props only: every change goes to the record through the page.
 */
export default function FolderEditor({
  folder,
  members,
  items,
  air,
  missed,
  ability,
  playoutSettings,
  slot,
  hasServerCue,
  takeBlocked,
  addressOf,
  onRename,
  onMode,
  onEnd,
  onSlot,
}: {
  folder: ShowFolder;
  /** Its cues, every run, in rundown order. */
  members: readonly ShowCue[];
  items: readonly PlayoutItem[];
  air: FolderAir | undefined;
  missed: number;
  ability: PlaybackAbility | null;
  playoutSettings: PlayoutSettings;
  /** Where a Play-through folder plays: the channel and layer, and whether either is its own. */
  slot: { channel: number; layer: number; set: boolean };
  hasServerCue: boolean;
  /** Why its Take is off, or null. */
  takeBlocked: string | null;
  /** Where one cue plays on its own: `2-10`, or `L20` for a graphic. */
  addressOf: (cue: ShowCue) => string;
  onRename: (name: string) => void;
  /** Answers why the mode was refused, or null. */
  onMode: (mode: ShowFolder['mode']) => string | null;
  onEnd: (end: 'loop' | null) => void;
  onSlot: (slot: { channel?: number | null; layer?: number | null }) => void;
}) {
  const mode = folderMode(folder);
  const name = folderName(folder);
  const [draftName, setDraftName] = useState(folder.name);
  const [refusal, setRefusal] = useState<string | null>(null);
  useEffect(() => setDraftName(folder.name), [folder.name]);
  useEffect(() => setRefusal(null), [folder.id, mode]);
  const words = folderAirWords(air, missed);
  const throughOff = offerBlocked(ability, NEEDS.through);
  // One clip that loops is a plain looping take, which any Bridge plays; only a run of several needs
  // a Bridge that can loop a sequence.
  const loopOff = members.length > 1 ? offerBlocked(ability, NEEDS.folderLoop) : null;
  const last = members[members.length - 1];
  const lastItem = last?.source === 'playout' ? items.find((i) => i.id === last.sourceId) : undefined;
  const lastEnd = last && lastItem ? effectiveEnd(last, lastItem) : 'hold';
  const allAudio = members.length > 0 && members.every((c) => items.find((i) => i.id === c.sourceId)?.mediaKind === 'audio');
  const address = `${slot.channel}-${slot.layer}`;
  const commitName = () => {
    const next = draftName.trim();
    if (next && next !== folder.name) onRename(next);
    else setDraftName(folder.name);
  };
  const modeHint =
    mode === 'manual'
      ? 'Tidiness only: each cue is taken on its own and sends what it sends outside a folder.'
      : mode === 'through'
        ? `One Take plays its clips one after another on ${address}, as one sequence NoaCG Bridge runs.`
        : 'One Take starts every cue in it: the server cues one after another, then the graphics.';
  return (
    <div className={`pd-editor pd-folder-editor${air?.onAir.length ? ' live' : ''}`} data-testid="folder-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">
          FOLDER · {members.length} cue{members.length === 1 ? '' : 's'}
        </span>
        <input
          className="pd-cue-title"
          value={draftName}
          aria-label="Folder name"
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
          }}
          data-testid="folder-name-input"
        />
        {words && (
          <span className={`pd-tag ${words.tone}`} title={words.title}>
            {words.tag}
          </span>
        )}
      </div>
      {takeBlocked && (
        <p className="pd-unsent-note pd-take-blocked" data-testid="folder-take-blocked">
          {takeBlocked}
        </p>
      )}
      <div className="pd-clip-settings">
        <div className="pd-clip-row">
          <span className="pd-clip-label" id={`folder-mode-${folder.id}`}>
            How it plays
          </span>
          <div className="ctl-segmented" role="radiogroup" aria-labelledby={`folder-mode-${folder.id}`} data-testid="folder-mode">
            {MODES.filter((m) => m.mode !== 'through' || hasServerCue || mode === 'through').map((m) => {
              const off = m.mode === 'through' && mode !== 'through' ? throughOff : null;
              return (
                <button
                  key={m.mode}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.mode}
                  className={mode === m.mode ? 'on' : ''}
                  disabled={!!off}
                  title={off ?? undefined}
                  onClick={() => setRefusal(onMode(m.mode))}
                  data-testid={`folder-mode-${m.mode}`}
                >
                  {m.word}
                </button>
              );
            })}
          </div>
          <span className="muted pd-clip-hint" data-testid="folder-mode-hint">
            {modeHint}
          </span>
        </div>
        {refusal && (
          <p className="status-bad" data-testid="folder-mode-refused">
            {refusal}
          </p>
        )}
        {mode === 'through' && (
          <>
            <div className="pd-clip-row">
              <span className="pd-clip-label" id={`folder-end-${folder.id}`}>
                At the end
              </span>
              <div className="ctl-segmented" role="radiogroup" aria-labelledby={`folder-end-${folder.id}`} data-testid="folder-end">
                <button type="button" role="radio" aria-checked={folder.end !== 'loop'} className={folder.end !== 'loop' ? 'on' : ''} onClick={() => onEnd(null)} data-testid="folder-end-last">
                  As the last clip says
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={folder.end === 'loop'}
                  className={folder.end === 'loop' ? 'on' : ''}
                  disabled={folder.end !== 'loop' && !!loopOff}
                  // Said while it is chosen too: a folder set to loop on a Bridge that cannot is not
                  // taken, and this is where the operator looks for why.
                  title={loopOff ?? undefined}
                  onClick={() => onEnd('loop')}
                  data-testid="folder-end-loop"
                >
                  Loop the folder
                </button>
              </div>
              <span className="muted pd-clip-hint" data-testid="folder-end-hint">
                {folder.end === 'loop'
                  ? `Starts over after ${last?.label ?? 'its last clip'}, until Out`
                  : `Then ${last?.label ?? 'its last clip'} ${END_AFTER[lastEnd]}`}
                {air?.onAir.length ? ' · applies at the next Take' : ''}
              </span>
            </div>
            <div className="pd-clip-row" data-testid="folder-slot-row">
              <span className="pd-clip-label">Plays on</span>
              <label className="pd-field pd-field-channel">
                <span>Channel</span>
                <select value={slot.channel} onChange={(e) => onSlot({ channel: Number(e.target.value) })} data-testid="folder-channel">
                  {playoutSettings.channels.map((row) => (
                    <option key={row.channel} value={row.channel}>
                      {channelLabel(playoutSettings, row.channel)}
                    </option>
                  ))}
                  {!playoutSettings.channels.some((row) => row.channel === slot.channel) && <option value={slot.channel}>{slot.channel} · not in Settings</option>}
                </select>
              </label>
              <label className="pd-field pd-field-layer">
                <span>Layer</span>
                <input
                  type="number"
                  min={MIN_PLAYOUT_LAYER}
                  max={MAX_PLAYOUT_LAYER}
                  value={slot.layer}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (Number.isInteger(n) && n >= MIN_PLAYOUT_LAYER && n <= MAX_PLAYOUT_LAYER) onSlot({ layer: n });
                  }}
                  data-testid="folder-layer"
                />
              </label>
              {slot.set && (
                <button type="button" onClick={() => onSlot({ channel: null, layer: null })} data-testid="folder-slot-default">
                  Clip default
                </button>
              )}
              <span className="muted pd-clip-hint" data-testid="folder-slot-summary">
                {channelLabel(playoutSettings, slot.channel)} · layer {slot.layer}
                {slot.set ? ', set for this folder' : ', the clip default'}
                {allAudio && slot.layer === PLAYOUT_CLIP_LAYER ? '. Audio files on layer 10 replace a clip there; layer 5 plays them under the clips' : ''}
              </span>
            </div>
          </>
        )}
      </div>
      <ol className="pd-folder-where" aria-label={`What airs where in ${name}`} data-testid="folder-where">
        {members.map((c) => (
          <li key={c.id}>
            <span className="pd-folder-where-cue">{c.label}</span>
            <span className="pd-cue-layer">{mode === 'through' && c.source === 'playout' ? address : addressOf(c)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
