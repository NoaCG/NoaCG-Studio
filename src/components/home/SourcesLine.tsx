import { useMemo, useState, useSyncExternalStore } from 'react';
import LibMenu from './LibMenu';
import { hasReaderLine, noacgReads, setShowSourcePaused, sourceKindWord, type Show, type ShowSource } from '../../model/shows';
import { SHEET_READ_MS, type SheetStatus, type SourceStatusStore } from '../../control/sheetSource';
import { FEED_READ_MS } from '../../control/feedSource';
import { jsonEveryMs } from '../../control/jsonSource';
import { fileAsk } from '../../control/fileSource';
import { allowFile, canPickFiles, pickFile, saveFileHandle } from '../../control/fileHandles';
import { useNow } from './ClipClock';
import { liveDataUrl, ownReaderGate, type OwnReaderGate } from '../../control/liveData';
import type { GraphicDoc } from '../../model/library';
import type { SavedGraphic } from '../../model/packets';
import { sourcePaths } from '../../model/productionData';
import { heldListOnAir, heldListsWaiting } from '../../control/contentFormats';
import type { LiveCueMap } from '../../control/liveCue';

/** A graphic of the production whose own code reads a Sheet (the retired block, data-sources C6). */
export interface OwnSheetReader {
  graphic: string;
  url: string | null;
  gate: OwnReaderGate;
}

/** What this page has observed of the published output (ProductionPage): the graphics whose
 *  published payload still reads a Sheet, and the graphics seen with a reader that no output is
 *  yet proven rid of (cleared only on positive evidence: off air, every output on the version).
 *  `stops` is the production record's own list of readers stopped while published
 *  (`Show.ownReaderStops`), which every browser reads. */
export interface OutputObservations {
  reads: ReadonlySet<string>;
  former: ReadonlySet<string>;
  stops: readonly string[];
}

/** One graphic's own Sheet reader where it plays (control/liveData.ts `ownReaderGate`): the design
 *  it plays, the copy, and what the published output was seen to run. */
export function ownSheetReader(graphic: SavedGraphic, _library: GraphicDoc[], published: boolean, output?: OutputObservations): OwnSheetReader {
  // The copy is what plays and publishes (live-publishing G1 section 1).
  const design = graphic.template.js;
  return {
    graphic: graphic.name,
    url: liveDataUrl(design) ?? liveDataUrl(graphic.template.js),
    gate: ownReaderGate({
      copyJs: graphic.template.js,
      resolvedJs: design,
      published,
      outputReads: output?.reads.has(graphic.name),
      outputBehind: !!output?.former.has(graphic.name),
      stopRecorded: !!output?.stops.includes(graphic.name),
    }),
  };
}

/** The production's graphics with an own reader running somewhere: the design, the copy, or the
 *  published payload. An output merely behind is not listed: whether its frame still reads is not
 *  known. */
export function ownSheetReaders(graphics: readonly SavedGraphic[], library: GraphicDoc[], published: boolean, output?: OutputObservations): OwnSheetReader[] {
  return graphics.map((g) => ownSheetReader(g, library, published, output)).filter((r) => r.gate === 'reader' || r.gate === 'publish');
}

/**
 * An own reader's line: named as a source, honestly without Pause, because nothing here can stop
 * code inside the graphic (sheet-data-flow AC-10). Connect data… on the graphic moves it here.
 */
export function OwnReaderLine({ reader }: { reader: OwnSheetReader }) {
  return (
    <div
      className="pd-source-line hint"
      title={`Its own code reads ${reader.url ?? 'a Sheet'} on its own timer. Connect data… on the graphic moves it here, where Pause works.`}
      data-testid="own-reader-line"
    >
      <span data-testid="source-status">
        Sheet in {reader.graphic}’s own code · read by the graphic · <strong className="status-warn">Pause does not stop it</strong>
      </span>
    </div>
  );
}

/** "3 s ago", "2 min ago", from a time in ms. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A source's status, re-rendering only its reader, and ticking for "checked N s ago". */
export function useSourceStatus(store: SourceStatusStore, sourceId: string): { status: SheetStatus | undefined; now: number } {
  const status = useSyncExternalStore(store.subscribe, () => store.get(sourceId));
  // Ticks only while the line shows an age; paused, failing or waiting text does not move.
  const ticking = (status?.state === 'ok' || status?.state === 'empty') && status.checkedAt !== null;
  return { status, now: useNow(ticking, 1000, Date.now) };
}

