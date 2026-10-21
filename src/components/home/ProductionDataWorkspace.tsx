import { useState, type ReactNode } from 'react';
import { saveAs } from 'file-saver';
import {
  addDatasetColumn,
  addDatasetRow,
  addShowDataset,
  datasetPreset,
  removeDatasetColumn,
  removeDatasetRow,
  removeShowDataset,
  renameDatasetColumn,
  renameShowDataset,
  importShowDataset,
  updateDatasetRow,
  type Show,
  type ShowDataset,
} from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { parseTableFile, serializeCsv } from '../../model/csv';
import type { JsonObject, ResolvedValues } from '../../model/productionData';
import ProductionDataPanel from './ProductionDataPanel';
import { datasetMatches } from '../../control/cueData';
import { fieldDescriptors } from '../../control/controlModel';
import type { SourceStatusStore } from '../../control/sheetSource';

/** A file name a spreadsheet will not argue with, from the table type's own name. */
function templateFileName(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'table'}-template.csv`;
}

/**
 * Which of an imported file's columns can actually BIND — the same match
 * `datasetValuesForFields` performs, asked of every graphic in this production's pool.
 *
 * It is here rather than in the model because it answers a UI question ("was that import
 * useful?"), and it deliberately reads the pool rather than the whole library: a table binds to
 * the graphics this production runs, not to graphics it does not.
 */
function boundColumns(show: Show, header: string[]): string[] {
  const titles = new Set<string>();
  for (const g of show.graphics) {
    for (const f of g.template.fields ?? []) {
      if (f.title) titles.add(f.title.trim().toLowerCase());
    }
  }
  return header.filter((h) => titles.has(h.trim().toLowerCase()));
}

/**
 * The production's DATA workspace (route `#/production/<id>/data` — the Data tab of the
 * playout dashboard, docs/INTERACTIVE_PLAYOUT_PLAN.md D3/D6): the show's own tables — quiz
 * question banks, teams, line-ups — edited here, loaded into CUES from the playout surface by
 * deliberate operator action. Everything is plain typed data on the Show record: offline,
 * synced with the production, no backend.
 *
 * Deliberately NOT a spreadsheet: no formulas, no cell formatting, no pivots. Tables, rows,
 * and the column labels that bind them to graphic fields (a column named like a field's title
 * loads into that field — the binding is the words, visible on both sides).
 */
