import { useState, useSyncExternalStore } from 'react';
import { fillsFields, setShowSourcePaused, sourceKindWord, type Show, type ShowSource } from '../../model/shows';
import { SHEET_READ_MS, type SheetStatus, type SourceStatusStore } from '../../control/sheetSource';
import { FEED_READ_MS } from '../../control/feedSource';
import { fileAsk } from '../../control/fileSource';
import { allowFile, pickFile, saveFileHandle } from '../../control/fileHandles';
import { useNow } from './ClipClock';
import { liveDataUrl, ownReaderGate, type OwnReaderGate } from '../../control/liveData';
import { resolveSavedGraphicDoc, type GraphicDoc } from '../../model/library';
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
export function ownSheetReader(graphic: SavedGraphic, library: GraphicDoc[], published: boolean, output?: OutputObservations): OwnSheetReader {
  const design = resolveSavedGraphicDoc(graphic, library)?.template.js ?? graphic.template.js;
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

/** Who reads a source and how often (data-sources AC-9's source details). */
export function readerWords(paused: boolean | undefined, status: SheetStatus | undefined, kind: ShowSource['kind']): string {
  if (paused) return 'Paused: not read until Resume';
  if (!status) return 'Waiting for the first read';
  const every = kind === 'feed' ? `about every ${FEED_READ_MS / 60_000} min` : `about every ${SHEET_READ_MS / 1000} s`;
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
  const ask = source.kind === 'file' && !source.paused && status?.state === 'failing' ? fileAsk(status.error) : null;
  if (!ask || source.kind !== 'file') return null;
  const press = async () => {
    setRefused(null);
    if (ask === 'allow') {
      if (await allowFile(source.id)) store.poke(source.id);
      else setRefused('Chrome did not allow it');
      return;
    }
    const picked = await pickFile();
    if (!picked) return;
    if ('error' in picked || picked.format !== source.config.format) {
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

/** One source's line: name, status, stale, the fix when it fails, Pause, and a list on air that
 *  waits for the next Take. */
function SourceLine({ show, setShows, source, store, onAir }: { show: Show; setShows: (shows: Show[]) => void; source: ShowSource; store: SourceStatusStore; onAir?: OnAir }) {
  const { status, now } = useSourceStatus(store, source.id);
  const waiting = onAir ? listsWaiting(show, source, onAir) : [];
  return (
    <div
      className="pd-source-line hint"
      title={readerWords(source.paused, status, source.kind)}
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
      {status?.state === 'failing' && status.fix && <span className="status-warn" data-testid="source-fix"> {status.fix}</span>}
      {status?.problems.map((p) => (
        <span key={p} className="status-warn" data-testid="source-problem"> {p}.</span>
      ))}
      {waiting.length > 0 && (
        <span data-testid="source-waiting" title={`On air: ${waiting.join(', ')}`}>
          {' '}· <strong>Newer data shows on the next Take</strong>
        </span>
      )}
    </div>
  );
}

/**
 * THE PLAYOUT SOURCES LINE (sheet spec, "Status and Pause on the Playout tab"): one line per
 * source of the production, whichever cue is selected, so a failing or stale Sheet is in sight
 * while the show runs and Pause is one press. Nothing at all without sources.
 */
export default function SourcesLine({
  show,
  setShows,
  store,
  ownReaders = [],
  onAir,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  store: SourceStatusStore;
  /** Graphics reading a Sheet in their own code: listed, without a Pause that would not work. */
  ownReaders?: readonly OwnSheetReader[];
  /** What is on air, so a held credits list can say newer data waits for its next Take. */
  onAir?: OnAir;
}) {
  // A Sheet's or a feed's line; a YouTube source is read and shown in Messages only.
  const sources = (show.sources ?? []).filter(fillsFields);
  if (sources.length === 0 && ownReaders.length === 0) return null;
  return (
    <div className="pd-sources" data-testid="sources-line">
      {sources.map((source) => (
        <SourceLine key={source.id} show={show} setShows={setShows} source={source} store={store} onAir={onAir} />
      ))}
      {ownReaders.map((reader) => (
        <OwnReaderLine key={reader.graphic} reader={reader} />
      ))}
    </div>
  );
}
