import { useState } from 'react';
import MiniPreview from '../MiniPreview';
import type { SpxTemplate } from '../../../model/types';
import type { Show } from '../../../model/shows';
import type { ProductionDest } from './FinishStep';

interface Props {
  /** The NEW production's name; empty falls back to `namePlaceholder` (the kit's own name). */
  name: string;
  namePlaceholder: string;
  onName: (name: string) => void;
  /** Every graphic that was built, in kit order. */
  built: SpxTemplate[];
  /**
   * THE HUB. Given, the step is the kit's home as well as its ending: every graphic is a card
   * that opens it for editing, in any order, and the set's contents can be changed. Absent (a
   * NoaCG Pro package, whose graphics are the generation's answer), the grid only shows.
   */
  onOpen?: (index: number) => void;
  /** Back to the kit contents picker, to add or remove graphics. Offered with `onOpen`. */
  onEditContents?: () => void;
  /** The saved productions on offer (live list, loaded by the wizard when Finish shows). */
  productions: Show[];
  /** Preselect: the production the wizard was opened FOR, else null — a kit then defaults to
   *  a NEW one, because a kit usually IS a show. */
  defaultProductionId: string | null;
  /** Save the whole set into the chosen production and land on its page. */
  onOpenProduction: (dest: ProductionDest) => void;
  /** Save the whole set, then export that production as one package. */
  onExport: (dest: ProductionDest) => void;
  /** True while the set is being written — both doors save, so both must say so. */
  busy: boolean;
  /** A save that did not land, reported here rather than swallowed. */
  error: string | null;
  /**
   * What this SET is called, in the user's own words - 'kit' for the catalog path, 'package'
   * for a NoaCG Pro generation (docs/NOACG_PRO_PLAN.md §15.9).
   *
   * The step is shared because the ending is genuinely the same one - N graphics that belong
   * together, saved into a production, the editor never involved - but a Pro user never chose
   * a kit and would be reading about something they have no word for. The TEST IDS stay
   * `kit-*` whatever the noun: an id names the surface, never the copy.
   */
  noun?: string;
}

/**
 * THE KIT'S FINISH — name the production, see everything that was built, choose a door.
 *
 * BOTH DOORS SAVE FIRST, and the save is not optional (the Finish step's doctrine, applied to
 * N graphics instead of one): a kit that was configured, exported and then dropped would cost
 * every choice in the walk to reproduce, times the size of the set. Export does not require
 * opening the editor — the editor is never involved in a kit at all.
 *
 * The thumbnail grid is the point of the step. A kit's promise is that the set reads as one
 * package, and a list of names cannot show whether it does; these are the real graphics, built,
 * settled and rendered side by side, which is the only place that promise can actually be
 * checked before anything is saved.
 */
