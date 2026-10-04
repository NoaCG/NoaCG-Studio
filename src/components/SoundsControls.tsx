import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SpxTemplate } from '../model/types';
import type { AnimSound } from '../blocks/animData';
import { soundTargets, type SoundOperation } from '../blocks/soundEdit';
import { isAudioAsset } from '../assets/assetUtils';
import { auditionSound, readSound, SOUND_ACCEPT } from '../assets/graphicSound';
import './sounds.css';

export default function SoundsControls({ template, onEdit }: {
  template: SpxTemplate; onEdit: (operation: SoundOperation, expectedJs: string) => void | Promise<void>;
}) {
  const targets = useMemo(() => soundTargets(template), [template]);
  const [chosen, setChosen] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [auditioning, setAuditioning] = useState(false);
  const target = targets.find(t => t.key === chosen) ?? targets[0], sound = target?.sound;
  const assets = template.assets.filter(a => isAudioAsset(a.path));
  const audition = useRef<ReturnType<typeof auditionSound> | null>(null), token = useRef({ value: 0 });
  const generation = token.current;
  const upload = useRef<HTMLInputElement>(null), levelId = useId();
  const stopAudition = () => { audition.current?.stop(); audition.current = null; setAuditioning(false); };
  useEffect(() => {
    generation.value++; audition.current?.stop(); audition.current = null; setAuditioning(false); setBusy(false);
    return () => { generation.value++; audition.current?.stop(); audition.current = null; };
  }, [template.js, target?.key, generation]);
  const edit = async (next?: AnimSound, asset?: SoundOperation['asset'], expectedJs = template.js, run = generation.value) => {
    if (!target || run !== generation.value) return;
    stopAudition(); setError(''); setBusy(true);
    try { await onEdit({ kind: 'sound.set', target: target.key, sound: next, asset }, expectedJs); }
    catch (cause) { if (run === generation.value) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (run === generation.value) setBusy(false); }
  };
  const attach = (path: string): AnimSound => ({ id: sound?.id ?? `sound-${crypto.randomUUID()}`, asset: path,
    enabled: sound?.enabled ?? false, levelDb: sound?.levelDb ?? 0, mode: sound?.mode ?? 'one-shot' });
  const listen = () => {
    stopAudition(); setError('');
    const asset = assets.find(a => a.path === sound?.asset);
    if (!asset || !sound) return;
    try {
      const current = auditionSound(asset, sound.levelDb, sound.mode === 'loop');
      audition.current = current; setAuditioning(true);
      void current.ready.catch(cause => { if (audition.current === current) setError(String(cause.message ?? cause)); });
      void current.finished.then(() => { if (audition.current === current) { audition.current = null; setAuditioning(false); } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <details className="sound-controls" data-testid="sound-controls">
    <summary><strong>Sounds</strong><span className="hint">{targets.filter(t => t.sound?.enabled).length} enabled</span></summary>
    <div className="sound-controls-body">
      {!target ? <p className="hint">Sounds need editable animation data. This graphic’s source is preserved.</p> : <>
        <label>Move<select aria-label="Sound move" value={target.key} disabled={busy} onChange={e => { stopAudition(); setError(''); setChosen(e.target.value); }}>
          {targets.map(t => <option key={t.key} value={t.key}>{t.label}{t.sound ? ' · sound attached' : ''}</option>)}
        </select></label>
        {target.reason && <p className="hint">{target.reason}</p>}
        <label>Sound<select aria-label="Sound asset" value={sound?.asset ?? ''} disabled={busy || !!target.reason} onChange={e => void edit(e.target.value ? attach(e.target.value) : undefined)}>
          <option value="">None</option>{assets.map(a => <option key={a.path} value={a.path}>{a.path.split('/').pop()}</option>)}
          {sound && !assets.some(a => a.path === sound.asset) && <option value={sound.asset}>Missing: {sound.asset}</option>}
        </select></label>
        <div className="sound-buttons">
          <button disabled={busy || !!target.reason} onClick={() => upload.current?.click()}>Upload sound</button>
          {sound && <button disabled={busy} onClick={() => void edit()}>Remove attachment</button>}
          <input ref={upload} type="file" accept={SOUND_ACCEPT} aria-label="Upload sound file" hidden onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
            const run = generation.value, expectedJs = template.js, descriptor = attach('');
            setError(''); setBusy(true);
            try { const asset = await readSound(file); if (run === generation.value) await edit({ ...descriptor, asset: asset.path }, asset, expectedJs, run); }
            catch (cause) { if (run === generation.value) setError(cause instanceof Error ? cause.message : String(cause)); }
            finally { if (run === generation.value) setBusy(false); }
          }} />
        </div>
        {sound && <>
          <label className="sound-enabled"><input type="checkbox" checked={sound.enabled} disabled={busy || !!target.reason} onChange={e => void edit({ ...sound, enabled: e.target.checked })} />Enabled</label>
          <label>Playback<select aria-label="Sound playback" value={sound.mode} disabled={busy || !!target.reason} onChange={e => void edit({ ...sound, mode: e.target.value as AnimSound['mode'] })}>
            <option value="one-shot">Play once</option>{target.loop && <option value="loop">Loop while active</option>}
          </select></label>
          <div className="sound-level"><label htmlFor={levelId}>Level</label>
            <input id={levelId} aria-label="Sound level" key={`${sound.id}:${sound.levelDb}`} type="number" min={-60} max={6} step={1} defaultValue={sound.levelDb} disabled={busy || !!target.reason} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={e => {
              const value = e.currentTarget.valueAsNumber;
              if (!Number.isFinite(value) || value < -60 || value > 6) { e.currentTarget.value = String(sound.levelDb); setError('Use a level from -60 to +6 dB.'); }
              else if (value !== sound.levelDb) void edit({ ...sound, levelDb: value });
            }} /><span>dB</span><button disabled={busy || sound.levelDb === 0 || !!target.reason} onClick={() => void edit({ ...sound, levelDb: 0 })}>Reset level</button>
          </div>
          <div className="sound-buttons"><button disabled={busy || !assets.some(a => a.path === sound.asset)} onClick={auditioning ? stopAudition : listen}>{auditioning ? 'Stop audition' : 'Audition sound'}</button></div>
        </>}
        <p className="hint">New attachments start disabled. Previews stay silent. Audition plays this sound here.</p>
        <p className="hint">Changes apply to the next execution. Publish changes before taking them on air.</p>
      </>}
      {busy && <p role="status">Preparing sound…</p>}{error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
