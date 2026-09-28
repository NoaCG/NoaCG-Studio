import { useState } from 'react';
import {
  MAX_PLAYOUT_LAYER,
  MIN_PLAYOUT_LAYER,
  setPlayoutItemChannel,
  setPlayoutItemFields,
  setPlayoutItemLayer,
  setPlayoutItemLoop,
  type PlayoutItem,
  type Show,
} from '../../model/shows';
import { channelLabel, channelOf, itemSlot, slotAddress, type PlayoutResult, type PlayoutSettings } from '../../control/playoutLink';
import { FieldRow } from '../fields/FieldControl';

/**
 * A cue over the PLAYOUT SERVER'S OWN LIBRARY (docs/BRIDGE.md §5): a template or a clip that
 * lives on the CasparCG box and airs through NoaCG Bridge. Its editor is the same shape as a
 * graphic's - the title, the fields, the note and the layer - with the server's state where the
 * unsent line would be, because "connected" or "not answering" is the fact an operator needs
 * before pressing Take on something nothing here shows.
 *
 * Moved out of ProductionPage with its behaviour unchanged (docs/CLIP_PLAYBACK_PLAN.md §16,
 * phase 0). Props only: the cue's edits go to the page's draft through `onEdit`, the item's own
 * settings to the record through `setShows`, and Pause and Resume back to the page as named
 * verbs, since the page owns every verb.
 */
export default function ServerCueEditor({
  showId,
  item,
  view,
  live,
  cueNo,
  bridgeStatus,
  playoutSettings,
  onEdit,
  onTransport,
  setShows,
}: {
  showId: string;
  item: PlayoutItem;
  /** The cue as the operator currently sees it - draft over record. */
  view: { label: string; note: string; values: Record<string, string> };
  /** This cue is the one the page put up on the server. */
  live: boolean;
  /** Its place in the rundown, 1-based; 0 when there is none to name. */
  cueNo: number;
  /** The Bridge's last word on the playout server; null while it is still being asked. */
  bridgeStatus: PlayoutResult | null;
  playoutSettings: PlayoutSettings;
  onEdit: (patch: { label?: string; note?: string; values?: Record<string, string> }) => void;
  /** Pause and Resume, as NAMED verbs through the page's one dispatcher (`onVerb`), so a key or a
   *  hardware panel reaches them the same way this button does. */
  onTransport: (verb: 'pause' | 'resume') => void;
  setShows: (shows: Show[]) => void;
}) {
  /** The channel it is set to play on, for the pick. */
  const channel = channelOf(playoutSettings, item);
  return (
    <div className={`pd-editor${live ? ' live' : ''}`} data-testid="playout-cue-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">
          {item.kind === 'media' ? 'SERVER CLIP' : 'SERVER TEMPLATE'}
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
        <code>{item.name}</code> plays on the playout server, on{' '}
        <code>{slotAddress(itemSlot(playoutSettings, item))}</code>, through NoaCG
        Bridge.{' '}
        {item.kind === 'media'
          ? 'The monitors here show its still picture, marked STILL, never the moving video.'
          : 'It is not shown on the PROGRAM monitor here.'}
      </p>
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
      {/* LOOP, the one clip option: CasparCG repeats the file itself (`PLAY … LOOP`), so a
          looping background or sting needs nothing from this page until Out. It is read
          at Take, so a change while the clip is up says it applies to the next one. */}
      {item.kind === 'media' && (
        <label className="pd-clip-loop" data-testid="playout-loop-row">
          <input
            type="checkbox"
            checked={item.loop === true}
            onChange={(e) => setShows(setPlayoutItemLoop(showId, item.id, e.target.checked))}
            data-testid="playout-loop"
          />
          <span>Loop</span>
          <span className="muted">
            {live
              ? 'repeats until Out · a change applies at the next Take'
              : 'repeats until Out, instead of playing once'}
          </span>
        </label>
      )}
      {item.kind === 'media' && live && (
        <div className="row pd-clip-transport" data-testid="playout-clip-transport">
          <button onClick={() => onTransport('pause')} data-testid="playout-pause">
            ⏸ Pause
          </button>
          <button onClick={() => onTransport('resume')} data-testid="playout-resume">
            ▶ Resume
          </button>
        </div>
      )}
      {/* WHERE IT PLAYS, as a CasparCG client puts it: the channel, then the layer. The
          channel is a pick from the channels Settings names, never a typed number; a
          channel this studio does not name (a production made elsewhere, a row removed
          since) stays listed as itself rather than silently moving the cue. */}
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
      </div>
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
