import { useEffect, useRef, useState } from 'react';
import type { AssetFile, GraphicSoundBinding, ProductionSounds as Config, SoundAssetRef, SpxTemplate } from '../../model/types';
import { productionSoundTargets, setProductionSound, soundPath } from '../../blocks/productionSoundEdit';
import { isProductionSounds, soundTopology, productionSoundSourceError } from '../../assets/productionSounds';
import { auditionSound, readSound, SOUND_ACCEPT } from '../../assets/graphicSound';
import { rememberSound, AUDIO_REF_PREFIX, isSoundAssetRef } from '../../assets/soundAssets';
import { isAudioAsset } from '../../assets/assetUtils';
import { uuid } from '../../model/id';
import { authoringSoundLoader } from '../../backend/productionAudio';
import '../sounds.css';

async function adopt(template: SpxTemplate, config?: Config): Promise<Config> {
  if (config) return config;
  let next: Config = { v: 1, assets: [], visuals: {} };
  for (const target of productionSoundTargets(template)) {
    if (!target.sound) continue;
    const asset = template.assets.find(a => a.path === target.sound!.asset);
    if (!asset) throw new Error(`Missing sound: ${target.sound.asset}`);
    const ref = await rememberSound(asset);
    next = setProductionSound(template,next,'graphic',target.key,{ ...target.sound, asset: soundPath(ref) },ref);
  }
  return next;
}

