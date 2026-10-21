// LOADING A DATA ROW INTO A CUE - the binding, written ONCE.
//
// A production dataset (the Data workspace) fills a cue's fields by matching column LABELS to
// field TITLES (model/shows.ts `datasetValuesForFields`). The matching around that call is not
// trivial - the A/B side gesture below - and it lived inline on the production page, which is
// why the hosted control page had no data loading at all: there was nothing to reuse without
// copying sixty lines of matching into a second surface, and a copied matcher is a matcher that
// drifts.
//
// So the rule and the rows live here. The in-app page runs it LIVE against the show's datasets;
// the hosted page renders rows this module produced AT PUBLISH TIME (control/hostedControl.ts
// `buildPanelSpec`), which is the same contract its cues and entries already have - what is
// published is what an operator can reach, and editing a dataset means republishing.

import { datasetValuesForFields, type ShowDataset } from '../model/shows';

/** A row an operator can load into the edited cue, with its values already resolved. */
export interface CueDataRow {
  /** Stable and unique across datasets AND sides - what a surface stores as "last loaded". */
  id: string;
  /** What the operator reads: the dataset name plus the row's first non-empty cell. */
  label: string;
  /** 'A' / 'B' on a two-sided board, null on every ordinary graphic. */
  side: string | null;
  /** fieldId -> value, for the matched columns only. */
  values: Record<string, string>;
}

/** The sides a two-sided board names in its field titles. */
const SIDES = ['A', 'B'] as const;

/** A field title with its side token removed - "Team A colour" -> "Team colour". */
function stripSide(label: string, side: string): string {
  return label.replace(new RegExp(`\\s+${side}\\b`), '').replace(/\s{2,}/g, ' ').trim();
}

/** True when this graphic titles its fields per side ("Team A", "Score B", …). */
export function hasSideFields(descriptors: { key: string; label: string }[]): boolean {
  return descriptors.some((d) => SIDES.some((s) => new RegExp(`\\b${s}\\b`).test(d.label)));
}

/**
 * THE SIDE GESTURE. A dataset row is ONE team, but a two-team board titles its fields "Team A" /
 * "Score A" / "Team B" / … - so a row can never match them directly and the whole teams preset
 * bound nothing. Dropping the standalone side token off the FIELD TITLE closes it:
 *
 *     Team A -> Team · Score A -> Score · Team A colour -> Team colour · Team A logo -> Team logo
 *     Period, Clock -> unchanged, no column, skipped as before
 *
 * The plain literal titles go in as well and win where they exist, so a column named exactly
 * "Team A" still binds literally. The other side's fields are removed entirely, so loading team
 * A can never overwrite team B.
 */
function sideDescriptors(descriptors: { key: string; label: string }[], side: string) {
  return descriptors
    .filter((d) => !SIDES.some((s) => s !== side && new RegExp(`\\b${s}\\b`).test(d.label)))
    .map((d) => ({ key: d.key, label: stripSide(d.label, side) }));
}

/** The descriptors a row is matched against for one load. */
function matchDescriptors(descriptors: { key: string; label: string }[], side: string | null) {
  if (!side) return descriptors;
  return [...sideDescriptors(descriptors, side), ...descriptors];
}

/**
 * Every row this graphic can load, in dataset then row order.
 *
 * A dataset with no column matching any field title contributes nothing - offering its rows
 * would be offering a load that changes nothing. On a sided board each row appears once per
 * side, because which side it fills is the operator's choice, not the data's.
 */
/**
 * Whether a graphic can load this dataset's rows at all: some column is named like one of its
 * fields. On a sided board that includes both sideless forms, or a "Team"/"Score" table would be
 * judged against "Team A" and dropped.
 */
export function datasetMatches(descriptors: { key: string; label: string }[], ds: Pick<ShowDataset, 'columns'>): boolean {
  const gate = hasSideFields(descriptors)
    ? SIDES.flatMap((s) => sideDescriptors(descriptors, s)).concat(descriptors)
    : descriptors;
  const labels = new Set(ds.columns.map((c) => c.label.trim().toLowerCase()));
  return gate.some((d) => labels.has(d.label.trim().toLowerCase()));
}

export function cueDataRows(
  descriptors: { key: string; label: string }[],
  datasets: ShowDataset[],
): CueDataRow[] {
  const sides: (string | null)[] = hasSideFields(descriptors) ? [...SIDES] : [null];
  const out: CueDataRow[] = [];
  for (const ds of datasets) {
    if (!datasetMatches(descriptors, ds)) continue;
    ds.rows.forEach((row, i) => {
      const first = ds.columns.map((c) => row.values[c.key] ?? '').find((v) => v.trim() !== '');
      const label = `${ds.name}: ${(first ?? `row ${i + 1}`).slice(0, 60)}`;
      for (const side of sides) {
        out.push({
          id: `${ds.id}:${row.id}${side ? `:${side}` : ''}`,
          label,
          side,
          values: datasetValuesForFields(ds, row, matchDescriptors(descriptors, side)),
        });
      }
    });
  }
  return out;
}

/** The rows offered for one side - the whole list on a graphic that has no sides. */
export function rowsForSide(rows: CueDataRow[], side: string): CueDataRow[] {
  return rows.some((r) => r.side !== null) ? rows.filter((r) => r.side === side) : rows;
}

/** The row after `lastId` within the same side, so ↷ Next walks a question bank in order. */
export function nextRow(rows: CueDataRow[], side: string, lastId: string | null): CueDataRow | null {
  const list = rowsForSide(rows, side);
  const at = list.findIndex((r) => r.id === lastId);
  return list[at + 1] ?? null;
}
