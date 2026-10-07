import { accentColor, routeColor } from '../../model/outputSetup';
import { setCueAccentColor, setRundownColor, type Show, type ShowCue } from '../../model/shows';
import type { PlayoutSettings } from '../../control/playoutLink';
import { useDeferredEdits } from './useDeferredEdits';

export function CueAccentControl({ show, cue, setShows, fallback, onPreview }: { show: Show; cue: ShowCue; setShows: (s: Show[]) => void; fallback: string; onPreview: (color: string | null) => void }) {
  const custom = accentColor(cue.accentColor);
  const edits = useDeferredEdits((key, value) => {
    const [showId, cueId] = JSON.parse(key) as [string, string];
    setShows(setCueAccentColor(showId, cueId, value));
    onPreview(null);
  });
  const key = JSON.stringify([show.id, cue.id]);
  return <div className="pd-cue-highlight-control" data-testid="cue-highlight">
    <label>Highlight <input type="color" aria-label="Cue highlight color" value={edits.text(key, custom ?? fallback)} onChange={e => { edits.type(key, e.target.value); onPreview(e.target.value); }} onBlur={edits.flush} /></label>
    <button disabled={!custom && !edits.dirty(key)} onClick={() => { edits.flush(); setShows(setCueAccentColor(show.id, cue.id, null)); }}>Reset to default</button>
  </div>;
}
/** One swatch per route: the NoaCG output, and each CasparCG channel while CasparCG is on. A route
 *  with its own colour offers Reset; nothing here needs explaining. */
export default function RundownColors({ show, settings, casparOn, setShows }: { show: Show; settings: PlayoutSettings; casparOn: boolean; setShows: (s: Show[]) => void }) {
  const edits = useDeferredEdits((key, value) => {
    const [showId, route] = JSON.parse(key) as [string, string];
    setShows(setRundownColor(showId, route, value));
  });
  const routes = [{ key: 'output', label: 'NoaCG output', channel: undefined }, ...(casparOn ? settings.channels.map(c => ({ key: `channel:${c.channel}`, label: `Channel ${c.channel}`, channel: c.channel })) : [])];
  return <div className="pd-rundown-colors" data-testid="rundown-colors">
    {routes.map(r => <div className="pd-cue-highlight-control" key={r.key}>
      <label>{r.label} <input type="color" aria-label={`${r.label} color`} value={edits.text(JSON.stringify([show.id, r.key]), routeColor(show.rundownColors, r.channel))} onChange={e => edits.type(JSON.stringify([show.id, r.key]), e.target.value)} onBlur={edits.flush} /></label>
      {show.rundownColors?.[r.key] && <button onClick={() => { edits.flush(); setShows(setRundownColor(show.id, r.key, null)); }}>Reset</button>}
    </div>)}
  </div>;
}