export default function ProductionDataWorkspace({
  show,
  setShows,
  liveData,
  setLiveData,
  resolved,
  dataKey,
  sourceStatus,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
  liveData: JsonObject;
  setLiveData: (data: JsonObject) => void;
  resolved: ResolvedValues;
  /** The production's own data key, passed straight through to the live panel - the page owns
   *  it because the page is the one that reads it (control/productionDataApi.ts). */
  dataKey?: string | null;
  sourceStatus: SourceStatusStore;
}) {
  const [newKind, setNewKind] = useState<ShowDataset['kind']>('quiz');
  const [importNote, setImportNote] = useState<string | null>(null);
  const datasets = show.datasets ?? [];

  /**
   * IMPORT a CSV/TSV/JSON file as a new table (Phase 7). The file's header row becomes the
   * column labels verbatim, because the binding IS the words — so a spreadsheet already using
   * the graphic's field titles works with no mapping step, and one that is not says so.
   *
   * The result is ordinary editable rows with NO link back to the file: re-importing is a
   * deliberate act, and a live file dependency would leave the production's data somewhere the
   * production does not travel.
   */
  const importFile = async (file: File) => {
    setImportNote(null);
    const text = await file.text();
    const parsed = parseTableFile(file.name, text);
    if (parsed.error) {
      setImportNote(parsed.error);
      return;
    }
    const name = file.name.replace(/\.[^.]+$/, '');
    const { shows, datasetId, error } = importShowDataset(show.id, parsed, { name });
    // The durable store answers a refusal after the call returns (model/durableStore.ts), so
    // this waits for it before claiming the table is in. There is deliberately no link back to
    // the file, so an import that quietly did not persist would have to be done again from
    // scratch - and the operator would only find out at the moment they needed the rows.
    const failure = error ?? (await commitDurableWrites());
    if (failure || !datasetId) {
      setImportNote(failure ?? 'The table could not be imported.');
      return;
    }
    setShows(shows);
    // Say what BOUND, not just what arrived. A table whose columns match no field on any of
    // this production's graphics imports perfectly and does nothing, and an import that only
    // reported "42 rows" would look like a success right up to the moment it was needed.
    const bound = boundColumns(show, parsed.header);
    setImportNote(
      bound.length > 0
        ? `✓ Imported ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}. These columns match a field on this production's graphics: ${bound.join(', ')}.`
        : `✓ Imported ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} — but NO column matches a field title on this production's graphics, so no cue can load a row yet. Rename a column to match a field, or add the graphic that uses them.`,
    );
  };

  /**
   * The other half of import: a file to FILL IN. Picking a table type and downloading gives a
   * spreadsheet with the right header row, so the round trip needs no guessing at what a column
   * has to be called for a cue to load it.
   *
   * The header comes from `datasetPreset` — the same table `＋ New table` builds its columns
   * from — so a downloaded template can never describe a shape the importer would refuse or the
   * binding would ignore. CSV, not JSON: this file exists to be opened in a spreadsheet and
   * typed into, which is what a header row is for; the JSON reader stays for exports out of
   * other systems, and those are not files anyone fills in by hand.
   */
  const downloadTemplate = () => {
    const preset = datasetPreset(newKind);
    const blob = new Blob([serializeCsv(preset.labels)], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, templateFileName(preset.name));
    setImportNote(
      `✓ Downloaded ${templateFileName(preset.name)} — fill in a row per entry under those column names, then import it back.`,
    );
  };

  /**
   * The three doors — pick a shape and make one, bring a file in, take the shape out — as ONE
   * cluster rendered in ONE place at a time: in the header once tables exist, and inside the
   * empty state before that. The actions are the whole answer to an empty workspace, so putting
   * a second copy of them in a corner while the middle of the screen stays blank would be the
   * defect this fixes, and keeping two live copies would be two things to hold in step.
   */
  const actions = (
    <div className="pd-data-actions">
      <select value={newKind} onChange={(e) => setNewKind(e.target.value as ShowDataset['kind'])} data-testid="new-dataset-kind">
        <option value="quiz">Quiz questions</option>
        <option value="teams">Teams</option>
        <option value="roster">Line-up / roster</option>
        <option value="generic">Blank table</option>
      </select>
      <button
        className="primary"
        onClick={() => setShows(addShowDataset(show.id, newKind).shows)}
        data-testid="add-dataset"
      >
        ＋ New table
      </button>
      {/* IMPORT (Phase 7). A label wrapping a hidden input, so the control is a real file
          picker with no click-through indirection and no second button to keep in step. */}
      <label className="pd-data-import">
        <input
          type="file"
          accept=".csv,.tsv,.txt,.json,text/csv,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clear the input so picking the SAME file twice fires again — re-importing after
            // fixing a column name in the spreadsheet is the normal second act.
            e.target.value = '';
            if (file) void importFile(file);
          }}
          data-testid="import-dataset"
        />
        ⬆ Import CSV / JSON
      </label>
      {/* Beside Import because they are one workflow read in either direction: take the shape
          out, fill it in, bring it back. */}
      <button onClick={downloadTemplate} data-testid="download-dataset-template">
        ⬇ Blank CSV
      </button>
    </div>
  );

  return (
    <section className="pd-data" data-testid="production-data">
      {/* THE LIVE TREE first, then the tables. Two different questions, deliberately not merged
          (docs/PRODUCTION_DATA_PLAN.md §2.8): production data is the ONE thing that is true
          right now and it wires itself into graphics; a table is a BANK of candidate rows an
          operator picks from. The tables section is named for what it holds, because the live
          panel above it is what "production data" now means. */}
      <ProductionDataPanel
        show={show}
        setShows={setShows}
        liveData={liveData}
        setLiveData={setLiveData}
        resolved={resolved}
        dataKey={dataKey}
        sourceStatus={sourceStatus}
      />
      <div className="pd-data-head">
        <h2>Tables</h2>
        <p className="hint">
          Tables this production owns — a question bank, a line-up, a roster. On the Playout tab,
          a cue whose field titles match a table's column names can load any row — into PREVIEW,
          never straight to air.
        </p>
        {datasets.length > 0 && actions}
      </div>

      {importNote && (
        <p
          className={importNote.startsWith('✓') ? 'status-ok pd-data-note' : 'status-bad pd-data-note'}
          data-testid="import-note"
        >
          {importNote}
        </p>
      )}

      {datasets.length === 0 && <EmptyState show={show} actions={actions} />}

      {datasets.map((ds) => (
        <DatasetCard key={ds.id} show={show} dataset={ds} setShows={setShows} />
      ))}
    </section>
  );
}

