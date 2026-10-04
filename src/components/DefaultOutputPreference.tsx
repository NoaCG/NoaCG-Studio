import { useEffect, useRef, useState } from 'react';
import { readDefaultOutput, saveDefaultOutput } from '../backend/auth';
import { OUTPUT_PROFILES, outputChoice, outputSetupLabel, type ProductionOutputSetup } from '../model/outputSetup';
import { useAuthState } from './auth/useAuthState';

const CHOICES = [null, ...OUTPUT_PROFILES.flatMap(p => p.id === 'casparcg' ? [outputChoice(null, true)] : [outputChoice(p.id, false), outputChoice(p.id, true)])];
export default function DefaultOutputPreference() {
  const { backendConfigured, user } = useAuthState();
  const account = useRef(user?.id);
  account.current = user?.id;
  const [setup, setSetup] = useState<ProductionOutputSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSetup(null); setNote(null); setBusy(false);
    if (!user?.id) return;
    setBusy(true);
    void readDefaultOutput(user.id).then(r => { if (!cancelled) { setSetup(r.setup); setNote(r.error); setBusy(false); } });
    return () => { cancelled = true; };
  }, [user?.id]);
  if (!backendConfigured || !user) return null;
  const index = CHOICES.findIndex(c => c?.destinations.map(d => d.profile).sort().join(',') === setup?.destinations.map(d => d.profile).sort().join(','));
  return <div className="dlg-row" data-testid="default-output-preference">
    <label htmlFor="default-production-output">Default production output</label>
    <select id="default-production-output" disabled={busy} value={Math.max(0, index)} onChange={async e => {
      const owner = user.id;
      const next = CHOICES[Number(e.target.value)];
      setBusy(true);
      const result = await saveDefaultOutput(owner, next);
      if (account.current !== owner) return;
      if (!result.error) setSetup(next);
      setNote(result.error ?? '✓ Default saved for future new productions.');
      setBusy(false);
    }}>
      {CHOICES.map((c, i) => <option value={i} key={i}>{c ? outputSetupLabel(c) : 'Ask every time'}</option>)}
    </select>
    <p className="dlg-hint">{note ?? 'Saved on your account. Existing productions and duplicates keep their own setup.'}</p>
  </div>;
}
