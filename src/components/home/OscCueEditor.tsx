// THE OSC CUE EDITOR (docs/work-specs/osc-control-cues/spec.md D2, D9, AC-2, AC-9): the cue's name,
// where it sends, the OSC address and its typed arguments, and Send test. Props in, writes through
// model/shows.ts; what a Take sends is decided in control/oscSend.ts, never here.
//
// Text boxes are deferred (home/useDeferredEdits): a keystroke is not a write, and nothing here
// sends - only Send test and Take do.

import { useEffect, useState, type MutableRefObject } from 'react';
import { readControl, type OscArg, type OscArgType, type OscControlV1, type OscDestination } from '../../model/controlCue';
import { removeOscDestination, saveOscDestination, setCueControl, updateShowCueChecked, type Show, type ShowCue } from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { uuid } from '../../model/id';
import { oscBridgeState, type PlayoutSettings } from '../../control/playoutLink';
import { useDeferredEdits } from './useDeferredEdits';

const ARG_TYPES: { type: OscArgType; label: string }[] = [
  { type: 's', label: 'Text' },
  { type: 'i', label: 'Whole number' },
  { type: 'f', label: 'Decimal' },
];

interface Props {
  show: Show;
  cue: ShowCue;
  cueNo: number;
  setShows: (shows: Show[]) => void;
  /** Why Take would not send now (control/oscSend.ts `oscBlocker`), or null. */
  takeBlocked: string | null;
  /** Unpublished: graphics play on this page only, while OSC reaches the device for real. */
  rehearsing: boolean;
  playoutSettings: PlayoutSettings;
  /** Send the cue once, as Take would (the page's `controlSend`). */
  onSendTest: (cue: ShowCue) => void;
  setNote: (note: string) => void;
  /** The page's undoable rundown write (useRundownAuthoring `writeRundown`): every edit of this cue
   *  goes through it, so it is one undo step and never clears the history. */
  writeRundown: (write: () => { shows: Show[]; error: string | null }, label: string, failed?: string) => Promise<boolean>;
  /** Filled by this editor: the cue as it stands on screen, typing not yet saved included, and the
   *  flush that saves it. A Take reads it, so a hardware press sends what the operator sees. */
  pendingRef: MutableRefObject<((cueId: string) => { cue: ShowCue; flush: () => void } | null) | null>;
}

type Draft = { id: string; name: string; host: string; port: string };

