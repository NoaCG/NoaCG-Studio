import { useEffect, useRef, useState } from 'react';
import { readDefaultOutput, saveDefaultOutput } from '../backend/auth';
import { outputChoice } from '../model/outputSetup';
import { useAuthState } from './auth/useAuthState';

/** "Use CasparCG in new productions" (docs/work-specs/playout-workflow-simplification AC-4): the
 *  account's starting point for a new production's CasparCG switch. Every production keeps its
 *  own switch in its Playout panel; this only decides where a new one starts. Saved on the
 *  account, under the same metadata key the earlier output default used. */
export default function DefaultOutputPreference() {
  const { backendConfigured, user } = useAuthState();
  const account = useRef(user?.id);
  account.current = user?.id;
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setOn(false); setNote(null); setBusy(false);
    if (!user?.id) return;
    setBusy(true);
    void readDefaultOutput(user.id).then(r => {
      if (cancelled) return;
      setOn(!!r.setup?.destinations.some(d => d.profile === 'casparcg'));
      setNote(r.error);
      setBusy(false);
    });
    return () => { cancelled = true; };
  }, [user?.id]);
  if (!backendConfigured || !user) return null;
  return <div data-testid="default-output-preference">
    <label className="dlg-check">
      <input type="checkbox" checked={on} disabled={busy} onChange={async e => {
        const owner = user.id;
        const next = e.target.checked;
        // The box follows the press at once and goes back only if the account refuses the save.
        setOn(next);
        setBusy(true);
        const result = await saveDefaultOutput(owner, outputChoice('browser', next));
        if (account.current !== owner) return;
        if (result.error) setOn(!next);
        setNote(result.error);
        setBusy(false);
      }} data-testid="default-caspar" />
      <span>Use CasparCG in new productions</span>
    </label>
    {note && <p className="status-bad" role="alert">{note}</p>}
  </div>;
}
