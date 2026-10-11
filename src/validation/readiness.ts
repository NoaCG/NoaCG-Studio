// The on-air readiness report: what was ALREADY measured, grouped into things an operator
// cares about.
//
// The runtime bench exercises a generated graphic hard — field binding, the entrance, every
// branch state, the exit, a replay, and a doubled-text stress lap — and validateTemplate
// checks the export contract on top. All of it reached the user as one line: "✓ Passes SPX
// validation and the live playout test", or a list of raw rule messages when it did not.
// That undersells the strongest thing the platform does and gives a failing result no shape.
//
// This adds NO checks. It is a pure reading of findings that already exist, which is what
// keeps it honest: a row can only report what was actually run.

import type { ValidationIssue, ValidationResult } from './validateTemplate';

export type ReadinessState = 'pass' | 'warn' | 'fail' | 'untested';

export interface ReadinessRow {
  id: string;
  /** What this proves, in the operator's terms — never a rule id. */
  label: string;
  state: ReadinessState;
  /** The findings behind a warn/fail, verbatim. Empty when it passed. */
  messages: string[];
}

/**
 * Each row owns its rules. `live` rows only mean something when the runtime bench actually
 * ran — a statically-validated result has NOT been played, and saying "plays and replays
 * cleanly" about a graphic nobody played would be a lie the UI told on the platform's behalf.
 */
const ROWS: { id: string; label: string; rules: string[]; live: boolean }[] = [
  {
    id: 'fields',
    label: 'Operator fields reach the graphic',
    rules: ['bench-binding', 'field-mapping', 'fields', 'definition'],
    live: false,
  },
  {
    id: 'lifecycle',
    label: 'Plays, comes off air, and replays cleanly',
    rules: ['bench-entrance', 'bench-hidden', 'bench-replay', 'bench-runtime', 'bench-timeout', 'runtime'],
    live: true,
  },
  {
    id: 'layout',
    label: 'Nothing collides or escapes the frame',
    rules: ['bench-overlap', 'bench-overflow', 'bench-occluded'],
    live: true,
  },
  {
    // The design rules as an operator-facing verdict (docs/DESIGN_RULES_PLAN.md §5 R4). The
    // measurement is the same one every product surface runs — designRulesWarnings composed
    // into the bench — so this row can only ever agree with the export panel. `live` because
    // it needs the settled render: an unplayed graphic has no computed sizes to measure.
    id: 'legibility',
    label: 'Reads where it will be watched',
    rules: [
      'legibility-size',
      // Supporting text and fine print have their own rule id (designRulesWarnings sizeRuleFor)
      // because the three legibility choices move THOSE floors and barely touch the primary
      // one. It is claimed HERE rather than given a row of its own: it is the same question -
      // does this read where it will be watched - and an eighth row would split one verdict in
      // two. Reporting only; nothing on this row has ever gated anything.
      'legibility-secondary-size',
      'legibility-contrast',
      'legibility-protection',
      'legibility-safe-area',
      'legibility-ticker-margins',
      // The measurement could not read the frame, or read none of its text (designRulesWarnings
      // LEGIBILITY_UNMEASURED). It warns rather than passing: a zero nobody measured is not a pass.
      'legibility-unmeasured',
    ],
    live: true,
  },
  {
    id: 'stress',
    label: 'Survives text twice as long',
    rules: ['bench-stress'],
    live: true,
  },
  {
    id: 'editable',
    label: 'Motion is editable on the timeline',
    rules: ['bench-editability', 'anim-data', 'anim-data-call', 'anim-data-target', 'anim-data-dynamic'],
    live: false,
  },
  {
    id: 'export',
    label: 'Exports plug-and-play',
    rules: ['files', 'missing-asset', 'absolute-path', 'external-dependency', 'syntax'],
    live: false,
  },
];

const matching = (issues: ValidationIssue[], rules: string[]): string[] =>
  issues.filter((i) => rules.includes(i.rule)).map((i) => i.message);

/**
 * Read a validation result as readiness rows.
 *
 * `benchRan` must be false whenever the live bench was not part of this result (the raw
 * one-shot path, or a bench that skipped itself) — its rows then report `untested` instead
 * of claiming a pass nobody earned.
 */
export function readinessRows(validation: ValidationResult, benchRan: boolean): ReadinessRow[] {
  // The bench announces its own no-show; trust that over the caller's optimism.
  const skipped = validation.warnings.some((w) => w.rule === 'bench-skipped') ||
    validation.errors.some((e) => e.rule === 'bench-skipped');
  const live = benchRan && !skipped;
  return ROWS.map((row) => {
    if (row.live && !live) return { id: row.id, label: row.label, state: 'untested' as const, messages: [] };
    const errors = matching(validation.errors, row.rules);
    const warnings = matching(validation.warnings, row.rules);
    const state: ReadinessState = errors.length ? 'fail' : warnings.length ? 'warn' : 'pass';
    return { id: row.id, label: row.label, state, messages: [...errors, ...warnings] };
  });
}

/**
 * Findings whose rule no row claims — surfaced verbatim rather than swallowed. A row set
 * that silently dropped a real error would be the worst version of this feature.
 */
export function unclaimedFindings(validation: ValidationResult): ValidationIssue[] {
  const claimed = new Set(ROWS.flatMap((r) => r.rules));
  return [...validation.errors, ...validation.warnings].filter(
    (i) => !claimed.has(i.rule) && i.rule !== 'bench-skipped',
  );
}