/**
 * What a source's line says, in the sheet spec's one vocabulary (checked, changed, paused, empty).
 * Last checked and last changed are two facts: a tab nobody edits is checked every read and
 * changed long ago, and that is healthy, not stale.
 */
export function statusWords(paused: boolean | undefined, status: SheetStatus | undefined, now: number, withReader = true): string {
  if (paused) return 'paused';
  if (!status || status.state === 'waiting') return 'reading…';
  const where = !withReader ? '' : status.reader === 'other' ? 'read in another tab · ' : status.reader === 'server' ? 'read by the server · ' : '';
  // Published with the server tick switched off, nothing reads once the pages close: say so.
  const closed = withReader && status.closedPage === false ? ' · closed-page reading off' : '';
  if (status.state === 'paused') return `${where}paused`;
  if (status.state === 'failing') return `${where}${status.error} since ${clock(status.failingSince ?? now)}${closed}`;
  const checked = status.checkedAt !== null ? `checked ${ago(status.checkedAt, now)}` : 'reading…';
  const changed = status.changedAt !== null ? ` · changed ${ago(status.changedAt, now)}` : '';
  return `${where}${status.state === 'empty' ? 'empty · ' : ''}${checked}${changed}${closed}`;
}

/** "every 30 s", "every 5 min". */
const everyWords = (ms: number): string => (ms % 60_000 === 0 ? `every ${ms / 60_000} min` : `every ${Math.round(ms / 1000)} s`);

/** Who reads a source and how often (data-sources AC-9's source details). `everyMs` is a JSON
 *  source's own interval (obs-scenes OS5a). */
export function readerWords(paused: boolean | undefined, status: SheetStatus | undefined, kind: ShowSource['kind'], everyMs?: number): string {
  if (paused) return 'Paused: not read until Resume';
  if (!status) return 'Waiting for the first read';
  const every = everyMs !== undefined ? everyWords(jsonEveryMs(everyMs)) : kind === 'feed' ? `about every ${FEED_READ_MS / 60_000} min` : `about every ${SHEET_READ_MS / 1000} s`;
  if (status.reader === 'server') return 'Read by the server about once a minute, while every page is closed';
  const page = status.reader === 'other' ? `Read by another tab of this production, ${every}` : `Read by this page, ${every}`;
  // The server cannot reach a file on this computer: it is read only while a page here is open.
  if (kind === 'file') return `${page}; only while a production page is open on this computer`;
  if (status.closedPage === undefined) return page;
  return status.closedPage ? `${page}; about once a minute by the server once every page is closed` : `${page}; closed-page reading is off`;
}

/**
 * A local file's one click (#2184): after a reload Chrome wants permission again (Allow), and a
 * computer that never chose the file needs it chosen here (Choose the file…). Then it reads at
 * once. Nothing for any other source, or while the file reads.
 */
export function FileAskButton({ source, status, store }: { source: ShowSource; status: SheetStatus | undefined; store: SourceStatusStore }) {
  const [refused, setRefused] = useState<string | null>(null);
  // Only this page's own reason: another page's line is that page's to fix.
  const ask = source.kind === 'file' && !source.paused && status?.state === 'failing' && status.reader === 'this' ? fileAsk(status.error) : null;
  if (!ask || source.kind !== 'file') return null;
  // Firefox and Safari cannot hold a file: say where it can be read rather than offer a button.
  if (!canPickFiles()) {
    return (
      <span className="status-warn" data-testid="source-file-unsupported">
        {' '}Open this production in Chrome or Edge on the computer that has {source.config.name}.
      </span>
    );
  }
  const press = async () => {
    setRefused(null);
    if (ask === 'allow') {
      if (await allowFile(source.id)) store.poke(source.id);
      else setRefused('Chrome did not allow it');
      return;
    }
    const picked = await pickFile();
    if (!picked) return;
    // The same file, so the line never names a file it is not reading.
    if ('error' in picked || picked.handle.name !== source.config.name) {
      setRefused(`Choose ${source.config.name}`);
      return;
    }
    await saveFileHandle(source.id, picked.handle);
    store.poke(source.id);
  };
  return (
    <>
      <button type="button" className="primary" onClick={() => void press()} data-testid="source-file-ask">
        {ask === 'allow' ? `Allow reading ${source.config.name}` : 'Choose the file…'}
      </button>
      {refused && <span className="status-warn"> {refused}.</span>}
    </>
  );
}

/** Pause or Resume a source, and read at once on Resume so the line does not wait an interval. */
export function toggleSourcePause(show: Show, setShows: (shows: Show[]) => void, store: SourceStatusStore, source: ShowSource) {
  setShows(setShowSourcePaused(show.id, source.id, !source.paused));
  if (source.paused) store.poke(source.id);
}

