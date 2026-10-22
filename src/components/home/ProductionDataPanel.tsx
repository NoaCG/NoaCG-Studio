import { useMemo, useState } from 'react';
import {
  deletePath,
  flattenLeaves,
  formatValue,
  getPath,
  isSourcePath,
  matchTitle,
  parseDataTree,
  parseLiteral,
  reparseLeaf,
  setPath,
  sourceIdOf,
  sourcePaths,
  sourcePrefix,
  suggestPath,
  type DataLeaf,
  type JsonObject,
  type ResolvedValues,
} from '../../model/productionData';
import { addGraphicToShow, fillsFields, ownSheetGraphics, preparedMessageField, sourceKindWord, setFieldBinding, setFieldBindings, setShowSeedData, type FieldShowSource, type Show } from '../../model/shows';
import { fieldDescriptors } from '../../control/controlModel';
import { freeName } from '../../model/poolIdentity';
import type { FieldDescriptor } from '../../model/fieldModel';
import type { SourceStatusStore } from '../../control/sheetSource';
import { OwnReaderLine, ownSheetReaders, readerWords, statusWords, toggleSourcePause, useSourceStatus } from './SourcesLine';
import { loadGraphics } from '../../model/library';
import { stripLiveData } from '../../control/liveData';
import { nameList } from './CueRundown';
import { useDeferredEdits } from './useDeferredEdits';
import { isApiPath } from '../../control/anotherSystem';

/**
 * THE MANUAL DATA PLAYGROUND (docs/PRODUCTION_DATA_PLAN.md §3) — the production's live data
 * tree, and the bindings that carry it into graphic fields.
 *
 * Three things at once, deliberately: an operator tool (change a value mid-show), a developer
 * tool (prove a binding before an external system exists), and the documentation for the future
 * ingress API — the JSON shown here is exactly the shape that endpoint will accept.
 *
 * Nothing here is domain-specific. The steppers below are generated from whichever leaves
 * happen to be NUMBERS, so a scoreboard, a poll and a lap counter get the same affordance, and
 * the copy's example paths (`show.title`) name no dataset either: a quiz night reads the same
 * explanation as a derby.
 */