/** Secondary, production-shared settings, always below the graphic's normal controls. */
export default function ProductionSounds({ template, config, assets: shared, visual, onSave }: {
  template: SpxTemplate; config?: Config; assets: SoundAssetRef[]; visual: string;
  onSave: (config: Config, expected: string, source: {js: string; topology: string}) => Promise<void>;
}) {
  const targets = productionSoundTargets(template);
  const invalid = !!config && !isProductionSounds(config);
  const sourceError = productionSoundSourceError(template);
  const bindings = (invalid ? {} : config?.visuals?.[visual]?.bindings) ?? Object.fromEntries(targets.filter(t=>t.sound).map(t=>[t.key,t.sound!]));
  const attached = Object.entries(bindings), unused = targets.filter(t=>!bindings[t.key]);
  const changed = invalid || !!sourceError || (!!config?.visuals?.[visual] && attached.length > 0 && config.visuals[visual].topology !== soundTopology(template));
  const [open,setOpen] = useState(false), [editing,setEditing] = useState(''), [adding,setAdding] = useState(false);
  const [trigger,setTrigger] = useState(''), [assetHash,setAssetHash] = useState(''), [mode,setMode] = useState<GraphicSoundBinding['mode']>('one-shot');
  const [level,setLevel] = useState(0), [enabled,setEnabled] = useState(true);
  const [levelText,setLevelText] = useState('0');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [playing,setPlaying] = useState(false);
  const audition = useRef<ReturnType<typeof auditionSound> | null>(null), upload = useRef<HTMLInputElement>(null), generation = useRef({ value: 0 }).current;
  const stop = () => { audition.current?.stop(); audition.current = null; setPlaying(false); };
  useEffect(() => { generation.value++; stop(); setBusy(false); return () => { generation.value++; audition.current?.stop(); }; }, [template.js,visual,generation]);
  useEffect(() => { audition.current?.stop(); audition.current = null; setPlaying(false); }, [config]);
  useEffect(() => { setLevelText(String(level)); }, [level]);
  const assets = [...new Map([...shared,...(invalid ? [] : config?.assets ?? [])].filter(isSoundAssetRef).map(a=>[a.hash,a])).values()];
  const key = adding ? trigger : editing;
  const target = targets.find(t=>t.key === key), existing = adding ? undefined : bindings[key];
  const legacy = template.assets.filter(a=>isAudioAsset(a.path) && !a.audio);
  const select = (key: string, add: boolean) => {
    stop(); setError(''); setAdding(add); setEditing(add ? '' : key); setTrigger(key); setAssetHash('');
    const b = add ? undefined : bindings[key]; setMode(b?.mode ?? 'one-shot'); setLevel(b?.levelDb ?? 0); setEnabled(b?.enabled ?? true);
    setLevelText(String(b?.levelDb ?? 0));
  };
  const save = async (sound?: GraphicSoundBinding, asset?: SoundAssetRef) => {
    const run = generation.value, expected = JSON.stringify(config ?? null), source = {js:template.js,topology:soundTopology(template)};
    stop(); setBusy(true); setError('');
    try {
      const initial = await adopt(template,config);
      if (run !== generation.value) return;
      const next = setProductionSound(template,initial,visual,key,sound,asset);
      if (JSON.stringify(next) === expected) return;
      await onSave(next,expected,source);
      if (run !== generation.value) return;
      if (sound) { setAdding(false); setEditing(key); setAssetHash(''); }
      else setEditing('');
    } catch (cause) { if (run === generation.value) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (run === generation.value) setBusy(false); }
  };
  const choose = async (value: string, attach: boolean) => {
    const run = generation.value; setBusy(true); setError('');
    try {
      const ref = assets.find(a=>a.hash === value) ?? await rememberSound(legacy.find(a=>a.path === value)!);
      if (run === generation.value && attach) await save(descriptor(ref),ref);
    } catch (cause) { if (run === generation.value) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (run === generation.value) setBusy(false); }
  };
  const descriptor = (ref: SoundAssetRef): GraphicSoundBinding => ({ id: existing?.id ?? uuid(), asset: soundPath(ref), enabled, mode, levelDb: level });
  const modify = (patch: Partial<GraphicSoundBinding>) => { if (existing) void save({ ...existing,...patch }); };
  const assetFor = (path: string): AssetFile | undefined => {
    const ref = assets.find(a=>soundPath(a) === path);
    return ref ? { path, data: AUDIO_REF_PREFIX + ref.hash, audio: ref } : template.assets.find(a=>a.path === path);
  };
  const listen = () => {
    stop(); setError(''); const asset = existing && assetFor(existing.asset); if (!asset || !existing) return;
    const current = auditionSound(asset,level,mode === 'loop',authoringSoundLoader); audition.current = current; setPlaying(true);
    void current.ready.catch(cause=>{ if (audition.current === current) setError(String(cause.message ?? cause)); });
    void current.finished.then(()=>{ if (audition.current === current) { audition.current = null; setPlaying(false); } });
  };
  return <details className="sound-controls production-sounds" data-testid="production-sounds" onToggle={e=>{ setOpen(e.currentTarget.open); if (!e.currentTarget.open) stop(); }}>
    <summary>Sounds · {attached.length ? `${attached.length} attached` : 'None'}</summary>
    {open && <div className="sound-controls-body">
      {changed && <p role="alert">{sourceError ?? (invalid ? 'Sound configuration is unreadable. Its saved data is preserved for repair.' : 'Triggers changed. Review these attachments. Remove and reattach them to the intended triggers.')}</p>}
      <div className="sound-attachments">{attached.map(([k,b])=>{
        const asset = assets.find(a=>soundPath(a) === b.asset);
        return <button type="button" className={`sound-attachment${editing === k ? ' selected' : ''}`} key={k} disabled={busy} onClick={()=>select(k,false)} title="Edit sound attachment">
          <span>{targets.find(t=>t.key === k)?.label ?? 'Trigger needs review'}</span><span aria-hidden="true">→</span>
          <span className="sound-filename" title={asset?.name ?? b.asset}>{asset?.name ?? b.asset.split('/').pop()}</span><span>{b.levelDb > 0 ? '+' : ''}{b.levelDb} dB</span>
          {!b.enabled && <span className="hint">Disabled</span>}
        </button>;
      })}</div>
      {!adding && <button type="button" className="sound-add" disabled={busy || !unused.length || changed || visual === 'picture:'} onClick={()=>select(unused[0]?.key ?? '',true)}>Add sound</button>}
      {(adding || existing) && <div className="sound-binding-editor">
        {adding && <label>Trigger<select aria-label="Sound trigger" value={trigger} disabled={busy} onChange={e=>select(e.target.value,true)}>{unused.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label>}
        <label>{adding ? 'Sound' : 'Change sound'}<select aria-label={adding ? 'Choose sound' : 'Change sound'} value={assetHash} disabled={busy || changed} onChange={async e=>{
          const value=e.target.value; setAssetHash(value); if (!value) return;
          await choose(value,!adding);
        }}><option value="">{adding ? 'Choose an existing sound…' : 'Choose a replacement…'}</option>{assets.map(a=><option key={a.hash} value={a.hash}>{a.name}</option>)}{legacy.map(a=><option key={a.path} value={a.path}>{a.path.split('/').pop()}</option>)}</select></label>
        <div className="sound-buttons"><button type="button" disabled={busy || changed} onClick={()=>upload.current?.click()}>Upload sound</button>
          {adding && <button type="button" disabled={busy || !assetHash} onClick={()=>void choose(assetHash,true)}>Attach sound</button>}
          {!adding && <button type="button" disabled={busy} onClick={()=>void save()}>Remove attachment</button>}
          <button type="button" disabled={busy} onClick={()=>{ stop(); setAdding(false); setEditing(''); }}>Close settings</button>
        </div>
        <label className="sound-enabled"><input type="checkbox" checked={enabled} disabled={busy || changed} onChange={e=>{ setEnabled(e.target.checked); modify({enabled:e.target.checked}); }} />Enabled</label>
        <label>Playback<select aria-label="Sound playback" value={mode} disabled={busy || changed} onChange={e=>{ const value=e.target.value as GraphicSoundBinding['mode']; setMode(value); modify({mode:value}); }}><option value="one-shot">Play once</option>{target?.loop && <option value="loop">Loop while active</option>}</select></label>
        <div className="sound-level"><label>Level</label><input aria-label="Sound level slider" type="range" min={-60} max={6} step={1} value={level} disabled={busy || changed} onChange={e=>setLevel(Number(e.target.value))} onPointerUp={()=>modify({levelDb:level})} onKeyUp={()=>modify({levelDb:level})} />
          <input aria-label="Sound level dB" type="number" min={-60} max={6} step={1} value={levelText} disabled={busy || changed} onChange={e=>{ setLevelText(e.target.value); if (Number.isInteger(e.target.valueAsNumber)) setLevel(e.target.valueAsNumber); }} onBlur={()=>{ const value=Number(levelText); if(levelText.trim() && Number.isInteger(value) && value >= -60 && value <= 6) modify({levelDb:value}); else { setLevel(existing?.levelDb ?? 0); setLevelText(String(existing?.levelDb ?? 0)); setError('Use a whole dB value from -60 to +6.'); } }} /><span>dB</span><button type="button" disabled={busy || changed || level === 0} onClick={()=>{ setLevel(0); modify({levelDb:0}); }}>Reset level</button></div>
        {!adding && <button type="button" disabled={busy || !existing || !assetFor(existing.asset)} onClick={playing ? stop : listen}>{playing ? 'Stop audition' : 'Audition sound'}</button>}
        <input ref={upload} aria-label="Upload graphic sound" type="file" accept={SOUND_ACCEPT} hidden onChange={async e=>{
          const file=e.target.files?.[0]; e.target.value=''; if (!file) return; const run=generation.value;
          setBusy(true); setError('');
          try { const ref=await rememberSound(await readSound(file)); if(run === generation.value) await save(descriptor(ref),ref); }
          catch (cause) { if(run === generation.value) setError(cause instanceof Error ? cause.message : String(cause)); }
          finally { if(run === generation.value) setBusy(false); }
        }} />
      </div>}
      <p className="hint">Shared by every cue of this visual. Publish changes before taking them on air. Audition plays here.</p>
      {busy && <p role="status">Preparing sound…</p>}{error && <p role="alert">{error}</p>}
    </div>}
  </details>;
}