/**
 * The empty workspace. It used to be one grey sentence over most of a screen — measured at
 * 946px of nothing below it on a 1080p display — which says what the surface is called and
 * nothing about how to start.
 *
 * It now answers the surface's one hard question in the place the operator is already looking:
 * WHAT DO I CALL MY COLUMNS? The binding is the words (a column named like a field's title
 * loads into that field), so the names that would bind are a fact about this production's own
 * graphics — and a production with no graphics yet gets told that instead, because a column
 * name list would be empty for a reason that has nothing to do with the table.
 */
function EmptyState({ show, actions }: { show: Show; actions: ReactNode }) {
  // The field TITLES of every graphic in the pool — the same words `boundColumns` matches an
  // imported header against, deduplicated and in pool order so the list reads like the rundown.
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const g of show.graphics) {
    for (const f of g.template.fields ?? []) {
      const title = f.title?.trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      titles.push(title);
    }
  }
  const shown = titles.slice(0, 12);

  return (
    <div className="pd-data-empty" data-testid="data-empty">
      <h3>No tables yet</h3>
      <p className="hint">
        A table is one row per entry — a question, a team, a name. Pick a shape below, or bring a
        spreadsheet in. On the Playout tab a cue then loads any row into PREVIEW, never straight
        to air.
      </p>
      {actions}
      <div className="pd-data-bind">
        {titles.length > 0 ? (
          <>
            <p className="hint">
              Name a column after one of these and a cue on this production can load it:
            </p>
            <p className="pd-bind-chips" data-testid="bindable-columns">
              {shown.map((t) => (
                <span key={t} className="pd-bind-chip">
                  {t}
                </span>
              ))}
              {titles.length > shown.length && (
                <span className="muted">+{titles.length - shown.length} more</span>
              )}
            </p>
          </>
        ) : (
          <p className="hint" data-testid="bindable-columns-none">
            This production has no graphics yet, so no column name matches a field. Add one on
            the Playout tab and its field names appear here.
          </p>
        )}
      </div>
    </div>
  );
}

