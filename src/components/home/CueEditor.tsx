import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type Ref, type SetStateAction } from 'react';
import { saveAs } from 'file-saver';
import { MAX_PLAYOUT_LAYER, MIN_PLAYOUT_LAYER, connectApiFields, connectConnectorSource, connectShowSource, ownSheetGraphics, disconnectShowFields, nextFreeLayer, preparedMessageField, renameShowSource, setShowGraphicLayer, sourceKindWord, type FieldShowSource, type Show, type ShowCue, type ShowSource } from '../../model/shows';
import type { SavedGraphic } from '../../model/packets';
import type { FieldDescriptor, FieldValue } from '../../model/fieldModel';
import { chosenPath, externalReadOnly, mappingEntries, proposeMapping, sourcePaths, type MappingRow, type ResolvedValues } from '../../model/productionData';
import { nextRow, type CueDataRow } from '../../control/cueData';
import { groupHeading, type CueFieldGroup } from '../../control/cueFieldGroups';
import { FieldRow, type FieldImage } from '../fields/FieldControl';
import CueOverflowNote from './CueOverflowNote';
import { nameList } from './CueRundown';
import { CueMessageFill, isMessageBodyField } from './ProductionAudienceWorkspace';
import LibMenu from './LibMenu';
import { commitDurableWrites } from '../../model/durableStore';
import { loadGraphics } from '../../model/library';
import { fillList, listFormatFor, pastedCells, scalarFields, scalarTemplateCsv, starterCsv, type ListFormat } from '../../control/contentFormats';
import type { OwnReaderGate } from '../../control/liveData';
import { uuid } from '../../model/id';
import {
  connectedFields,
  fieldValue,
  isSourcePath,
  pathValue,
  offeredValues,
  parseSheetLink,
  readSheet,
  sheetContent,
  sheetShapeFor,
  sourceIdOf,
  SHEET_TIMEOUT_MS,
  type SheetLink,
  type SheetRead,
  type SourceStatusStore,
} from '../../control/sheetSource';
import { FEED_ROUTE_TIMEOUT_MS, normalizeFeedAddress, readFeedRoute } from '../../control/feedSource';
import { apiOffers, isApiPath } from '../../control/anotherSystem';
import { connectorPlan, defaultColumns, jsonOffers, LIST_CELLS, needsRepair, proposeConnector, readConnectorSample, type ConnectorSource } from '../../control/connectorReview';
import { projectSource } from '../../control/sourceMapping';
import type { SourceListAdapter } from '../../control/externalSource';
import { productionDataKey } from '../../control/productionDataApi';
import { viewOf, type CueDraft, type CueText } from '../../control/cueDraft';

/** The edited cue's text, as the draft shows it. */
export type CueEditorView = CueText;

/** A cue's text as it is being typed: the draft over `cue` (control/cueDraft.ts). The component
 *  redraws when this cue's draft moves, and not for another cue's. */
export function useCueView(draft: Pick<CueDraft, 'part'>, cue: ShowCue): CueText;
export function useCueView(draft: Pick<CueDraft, 'part'>, cue: ShowCue | null): CueText | null;
export function useCueView(draft: Pick<CueDraft, 'part'>, cue: ShowCue | null): CueText | null {
  const own = useSyncExternalStore(draft.part.subscribe, () => {
    const d = draft.part.get();
    return d && d.cueId === cue?.id ? d : null;
  });
  return cue ? viewOf(own, cue) : null;
}

/** A file name a spreadsheet will not argue with, from the graphic's own name. */
function csvName(graphic: string, what: string): string {
  return `${graphic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'graphic'}-${what}.csv`;
}

const downloadCsv = (text: string, name: string) => saveAs(new Blob([text], { type: 'text/csv;charset=utf-8' }), name);

/**
 * "Fill from… Paste rows" on a list field (data-sources C1a, AC-4): cells pasted from a
 * spreadsheet or lines from a document, read by the field's format adapter
 * (control/contentFormats.ts) into the text the graphic parses. The rows are listed with any
 * malformed one flagged before anything changes; Fill writes the cue's draft in one edit (both
 * fields of a standings board), so the preview shows it and the draft saves it as any edit. No
 * account and no source record. The starter download is the same rows the other way: the field's
 * current content, with the adapter's header.
 */