export default function ProductionDataPanel({
  show,
  setShows,
  liveData,
  setLiveData,
  resolved,
  sourceStatus,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  liveData: JsonObject;
  setLiveData: (data: JsonObject) => void;
  resolved: ResolvedValues;
  /** What each source's reader last found (control/sheetSource.ts), for the overview. */
  sourceStatus: SourceStatusStore;
}) {
  const [newPath, setNewPath] = useState('');
  const [newValue, setNewValue] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  /** The one line this panel says back, and whether it is good news. ONE state rather than two,
   *  so a red line and a green one can never be on screen together - which they were, the moment
   *  any note was set outside `write()`. */
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  /** The one ✕ whose second click deletes, or null. One slot, so arming a row disarms any other. */
  const [armed, setArmed] = useState<string | null>(null);

  const leaves = useMemo(() => flattenLeaves(liveData), [liveData]);
  const seed = show.data;
  const hasSeed = !!seed && Object.keys(seed).length > 0;

  const write = (next: JsonObject, message?: string) => {
    setLiveData(next);
    setNote(message ? { text: message, ok: true } : null);
  };

  /**
   * The value boxes, deferred (see {@link useDeferredEdits}). The commit writes ONE path, from
   * the tree as it stands at commit time - so an edit typed while a feed tick landed on some
   * other path keeps that tick. An edit that ends where it started writes nothing at all, which
   * is what makes clicking into a box, changing your mind and clicking out of it free.
   *
   * The steppers, Apply JSON, Reset, Clear and Move numbers stay IMMEDIATE: each is one
   * deliberate press, already one write, and a press that did not move the figure would read as
   * a broken button.
   */
  const edits = useDeferredEdits((path, text) => {
    // Read through the model rather than scanning the rows this render happens to hold: `getPath`
    // and `formatValue` are the same pair `flattenLeaves` used to build them, so "is this path
    // still a leaf, and what does it say" cannot drift from what the rest of the app believes.
    const previous = getPath(liveData, path);
    const stored = formatValue(previous);
    // THE ROW WENT AWAY while it was being typed into - a second operator deleted the path, or a
    // feed's tree no longer carries it. Writing the text back would resurrect a value somebody
    // deliberately removed, so the edit is dropped - but never in silence, because the operator
    // has typed something and is entitled to know it went nowhere.
    if (stored === null) {
      setNote({ text: `${path} was removed while you were typing it, so what you typed was not saved.`, ok: false });
      return;
    }
    if (stored === text) return;
    write(setPath(liveData, path, reparseLeaf(previous, text)));
  });

  /** A − or + press on a number: one write, counted from the tree as it stands. */
  const step = (path: string, by: number) => {
    const value = getPath(liveData, path);
    if (typeof value === 'number') write(setPath(liveData, path, value + by));
  };

  const addField = () => {
    const path = newPath.trim();
    if (path === '') return;
    write(setPath(liveData, path, parseLiteral(newValue)));
    setNewPath('');
    setNewValue('');
  };

  const openRaw = () => {
    setRawText(JSON.stringify(liveData, null, 2));
    setRawError(null);
    setRawOpen(true);
  };

  const applyRaw = () => {
    const { data, error } = parseDataTree(rawText);
    if (!data) {
      setRawError(error);
      return;
    }
    write(data, '✓ Data replaced');
    setRawOpen(false);
  };

  /** Nudge every NUMBER leaf by a hand-sized amount — the generic "does my binding move?"
   *  gesture. No named dataset, no per-domain button: the tree's own shape decides. */
  const randomise = () => {
    let next = liveData;
    let touched = 0;
    for (const leaf of leaves) {
      if (typeof leaf.value !== 'number') continue;
      next = setPath(next, leaf.path, Math.round((leaf.value + (Math.random() * 10 - 4)) * 100) / 100);
      touched += 1;
    }
    write(next, touched > 0 ? `✓ ${touched} number${touched === 1 ? '' : 's'} moved` : 'No numbers to move.');
  };

  return (
    <section className="pd-live" data-testid="production-live-data">
      {/* Deliberately NOT `.pd-data-head` / `.pd-data-actions`: those selectors belong to the
          tables section below and its empty-state layout is asserted through them by geometry
          (e2e/production-data.spec.ts). A second element wearing the same class would answer
          that measurement instead. */}
      <div className="pd-live-head">
        <h2>Production data</h2>
        <p className="hint">
          The values, lists and Sheets this production uses, and the graphics that show them.
          Change a value here and every graphic showing it follows, on air too.
        </p>
      </div>

      {/* ONE line, in the colour its own news deserves: a value that went nowhere must not arrive
          wearing the style this panel uses for "done". */}
      {note && (
        <p className={`${note.ok ? 'status-ok' : 'status-bad'} pd-data-note`} data-testid="data-note">
          {note.text}
        </p>
      )}

      <DataOverview
        show={show}
        setShows={setShows}
        leaves={leaves}
        store={sourceStatus}
        edits={{ ...edits, step }}
      />

      {/* ADVANCED (sheet spec AC-9): the tree by its paths, the seed, Raw JSON and the per-field
          table, closed by default. They all keep working; the default surface above speaks the
          one vocabulary instead. */}
      <details className="pd-advanced" data-testid="data-advanced">
        <summary data-testid="data-advanced-toggle">Advanced</summary>
        <div className="pd-live-actions">
            <button
              onClick={() => write({ ...(seed ?? {}) }, '✓ Reset to seed')}
              disabled={!hasSeed}
              title={hasSeed ? 'Return every value to the saved seed' : 'No seed saved yet'}
              data-testid="data-reset"
            >
              ⟲ Reset to seed
            </button>
            <button onClick={() => write({}, '✓ Cleared')} data-testid="data-clear">
              ✕ Clear
            </button>
            <button
              onClick={() => {
                setShows(setShowSeedData(show.id, liveData));
                setNote({ text: '✓ Saved as this production’s seed', ok: true });
              }}
              data-testid="data-save-seed"
            >
              ⬇ Save as seed
            </button>
            <button onClick={randomise} data-testid="data-randomise">
              ⚄ Move numbers
            </button>
            <button onClick={rawOpen ? () => setRawOpen(false) : openRaw} data-testid="data-raw-toggle">
              {rawOpen ? '▴ Hide JSON' : '▾ Raw JSON'}
            </button>
        </div>
        {/* WHAT THIS TAB IS FOR, in three short paragraphs, closed by default. The owner opened this
            tab on 2026-09-15 and could not tell what the button did or how the boxes worked, and he
            built the product; a first-time operator gets one look. A drawer costs nothing once
            learned, and a paragraph that is always open is one more thing to scroll past on air. */}
        <details className="pd-explain" data-testid="data-explain">
          <summary>How this tab works</summary>
          <div className="pd-explain-body">
            <p>
              <strong>Production data</strong> is a list of values with a path and a value, like{' '}
              <code>show.title</code> and <code>Helsinki</code>. Type a new value and every graphic
              bound to that path shows it, also while it is on air. An outside system can write the
              same list over the data key.
            </p>
            <p>
              <strong>Bindings</strong> link one field of one graphic to one path. Click a field's
              box to pick a path from the list, or type one. A bound field shows the value from here,
              in the preview and on air, and its box in the cue is locked.
            </p>
            <p>
              <strong>Tables</strong> are banks of rows, like a quiz bank or a line-up. They change
              nothing by themselves: on the Playout tab you load one row into a cue's preview, then
              take it.
            </p>
            <p className="hint">
              <a href="/docs#data-example" target="_blank" rel="noreferrer">
                More about this, with a worked example
              </a>
            </p>
          </div>
        </details>

        {rawOpen && (
          <div className="pd-raw" data-testid="data-raw">
            {/* The honest view of a nested tree, and the paste target for a sample payload — the
                same JSON the future ingress API will accept, which is what makes this panel the
                API's documentation as well as its playground. */}
            <textarea
              value={rawText}
              spellCheck={false}
              onChange={(e) => {
                setRawText(e.target.value);
                setRawError(null);
              }}
              data-testid="data-raw-text"
            />
            {rawError && (
              <p className="status-bad" data-testid="data-raw-error">
                {rawError}
              </p>
            )}
            <button onClick={applyRaw} data-testid="data-raw-apply">
              Apply JSON
            </button>
          </div>
        )}

        <div className="pd-live-rows">
          {leaves.length === 0 && (
            <p className="hint" data-testid="data-empty-live">
              No values yet. Add one below, or open Raw JSON and paste a whole payload, nested as
              deep as you like.
            </p>
          )}
          {leaves.map((leaf) => {
            // What the box shows, and whether it is holding an edit nobody has been told about.
            const text = edits.text(leaf.path, leaf.text);
            const dirty = edits.dirty(leaf.path);
            return (
              <div className="pd-live-row" key={leaf.path} data-testid={`data-row-${leaf.path}`}>
                <code className="pd-live-path">{leaf.path}</code>
                {/* A LIST needs a textarea, not an input: `<input>` sanitises newlines out of its
                    own value, so a list rendered there would come back joined into one line and the
                    array would quietly become a string. `reparseLeaf` puts the list back together.

                    IT IS THE VALUE'S TYPE THAT DECIDES, not how many lines the text happens to have.
                    A list stays a list through `reparseLeaf` however few lines are left in it, so a
                    textarea stays a textarea - whereas the line count changes as somebody types, and
                    on a two-line list edited down to one the settle timer would swap the element
                    under an idle caret, unmounting the box mid-edit and sending focus to the body.
                    A multi-line STRING still reads its line count, because nothing about a string
                    says it wants more than one line; it can still swap, and only when a person has
                    deleted every newline in it. */}
                {Array.isArray(leaf.value) || leaf.text.includes('\n') ? (
                  <textarea
                    className="pd-live-lines"
                    rows={Math.min(text.split('\n').length, 6)}
                    value={text}
                    data-dirty={dirty || undefined}
                    onChange={(e) => edits.type(leaf.path, e.target.value)}
                    onBlur={edits.flush}
                    data-testid={`data-value-${leaf.path}`}
                  />
                ) : (
                  <input
                    value={text}
                    data-dirty={dirty || undefined}
                    onChange={(e) => edits.type(leaf.path, e.target.value)}
                    onBlur={edits.flush}
                    // Enter ends the edit here. Not on the textarea above, where Enter is a line of
                    // the list and ending the edit with it would make a list impossible to type.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') edits.flush();
                    }}
                    data-testid={`data-value-${leaf.path}`}
                  />
                )}
                <span className="pd-live-type">{Array.isArray(leaf.value) ? 'list' : typeof leaf.value}</span>
                {typeof leaf.value === 'number' && (
                  <span className="pd-live-step">
                    <button
                      onClick={() => step(leaf.path, -1)}
                      data-testid={`data-down-${leaf.path}`}
                    >
                      −
                    </button>
                    <button
                      onClick={() => step(leaf.path, 1)}
                      data-testid={`data-up-${leaf.path}`}
                    >
                      +
                    </button>
                  </span>
                )}
                {/* ARMED, like the entry delete on the graphic control page. This is typed-in data
                    with no undo behind it, on a row someone drives live, and a stray click took it
                    with no way back - "if I close one of those, how can I reopen it?" (owner,
                    2026-08-21). The answer used to be: retype the path and the value from memory. */}
                <button
                  className={`pd-live-del${armed === `leaf:${leaf.path}` ? ' reset-armed' : ''}`}
                  title={armed === `leaf:${leaf.path}` ? `Click again to delete ${leaf.path}` : 'Delete this value'}
                  onClick={() => {
                    if (armed === `leaf:${leaf.path}`) {
                      setArmed(null);
                      write(deletePath(liveData, leaf.path));
                    } else setArmed(`leaf:${leaf.path}`);
                  }}
                  data-testid={`data-delete-${leaf.path}`}
                >
                  {/* A GLYPH, not the word the other armed buttons use: this row's last grid column
                      is a fixed 28px, so "Delete?" would overflow its own track - the defect §2d of
                      docs/PLAYOUT_DASHBOARD.md is about, one panel over. The amber and the tooltip
                      carry the meaning instead. */}
                  {armed === `leaf:${leaf.path}` ? '✓' : '✕'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="pd-live-add">
          <input
            value={newPath}
            placeholder="show.title"
            onChange={(e) => setNewPath(e.target.value)}
            data-testid="data-new-path"
          />
          <input
            value={newValue}
            placeholder="value"
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addField();
            }}
            data-testid="data-new-value"
          />
          <button onClick={addField} data-testid="data-add">
            + Add field
          </button>
          <span className="hint">
            <code>4</code> is a number, <code>true</code> a boolean, <code>[1,2]</code> a list;
            anything else is text.
          </span>
        </div>

        <BindingTable show={show} setShows={setShows} liveData={liveData} resolved={resolved} />
      </details>
    </section>
  );
}

/** The graphics showing a value, by name, from the production's connections. */
function usersOf(show: Show, pool: ReadonlySet<string>, path: string): { graphic: string; fieldId: string }[] {
  return Object.entries(show.bindings ?? {})
    .filter(([graphic]) => pool.has(graphic))
    .flatMap(([graphic, fields]) => Object.entries(fields).filter(([, p]) => p === path).map(([fieldId]) => ({ graphic, fieldId })));
}

/** A value's name on the overview: a data template's Field ID reads as the field's own title. */
function nameOf(show: Show, key: string, users: { graphic: string; fieldId: string }[]): string {
  const user = users.find((u) => u.fieldId === key);
  const field = user && show.graphics.find((g) => g.name === user.graphic)?.template.fields?.find((f) => f.field === key);
  return field?.title || key;
}

/** What the overview's value rows need from the panel: its deferred boxes and its one write. */
interface ValueEdits {
  text: (key: string, stored: string) => string;
  dirty: (key: string) => boolean;
  type: (key: string, text: string) => void;
  flush: () => void;
  step: (path: string, by: number) => void;
}

/**
 * One value on the overview: its name, what it holds and who shows it. A scalar is typed into
 * here (the operator wins, D4: a Sheet value holds until its cell changes); a list is read here
 * and edited where it comes from, the Sheet or Advanced.
 */
function OverviewValue({ leaf, name, users, list, connected, edits }: { leaf: DataLeaf; name: string; users: string[]; list: boolean; connected: boolean; edits: ValueEdits }) {
  const lines = leaf.text.split('\n');
  return (
    <div className="pd-live-row" data-testid={`data-item-${leaf.path}`}>
      <span className="pd-live-path">{name}</span>
      {list ? (
        <span className="hint" data-testid="data-item-value">
          {lines.length} line{lines.length === 1 ? '' : 's'}: {lines[0]}
          {lines.length > 1 ? ' …' : ''}
          {connected ? ' · edit it in the Sheet' : ' · edit it under Advanced'}
        </span>
      ) : (
        <input
          value={edits.text(leaf.path, leaf.text)}
          data-dirty={edits.dirty(leaf.path) || undefined}
          onChange={(e) => edits.type(leaf.path, e.target.value)}
          onBlur={edits.flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter') edits.flush();
          }}
          aria-label={name}
          data-testid="data-item-value"
        />
      )}
      {typeof leaf.value === 'number' ? (
        <span className="pd-live-step">
          <button onClick={() => edits.step(leaf.path, -1)} aria-label={`${name} down`} data-testid="data-item-down">
            −
          </button>
          <button onClick={() => edits.step(leaf.path, 1)} aria-label={`${name} up`} data-testid="data-item-up">
            +
          </button>
        </span>
      ) : (
        <span />
      )}
      <span className="hint" data-testid="data-item-users">
        {users.length > 0 ? `Shown by ${users.join(', ')}` : 'Not shown by any graphic'}
      </span>
    </div>
  );
}