function DatasetCard({
  show,
  dataset: ds,
  setShows,
}: {
  show: Show;
  dataset: ShowDataset;
  setShows: (shows: Show[]) => void;
}) {
  /** Which destructive button is armed: 'table', `col:<key>` or `row:<id>` — ONE state, so arming
   *  any of them disarms the rest and the card can never show two pending confirms at once. */
  const [armed, setArmed] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState('');
  // The cue's own test (control/cueData.ts), so the card and the cue's loader never disagree.
  const users = show.graphics.filter((g) => datasetMatches(fieldDescriptors(g.template.fields ?? []), ds)).map((g) => g.name);

  return (
    <div className="pd-dataset" data-testid={`dataset-${ds.id}`}>
      <div className="pd-dataset-head">
        <input
          className="pd-dataset-name"
          value={ds.name}
          onChange={(e) => setShows(renameShowDataset(show.id, ds.id, e.target.value))}
          aria-label="Table name"
          data-testid="dataset-name"
        />
        <span className="muted">{ds.rows.length} row{ds.rows.length === 1 ? '' : 's'}</span>
        {/* The graphics using it (data-sources AC-9): the ones a cue of which can load its rows. */}
        <span className="muted" data-testid="dataset-users">
          {users.length > 0 ? `Loads into ${users.join(', ')}` : 'No graphic loads it yet'}
        </span>
        <div className="spacer" />
        {/* Two-step delete: a table of typed-in questions has no undo behind it. */}
        <button
          className={armed === 'table' ? 'pd-dataset-delete armed' : 'pd-dataset-delete'}
          onClick={() => {
            if (armed !== 'table') setArmed('table');
            else setShows(removeShowDataset(show.id, ds.id));
          }}
          onBlur={() => setArmed((a) => (a === 'table' ? null : a))}
          data-testid="dataset-delete"
        >
          {armed === 'table' ? 'Delete table?' : '✕'}
        </button>
      </div>

      <div className="pd-dataset-scroll">
        <table className="pd-table">
          <thead>
            <tr>
              {ds.columns.map((c) => (
                <th key={c.key}>
                  <span className="pd-th">
                    <input
                      value={c.label}
                      onChange={(e) => setShows(renameDatasetColumn(show.id, ds.id, c.key, e.target.value))}
                      aria-label="Column name"
                      data-testid={`col-${c.key}`}
                    />
                    {ds.columns.length > 1 && (
                      /* ARMED, like the table delete above it and the Data panel's value ✕: a
                         column takes every value under it, with no undo, off a table someone may
                         be reading rows from live. A GLYPH rather than the table button's word -
                         this sits inside the header's flex line beside the name input, so
                         "Delete column?" would push the column wider than its own content. */
                      <button
                        className={`pd-col-delete${armed === `col:${c.key}` ? ' reset-armed' : ''}`}
                        title={
                          armed === `col:${c.key}`
                            ? `Click again to remove ${c.label} and every value in it`
                            : 'Remove this column (its values go with it)'
                        }
                        onClick={() => {
                          if (armed === `col:${c.key}`) {
                            setArmed(null);
                            setShows(removeDatasetColumn(show.id, ds.id, c.key));
                          } else setArmed(`col:${c.key}`);
                        }}
                        onBlur={() => setArmed((a) => (a === `col:${c.key}` ? null : a))}
                        aria-label={`Remove column ${c.label}`}
                        data-testid={`col-delete-${c.key}`}
                      >
                        {armed === `col:${c.key}` ? '✓' : '✕'}
                      </button>
                    )}
                  </span>
                </th>
              ))}
              <th className="pd-th-actions" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {ds.rows.map((row, i) => (
              <tr key={row.id} data-testid={`row-${row.id}`}>
                {ds.columns.map((c) => (
                  <td key={c.key}>
                    <input
                      value={row.values[c.key] ?? ''}
                      onChange={(e) => setShows(updateDatasetRow(show.id, ds.id, row.id, { [c.key]: e.target.value }))}
                      aria-label={`${c.label}, row ${i + 1}`}
                      data-testid={`cell-${row.id}-${c.key}`}
                    />
                  </td>
                ))}
                <td className="pd-td-actions">
                  {/* ARMED for the same reason as the column: the row's typed-in values go with
                      it and nothing brings them back. Glyph, not a word - the actions column is
                      sized by this button and a widening cell would shove the table sideways. */}
                  <button
                    className={armed === `row:${row.id}` ? 'reset-armed' : undefined}
                    title={
                      armed === `row:${row.id}` ? 'Click again to remove this row' : 'Remove this row'
                    }
                    onClick={() => {
                      if (armed === `row:${row.id}`) {
                        setArmed(null);
                        setShows(removeDatasetRow(show.id, ds.id, row.id));
                      } else setArmed(`row:${row.id}`);
                    }}
                    onBlur={() => setArmed((a) => (a === `row:${row.id}` ? null : a))}
                    aria-label={`Remove row ${i + 1}`}
                    data-testid={`row-delete-${row.id}`}
                  >
                    {armed === `row:${row.id}` ? '✓' : '✕'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pd-dataset-foot">
        <button onClick={() => setShows(addDatasetRow(show.id, ds.id).shows)} data-testid="add-row">
          ＋ Row
        </button>
        <input
          placeholder="New column name…"
          value={newColumn}
          onChange={(e) => setNewColumn(e.target.value)}
          data-testid="new-column-name"
        />
        <button
          disabled={!newColumn.trim()}
          onClick={() => {
            setShows(addDatasetColumn(show.id, ds.id, newColumn));
            setNewColumn('');
          }}
          data-testid="add-column"
        >
          ＋ Column
        </button>
      </div>
    </div>
  );
}