function CueRowsFill({
  format,
  values,
  graphicName,
  onFill,
}: {
  format: ListFormat;
  values: Record<string, string>;
  graphicName: string;
  onFill: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const fill = text.trim() ? fillList(format, pastedCells(text)) : null;
  return (
    <span className="lib-menu-host pd-fill-from">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="cue-rows-from">
        Fill from…
      </button>
      <LibMenu open={open} onClose={() => setOpen(false)} testid="cue-rows-menu" role="dialog">
        <p className="hint">Paste rows</p>
        <textarea value={text} rows={5} aria-label="Rows" onChange={(e) => setText(e.target.value)} data-testid="cue-rows-paste" />
        {fill && (
          <ol className="hint" data-testid="cue-rows-preview">
            {fill.rows.map((r, i) => (
              <li key={i} className={r.problem ? 'status-warn' : undefined} data-testid={r.problem ? 'cue-rows-flag' : 'cue-rows-row'}>
                {r.text || '·'}
                {r.problem && ` - ${r.problem}`}
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          disabled={!fill}
          onClick={() => {
            if (!fill) return;
            onFill(fill.values);
            setText('');
            setOpen(false);
          }}
          data-testid="cue-rows-fill"
        >
          Fill this cue
        </button>
        <button type="button" onClick={() => downloadCsv(starterCsv(format, values), csvName(graphicName, 'rows'))} data-testid="cue-rows-starter">
          ⬇ Starter rows
        </button>
      </LibMenu>
    </span>
  );
}

/** The source a connected path follows, when it is a source's (`sheet.<id>.…`). */
function sourceOf(show: Pick<Show, 'sources'>, path: string | undefined): ShowSource | null {
  const id = sourceIdOf(path);
  return (id && show.sources?.find((s) => s.id === id)) || null;
}

/**
 * A connected field this graphic no longer has (its template changed under it), flagged where the
 * graphic is edited, never redirected. The source's own health is the Playout sources line's
 * (home/SourcesLine): it is the production's, whichever graphic is selected.
 */
function CueSourceMissing({ source, missing, onDisconnect }: { source: ShowSource; missing: string[]; onDisconnect: (fieldIds: string[]) => void }) {
  return (
    <div className="pd-source-line hint" data-testid={`cue-source-${source.id}`}>
      {missing.map((fieldId) => (
        <span key={fieldId} className="status-warn" data-testid="cue-source-missing">
          {fieldId.toUpperCase()} is connected to {sourceKindWord(source)}: {source.label}, but this graphic has no {fieldId.toUpperCase()}.{' '}
          <button type="button" onClick={() => onDisconnect([fieldId])} data-testid={`cue-disconnect-${fieldId}`}>
            Disconnect
          </button>
        </span>
      ))}
    </div>
  );
}

/** A connected field's mark: where it comes from, and stale after three missed reads. Short, as
 *  the mark beside a field label is clipped to its column. */
function CueConnectedMark({ source, store }: { source: ShowSource; store: SourceStatusStore }) {
  const status = useSyncExternalStore(store.subscribe, () => store.get(source.id));
  // A connector's provenance names its mapping too: the recipe its values are read through.
  const recipe = source.kind === 'external' ? (source.config as { mapping?: { v?: unknown } | null }).mapping : null;
  const how = source.kind !== 'external' ? '' : externalReadOnly(source) ? ' · a later version, read-only' : recipe ? ` · mapping v${String(recipe.v)}` : '';
  return (
    <span className="pd-bound-mark" title={`Connected to ${sourceKindWord(source)}: ${source.label}${how}`} data-testid="cue-connected-mark" data-stale={status?.stale ? 'true' : undefined}>
      {status?.stale ? '⚠ stale · ' : '🔗 '}{sourceKindWord(source)}: {source.label}
    </span>
  );
}

/** A tab or a feed read for the review: its link or address, rows, or the failure with its fix;
 *  or Another system, which has nothing to read: its paths are offered from the fields (C5); or a
 *  connector's JSON sample (E5.2), read for the review and never applied. */
type ConnectRead =
  | { link: SheetLink; rows: string[][] }
  | { feed: string; rows: string[][] }
  | { api: true }
  | { json: string; sample: unknown; via: 'agent' | 'hosted' }
  | { error: string; fix: string };

/** A connector sample is waited on in steps of this (control/connectorReview `readConnectorSample`). */
const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The Connect review's content: the read, the proposal, repair and the one confirmation. */
function CueConnectReview({
  show,
  setShows,
  poolGraphic,
  descriptors,
  values,
  bound,
  store,
  fieldsOf,
  onPreview,
  onFill,
  onClose,
  onRefused,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  poolGraphic: SavedGraphic;
  descriptors: FieldDescriptor[];
  /** What the cue shows now: the downloads start from it. */
  values: Record<string, string>;
  bound: Record<string, string>;
  store: SourceStatusStore;
  /** A pool graphic's fields as drawn (the page's lookup, shared with the reader). */
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  onPreview: (values: Record<string, string> | null) => void;
  /** Copy what the read gives into this cue, connecting nothing (the cue keeps it). */
  onFill: (values: Record<string, string>) => void;
  onClose: () => void;
  onRefused: (text: string | null) => void;
}) {
  const [linkText, setLinkText] = useState('');
  const [reuse, setReuse] = useState<FieldShowSource | ConnectorSource | null>(null);
  /** A ticker (the lines adapter) also follows a news feed (data-sources C4). */
  const takesFeed = sheetShapeFor(poolGraphic) === 'lines';
  /** A Sheet tab, a connector, and for a ticker a feed, can fill fields; a YouTube source feeds
   *  Messages alone. */
  const fieldSources = (show.sources ?? []).filter(
    (s): s is FieldShowSource | ConnectorSource => s.kind === 'sheet' || s.kind === 'external' || (takesFeed && s.kind === 'feed'),
  );
  /** A list field's columns, by field, as the operator picked them (a connector's list). */
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  const [read, setRead] = useState<ConnectRead | null>(null);
  const [reading, setReading] = useState(false);
  const [firstTab, setFirstTab] = useState(false);
  const [label, setLabel] = useState('');
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** A new source's id, minted per read of a pasted link, so a second Connect is a second source. */
  const [sourceId, setSourceId] = useState('');
  /** Which read is current: an older answer, or one arriving after the review closed, is dropped. */
  const readNo = useRef(0);
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;

  const kind = reuse?.kind ?? (read && 'feed' in read ? 'feed' : read && 'json' in read ? 'external' : 'sheet');
  // A feed is read only on a ticker, whose shape is `lines`.
  const shape = reuse?.kind === 'sheet' ? reuse.config.shape : sheetShapeFor(poolGraphic);
  const id = reuse?.id ?? sourceId;
  const rows = read && 'rows' in read ? read.rows : null;
  const content = rows ? sheetContent(shape, rows) : null;
  const api = Boolean(read && 'api' in read);
  const json = read && 'json' in read ? read : null;
  const fields = descriptors.filter((d) => d.kind !== 'image');
  const byKey = new Map(fields.map((d) => [d.key, d]));
  const refuses = (fieldId: string) => preparedMessageField(show, poolGraphic.name, fieldId);
  const holds = (fieldId: string, text: string) => fieldValue(byKey.get(fieldId)!, text) !== null;
  // A connector's sample: its values and its lists, a list field matched against the lists.
  const offers = json ? jsonOffers(id, json.sample) : null;
  const adapters: Record<string, SourceListAdapter> = {};
  if (json) {
    for (const d of fields) {
      const adapter = listFormatFor(poolGraphic, d.key)?.adapter;
      if (adapter && adapter in LIST_CELLS) adapters[d.key] = adapter as SourceListAdapter;
    }
  }
  const offered = api ? apiOffers(show.bindings, poolGraphic.name, fields, values) : content ? offeredValues(id, shape, content, kind === 'external' ? 'sheet' : kind) : offers ? offers.scalars : [];
  const sample = new Map(offered.map((o) => [o.path, o.sample]));
  const mapping: MappingRow[] = offers
    ? proposeConnector(fields, offers, bound, adapters, refuses, holds)
    : content || api
      ? proposeMapping(fields, offered, bound, refuses, holds)
      : [];
  const repairs = offers ? needsRepair(bound, id, offers) : new Set<string>();
  /** What a row may pick: a list field the sample's lists, any other its values. */
  const optionsFor = (fieldId: string) => (offers && adapters[fieldId] ? offers.collections.map((c) => ({ path: c.path, label: `${c.label} (${c.count})` })) : offered);
  const chosen = (row: MappingRow): string | null => chosenPath(row, choices);
  const entries = mappingEntries(poolGraphic.name, mapping, choices);
  const matched = mapping.filter((r) => r.status !== 'refused' && chosen(r) !== null).length;
  // A field nothing matched needs attention until it follows something (a pick, or its own binding).
  const attention = mapping.filter(
    (r) => ((r.status === 'ambiguous' || r.status === 'unmatched') && chosen(r) === null) || (repairs.has(r.fieldId) && chosen(r) === r.current) || (r.current !== null && r.current !== r.path && r.path !== null),
  ).length;
  const users = [...new Set(sourcePaths(show.bindings, id).map((p) => p.graphic))].filter((g) => g !== poolGraphic.name);
  const usedBy = (show.cues ?? []).filter((c) => {
    const g = show.graphics.find((x) => x.id === c.sourceId);
    return g && (g.id === poolGraphic.id || users.includes(g.name));
  }).length;
  const removed = users.filter((g) => !show.graphics.some((x) => x.name === g));
  // A link that names no tab reads the first tab, which the operator confirms before connecting.
  const noTab = Boolean(read && 'link' in read && read.link.gid === null);

  // The preview monitor shows the reviewed mapping on the real graphic while the review is open,
  // and nothing of it once the review closes, fails to read, or leaves with its graphic.
  // What each chosen path will write, by the reader's own rule: the bindings as this review would
  // leave them, every field on the path, one form for all of them (sheetSource `pathValue`).
  const proposed = { ...(show.bindings ?? {}), [poolGraphic.name]: { ...bound, ...Object.fromEntries(entries.map((e) => [e.fieldId, e.path ?? ''])) } };
  const drawn = (g: string) => (g === poolGraphic.name ? descriptors : fieldsOf(g));
  // A connector's sample is evaluated by the one shared evaluator, recipe and all, exactly as the
  // route will evaluate the provider's answers once the mapping is saved; nothing is applied.
  const reusedConnector = reuse?.kind === 'external' ? reuse : null;
  const plan = json
    ? connectorPlan({
        graphic: poolGraphic.name,
        bindings: show.bindings,
        source: reusedConnector ?? { id, label: label.trim() || poolGraphic.name, endpoint: json.json },
        rows: mapping,
        choices,
        collections: offers!.collections,
        adapters,
        columns,
      })
    : null;
  const projection =
    plan && !('error' in plan)
      ? projectSource({ sourceId: id, payload: json!.sample, bindings: plan.bindings, fieldsOf: drawn, lists: plan.source.config.lists, mapping: plan.source.config.mapping, configRevision: plan.source.config.configRevision })
      : null;
  const leafOf = (path: string) => path.slice(`external.${id}.`.length);
  const writes = (path: string): string | null =>
    projection ? (projection.writes[path] ?? null) : pathValue(connectedFields(proposed, path, drawn), sample.get(path) ?? '');
  const previewValues: Record<string, string> = {};
  for (const row of mapping) {
    const path = chosen(row);
    const value = path !== null && row.status !== 'refused' && (projection || sample.has(path)) ? writes(path) : null;
    if (value !== null) previewValues[row.fieldId] = value;
  }
  const previewKey = content || api || json ? JSON.stringify(previewValues) : null;
  useEffect(() => {
    previewRef.current(previewKey === null ? null : (JSON.parse(previewKey) as Record<string, string>));
  }, [previewKey]);
  useEffect(() => () => previewRef.current(null), []);

  // Closing unmounts the review, which is its reset; a read still in flight then lands nowhere.
  useEffect(() => () => void (readNo.current += 1), []);
  const close = onClose;
  /** Read a tab, or a feed's headlines through NoaCG's feed route (control/feedSource.ts), for
   *  the review; an older read, or one arriving after the review closed, lands nowhere. */
  const readInto = async (go: () => Promise<SheetRead>, as: (rows: string[][]) => ConnectRead) => {
    const no = (readNo.current += 1);
    setReading(true);
    setRead(null);
    setChoices({});
    setColumns({});
    setFirstTab(false);
    const answer = await go();
    if (no !== readNo.current) return;
    setReading(false);
    setRead(answer.ok ? as(answer.rows) : { error: answer.error, fix: answer.fix });
  };
  const readTab = (link: SheetLink) =>
    readInto(() => readSheet((url, init) => fetch(url, init), link, AbortSignal.timeout(SHEET_TIMEOUT_MS)), (rows) => ({ link, rows }));
  const readFeed = (url: string) =>
    readInto(() => readFeedRoute((u, init) => fetch(u, init), url, AbortSignal.timeout(FEED_ROUTE_TIMEOUT_MS)), (rows) => ({ feed: url, rows }));
  /** A connector's sample: through its agent when one holds the registered source of this
   *  published production, else the hosted fetcher for a public address. Never applied. */
  const readJson = async (endpoint: string, registered: string | null) => {
    const no = (readNo.current += 1);
    setReading(true);
    setRead(null);
    setChoices({});
    setColumns({});
    const key = registered ? await productionDataKey(show.id).catch(() => null) : null;
    const answer = await readConnectorSample({ fetcher: (u, init) => fetch(u, init), endpoint, key, sourceId: registered, wait: waitMs, now: Date.now });
    if (no !== readNo.current) return;
    setReading(false);
    setRead(answer.ok ? { json: endpoint, sample: answer.sample, via: answer.via } : { error: answer.error, fix: answer.fix });
  };
  /** Connect: one write, and the review closes only once storage has agreed to it, so a
   *  refused save leaves the review here to try again (components AGENTS.md, the save rule). */
  const confirm = async () => {
    if (!read || 'error' in read || saving) return;
    if ('api' in read) return finish(connectApiFields(show.id, entries), null);
    if ('json' in read) {
      if (!plan || 'error' in plan) return setSaveError(plan?.error ?? 'Nothing to connect.');
      let result = connectConnectorSource(show.id, plan.source, plan.entries, plan.fence);
      if (!result.error && reusedConnector && label.trim() && label.trim() !== reusedConnector.label) result = { ...result, shows: renameShowSource(show.id, reusedConnector.id, label) };
      return finish(result, null);
    }
    if (id === '') return;
    if (reuse?.kind === 'external') return;
    const source: ShowSource =
      reuse ??
      ('feed' in read
        ? { id, kind: 'feed', label: label.trim() || poolGraphic.name, config: { url: read.feed } }
        : {
            id,
            kind: 'sheet',
            label: label.trim() || poolGraphic.name,
            config: { sheetId: read.link.sheetId, gid: read.link.gid, ...(read.link.published ? { published: true } : {}), shape },
          });
    let result = connectShowSource(show.id, source, entries);
    if (!result.error && reuse && label.trim() && label.trim() !== reuse.label) result = { ...result, shows: renameShowSource(show.id, reuse.id, label) };
    await finish(result, source.id);
  };
  /** The one write's outcome: the review closes only once storage has agreed to it. */
  const finish = async (result: { shows: Show[]; error: string | null; refused: { fieldId: string }[] }, sourceToRead: string | null) => {
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setShows(result.shows);
    setSaving(true);
    const failure = await commitDurableWrites();
    setSaving(false);
    if (failure) {
      setSaveError(`Not saved: ${failure}`);
      return;
    }
    const fields = result.refused.map((r) => r.fieldId.toUpperCase()).join(', ');
    onRefused(
      result.refused.length === 0
        ? null
        : // Refused because its own code still reads a Sheet (C6): the gate normally stops this
          // first, but a copy that changed while the review was open lands here.
          ownSheetGraphics(result.shows.find((x) => x.id === show.id) ?? show, loadGraphics()).has(poolGraphic.name)
          ? `${fields} not connected: ${poolGraphic.name} still reads a Sheet in its own code. Open Connect data… again.`
          : `${fields} not connected: prepared messages use it. Add a separate card for messages.`,
    );
    if (sourceToRead) store.poke(sourceToRead);
    close();
  };

  return (
    <>
      <p className="hint">
        {takesFeed
          ? 'Paste a Google Sheet tab’s link (Share, then “Anyone with the link”) or a news feed’s address.'
          : 'Paste a Google Sheet tab’s link (Share, then “Anyone with the link”) or an address that answers JSON.'}
      </p>
      <div className="row">
        <input
          className="grow"
          value={linkText}
          placeholder={takesFeed ? 'https://docs.google.com/spreadsheets/d/… or https://…/feed.xml' : 'https://docs.google.com/spreadsheets/d/… or https://…'}
          aria-label={takesFeed ? 'Sheet link or feed address' : 'Sheet link or JSON address'}
          onChange={(e) => {
            // A changed link is a new tab: the last read, its review and any read in flight go,
            // so Connect needs a fresh read of what the box now says.
            readNo.current += 1;
            setLinkText(e.target.value);
            setReuse(null);
            setRead(null);
            setReading(false);
            setChoices({});
            setSourceId('');
          }}
          data-testid="cue-connect-link"
        />
        <button
          type="button"
          disabled={reading || linkText.trim() === ''}
          onClick={() => {
            const start = (go: () => Promise<void>) => {
              setLabel((l) => l || poolGraphic.name);
              setSourceId(`s${uuid().replace(/-/g, '').slice(0, 10)}`);
              void go();
            };
            const sheet = parseSheetLink(linkText);
            if (!('error' in sheet)) return start(() => readTab(sheet.link));
            if (/docs\.google\.com/.test(linkText)) return setRead({ error: sheet.error, fix: 'Copy the link from the Sheet’s Share button.' });
            // Not a Sheet: on a ticker, any other web address is read as a news feed; on any other
            // graphic, as a JSON endpoint (a new connector), its sample read by the hosted fetcher.
            const address = normalizeFeedAddress(linkText);
            if ('error' in address) return setRead({ error: address.error.replace(/\.$/, '').replace('feed', 'web'), fix: takesFeed ? 'Copy the feed’s address from its site.' : 'Copy the address from the provider.' });
            start(() => (takesFeed ? readFeed(address.url) : readJson(address.url, null)));
          }}
          data-testid="cue-connect-read"
        >
          {reading ? 'Reading…' : 'Read'}
        </button>
      </div>
      {/* Another system writes this graphic's fields through the data key (C5): nothing to
          read, every field offered its own path, reviewed and confirmed once like a Sheet. */}
      <button
        type="button"
        onClick={() => {
          readNo.current += 1;
          setReading(false);
          setReuse(null);
          setLinkText('');
          setChoices({});
          setRead({ api: true });
        }}
        data-testid="cue-connect-api"
      >
        Another system
      </button>
      {fieldSources.length > 0 && (
        <select
          value={reuse?.id ?? ''}
          onChange={(e) => {
            const source = fieldSources.find((s) => s.id === e.target.value) ?? null;
            setReuse(source);
            setLabel(source?.label ?? '');
            setLinkText('');
            if (source?.kind === 'external') void readJson(source.config.endpoint, source.id);
            else if (source?.kind === 'feed') void readFeed(source.config.url);
            else if (source) void readTab({ sheetId: source.config.sheetId, gid: source.config.gid, published: source.config.published });
            else {
              readNo.current += 1;
              setReading(false);
              setRead(null);
            }
          }}
          aria-label="Use existing content"
          data-testid="cue-connect-reuse"
        >
          <option value="">Use existing content…</option>
          {fieldSources.map((s) => (
            // A connector a later version set up is read-only here: kept as it is, never edited.
            <option key={s.id} value={s.id} disabled={externalReadOnly(s)}>
              {sourceKindWord(s)}: {s.label}
            </option>
          ))}
        </select>
      )}
      {read && 'error' in read && (
        <p className="status-warn" data-testid="cue-connect-error">
          {read.error}. {read.fix}
        </p>
      )}
      {api && (
        <p className="hint" data-testid="cue-connect-api-note">
          Another system fills these fields by writing their paths with the production’s data key. Data, Another system has the
          address, the key and an example.
        </p>
      )}
      {(content || api || json) && (
        <>
          {content && noTab && (
            <label className="hint" data-testid="cue-connect-first-tab">
              <input type="checkbox" checked={firstTab} onChange={(e) => setFirstTab(e.target.checked)} /> The link names no tab,
              so this is its first tab. Use it?
            </label>
          )}
          {(content || json) && (
          <label className="pd-field">
            <span>Name</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} data-testid="cue-connect-label" />
          </label>
          )}
          {content && content.preview.length > 0 && (
            <ol className="hint" data-testid="cue-connect-preview">
              {content.preview.slice(0, 12).map((r, i) => (
                <li key={i} className={r.problem ? 'status-warn' : undefined}>
                  {r.text || '·'}
                  {r.problem && ` - ${r.problem}`}
                </li>
              ))}
            </ol>
          )}
          {content?.empty && (
            <p className="hint" data-testid="cue-connect-empty">
              {kind === 'feed' ? 'The feed has no headlines' : 'The tab is empty'}: connected, it clears the field.
            </p>
          )}
          {content?.problems.map((p) => (
            <p key={p} className="status-warn">{p}</p>
          ))}
          <table className="hint" data-testid="cue-connect-map">
            <tbody>
              {mapping.map((row) => {
                // A list field reading one of the sample's lists picks its columns on a line of its own.
                const list = offers && adapters[row.fieldId] ? offers.collections.find((c) => c.path === chosen(row)) : undefined;
                return [
                <tr key={row.fieldId} data-testid={`cue-connect-row-${row.fieldId}`} data-status={row.status}>
                  <td>{row.fieldId.toUpperCase()} · {row.label}</td>
                  <td>
                    {row.status === 'refused' ? (
                      <span className="status-warn">used by prepared messages</span>
                    ) : (
                      <select
                        value={chosen(row) ?? ''}
                        onChange={(e) => setChoices((c) => ({ ...c, [row.fieldId]: e.target.value || null }))}
                        aria-label={`${row.label} follows`}
                        data-testid={`cue-connect-pick-${row.fieldId}`}
                      >
                        <option value="">Not connected</option>
                        {row.current !== null && !optionsFor(row.fieldId).some((o) => o.path === row.current) && (
                          <option value={row.current}>Keep: {row.current}</option>
                        )}
                        {optionsFor(row.fieldId).map((o) => (
                          <option key={o.path} value={o.path}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="muted">
                    {repairs.has(row.fieldId) && chosen(row) === row.current ? (
                      <span className="status-warn" data-testid={`cue-connect-repair-${row.fieldId}`}>not in the sample: pick another</span>
                    ) : projection && chosen(row) !== null && projection.problems[leafOf(chosen(row)!)] ? (
                      <span className="status-warn">{projection.problems[leafOf(chosen(row)!)]}</span>
                    ) : row.status === 'ambiguous'
                      ? 'several match: pick one'
                      : row.current !== null && row.path !== null && row.current !== row.path && chosen(row) === row.current
                        ? 'connected elsewhere: pick to replace'
                        : chosen(row) !== null && (projection || sample.has(chosen(row)!)) && writes(chosen(row)!) === null
                          ? projection ? 'no value in the sample' : 'its other fields need it in another form: it would hold'
                          : chosen(row) !== null && (projection || sample.has(chosen(row)!))
                          ? writes(chosen(row)!)!.split('\n')[0]
                          : row.status === 'unmatched'
                            ? 'no match'
                            : ''}
                  </td>
                </tr>,
                list && (
                  <tr key={`${row.fieldId}-columns`}>
                    <td />
                    <td colSpan={2}>
                      <ConnectorColumns
                        fieldId={row.fieldId}
                        collection={list}
                        picked={columns[row.fieldId] ?? defaultColumns(list, adapters[row.fieldId])}
                        onPick={(next) => setColumns((c) => ({ ...c, [row.fieldId]: next }))}
                      />
                    </td>
                  </tr>
                ),
                ];
              })}
            </tbody>
          </table>
          <p className="hint" data-testid="cue-connect-summary">
            {matched} connected · {attention} need{attention === 1 ? 's' : ''} attention · Used by {usedBy} cue{usedBy === 1 ? '' : 's'}
            {removed.length > 0 && <span className="status-warn" data-testid="cue-connect-removed"> · {removed.join(', ')} no longer in this production</span>}
          </p>
          <div className="row">
            {saveError && (
              <p className="status-warn" data-testid="cue-connect-save-error">
                {saveError}
              </p>
            )}
            <button type="button" disabled={(noTab && !firstTab) || saving} onClick={() => void confirm()} data-testid="cue-connect-confirm">
              Connect
            </button>
            {/* Fill copies what the read gives into this cue and connects nothing: the cue keeps
                it whatever the source does next. */}
            {!api && (
              <button
                type="button"
                disabled={Object.keys(previewValues).length === 0}
                onClick={() => {
                  onFill(previewValues);
                  close();
                }}
                data-testid="cue-connect-fill"
              >
                Fill this cue
              </button>
            )}
            <button type="button" onClick={close} data-testid="cue-connect-cancel">
              Cancel
            </button>
          </div>
        </>
      )}
      {!content && !api && !json && (
        <button
          type="button"
          onClick={() => {
            const format = listFormatFor(poolGraphic, 'f0') ?? listFormatFor(poolGraphic, 'f2');
            if (format) downloadCsv(starterCsv(format, values), csvName(poolGraphic.name, 'rows'));
            else downloadCsv(scalarTemplateCsv(scalarFields(poolGraphic, descriptors), values), csvName(poolGraphic.name, 'data-template'));
          }}
          data-testid="cue-connect-template"
        >
          ⬇ {shape === 'values' ? 'Data template' : 'Starter rows'}
        </button>
      )}
    </>
  );
}

/** A connector list's columns: one pick per cell a row of the list carries, from the records' keys. */
function ConnectorColumns({
  fieldId,
  collection,
  picked,
  onPick,
}: {
  fieldId: string;
  collection: { keys: string[] };
  picked: string[];
  onPick: (columns: string[]) => void;
}) {
  return (
    <span className="pd-connect-columns" data-testid={`cue-connect-columns-${fieldId}`}>
      {picked.map((key, i) => (
        <select
          key={i}
          value={key}
          aria-label={`Column ${i + 1}`}
          onChange={(e) => onPick(picked.map((k, j) => (j === i ? e.target.value : k)))}
          data-testid={`cue-connect-column-${fieldId}-${i}`}
        >
          {collection.keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      ))}
    </span>
  );
}

/**
 * "CONNECT DATA…" (data-sources C1b; sheet AC-1, AC-2): the graphic-level action. Choose a Google
 * Sheet tab or reuse a source, see the tab's rows and every field's proposed connection on the
 * real graphic (the PREVIEW monitor shows them), repair what needs attention, and confirm ONCE:
 * the source and the reviewed mapping are one write through the shared binding path, prepared
 * message fields refused. Cancel writes nothing. A graphic whose own code already reads a Sheet
 * offers the explicit migration first (C6, `CueOwnReader`), so no field ever has two readers. The
 * review (CueConnectReview) exists only while open, so a closed menu costs the editor nothing.
 */
function CueConnectData({ ownReader, ...props }: Omit<Parameters<typeof CueConnectReview>[0], 'onClose' | 'onRefused'> & { ownReader: OwnReader }) {
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const close = () => setOpen(false);
  return (
    <span className="lib-menu-host pd-connect-host">
      {/* The head's compact button, as the switch beside it: the head keeps its height. */}
      <button type="button" className="pd-editor-switch" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="cue-connect">
        Connect data…
      </button>
      {refusal && (
        <span className="status-warn" data-testid="cue-connect-refused"> {refusal}</span>
      )}
      <LibMenu open={open} onClose={close} testid="cue-connect-menu" role="dialog">
        {open &&
          (ownReader.gate === 'none' ? (
            <CueConnectReview {...props} onClose={close} onRefused={setRefusal} />
          ) : (
            <CueOwnReader reader={ownReader} graphic={props.poolGraphic.name} onKeep={close} />
          ))}
      </LibMenu>
    </span>
  );
}

/** A graphic's own Sheet reader, as Connect data… sees it (sheet-data-flow AC-10, C6). */
export interface OwnReader {
  gate: OwnReaderGate;
  /** The address its code reads, when the code still says one. */
  url: string | null;
  /** Other productions that play the same library graphic, which the removal reaches too. */
  elsewhere: number;
  /** Remove the reader (ProductionPage's write); answers why it did not happen, or null. */
  remove: () => Promise<string | null>;
}

/**
 * THE EXPLICIT MIGRATION: Connect data… on a graphic that reads a Sheet in its own code. Connecting
 * while that reader runs would leave two readers writing the same fields, so the operator chooses:
 * stop its own reader (the review follows here, or after Publish on a published production, where
 * the output keeps the old reader until then), or keep it and connect nothing.
 */
function CueOwnReader({ reader, graphic, onKeep }: { reader: OwnReader; graphic: string; onKeep: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (reader.gate === 'publish') {
    return (
      <p className="hint status-warn" data-testid="cue-connect-publish-first">
        The output still runs {graphic}’s own Sheet reader. Publish changes, then connect here, so only one reader writes its fields.
      </p>
    );
  }
  if (reader.gate === 'clear') {
    return (
      <p className="hint status-warn" data-testid="cue-connect-clear-first">
        An output has not taken the published {graphic} yet, so its old reader may still run. If it is on air, take it out, then connect here.
      </p>
    );
  }
  return (
    <div data-testid="cue-connect-legacy">
      <p className="hint status-warn">
        {graphic} reads a Sheet in its own code{reader.url ? ` (${reader.url})` : ''}. Connecting here as well would make two readers write the same fields.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const why = await reader.remove();
            setBusy(false);
            setNote(why);
          }}
          data-testid="cue-connect-retire"
        >
          Stop its own reader
        </button>
        <button type="button" onClick={onKeep} data-testid="cue-connect-keep">
          Keep it
        </button>
      </div>
      <p className="hint" data-testid="cue-connect-retire-scope">
        Removes the reader from {graphic}’s code{reader.elsewhere > 0 ? `, also in ${reader.elsewhere} other production${reader.elsewhere === 1 ? '' : 's'} using it` : ''}. Until then Pause does not stop it.
      </p>
      {note && (
        <p className="status-bad" data-testid="cue-connect-retire-failed">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * THE CUE EDITOR of a graphic cue: its title, the unsent line, the setup fold, the data-row
 * loader, the field bands (with the message body's "Fill from…" menu, data-sources C0, and a
 * list field's "Fill from… Paste rows", C1a), the operator note, how the cue ends, the playout
 * layer, the graphic's data template and the sound.
 *
 * The page owns every piece of state and derives every value but one: the cue's text as it is being
 * typed, which this component reads from the session's `draft` part itself (control/cueDraft.ts), so
 * a keystroke redraws the editor and not the page (docs/work-specs/production-page-refactor/spec.md
 * D12, phase 13b). Edits go back through `editDraft`, `setShows` and the setters handed in. The ends
 * row and the sound arrive as render functions, because both read and write the record in ways the
 * page decides (phase 13a); the sound is keyed on the picture being typed, so it takes the text.
 */
export default function CueEditor({
  show,
  setShows,
  poolGraphic,
  editingCue,
  draft,
  editingCueNo,
  editingIsLive,
  rehearsing,
  selectedCue,
  selectedCueStaged,
  selectedGraphic,
  airCue,
  editTarget,
  setEditTarget,
  authoringAllowed,
  editDraft,
  flushDraft,
  rundownHistory,
  updateLive,
  hasUnsent,
  unsentFields,
  keptStates,
  overflowKeys,
  overflowSet,
  descriptors,
  descriptorByKey,
  fieldGroups,
  boundFields,
  resolved,
  cueImages,
  liveFirst,
  fieldsFolded,
  setFoldedFields,
  dataRows,
  loadableRows,
  hasSides,
  loadSide,
  setLoadSide,
  lastLoaded,
  loadRow,
  layerClash,
  sharingLayer,
  editedLayer,
  advancedOpen,
  setAdvancedFor,
  clashFix,
  endsRow,
  sounds,
  sourceStatus,
  fieldsOf,
  onConnectPreview,
  ownReader,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  poolGraphic: SavedGraphic;
  editingCue: ShowCue;
  /** The cue being typed, which the editor shows over the record. */
  draft: Pick<CueDraft, 'part'>;
  /** Its place in the rundown, 1-based; 0 when there is none. */
  editingCueNo: number;
  editingIsLive: boolean;
  rehearsing: boolean;
  selectedCue: ShowCue | null;
  selectedCueStaged: boolean;
  selectedGraphic: string | null;
  /** The cue on air on the selected cue's layer, which the switch points the editor at. */
  airCue: ShowCue | null;
  editTarget: 'preview' | 'air';
  setEditTarget: Dispatch<SetStateAction<'preview' | 'air'>>;
  authoringAllowed: boolean;
  editDraft: (patch: Partial<Pick<CueEditorView, 'label' | 'note'>> & { values?: Record<string, string> }) => void;
  flushDraft: () => Promise<unknown>;
  /** The rundown history, whose group closes when focus leaves the editor. */
  rundownHistory: { closeGroup: () => Promise<boolean> };
  updateLive: () => Promise<void>;
  hasUnsent: boolean;
  unsentFields: string[];
  /** The machine states ✎ Update keeps on air, as words; empty when none. */
  keptStates: string;
  overflowKeys: string[];
  overflowSet: ReadonlySet<string>;
  descriptors: FieldDescriptor[];
  descriptorByKey: ReadonlyMap<string, FieldDescriptor>;
  fieldGroups: CueFieldGroup[];
  boundFields: (graphic: string | null) => Record<string, string>;
  resolved: ResolvedValues;
  cueImages: FieldImage[];
  liveFirst: boolean;
  fieldsFolded: boolean;
  setFoldedFields: Dispatch<SetStateAction<ReadonlySet<string>>>;
  dataRows: CueDataRow[];
  loadableRows: CueDataRow[];
  hasSides: boolean;
  loadSide: 'A' | 'B';
  setLoadSide: (side: 'A' | 'B') => void;
  /** The row each cue last loaded, by cue id. */
  lastLoaded: Record<string, string>;
  loadRow: (id: string) => void;
  layerClash: boolean;
  sharingLayer: SavedGraphic[] | undefined;
  editedLayer: number;
  advancedOpen: boolean;
  setAdvancedFor: (graphicId: string | null) => void;
  clashFix: Ref<HTMLButtonElement>;
  /** How the cue ends (home/CueTiming's CueEndsRow), built by the page when the setup fields
   *  are open. */
  endsRow: () => ReactNode;
  /** The cue's sound (home/ProductionSounds), built by the page for the cue's text as typed. */
  sounds: (view: CueEditorView) => ReactNode;
  /** What each source's reader last found (control/sheetSource.ts), read by the lines that show it. */
  sourceStatus: SourceStatusStore;
  /** A pool graphic's fields as drawn: the same lookup the Sheet reader converts cells with. */
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  /** Show a Connect review's values on the PREVIEW monitor, or stop (null). */
  onConnectPreview: (values: Record<string, string> | null) => void;
  /** The graphic's own Sheet reader, which Connect data… migrates before it connects anything. */
  ownReader: OwnReader;
}) {
  /** How many times the editor has rendered - published on its root as `data-renders`, beside the
   *  page's: e2e/playout-air-contract.spec.ts proves typing moves this one and not that one. */
  const renders = useRef(0);
  renders.current += 1;
  const editingView = useCueView(draft, editingCue);
  const bound = boundFields(selectedGraphic);
  /** What a band HEADING reads, resolved the way the field boxes under it resolve: the live tree
   *  for a bound field, then the cue's own value, then the authored default. */
  const headingValues: Record<string, FieldValue> = Object.fromEntries(
    descriptors.map((d) => [
      d.key,
      (bound[d.key] ? resolved[selectedGraphic ?? '']?.[d.key] : undefined) ??
        editingView.values[d.key] ??
        d.defaultValue ??
        '',
    ]),
  );
  /** What a folded setup bar reads back: the words and figures the cue is set to, resolved the way
   *  the boxes resolve them (a bound field from the tree). Colours and pictures say nothing as
   *  text, so they stay out of it. */
  const setupSummary = fieldsFolded
    ? descriptors
        .filter((d) => d.kind !== 'color' && d.kind !== 'image')
        .map((d) => String(headingValues[d.key] ?? '').trim())
        .filter(Boolean)
        .join(' · ')
    : '';
  // What the cue shows now, field by field, as the band headings read it: starter rows and the
  // data template both start from it. A bound field is not a cue value, so a fill skips it.
  const currentValues = Object.fromEntries(Object.entries(headingValues).map(([k, v]) => [k, String(v)]));
  /** Return connected fields to the cue, each holding the value it last showed. */
  const disconnect = (fieldIds: string[]) => {
    const last = Object.fromEntries(fieldIds.map((f) => [f, resolved[poolGraphic.name]?.[f] ?? editingView.values[f] ?? '']));
    void flushDraft().then(() => setShows(disconnectShowFields(show.id, poolGraphic, last)));
  };
  // The sources this graphic follows, and connected fields it no longer has.
  const fed = (show.sources ?? []).filter((source) => Object.values(bound).some((path) => isSourcePath(source.id, path)));
  return (
    <div className={`pd-editor${editingIsLive ? (rehearsing ? ' up' : ' live') : ''}`} data-testid="cue-editor" data-renders={renders.current} inert={!authoringAllowed}
      onBlurCapture={() => { void flushDraft(); void rundownHistory.closeGroup(); }}>
      <div className="pd-editor-head">
        {/* The cue's POSITION, not just its state. Two cues of the same graphic carry the
            same name and the same tally, so "EDITING ON-AIR CUE" over an editable title
            named them both identically — the operator's own report, 2026-09-05. The number
            is the one thing that is unique per row and is already what the rundown shows. */}
        {/* "PREVIEW CUE" only while the cue IS on PREVIEW: in 'preview-then-take' mode
            the editor follows the cursor, which walks on ahead of the monitor. */}
        <span className="pd-editor-kicker">
          EDITING {editingIsLive ? (rehearsing ? 'UP CUE' : 'ON-AIR CUE') : selectedCueStaged ? 'PREVIEW CUE' : 'SELECTED CUE'}
          {editingCueNo > 0 ? ` · ${editingCueNo}` : ''}
        </span>
        {/* The cue's own title, editable HERE: mislabelling "Guest lower third" as "Host"
            is a live-show mistake and must be fixable without leaving the surface. */}
        <input
          className="pd-cue-title"
          value={editingView.label}
          onChange={(e) => editDraft({ label: e.target.value })}
          aria-label="Cue name"
          data-testid="cue-label"
        />
        <span
          className={hasUnsent ? 'pd-editor-fate pd-unsent-note' : 'muted pd-editor-fate'}
          data-testid="cue-unsent"
        >
          {hasUnsent
            ? keptStates
              ? `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not ${rehearsing ? 'on PROGRAM' : 'on air'} yet. ✎ Update keeps ${keptStates} ${rehearsing ? 'up' : 'on air'}, ⟳ Re-take starts over with these values`
              : `${unsentFields.length} change${unsentFields.length === 1 ? '' : 's'} not ${rehearsing ? 'on PROGRAM' : 'on air'} yet. Press ✎ Update`
            : null}
        </span>
        <CueOverflowNote keys={overflowKeys} descriptors={descriptors} />
        <CueConnectData
          key={poolGraphic.id}
          show={show}
          setShows={setShows}
          poolGraphic={poolGraphic}
          descriptors={descriptors}
          values={currentValues}
          bound={bound}
          store={sourceStatus}
          fieldsOf={fieldsOf}
          onPreview={onConnectPreview}
          onFill={(values) => editDraft({ values: Object.fromEntries(Object.entries(values).filter(([k]) => !bound[k])) })}
          ownReader={ownReader}
        />
        {/* Phone only (the bottom bar carries TAKE/Next/Out): Update belongs beside the
            line that names it rather than hidden from the operator entirely. */}
        {editingIsLive && (
          <button className="pd-editor-update" onClick={() => void updateLive()} data-testid="editor-update">
            ✎ Update
          </button>
        )}
        <div className="spacer" />
        {airCue && airCue.id !== selectedCue?.id && (
          <button
            className="pd-editor-switch"
            onClick={() => setEditTarget((t) => (t === 'preview' ? 'air' : 'preview'))}
            data-testid="cue-editor-switch"
          >
            {editTarget === 'preview' ? (rehearsing ? 'switch to up cue ▾' : 'switch to on-air cue ▾') : 'switch to preview cue ▾'}
          </button>
        )}
      </div>

      {fed.map((source) => {
        const missing = Object.keys(bound).filter((f) => isSourcePath(source.id, bound[f]) && !descriptorByKey.has(f));
        return missing.length > 0 && <CueSourceMissing key={source.id} source={source} missing={missing} onDisconnect={disconnect} />;
      })}

      {/* THE SETUP FOLD, offered only under live actions: a scorebug's team names and a
          quiz's words are set before the cue airs, and once they are the operator works
          from the ⚡ block above. Folded, the bar reads back what is set, so nothing is out
          of sight that the operator cannot check at a glance; the unsent line and the
          too-long warning stay in the head above it. A layer clash keeps it open: that
          repair must never sit behind a closed fold. */}
      {liveFirst && !layerClash && (
        <button
          type="button"
          className="pd-fields-fold"
          aria-expanded={!fieldsFolded}
          aria-controls="pd-setup-fields"
          onClick={() =>
            setFoldedFields((s) => {
              const next = new Set(s);
              if (next.has(poolGraphic.id)) next.delete(poolGraphic.id);
              else next.add(poolGraphic.id);
              return next;
            })
          }
          data-testid="cue-fields-fold"
        >
          <span className="pd-advanced-caret" aria-hidden="true">{fieldsFolded ? '▸' : '▾'}</span>
          Setup fields
          {fieldsFolded && (
            <span className="pd-fields-fold-sum" data-testid="cue-fields-summary">
              {setupSummary}
            </span>
          )}
        </button>
      )}

      {!fieldsFolded && (
      <div id="pd-setup-fields">
      <div className="pd-fields">
        {/* LOAD A DATA ROW (the Data workspace's other half): a table whose column names
            match this graphic's field titles offers its rows here. Loading fills the
            EDITED CUE's draft — data prepares, only Take (or ✎ Update, deliberately)
            airs. Unmatched columns are skipped; untouched fields keep their values. */}
        {loadableRows.length > 0 && (
          <label className="pd-field pd-field-load">
            <span>
              Load data row
              {/* THE SIDE PICKER. Only a board with A/B fields shows it, and it says
                  which side the next load fills — one row is one team, so without it a
                  teams table can only ever describe half the graphic. */}
              {hasSides && (
                <span className="pd-side-pick" data-testid="cue-load-side">
                  {(['A', 'B'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={loadSide === s ? 'active' : ''}
                      onClick={() => setLoadSide(s)}
                      data-testid={`cue-load-side-${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <div className="row">
              <select className="grow" value="" onChange={(e) => loadRow(e.target.value)} data-testid="cue-load-row">
                <option value="">Pick a row from the production's data…</option>
                {loadableRows.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {/* The running-order gesture: next question, next name — one press. Loads
                  the row AFTER the one this cue last loaded (the first, before any). */}
              <button
                onClick={() => {
                  const next = nextRow(dataRows, loadSide, editingCue ? lastLoaded[editingCue.id] ?? null : null);
                  if (next) loadRow(next.id);
                }}
                disabled={
                  !editingCue ||
                  !nextRow(dataRows, loadSide, lastLoaded[editingCue.id] ?? null)
                }
                title="Load the next row of the table into this cue"
                data-testid="cue-load-next"
              >
                Load next row
              </button>
            </div>
          </label>
        )}
        {/* THE BANDS. One per side on a two-sided board, headed by the operator's own
            word for that side; one unlabelled band - today's flat flow - on everything
            else. The grouping is derived, never authored (control/cueFieldGroups.ts). */}
        {fieldGroups.map((group) => {
          // WHAT THE OPERATOR IS LOOKING AT, in the same order the field boxes resolve it:
          // a bound field shows the live tree's value, an unset one its authored default.
          // Reading `editingView.values` alone would head a band "Side A" while the box
          // under it plainly said HOME.
          const heading = groupHeading(group, headingValues);
          return (
            <div
              className={`pd-band${heading ? '' : ' pd-band-plain'}`}
              key={group.id}
              data-testid={`cue-band-${group.id}`}
            >
              {heading && (
                <span className="pd-band-label" data-testid={`cue-band-label-${group.id}`}>
                  {heading}
                </span>
              )}
              <div className="pd-band-fields">
                {group.keys.map((key) => {
                  const d = descriptorByKey.get(key);
                  if (!d) return null;
                  // A BOUND field is not a cue value (plan §2.7): it takes the live tree's
                  // value at Take, at ✎ Update and in the preview, so an editable box here
                  // would show a number nothing will ever air. It reads out instead,
                  // wearing its path — the one override gesture is Unbind, on the Data tab.
                  const path = boundFields(selectedGraphic)[d.key];
                  const source = sourceOf(show, path);
                  const format = listFormatFor(poolGraphic, d.key);
                  if (path) {
                    // Built on `.field-row`/`.field-meta` - FieldRow's OWN structure -
                    // rather than on a hand-rolled label. The cue fields lay out in a grid,
                    // so a row of a different height sits its input a few pixels off its
                    // neighbour's; matching the real structure makes them line up by
                    // construction instead of by a number kept in step here.
                    return (
                      <div className="field-row pd-field-bound" key={d.key} data-testid={`cue-bound-${d.key}`}>
                        <div className="field-meta">
                          <label style={{ margin: 0 }}>
                            {d.key.toUpperCase()} · {d.label}
                          </label>
                          {source ? (
                            <CueConnectedMark source={source} store={sourceStatus} />
                          ) : isApiPath(path) ? (
                            <span className="pd-bound-mark" title={`Connected to Another system: ${path}`} data-testid="cue-connected-mark">
                              🔗 Another system
                            </span>
                          ) : (
                            <span className="pd-bound-mark" title={`Bound to production data: ${path}`}>
                              🔗 {path}
                            </span>
                          )}
                        </div>
                        {/* A list keeps its lines: an <input> would join them into one. A
                            connector's field fills at its source's next read, never from the
                            review's sample: until then it says so. */}
                        {format ? (
                          <textarea value={resolved[selectedGraphic ?? '']?.[d.key] ?? ''} placeholder={source?.kind === 'external' ? 'waits for the next read' : 'not set yet'} rows={3} readOnly tabIndex={-1} />
                        ) : (
                          <input value={resolved[selectedGraphic ?? '']?.[d.key] ?? ''} placeholder={source?.kind === 'external' ? 'waits for the next read' : 'not set yet'} readOnly tabIndex={-1} />
                        )}
                        {/* The operator wins for values (±, a typed value on Data); a connected
                            list is read-only here and says where to edit it (sheet spec). */}
                        {isApiPath(path) && (
                          <span className="hint" data-testid="cue-connected-note">
                            Another system writes <code>{path}</code>.{' '}
                            <button type="button" className="link-inline" onClick={() => disconnect([d.key])} data-testid="cue-disconnect">
                              Disconnect
                            </button>
                          </span>
                        )}
                        {source && (
                          <span className="hint" data-testid="cue-connected-note">
                            {format
                              ? source.kind === 'feed' || source.kind === 'external'
                                ? `Connected to ${sourceKindWord(source)}: ${source.label}. `
                                : `Connected to Sheet: ${source.label}. Edit in the Sheet, or `
                              : ''}
                            <button type="button" className="link-inline" onClick={() => disconnect([d.key])} data-testid="cue-disconnect">
                              {format ? 'Disconnect to edit here' : 'Disconnect'}
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  }
                  const field = (
                    <FieldRow
                      key={d.key}
                      descriptor={{ ...d, label: `${d.key.toUpperCase()} · ${d.label}` }}
                      value={String(editingView.values[d.key] ?? d.defaultValue ?? '')}
                      onChange={(v) => editDraft({ values: { [d.key]: String(v) } })}
                      overflow={overflowSet.has(d.key)}
                      testIdPrefix="cue-field"
                      images={cueImages}
                      imageHint={
                        poolGraphic.type === 'picture'
                          ? 'Add pictures with Upload image…'
                          : "Add pictures in the graphic's Assets tab."
                      }
                    />
                  );
                  // A LIST FIELD offers "Fill from… Paste rows" (data-sources C1a). A standings
                  // board's two fields fill together, from its rows field.
                  if (editingCue && format?.main === d.key) {
                    return (
                      <div className="pd-field-with-fill" key={d.key}>
                        {field}
                        <CueRowsFill
                          key={editingCue.id}
                          format={format}
                          values={currentValues}
                          graphicName={poolGraphic.name}
                          onFill={(values) => editDraft({ values: Object.fromEntries(Object.entries(values).filter(([k]) => !bound[k])) })}
                        />
                      </div>
                    );
                  }
                  // A MESSAGE BODY offers "Fill from…": paste or pick a message into this
                  // cue, through the same staging Messages uses (data-sources C0).
                  if (!editingCue || !isMessageBodyField(show, poolGraphic.id, d.key)) return field;
                  return (
                    <div className="pd-field-with-fill" key={d.key}>
                      {field}
                      <CueMessageFill show={show} setShows={setShows} cueId={editingCue.id} graphicId={poolGraphic.id} beforeFill={flushDraft} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* CUE SETTINGS, under a rule and not in the content grid. The note is the cue's; it is
          not something the graphic SHOWS, and flowing it in beside the content fields is
          what left settings alone on a second row looking like a field nobody finished
          (owner, 2026-08-21). */}
      <div className="pd-cue-meta" data-testid="cue-meta">
        <label className="pd-field pd-field-note">
          <span>Operator note</span>
          <input
            value={editingView.note}
            placeholder="e.g. after the intro"
            onChange={(e) => editDraft({ note: e.target.value })}
            data-testid="cue-note"
          />
        </label>
        {/* HOW THE CUE ENDS (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, §2.1): by hand, or after so many
            seconds on air, then Out, the next cue, or both. Phase 1 runs it unpublished only. */}
        {endsRow()}
      </div>


      {/* ADVANCED: the graphic's PLAYOUT LAYER (docs/CLIP_PLAYBACK_PLAN.md §6.5). Closed by
          default with the number in its summary, because most productions never change it
          (§5 counts from 20, distinct by construction). WHEN IT CLASHES it is open and
          cannot be closed: two graphics on one layer replace each other on air, so the
          repair must never be one click away behind a closed disclosure. The rundown's
          clash badge lands here too (`openLayerRepair`). */}
      <div className={`pd-advanced${layerClash ? ' clash' : ''}`} data-testid="cue-advanced">
        <button
          type="button"
          className="pd-advanced-toggle"
          aria-expanded={advancedOpen}
          aria-controls="pd-advanced-graphic"
          disabled={layerClash}
          onClick={() => setAdvancedFor(advancedOpen ? null : poolGraphic.id)}
          title={layerClash ? 'Two graphics share this layer' : undefined}
          data-testid="cue-advanced-toggle"
        >
          <span className="pd-advanced-caret" aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
          Advanced
          <span className="pd-advanced-sum" data-testid="cue-advanced-summary">
            Layer {editedLayer}
            {layerClash ? ' · shared' : ''}
          </span>
        </button>
        {advancedOpen && (
          <div className="pd-advanced-body" id="pd-advanced-graphic">
            <label className="pd-field pd-field-layer">
              <span>Playout layer</span>
              <input
                type="number"
                min={MIN_PLAYOUT_LAYER}
                max={MAX_PLAYOUT_LAYER}
                value={editedLayer}
                onChange={(e) => setShows(setShowGraphicLayer(show.id, poolGraphic.id, Number(e.target.value)))}
                data-testid="graphic-layer"
              />
            </label>
            {/* THE DATA TEMPLATE (data-sources C1a, AC-13): every value of this graphic as
                `Field ID,Label,Value`, keyed by id so a reordered row or a renamed label still
                reaches its field. A spreadsheet coerces "007" and "=1+1" unless told not to. */}
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => downloadCsv(scalarTemplateCsv(scalarFields(poolGraphic, descriptors), currentValues), csvName(poolGraphic.name, 'data-template'))}
                data-testid="cue-data-template"
              >
                ⬇ Data template
              </button>
              <span className="muted">In Google Sheets, import it with “Convert text to numbers, dates and formulas” off.</span>
            </div>
            {sharingLayer && (
              <p className="status-warn pd-layer-clash" data-testid="layer-clash">
                {nameList(sharingLayer.map((g) => g.name))} share layer {editedLayer}. On air
                they replace each other.
                <button
                  ref={clashFix}
                  onClick={() => setShows(setShowGraphicLayer(show.id, poolGraphic.id, nextFreeLayer(show.graphics)))}
                  data-testid="layer-clash-fix"
                >
                  Move to layer {nextFreeLayer(show.graphics)}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
      </div>
      )}
      {sounds(editingView)}
    </div>
  );
}