export default function KitFinishStep({
  name,
  namePlaceholder,
  onName,
  built,
  onOpen,
  onEditContents,
  productions,
  defaultProductionId,
  onOpenProduction,
  onExport,
  busy,
  error,
  noun = 'kit',
}: Props) {
  // A kit usually IS a show, so a NEW production is the default - unlike the single-graphic
  // Finish, which defaults to the most recent one. The exception is the wizard opened FOR a
  // production, where building a second one beside it is not what was asked for.
  const [dest, setDest] = useState<string>(() =>
    defaultProductionId && productions.some((p) => p.id === defaultProductionId)
      ? defaultProductionId
      : 'new',
  );
  const resolvedDest = (): ProductionDest =>
    dest === 'new'
      ? { kind: 'new', name: name.trim() || namePlaceholder }
      : { kind: 'existing', id: dest };
  const target = productions.find((p) => p.id === dest);

  // THE SET, side by side. On the hub every card opens its graphic; on a package it only shows.
  const graphics = (
    <div className="panel-section">
      <h3>
        {onOpen ? `Your ${namePlaceholder} ${noun}` : 'What you built'}
        <span className="dlg-caption">
          {built.length} graphic{built.length === 1 ? '' : 's'}
          {/* A Pro package is composed from ONE design language, so "one look" is its claim. */}
          {onOpen ? '' : ', one look'}
        </span>
      </h3>
      {onOpen && (
        <p className="hint wz-kit-hub-lede">
          Click any graphic to edit it, in any order. Every graphic keeps its own changes.
        </p>
      )}
      <ul className="wz-kit-built" data-testid="kit-built">
        {built.map((template, i) => (
          <li key={`${template.name}-${i}`} className="wz-kit-built-cell">
            {onOpen ? (
              <button
                className="wz-kit-open"
                onClick={() => onOpen(i)}
                data-kit-open={i}
                title={`Edit ${template.name}`}
              >
                <span className="wz-kit-thumb">
                  <MiniPreview template={template} lazy />
                </span>
                <span className="wz-kit-built-name">{template.name}</span>
                <span className="wz-kit-open-cue" aria-hidden="true">Edit</span>
              </button>
            ) : (
              <>
                <MiniPreview template={template} lazy />
                <span className="wz-kit-built-name">{template.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {onEditContents && (
        <button className="wz-rail-change" onClick={onEditContents} data-testid="kit-edit-contents">
          ＋ Add or remove graphics
        </button>
      )}
    </div>
  );

  // "Saves all 2" is the shape of a sentence nobody wrote on purpose.
  const allOfThem = built.length === 2 ? 'both' : `all ${built.length}`;
  return (
    <div className="wz-finish wz-kit-finish" data-testid="kit-finish">
      {/* THE HUB (a catalog kit) leads with the set, because the set is what the user edits
          here and finishing is the last thing they do. A Pro package leads with where it goes,
          as it always has: its graphics are the answer, not a starting point. */}
      {onOpen && graphics}
      <div className="panel-section">
        <h3>Where this {noun} goes</h3>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="grow"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            data-testid="kit-finish-production"
            aria-label="Which production this kit joins"
          >
            <option value="new">＋ New production…</option>
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.graphics.length} graphic{p.graphics.length === 1 ? '' : 's'})
              </option>
            ))}
          </select>
          {dest === 'new' && (
            <input
              className="grow"
              value={name}
              placeholder={namePlaceholder}
              onChange={(e) => onName(e.target.value)}
              data-testid="kit-finish-name"
              aria-label="Production name"
            />
          )}
        </div>
        <p className="hint">
          A production is what airs: its graphics, the cue rundown, the output URL, and the
          control page.
        </p>
      </div>

      {!onOpen && graphics}
      {error && <p className="status-bad" data-testid="kit-finish-error">{error}</p>}

      <div className="wz-finish-doors">
        <button
          className="wz-entry-card wz-entry-card--primary"
          onClick={() => onOpenProduction(resolvedDest())}
          disabled={busy}
          data-testid="kit-finish-production-go"
        >
          <span className="wz-entry-head">
            <span className="wz-entry-icon">▶</span>
            <strong>{target ? `Add to ${target.name}` : 'Open the production'}</strong>
          </span>
          <span className="hint">
            Saves {allOfThem}, pools them with their cues ready, and opens the cockpit.
          </span>
        </button>
        <button
          className="wz-entry-card"
          onClick={() => onExport(resolvedDest())}
          disabled={busy}
          data-testid="kit-finish-export"
        >
          {/* THE DOOR NAMES WHAT COMES OUT OF IT. The package is the PRODUCTION's - the whole
              pool, each graphic on its own playout layer - which is the useful artifact and
              also the only coherent one: once a kit is pooled into a production there is no
              "just the kit" left to package. So a kit joining a production that already had
              graphics says so, and says how many, instead of promising a package of the kit
              and handing over somebody else's graphics as well. */}
          <span className="wz-entry-head">
            <span className="wz-entry-icon">⬇</span>
            <strong>{target ? `Export ${target.name} (.zip)` : `Export the ${noun} (.zip)`}</strong>
          </span>
          <span className="hint">
            {target
              ? `One package with all ${target.graphics.length + built.length} graphics in that production, the kit and what was already there, each on its own playout layer.`
              : 'One package with every graphic on its own playout layer.'}{' '}
            Saved first, so nothing is lost.
          </span>
        </button>
      </div>
    </div>
  );
}
