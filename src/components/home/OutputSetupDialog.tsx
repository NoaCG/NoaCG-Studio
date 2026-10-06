import { useId, useState } from 'react';
import { useModalGate } from '../spaceKey';
import { hasCasparOutput, outputChoice, readOutputSetup, type OutputProfile, type ProductionOutputSetup } from '../../model/outputSetup';

export function OutputChoiceFields({ setup, onChange, disabled = false, autoFocus = false }: { setup: ProductionOutputSetup | null; onChange: (s: ProductionOutputSetup) => void; disabled?: boolean; autoFocus?: boolean }) {
  const id = useId();
  const browser = setup?.destinations.find(d => d.profile !== 'casparcg');
  const caspar = hasCasparOutput(setup);
  const primary = browser?.profile ?? (caspar ? 'casparcg' : '');
  return <>
    <div className="dlg-row">
      <label htmlFor={id}>Output</label>
      <select autoFocus={autoFocus} id={id} value={primary === 'obs' || primary === 'vmix' ? 'browser' : primary} disabled={disabled} data-testid="output-profile" onChange={e => {
        const value = e.target.value as OutputProfile;
        onChange(value === 'casparcg' ? outputChoice(null, true) : value ? outputChoice(value, browser ? caspar : false) : outputChoice(null, false));
      }}>
        <option value="">Choose output…</option>
        <option value="browser">Browser source (OBS, vMix)</option>
        <option value="casparcg">CasparCG through Bridge</option>
        <option value="spx">SPX template</option>
      </select>
    </div>
    {browser && <label className="dlg-check">
      <input type="checkbox" checked={caspar} disabled={disabled} onChange={e => onChange(outputChoice(browser.profile as Exclude<OutputProfile, 'casparcg'>, e.target.checked))} data-testid="output-also-caspar" />
      <span>Also use CasparCG through Bridge</span>
    </label>}
    <details className="hint"><summary>About these outputs</summary><p>{primary === 'spx' ? 'Download the SPX template after publishing. Operate the graphics from NoaCG.' : primary === 'casparcg' ? 'Bridge connects NoaCG to CasparCG. A browser source URL is also available in Playout settings.' : 'Add the URL to a browser source in OBS, vMix or another HTML system.'}</p></details>
  </>;
}

export default function OutputSetupDialog({ initial, publishing, canRemember, onConfirm, onClose }: {
  initial?: ProductionOutputSetup; publishing: boolean; canRemember: boolean;
  onConfirm: (s: ProductionOutputSetup, remember: boolean) => Promise<string | null>; onClose: () => void;
}) {
  useModalGate();
  const [setup, setSetup] = useState<ProductionOutputSetup | null>(() => readOutputSetup(initial));
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const confirm = async () => {
    if (!setup?.destinations.length) return;
    setBusy(true);
    try { setNote(await onConfirm(setup, remember)); }
    catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="gallery-backdrop" onClick={() => !busy && onClose()}>
    <div className="wz-modal save-dialog pd-output-dialog" role="dialog" aria-modal="true" aria-labelledby="output-setup-title" onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }} onClick={e => e.stopPropagation()} data-testid="output-setup-dialog">
      <div className="wz-header"><h2 id="output-setup-title">Choose production output</h2><button className="gallery-close" onClick={onClose} disabled={busy} title="Close">✕</button></div>
      <div className="prod-export-body">
        <OutputChoiceFields autoFocus setup={setup} onChange={setSetup} disabled={busy} />
        {publishing && canRemember && <label className="dlg-check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} disabled={busy} data-testid="remember-output" /><span>Remember my choice<span className="hint">Use it for future new productions on my account. Change it later in Settings → Workflow defaults.</span></span></label>}
        <p className="hint">Changing this setup does not stop or reroute an active output.</p>
        {note && <p className="status-bad" role="alert">{note}</p>}
      </div>
      <div className="dlg-foot"><button onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={busy || !setup?.destinations.length} onClick={() => void confirm()} data-testid="confirm-output">{busy ? 'Saving…' : publishing ? 'Publish' : 'Save output'}</button></div>
    </div>
  </div>;
}
