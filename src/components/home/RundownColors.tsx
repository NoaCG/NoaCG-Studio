import { accentColor, routeColor } from '../../model/outputSetup';
import { setCueAccentColor, setRundownColor, type Show, type ShowCue } from '../../model/shows';
import type { PlayoutSettings } from '../../control/playoutLink';

export function CueAccentControl({ show, cue, setShows, fallback }: { show: Show; cue: ShowCue; setShows: (s: Show[]) => void; fallback: string }) {
  const custom = accentColor(cue.accentColor);
  return <div className="pd-cue-highlight-control" data-testid="cue-highlight">
    <label>Highlight <input type="color" aria-label="Cue highlight color" value={custom ?? fallback} onChange={e => setShows(setCueAccentColor(show.id, cue.id, e.target.value))} /></label>
    <button disabled={!custom} onClick={() => setShows(setCueAccentColor(show.id, cue.id, null))}>Reset to default</button>
  </div>;
}
export default function RundownColors({ show, settings, setShows }: { show: Show; settings: PlayoutSettings; setShows: (s: Show[]) => void }) {
  const routes = [{ key: 'output', label: 'NoaCG output', channel: undefined }, ...settings.channels.map(c => ({ key: `channel:${c.channel}`, label: `Channel ${c.channel}`, channel: c.channel }))];
  return <details className="pd-rundown-colors" data-testid="rundown-colors"><summary>Rundown colors</summary>
    {routes.map(r => <div className="pd-cue-highlight-control" key={r.key}>
      <label>{r.label} <input type="color" aria-label={`${r.label} color`} value={routeColor(show.rundownColors, r.channel)} onChange={e => setShows(setRundownColor(show.id, r.key, e.target.value))} /></label>
      <button disabled={!show.rundownColors?.[r.key]} onClick={() => setShows(setRundownColor(show.id, r.key, null))}>Reset</button>
    </div>)}
    <p className="hint">These accents identify routes. Custom cue highlights and ON AIR/PVW colors remain independent.</p>
  </details>;
}
