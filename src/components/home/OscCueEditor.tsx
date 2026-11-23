// THE OSC CUE EDITOR (docs/work-specs/osc-control-cues/spec.md D2, D9, AC-2, AC-9): the cue's name,
// where it sends, the OSC address and its typed arguments, and Send test. Props in, writes through
// model/shows.ts; what a Take sends is decided in control/oscSend.ts, never here.
//
// Text boxes are deferred (home/useDeferredEdits): a keystroke is not a write, and nothing here
// sends - only Send test and Take do.

import { useEffect, useState, type MutableRefObject } from 'react';
import { readControl, type OscArg, type OscArgType, type OscControlV1, type OscDestination, type OscMessage } from '../../model/controlCue';
import { removeOscDestination, saveOscDestination, setCueControl, updateShowCueChecked, type Show, type ShowCue } from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { uuid } from '../../model/id';
import { oscBridgeState, type PlayoutSettings } from '../../control/playoutLink';
import { useDeferredEdits } from './useDeferredEdits';
import InfoTip from './InfoTip';

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
  /** Send the cue's Take or On Out message once (the page's `controlSend`). */
  onSendTest: (cue: ShowCue, which: 'take' | 'out') => void;
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

  /** One edit as a change to the message as stored when its write runs, never this render's copy:
   *  two edits queued back to back (a destination, then an address) both land. */
  const writeControl = (change: (current: OscControlV1) => OscControlV1) =>
    void writeRundown(() => setCueControl(show.id, cue.id, change), 'Edit OSC cue', 'The OSC cue was not saved');

  const edits = useDeferredEdits((key, text) => {
    if (key === 'label') {
      void writeRundown(() => updateShowCueChecked(show.id, cue.id, { label: text.trim() || 'OSC cue' }), 'Rename cue', 'The cue name was not saved');
      return;
    }
    if (!control) return;
    if (key === 'address') writeControl((c) => ({ ...c, address: text }));
    else if (key === 'out-address') writeControl((c) => withOut(c, (m) => ({ ...m, address: text })));
    else if (key.startsWith('arg:')) {
      const at = Number(key.slice(4));
      writeControl((c) => ({ ...c, args: c.args.map((a, i) => (i === at ? { ...a, value: text } : a)) }));
    } else if (key.startsWith('out-arg:')) {
      const at = Number(key.slice(8));
      writeControl((c) => withOut(c, (m) => ({ ...m, args: m.args.map((a, i) => (i === at ? { ...a, value: text } : a)) })));
    }
  });

  // What a press reads: the cue with the boxes' unsaved text over it (home/AGENTS.md: a Take pressed
  // between a keystroke and a save airs the keystroke).
  const onScreen = control ? {
    ...cue,
    label: edits.text('label', cue.label).trim() || cue.label,
    control: {
      ...control,
      address: edits.text('address', control.address),
      args: control.args.map((a, i) => ({ ...a, value: edits.text(`arg:${i}`, a.value) })),
      ...(control.out || edits.text('out-address', '') ? {
        out: {
          address: edits.text('out-address', control.out?.address ?? ''),
          args: (control.out?.args ?? []).map((a, i) => ({ ...a, value: edits.text(`out-arg:${i}`, a.value) })),
        },
      } : {}),
    },
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

  const setArgs = (change: (args: OscArg[]) => OscArg[]) => writeControl((c) => ({ ...c, args: change(c.args) }));
  const setOutArgs = (change: (args: OscArg[]) => OscArg[]) => writeControl((c) => withOut(c, (m) => ({ ...m, args: change(m.args) })));
  /** One message's address and arguments: the Take message, or the On Out one (`prefix` 'out-'). */
  const messageFields = (message: OscMessage, prefix: '' | 'out-', change: (change: (args: OscArg[]) => OscArg[]) => void) => (
    <>
      <label className="pd-field">
        <span>{prefix ? 'On Out address' : 'OSC address'}</span>
        <input
          value={edits.text(`${prefix}address`, message.address)}
          onChange={(e) => edits.type(`${prefix}address`, e.target.value)}
          onBlur={edits.flush}
          placeholder={prefix ? 'Optional: sent at Out' : '/zeros/cue/go'}
          spellCheck={false}
          data-testid={`osc-${prefix}address`}
        />
      </label>
      {message.args.map((arg, i) => (
        <div className="pd-osc-arg" key={i} data-testid={`osc-${prefix}arg`}>
          <select value={arg.type} aria-label={`${prefix ? 'On Out argument' : 'Argument'} ${i + 1} type`} onChange={(e) => {
            const type = e.target.value as OscArgType;
            change((args) => args.map((a, j) => (j === i ? { ...a, type } : a)));
          }}>
            {ARG_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
          <input
            value={edits.text(`${prefix}arg:${i}`, arg.value)}
            onChange={(e) => edits.type(`${prefix}arg:${i}`, e.target.value)}
            onBlur={edits.flush}
            aria-label={`${prefix ? 'On Out argument' : 'Argument'} ${i + 1}`}
            spellCheck={false}
            data-testid={`osc-${prefix}arg-value`}
          />
          <button type="button" className="btn-small" aria-label={`Remove ${prefix ? 'On Out argument' : 'argument'} ${i + 1}`} onClick={() => change((args) => args.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-small" data-testid={`osc-${prefix}arg-add`} disabled={message.args.length >= 16} onClick={() => change((args) => (args.length >= 16 ? args : [...args, { type: 's', value: '' }]))}>
        + Argument
      </button>
    </>
  );
  const out = control.out ?? { address: '', args: [] };
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
    writeControl((c) => (c.destinationId === draft.id ? c : { ...c, destinationId: draft.id }));
    setDestDraft(null);
  };
  const editing = (d?: OscDestination): Draft => (d ? { id: d.id, name: d.name, host: d.host, port: String(d.port) } : { id: uuid(), name: '', host: '', port: '' });
  const current = destinations.find((d) => d.id === control.destinationId);

  return (
    <div className="pd-editor" data-testid="osc-cue-editor">
      <div className="pd-editor-head">
        <span className="pd-editor-kicker">OSC{cueNo > 0 ? ` · ${cueNo}` : ''}</span>
        <InfoTip label="How an OSC cue works" testid="osc-help">
          <span className="pd-osc-help">
            <strong>Take</strong> sends one message to a device. It never goes on air.
            <br /><strong>Destination</strong>: the device's IP address and its OSC port, from its settings or manual.
            <br /><strong>OSC address</strong>: the command, starting with /, exactly as the device lists it.
            <br /><strong>Arguments</strong>: values after the address. Text, Whole number or Decimal, as the device asks: &quot;5&quot; and 5 differ.
            <br /><strong>On Out</strong>: optional. Sent at Out on this cue, or when the folder that sent it goes out, for example lights back to normal.
            <br />Graphic and lights together: put both in an All together folder. Each can have a Delay there.
            <br /><a href="/docs#osc" target="_blank" rel="noreferrer">Full guide</a>
          </span>
        </InfoTip>
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
            onChange={(e) => {
              const chosen = e.target.value;
              if (chosen === '+new') setDestDraft(editing());
              else writeControl((c) => ({ ...c, destinationId: chosen }));
            }}
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

        {messageFields(control, '', setArgs)}
        <div className="pd-osc-out" data-testid="osc-out">{messageFields(out, 'out-', setOutArgs)}</div>
      </div>

      <div className="pd-osc-tests">
        <button type="button" data-testid="osc-send-test" disabled={!!takeBlocked} onClick={() => { edits.flush(); onSendTest(cue, 'take'); }}>
          Send test
        </button>
        {out.address.trim() && (
          <button type="button" data-testid="osc-send-out-test" disabled={!!takeBlocked} onClick={() => { edits.flush(); onSendTest(cue, 'out'); }}>
            Send On Out test
          </button>
        )}
      </div>
    </div>
  );
}

/** The cue's message with its On Out message changed; an On Out left with no address and no
 *  arguments is removed, so a cue without one keeps the record it always had. */
function withOut(c: OscControlV1, change: (m: OscMessage) => OscMessage): OscControlV1 {
  const next = change(c.out ?? { address: '', args: [] });
  if (!next.address && !next.args.length) {
    const rest = { ...c };
    delete rest.out;
    return rest;
  }
  return { ...c, out: next };
}