export default function OscCueEditor({ show, cue, cueNo, setShows, takeBlocked, rehearsing, playoutSettings, onSendTest, setNote, writeRundown, pendingRef }: Props) {
  const control = readControl(cue.control);
  const destinations = show.oscDestinations ?? [];
  const [destDraft, setDestDraft] = useState<Draft | null>(null);
  const [bridge, setBridge] = useState<{ ready: boolean; detail: string } | null>(null);

  // Asked once per cue opened and per pairing: an unpaired browser asks nothing (oscBridgeState).
  const { agentUrl, agentToken } = playoutSettings;
  useEffect(() => {
    let live = true;
    void oscBridgeState({ agentUrl, agentToken }).then((s) => live && setBridge(s));
    return () => {
      live = false;
    };
  }, [cue.id, agentUrl, agentToken]);

  const writeControl = (next: OscControlV1) => void writeRundown(() => setCueControl(show.id, cue.id, next), 'Edit OSC cue', 'The OSC cue was not saved');

  const edits = useDeferredEdits((key, text) => {
    if (key === 'label') {
      void writeRundown(() => updateShowCueChecked(show.id, cue.id, { label: text.trim() || 'OSC cue' }), 'Rename cue', 'The cue name was not saved');
      return;
    }
    if (!control) return;
    if (key === 'address') writeControl({ ...control, address: text });
    else if (key.startsWith('arg:')) {
      const at = Number(key.slice(4));
      writeControl({ ...control, args: control.args.map((a, i) => (i === at ? { ...a, value: text } : a)) });
    }
  });

  // What a press reads: the cue with the boxes' unsaved text over it (home/AGENTS.md: a Take pressed
  // between a keystroke and a save airs the keystroke).
  const onScreen = control ? {
    ...cue,
    label: edits.text('label', cue.label).trim() || cue.label,
    control: { ...control, address: edits.text('address', control.address), args: control.args.map((a, i) => ({ ...a, value: edits.text(`arg:${i}`, a.value) })) },
  } : null;
  const { flush } = edits;
  useEffect(() => {
    pendingRef.current = (cueId) => (onScreen && cueId === onScreen.id ? { cue: onScreen, flush } : null);
  });
  useEffect(() => () => {
    pendingRef.current = null;
  }, [pendingRef]);

  if (!control) {
    return (
      <div className="pd-editor" data-testid="osc-cue-editor">
        <p className="pd-unsent-note">{cue.label} was saved by a newer version of NoaCG, so it is read-only here.</p>
      </div>
    );
  }

  const setArgs = (args: OscArg[]) => writeControl({ ...control, args });
  // The form closes only on a save storage has agreed to (src/components/AGENTS.md): a refused one
  // keeps what was typed and says why.
  const saveDestination = async () => {
    if (!destDraft) return;
    const draft = destDraft;
    const r = saveOscDestination(show.id, { id: draft.id, name: draft.name, host: draft.host, port: Number(draft.port) });
    setShows(r.shows);
    if (r.error) return setNote(r.error);
    const failure = await commitDurableWrites();
    if (failure) return setNote(`The destination was not saved: ${failure}`);
    if (control.destinationId !== draft.id) writeControl({ ...control, destinationId: draft.id });
    setDestDraft(null);
  };
  const editing = (d?: OscDestination): Draft => (d ? { id: d.id, name: d.name, host: d.host, port: String(d.port) } : { id: uuid(), name: '', host: '', port: '' });
  const current = destinations.find((d) => d.id === control.destinationId);

  return (
    <div className="pd-editor" data-testid="osc-cue-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">OSC{cueNo > 0 ? ` · ${cueNo}` : ''}</span>
        <input
          className="pd-cue-title"
          value={edits.text('label', cue.label)}
          onChange={(e) => edits.type('label', e.target.value)}
          onBlur={edits.flush}
          aria-label="Cue name"
          data-testid="cue-label"
        />
        <span
          className={bridge && !bridge.ready ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
          data-testid="osc-bridge-status"
          title="Sent means the message left this computer. UDP has no receipt, so a device that is off can still read as sent."
        >
          {bridge === null ? 'Checking NoaCG Bridge…' : bridge.detail}
        </span>
      </div>
      {rehearsing && <p className="hint" data-testid="osc-rehearsal">Graphics play on this page until you publish. OSC cues send to the device now.</p>}
      {takeBlocked && <p className="pd-unsent-note pd-take-blocked" data-testid="osc-take-blocked">{takeBlocked}</p>}

      <div className="pd-band-fields" data-testid="osc-fields">
        <label className="pd-field">
          <span>Destination</span>
          <select
            value={current ? current.id : ''}
            data-testid="osc-destination"
            onChange={(e) => (e.target.value === '+new' ? setDestDraft(editing()) : writeControl({ ...control, destinationId: e.target.value }))}
          >
            {!current && <option value="">{control.destinationId ? 'Missing device - choose one' : 'Choose…'}</option>}
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>{`${d.name} (${d.host}:${d.port})`}</option>
            ))}
            <option value="+new">New destination…</option>
          </select>
        </label>
        {current && !destDraft && (
          <button type="button" className="btn-small" data-testid="osc-destination-edit" onClick={() => setDestDraft(editing(current))}>Edit</button>
        )}
        {destDraft && (
          <div className="pd-osc-dest" data-testid="osc-destination-form">
            <label className="pd-field"><span>Name</span><input value={destDraft.name} onChange={(e) => setDestDraft({ ...destDraft, name: e.target.value })} data-testid="osc-dest-name" placeholder="Lighting desk" /></label>
            <label className="pd-field"><span>Address</span><input value={destDraft.host} onChange={(e) => setDestDraft({ ...destDraft, host: e.target.value })} data-testid="osc-dest-host" placeholder="192.168.1.40" /></label>
            <label className="pd-field"><span>Port</span><input inputMode="numeric" value={destDraft.port} onChange={(e) => setDestDraft({ ...destDraft, port: e.target.value })} data-testid="osc-dest-port" placeholder="8830" /></label>
            <button type="button" className="btn-small" onClick={() => void saveDestination()} data-testid="osc-dest-save">Save</button>
            <button type="button" className="btn-small" onClick={() => setDestDraft(null)}>Cancel</button>
            {destinations.some((d) => d.id === destDraft.id) && (
              <button type="button" className="btn-small" data-testid="osc-dest-remove" onClick={() => void (async () => {
                const r = removeOscDestination(show.id, destDraft.id);
                setShows(r.shows);
                const failure = r.error ?? (await commitDurableWrites());
                if (failure) return setNote(`The destination was not removed: ${failure}`);
                setDestDraft(null);
              })()}>Remove</button>
            )}
          </div>
        )}

        <label className="pd-field">
          <span>OSC address</span>
          <input
            value={edits.text('address', control.address)}
            onChange={(e) => edits.type('address', e.target.value)}
            onBlur={edits.flush}
            placeholder="/zeros/cue/go"
            spellCheck={false}
            data-testid="osc-address"
          />
        </label>

        {control.args.map((arg, i) => (
          <div className="pd-osc-arg" key={i} data-testid="osc-arg">
            <select value={arg.type} aria-label={`Argument ${i + 1} type`} onChange={(e) => setArgs(control.args.map((a, j) => (j === i ? { ...a, type: e.target.value as OscArgType } : a)))}>
              {ARG_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <input
              value={edits.text(`arg:${i}`, arg.value)}
              onChange={(e) => edits.type(`arg:${i}`, e.target.value)}
              onBlur={edits.flush}
              aria-label={`Argument ${i + 1}`}
              spellCheck={false}
              data-testid="osc-arg-value"
            />
            <button type="button" className="btn-small" aria-label={`Remove argument ${i + 1}`} onClick={() => setArgs(control.args.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-small" data-testid="osc-arg-add" disabled={control.args.length >= 16} onClick={() => setArgs([...control.args, { type: 's', value: '' }])}>
          + Argument
        </button>
      </div>

      <button type="button" data-testid="osc-send-test" disabled={!!takeBlocked} onClick={() => { edits.flush(); onSendTest(cue); }}>
        Send test
      </button>
    </div>
  );
}