/** What is on air, for a source's line: the graphics up, by name, and which of them the PROGRAM
 *  monitor says hold a list with a newer one waiting for the next Take (PreviewStateMessage.waits). */
export interface OnAir {
  live: LiveCueMap;
  waits: Readonly<Record<string, boolean>>;
}

/**
 * The graphics on air whose held list (the imported credits roll and cards) is this source's and
 * has a newer one waiting (control/contentFormats.ts `heldListsWaiting`): the graphic's own
 * answer, so an edit that leaves the list as taken says nothing, and a Pause does not hide a list
 * still waiting.
 */
function listsWaiting(show: Show, source: ShowSource, onAir: OnAir): string[] {
  const heldMain = (name: string) => {
    const saved = show.graphics.find((g) => g.name === name);
    return saved ? heldListOnAir(saved)?.main : null;
  };
  return heldListsWaiting(sourcePaths(show.bindings, source.id), heldMain, onAir.live, onAir.waits);
}

/** One source's line in the data panel: name, status, stale, the fix when it fails, and Pause. */
function SourceLine({ show, setShows, source, store }: { show: Show; setShows: (shows: Show[]) => void; source: ShowSource; store: SourceStatusStore }) {
  const { status, now } = useSourceStatus(store, source.id);
  return (
    <div
      className="pd-source-line hint"
      title={readerWords(source.paused, status, source.kind, noacgReads(source) ? source.config.read.everyMs : undefined)}
      data-testid={`source-line-${source.id}`}
      data-state={source.paused ? 'paused' : (status?.state ?? 'waiting')}
      data-stale={status?.stale && !source.paused ? 'true' : undefined}
    >
      <span data-testid="source-status">
        {sourceKindWord(source)}: {source.label} · {statusWords(source.paused, status, now)}
        {status?.stale && !source.paused && <strong className="status-warn"> · stale</strong>}
      </span>{' '}
      <button type="button" onClick={() => toggleSourcePause(show, setShows, store, source)} data-testid="source-pause">
        {source.paused ? 'Resume' : 'Pause'}
      </button>
      <FileAskButton source={source} status={status} store={store} />
      {/* The file's one click says the fix itself. */}
      {status?.state === 'failing' && status.fix && !fileAsk(status.error) && <span className="status-warn" data-testid="source-fix"> {status.fix}</span>}
      {status?.problems.map((p) => (
        <span key={p} className="status-warn" data-testid="source-problem"> {p}.</span>
      ))}
    </div>
  );
}

/** One source's tone in the header indicator, worst last: a source still on its first read, a
 *  healthy one, one paused by the operator, one with a problem (failing, empty, or rows it could
 *  not use), and one stale after three missed reads. */
export type DataTone = 'ok' | 'waiting' | 'paused' | 'warn' | 'bad';
const TONE_RANK: Record<DataTone, number> = { ok: 0, waiting: 1, paused: 2, warn: 3, bad: 4 };
const TONE_GLYPH: Record<DataTone, string> = { ok: '✓', waiting: '…', paused: '❚❚', warn: '⚠', bad: '⚠' };

export function sourceTone(paused: boolean | undefined, status: SheetStatus | undefined): DataTone {
  if (paused || status?.state === 'paused') return 'paused';
  if (status?.stale) return 'bad';
  if (!status || status.state === 'waiting') return 'waiting';
  if (status.state === 'failing' || status.state === 'empty' || status.problems.length > 0) return 'warn';
  return 'ok';
}

/** A source with a problem (#2248): failing, empty, rows it could not use, or stale, and not paused.
 *  The header's amber or red, the cue line's warning and the rundown's mark all go by it. */
export function sourceHasProblem(paused: boolean | undefined, status: SheetStatus | undefined): boolean {
  const tone = sourceTone(paused, status);
  return tone === 'warn' || tone === 'bad';
}

/** Each graphic fed by a source with a problem, with those sources' names (#2248). Read as one
 *  string, so a status that moves without changing the answer renders nothing. */
export function useDataProblems(show: Pick<Show, 'sources' | 'bindings'>, store: SourceStatusStore): ReadonlyMap<string, string[]> {
  const key = useSyncExternalStore(store.subscribe, () => {
    const byGraphic = new Map<string, string[]>();
    for (const source of (show.sources ?? []).filter(hasReaderLine)) {
      if (!sourceHasProblem(source.paused, store.get(source.id))) continue;
      for (const graphic of new Set(sourcePaths(show.bindings, source.id).map((p) => p.graphic))) {
        byGraphic.set(graphic, [...(byGraphic.get(graphic) ?? []), source.label]);
      }
    }
    return JSON.stringify([...byGraphic]);
  });
  return useMemo(() => new Map(JSON.parse(key) as [string, string[]][]), [key]);
}