/** A source on the overview: what it is, who reads it and how often, checked versus changed,
 *  Pause, and the graphics that follow it (data-sources AC-9's source details). */
function OverviewSource({ show, setShows, source, store, pool }: { show: Show; setShows: (shows: Show[]) => void; source: FieldShowSource; store: SourceStatusStore; pool: ReadonlySet<string> }) {
  const { status, now } = useSourceStatus(store, source.id);
  const graphics = [...new Set(sourcePaths(show.bindings, source.id).map((p) => p.graphic))].filter((g) => pool.has(g));
  return (
    <div className="pd-bind-graphic-head" data-testid={`data-source-${source.id}`}>
      <h4>{sourceKindWord(source)}: {source.label}</h4>
      <span className="hint" data-testid="data-source-status">
        {statusWords(source.paused, status, now, false)}
        {status?.stale && !source.paused && <strong className="status-warn"> · stale</strong>}
        {status?.state === 'failing' && status.fix && !source.paused && <span className="status-warn"> · {status.fix}</span>}
        {!source.paused && status?.problems.map((p) => (
          <span key={p} className="status-warn" data-testid="data-source-problem"> · {p}.</span>
        ))}
      </span>
      <span className="hint" data-testid="data-source-reader">
        {readerWords(source.paused, status, source.kind)}
      </span>
      <span className="hint" data-testid="data-source-users">
        {graphics.length > 0 ? `Followed by ${graphics.join(', ')}` : 'No graphic follows it'}
      </span>
      <button type="button" onClick={() => toggleSourcePause(show, setShows, store, source)} data-testid="data-source-pause">
        {source.paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}

/**
 * THE DATA OVERVIEW (data-sources C1c, AC-9; sheet AC-9): every source with its reader, cadence,
 * last checked and last changed, and Pause; every value under the source it comes from or as
 * local content, with the graphics showing it. Local content carries no freshness: nothing reads
 * it, so nothing about it can be late.
 */
function DataOverview({
  show,
  setShows,
  leaves,
  store,
  edits,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  leaves: DataLeaf[];
  store: SourceStatusStore;
  edits: ValueEdits;
}) {
  // Only a Sheet tab or a feed holds values; a YouTube source feeds Messages alone.
  const sources = (show.sources ?? []).filter(fillsFields);
  // A Sheet's values outlive its disconnection in the tree, following nothing: they are not local
  // content, and they stay reachable under Advanced. Another system's are its own group (C5).
  const local = leaves.filter((leaf) => !sourceIdOf(leaf.path) && !isApiPath(leaf.path));
  const pushed = leaves.filter((leaf) => isApiPath(leaf.path));
  // Bindings outlive a graphic removed from the pool; only graphics still in it show anything.
  const pool = new Set(show.graphics.map((g) => g.name));
  // A graphic reading a Sheet in its own code is a source too, one Pause cannot reach (C6).
  const ownReaders = useMemo(() => ownSheetReaders(show.graphics, loadGraphics(), !!show.hostedSlug), [show.graphics, show.hostedSlug]);
  const row = (leaf: DataLeaf, key: string | null) => {
    const users = usersOf(show, pool, leaf.path);
    return (
      <OverviewValue
        key={leaf.path}
        leaf={leaf}
        name={key === null ? leaf.path : nameOf(show, key.replace(/^values\./, ''), users)}
        users={[...new Set(users.map((u) => u.graphic))]}
        // A Sheet's lines and rows are lists by shape, even emptied; a local value by its type. Text
        // with line breaks is read here, never typed: a one-line box would flatten it on air.
        list={leaf.text.includes('\n') || (key === null ? Array.isArray(leaf.value) : !key.startsWith('values.'))}
        connected={key !== null}
        edits={edits}
      />
    );
  };
  return (
    <div className="pd-bindings" data-testid="data-overview">
      {sources.map((source) => (
        <div className="pd-bind-graphic" key={source.id}>
          <OverviewSource show={show} setShows={setShows} source={source} store={store} pool={pool} />
          {leaves
            .filter((leaf) => isSourcePath(source.id, leaf.path))
            .map((leaf) => row(leaf, leaf.path.slice(sourcePrefix(source.id, source.kind).length + 1)))}
        </div>
      ))}
      {ownReaders.map((reader) => (
        <div className="pd-bind-graphic" key={`own:${reader.graphic}`}>
          <OwnReaderLine reader={reader} />
        </div>
      ))}
      {pushed.length > 0 && (
        <div className="pd-bind-graphic" data-testid="data-api-values">
          <div className="pd-bind-graphic-head">
            <h4>Another system</h4>
            <span className="hint">Written with the data key: see Another system below.</span>
          </div>
          {pushed.map((leaf) => row(leaf, null))}
        </div>
      )}
      {(local.length > 0 || (sources.length === 0 && pushed.length === 0)) && (
        <div className="pd-bind-graphic" data-testid="data-local">
          <div className="pd-bind-graphic-head">
            <h4>Local content</h4>
            <span className="hint">Kept with this production. Nothing reads it from elsewhere.</span>
          </div>
          {local.length === 0 && (
            <p className="hint" data-testid="data-local-empty">
              No values yet. Connect a Sheet with Connect data… on a graphic in Playout, or add values under Advanced.
            </p>
          )}
          {local.map((leaf) => row(leaf, null))}
        </div>
      )}
    </div>
  );
}

/**
 * Which field of which graphic reads which path — visible on both sides, editable in one place.
 *
 * The suggestion is offered, never applied silently: `suggestPath` returns a path only when
 * exactly ONE leaf matches the field's title, so an ambiguous name leaves an empty row for the
 * operator rather than a binding that is wrong half the time (the API's `ambiguous` doctrine).
 */
/** Every unbound, unambiguous title-to-leaf suggestion the given descriptors would bind, keyed
 *  by field id, the same computation the per-row suggestion and the two bulk buttons share. */
function unambiguousSuggestions(
  descriptors: FieldDescriptor[],
  bound: Record<string, string> | undefined,
  leaves: DataLeaf[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of descriptors) {
    if (bound?.[d.key]) continue; // already bound, never overwritten by a bulk press
    const suggestion = suggestPath(d.label, leaves);
    if (suggestion) out[d.key] = suggestion;
  }
  return out;
}

/** Which "Bind all by title" button produced the last note - the whole production, or one
 *  named graphic. A bare string would collide with a graphic actually named "production"
 *  (nothing stops that rename), so the scope is tagged rather than compared by string equality. */
type BindAllScope = { kind: 'production' } | { kind: 'graphic'; name: string };

function scopesMatch(a: BindAllScope, b: BindAllScope): boolean {
  return a.kind === 'production' ? b.kind === 'production' : b.kind === 'graphic' && b.name === a.name;
}

function BindingTable({
  show,
  setShows,
  liveData,
  resolved,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  liveData: JsonObject;
  resolved: ResolvedValues;
}) {
  const leaves = useMemo(() => flattenLeaves(liveData), [liveData]);
  const bindings = show.bindings ?? {};
  /** The one ✕ whose second click unbinds, or null — the same one-slot arming as above. */
  const [armed, setArmed] = useState<string | null>(null);
  /** The last "Bind all by title" outcome, per button. Cleared by the next press of any. */
  const [bindAllNote, setBindAllNote] = useState<{ scope: BindAllScope; text: string } | null>(null);
  /** Graphics still reading a Sheet in their own code: their fields take no binding (C6). */
  const ownGraphics = useMemo(() => ownSheetGraphics(show, loadGraphics()), [show]);

  const graphicsWithFields = show.graphics
    .map((g) => ({ g, descriptors: fieldDescriptors(g.template.fields ?? [], { includeHidden: true }) }))
    .filter(({ descriptors }) => descriptors.length > 0);

  /**
   * The path boxes, deferred for the same reason as the value boxes above and one of its own: a
   * binding is persisted on the SHOW RECORD, so typing `match.home.name` used to save fifteen
   * bindings, fourteen of them to paths that do not exist. Each of those is a synced document
   * write, and each makes the field it belongs to resolve to nothing for a moment - on air.
   *
   * A graphic's name and a field id are two strings that both come from user data, so the key
   * that identifies a box is their JSON pair rather than anything joined by a separator one of
   * them could contain.
   */
  const bindEdits = useDeferredEdits((key, text) => {
    const { graphic, fieldId } = JSON.parse(key) as { graphic: string; fieldId: string };
    // Same rule as the value boxes: an edit that ends where it started writes nothing. Here that
    // is worth a line of its own, because the write is a whole load-mutate-save of the shows
    // store and a synced show-record write - an expensive way to store the string already there.
    if ((bindings[graphic]?.[fieldId] ?? '') === text) return;
    setShows(setFieldBinding(show.id, graphic, fieldId, text));
  });
  const bindKey = (graphic: string, fieldId: string) => JSON.stringify({ graphic, fieldId });
  /** A free pool name for the separate card a refused binding offers. */
  const separateName = (name: string) => freeName(show.graphics.map((x) => x.name), `${name} (live data)`);

  /** Apply every unambiguous suggestion across one or more graphics in ONE write to the show
   *  record. This is the operator's press, never a load-time effect (the suggestion above is
   *  only ever offered) - and one press writing N fields costs one write, not N. */
  const bindAllByTitle = (
    scope: BindAllScope,
    targets: { g: Show['graphics'][number]; descriptors: FieldDescriptor[] }[],
  ) => {
    const entries: { graphic: string; fieldId: string; path: string }[] = [];
    const skipped: string[] = [];
    for (const { g, descriptors } of targets) {
      // Its own code reads a Sheet: the binding would be refused (shows.ts `ownSheetGraphics`).
      if (ownGraphics.has(g.name)) {
        skipped.push(g.name);
        continue;
      }
      const suggestions = unambiguousSuggestions(descriptors, bindings[g.name], leaves);
      for (const fieldId of Object.keys(suggestions)) entries.push({ graphic: g.name, fieldId, path: suggestions[fieldId] });
    }
    if (entries.length > 0) setShows(setFieldBindings(show.id, entries));
    // The second press says WHY it did nothing, because the first press did something and the
    // button looks the same: every field this could fill is already filled, or nothing matches.
    setBindAllNote({
      scope,
      text:
        (entries.length > 0
          ? `✓ ${entries.length} field${entries.length === 1 ? '' : 's'} bound`
          : skipped.length > 0
            ? 'Nothing bound.'
            : 'Nothing left to bind. No empty field has exactly one matching path.') +
        (skipped.length > 0 ? ` ${nameList(skipped)} ${skipped.length === 1 ? 'reads' : 'read'} a Sheet in its own code: Connect data… moves it here first.` : ''),
    });
  };
  const hasFields = graphicsWithFields.length > 0;

  return (
    <div className="pd-bindings" data-testid="production-bindings">
      <div className="pd-bind-head">
        <h3>Bindings</h3>
        {hasFields && (
          <button
            className="pd-bind-all"
            onClick={() => bindAllByTitle({ kind: 'production' }, graphicsWithFields)}
            data-testid="bind-all-production"
          >
            Bind all by title
          </button>
        )}
      </div>
      {/* `unambiguousSuggestions` and `matchTitle`, said where the button is. */}
      {hasFields && (
        <p className="hint pd-bind-rule" data-testid="bind-all-rule">
          Fills each empty field whose title is the last part of exactly one path above, like the
          field "Title" and the path <code>show.title</code>. Paths you typed stay. Pressing again
          changes nothing until the data or the fields change.
        </p>
      )}
      {bindAllNote && scopesMatch(bindAllNote.scope, { kind: 'production' }) && (
        <p className="hint" data-testid="bind-all-note-production">
          {bindAllNote.text}
        </p>
      )}
      {show.graphics.length === 0 && (
        <p className="hint">Add a graphic to this production and its fields appear here.</p>
      )}
      {graphicsWithFields.map(({ g, descriptors }) => {
        return (
          <div className="pd-bind-graphic" key={g.id} data-testid={`bind-graphic-${g.name}`}>
            <div className="pd-bind-graphic-head">
              <h4>{g.name}</h4>
              <button
                className="pd-bind-all"
                onClick={() => bindAllByTitle({ kind: 'graphic', name: g.name }, [{ g, descriptors }])}
                data-testid={`bind-all-${g.name}`}
              >
                Bind this graphic by title
              </button>
            </div>
            {bindAllNote && scopesMatch(bindAllNote.scope, { kind: 'graphic', name: g.name }) && (
              <p className="hint" data-testid={`bind-all-note-${g.name}`}>
                {bindAllNote.text}
              </p>
            )}
            {descriptors.map((d) => {
              const path = bindings[g.name]?.[d.key] ?? '';
              // One scan of the leaves per unbound field, read two ways: exactly one hit is the
              // suggestion (the same rule as `suggestPath`), and two or more are never guessed
              // but still owe the operator a reason, so the row names what it matched.
              const hits = path ? [] : matchTitle(d.label, leaves);
              const suggestion = hits.length === 1 ? hits[0] : null;
              const ambiguous = hits.length > 1 ? hits : [];
              const live = resolved[g.name]?.[d.key];
              const key = bindKey(g.name, d.key);
              // A field prepared messages use takes no binding: it would let data rewrite a message
              // the operator approved. setFieldBinding refuses it whatever the door; this says why
              // here, and offers the way that works - a separate card for the live data.
              const refused = !path && preparedMessageField(show, g.name, d.key);
              // Its own code reads a Sheet: no new path, until Connect data… moves it here (C6). A
              // binding saved before that stays, and can still be unbound.
              const ownReader = !refused && ownGraphics.has(g.name);
              return (
                <div className="pd-bind-row" key={d.key}>
                  <span className="pd-bind-field">
                    <code>{d.key}</code> {d.label}
                  </span>
                  <input
                    value={bindEdits.text(key, path)}
                    readOnly={refused || ownReader}
                    data-dirty={bindEdits.dirty(key) || undefined}
                    placeholder={suggestion ? `suggested: ${suggestion}` : 'pick or type a path'}
                    list="pd-data-paths"
                    onChange={(e) => bindEdits.type(key, e.target.value)}
                    onBlur={bindEdits.flush}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') bindEdits.flush();
                    }}
                    data-testid={`bind-${g.name}-${d.key}`}
                  />
                  {refused && (
                    <span className="pd-bind-miss" data-testid={`bind-refused-${g.name}-${d.key}`}>
                      Prepared messages use this field, so it cannot follow data.{' '}
                      <button
                        className="pd-bind-suggest"
                        // The separate card never brings the graphic's own Sheet reader with it.
                        onClick={() => setShows(addGraphicToShow(show.id, { ...g.template, js: stripLiveData(g.template.js ?? ''), name: separateName(g.name) }, {}).shows)}
                        data-testid={`bind-separate-${g.name}-${d.key}`}
                      >
                        Add a separate card for live data
                      </button>
                    </span>
                  )}
                  {ownReader && (
                    <span className="pd-bind-miss" data-testid={`bind-own-reader-${g.name}-${d.key}`}>
                      {g.name} reads a Sheet in its own code. Connect data… on its cue moves it here first.
                    </span>
                  )}
                  {suggestion && !refused && !ownReader && (
                    <button
                      className="pd-bind-suggest"
                      onClick={() => setShows(setFieldBinding(show.id, g.name, d.key, suggestion))}
                      data-testid={`bind-accept-${g.name}-${d.key}`}
                    >
                      use {suggestion}
                    </button>
                  )}
                  {ambiguous.length > 1 && (
                    <span className="pd-bind-ambiguous" data-testid={`bind-ambiguous-${g.name}-${d.key}`}>
                      {ambiguous.length} paths match, pick one: {ambiguous.join(', ')}
                    </span>
                  )}
                  {/* What the field is ACTUALLY showing, so a typo in a path reads as a blank
                      here rather than as a mystery on air. */}
                  {path && (
                    <span
                      className={live === undefined ? 'pd-bind-miss' : 'pd-bind-live'}
                      data-testid={`bind-value-${g.name}-${d.key}`}
                    >
                      {live === undefined ? 'no value at this path, field left alone' : live}
                    </span>
                  )}
                  {path && (
                    // ARMED for the same reason as the value delete above, and more so: unbinding
                    // CHANGES WHAT AIRS - the field goes back to the cue's own value the next time
                    // it is sent - and the path it forgets was only ever typed here.
                    <button
                      className={`pd-live-del${armed === `bind:${g.name}:${d.key}` ? ' reset-armed' : ''}`}
                      title={
                        armed === `bind:${g.name}:${d.key}`
                          ? `Click again to unbind ${d.key} from ${path}`
                          : "Unbind. The field goes back to the cue's own value"
                      }
                      onClick={() => {
                        if (armed === `bind:${g.name}:${d.key}`) {
                          setArmed(null);
                          setShows(setFieldBinding(show.id, g.name, d.key, null));
                        } else setArmed(`bind:${g.name}:${d.key}`);
                      }}
                      data-testid={`unbind-${g.name}-${d.key}`}
                    >
                      {armed === `bind:${g.name}:${d.key}` ? '✓' : '✕'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <datalist id="pd-data-paths">
        {leaves.map((l) => (
          <option key={l.path} value={l.path} />
        ))}
      </datalist>
    </div>
  );
}