/** The indicator's reading: the worst tone and its count. All well, every source ("Data ✓ 3");
 *  paused, the paused ones; a problem, every source with a problem or stale. */
export function dataSummary(tones: readonly DataTone[]): { tone: DataTone; count: number } | null {
  if (tones.length === 0) return null;
  const tone = tones.reduce((w, t) => (TONE_RANK[t] > TONE_RANK[w] ? t : w), 'ok' as DataTone);
  // A source still on its first read is not a problem: it counts with the healthy ones.
  const count =
    tone === 'ok' || tone === 'waiting' ? tones.length
    : tone === 'paused' ? tones.filter((t) => t === 'paused').length
    : tones.filter((t) => TONE_RANK[t] >= TONE_RANK.warn).length;
  return { tone, count };
}

/**
 * THE DATA INDICATOR in the production page's header (#2244): one compact button for every source
 * of the production, "Data ✓ 3" while all read fine, amber or red with a count when one has a
 * problem or is stale. A press opens the panel of source lines, each with its state and Pause or
 * Resume. Healthy sources take no room under the monitors. Nothing at all without sources.
 */
export function DataIndicator({
  show,
  setShows,
  store,
  ownReaders = [],
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  store: SourceStatusStore;
  /** Graphics reading a Sheet in their own code: listed, without a Pause that would not work. */
  ownReaders?: readonly OwnSheetReader[];
}) {
  const [open, setOpen] = useState(false);
  // A Sheet's or a feed's line; a YouTube source is read and shown in Messages only.
  const sources = (show.sources ?? []).filter(hasReaderLine);
  // One string per reading, so a status that moves without changing a tone renders nothing here.
  const tones = useSyncExternalStore(store.subscribe, () => sources.map((s) => sourceTone(s.paused, store.get(s.id))).join(' '));
  // A graphic's own reader reads by itself and nothing here sees its reads: it counts as reading,
  // and its line in the panel says Pause does not stop it. A permanent amber would teach the
  // operator to ignore amber.
  const summary = dataSummary([...(tones ? (tones.split(' ') as DataTone[]) : []), ...ownReaders.map(() => 'ok' as const)]);
  if (!summary) return null;
  const total = sources.length + ownReaders.length;
  const title =
    summary.tone === 'ok' ? `${total} data source${total === 1 ? '' : 's'}, all reading`
    : summary.tone === 'waiting' ? 'Reading the data sources…'
    : summary.tone === 'paused' ? `${summary.count} paused: values on air are frozen until Resume`
    : summary.tone === 'bad' ? `${summary.count} with a problem or stale: the last good values stay on air`
    : `${summary.count} with a problem`;
  return (
    <span className="pd-ready-host pd-data-host" data-tone={summary.tone}>
      <button
        type="button"
        className={`pd-data-status pd-data-status--${summary.tone}`}
        aria-expanded={open}
        aria-label={`Data: ${title}`}
        title={title}
        onClick={() => setOpen((o) => !o)}
        data-testid="data-indicator"
        data-tone={summary.tone}
        data-count={summary.count}
      >
        Data <span aria-hidden="true">{TONE_GLYPH[summary.tone]}</span> {summary.count}
      </button>
      <LibMenu open={open} onClose={() => setOpen(false)} surface="pd-ready-panel" role="none" className="pd-data-panel" testid="sources-line">
        {sources.map((source) => (
          <SourceLine key={source.id} show={show} setShows={setShows} source={source} store={store} />
        ))}
        {ownReaders.map((reader) => (
          <OwnReaderLine key={reader.graphic} reader={reader} />
        ))}
      </LibMenu>
    </span>
  );
}

/**
 * A held credits list on air with newer data waiting for the next Take: the one data fact that
 * asks the operator for a press, so it shows under the monitors, and only while it is true.
 */
export function DataWaitingNote({ show, onAir }: { show: Show; onAir: OnAir }) {
  const waiting = [...new Set((show.sources ?? []).filter(hasReaderLine).flatMap((s) => listsWaiting(show, s, onAir)))];
  if (waiting.length === 0) return null;
  return (
    <div className="pd-data-waiting hint" data-testid="source-waiting" title={`On air: ${waiting.join(', ')}`}>
      <strong>Newer data shows on the next Take</strong>
    </div>
  );
}
