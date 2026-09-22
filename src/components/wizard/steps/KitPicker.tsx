import { useMemo } from 'react';
import { PACKS, resolvePack, type TemplatePack } from '../../../templates/packs';
import { kitChoices, kitSize, type KitChoice } from '../../../templates/kit';
import type { StyleTag } from '../../../model/fonts';
import MiniPreview from '../MiniPreview';

/** Every style family in the catalog. Local to this surface: fonts.ts exports the TYPE, not
 *  the value list. Which of these a given kit can actually be built in is computed per pack -
 *  see `familiesFor`. */
const FAMILIES: StyleTag[] = ['noacg', 'minimal', 'editorial', 'sport', 'glass', 'cinematic', 'sticker', 'showtime', 'arcade'];

/**
 * The looks a kit can genuinely be built in, by asking `resolvePack` rather than trusting a
 * declaration. The (type x family) matrix is NOT full in practice: measured 2026-07-29, no
 * pack resolves in all six families and `editorial`/`cinematic` resolve for none, because a
 * pack's types only ship designs in some families. Offering a look that throws on Create
 * would be offering a guaranteed failure, so the picker shows what works and nothing else.
 */
export function familiesFor(pack: TemplatePack): StyleTag[] {
  return FAMILIES.filter((family) => {
    try {
      resolvePack({ ...pack, family });
      return true;
    } catch {
      return false;
    }
  });
}

/** The pack a kit picker starts on, and the look it starts in. */
export function defaultFamilyFor(pack: TemplatePack, wanted: StyleTag | null): StyleTag | null {
  const available = familiesFor(pack);
  if (wanted && available.includes(wanted)) return wanted;
  if (available.includes(pack.family)) return pack.family;
  return available[0] ?? null;
}

/** Every graphic of a pack, ticked - what "start from a genre preset" means. */
export function defaultSelectionFor(pack: TemplatePack, family: StyleTag): string[] {
  return kitChoices(pack, family).filter((c) => c.inPack).map((c) => c.key);
}

/**
 * WHAT THE BROWSE STEP'S SEARCH BOX MEANS ON THIS SIDE OF THE SWITCH: a plain normalized
 * substring over the words a person would actually type, not the taxonomy engine.
 * `templates/search.ts` ranks DESIGNS over facets, semantics and programme formats, and none
 * of that is the question here — "which show am I running" and "does this kit have a ticker"
 * are answered by names. Splitting on `-` is what lets a typed "map round" find the
 * `map-round` type.
 */
function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase().replace(/-/g, ' ');
  return q.split(/\s+/).every((word) => hay.includes(word.replace(/-/g, ' ')));
}

/** The graphic TYPE's id as a phrase — "match-board" reads as "Match board". The id is the
 *  only description of a row that is not the design's own name, and a kebab id in a picker is
 *  a leak of the registry's spelling. An `extras` row has no type and says nothing. */
function typeLabel(typeId: string | null): string | null {
  if (!typeId) return null;
  const words = typeId.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * ONE GRAPHIC OF A KIT, as a card you can LOOK at.
 *
 * It was a checkbox and a name, and the owner's verdict on that was "buying a pig in a bag":
 * "Volt Scorebug", "Slab Bug", "Pager" and "Doors Open" are 33 rows that tell a student
 * nothing about what they are agreeing to build. The card system already renders every one of
 * these designs on the Browse grid, so showing them here is a reuse rather than a new surface —
 * MiniPreview settles the real template at its own field defaults and mounts its iframe only
 * when the card scrolls into view, which is what keeps a 33-graphic kit from being 33 live
 * timelines on arrival.
 *
 * The whole card is the toggle. The preview is `pointer-events: none` in CSS for that reason:
 * an iframe swallows the click that would otherwise reach the label around it, so a student
 * clicking the picture of the graphic they want would have got nothing.
 */
function KitRow({ choice, ticked, onToggle }: { choice: KitChoice; ticked: boolean; onToggle: () => void }) {
  const kind = typeLabel(choice.typeId);
  return (
    <li>
      <label className={`wz-kit-item${ticked ? ' is-on' : ''}`}>
        <span className="wz-kit-thumb">
          <MiniPreview variant={choice.variant} />
        </span>
        <span className="wz-kit-item-head">
          <input
            type="checkbox"
            checked={ticked}
            onChange={onToggle}
            data-kit-item={choice.key}
          />
          <span className="wz-kit-item-name">{choice.variant.name}</span>
        </span>
        {kind && <span className="wz-kit-item-kind hint">{kind}</span>}
      </label>
    </li>
  );
}

interface Props {
  /** The chosen genre preset, or null while the user is still picking one. */
  pack: TemplatePack | null;
  family: StyleTag | null;
  /** The ticked contents, by `KitChoice.key`. */
  selected: string[];
  onPack: (pack: TemplatePack) => void;
  onFamily: (family: StyleTag) => void;
  onSelected: (keys: string[]) => void;
  /** The Browse step's search box, shared with the one-graphic side. */
  query: string;
  onClearQuery: () => void;
}

/**
 * THE KIT CONTENTS PICKER — the second half of the Browse step once its mode switch says "a
 * whole kit" (docs/PACK_TAXONOMY.md, and the reversal of TEMPLATE_TAXONOMY_PROPOSAL.md §18's
 * separate-entry-card decision recorded there).
 *
 * Two moves, in this order because the second is an edit of the first: pick the GENRE PRESET
 * (the pack — "which show am I running?"), then EDIT THE SET with checkboxes. Everything on
 * offer resolves in the chosen look, asked through `resolvePack` (src/templates/kit.ts
 * `kitChoices`) — a row that would throw on Create is never drawn.
 *
 * THE COUNT ON SCREEN IS THE COUNT THAT GETS BUILT. `kitSize` counts the pack (types AND
 * extras) and is only ever shown on an unpicked card; from the moment a pack is chosen the
 * number comes from the SELECTION, because the whole point of the picker is that the user can
 * move it in either direction.
 */
export default function KitPicker({
  pack,
  family,
  selected,
  onPack,
  onFamily,
  onSelected,
  query,
  onClearQuery,
}: Props) {
  const available = useMemo(() => (pack ? familiesFor(pack) : []), [pack]);
  /** What this pack can contain in this look. Resolution can throw on a config error (an
   *  unfilled matrix cell) - that is a build-time bug, not a user error, so it degrades to an
   *  empty offer rather than taking the step down. */
  const choices = useMemo(() => {
    if (!pack || !family) return [];
    try {
      return kitChoices(pack, family);
    } catch {
      return [];
    }
  }, [pack, family]);

  const ticked = new Set(selected);
  const toggle = (key: string) =>
    onSelected(ticked.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  // A show matches on its NAME, on what it is for, and on the reference formats it serves -
  // which is what makes "wedding" find Church & Ceremony and "auction" find Shopping.
  const shows = PACKS.filter((p) => matches(query, p.name, p.description, p.formats.join(' ')));
  // A row matches on the design's name AND on its graphic TYPE, because those are two
  // different words for the same thing and a person types either: the ticker type's minimal
  // design is called "Wire Rotator", so searching "ticker" has to find it.
  const visible = choices.filter((c) => matches(query, c.variant.name, c.typeId));
  const inPack = visible.filter((c) => c.inPack);
  const extra = visible.filter((c) => !c.inPack);
  // THE COUNT IS THE WHOLE SELECTION, never the visible rows. Filtering hides rows; it does
  // not untick them, and a number that fell while the user typed would read as the kit
  // shrinking under them.
  const chosenCount = choices.filter((c) => ticked.has(c.key)).length;
  // Only rows that are IN the kit can be reassured about. The add-more rows are an offer, not
  // a promise, so counting them here produced "72 more graphics are hidden - they stay in the
  // kit" over a kit of 32, which is two wrong facts in one sentence.
  const hidden = choices.filter((c) => c.inPack).length - inPack.length;

  return (
    <div className="wz-kit" data-testid="kit-picker">
      <p className="wz-kit-lede">
        A kit is a whole set of graphics for one kind of show, made together in one look and
        landing in one production. Start from the show you are running, then add or drop
        anything you like.
      </p>

      {shows.length === 0 && (
        <div className="wz-browse-empty" data-testid="kit-no-shows">
          <p className="hint">No show matches “{query.trim()}”.</p>
          <button className="wz-filter" onClick={onClearQuery}>✕ Clear the search</button>
        </div>
      )}

      <div className="wz-kit-grid" role="list">
        {shows.map((p) => {
          const active = p.id === pack?.id;
          return (
            <button
              key={p.id}
              role="listitem"
              className={`wz-kit-card${active ? ' is-active' : ''}`}
              onClick={() => onPack(p)}
              data-kit={p.id}
              aria-pressed={active}
            >
              <strong>{p.name}</strong>
              <span className="hint">{p.description}</span>
              <span className="wz-kit-count mono">{kitSize(p)} graphics</span>
            </button>
          );
        })}
      </div>

      {pack && family && (
        <div className="wz-kit-detail" data-testid="kit-detail">
          <div className="wz-kit-detail-head">
            <h3>{pack.name}</h3>
            <label className="wz-kit-family">
              <span>Look</span>
              <select
                value={family}
                onChange={(event) => onFamily(event.target.value as StyleTag)}
                data-testid="kit-family"
              >
                {available.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            {/* The promise, live: this is the number of graphics the wizard will build. */}
            <span className="wz-kit-total mono" data-testid="kit-total">
              {chosenCount} graphic{chosenCount === 1 ? '' : 's'}
            </span>
          </div>

          {/* A search narrows what is SHOWN, never what is chosen - so say so, or a kit that
              still counts twelve while listing three looks like a bug in the count. */}
          {hidden > 0 && (
            <p className="wz-kit-filtered hint" data-testid="kit-filtered">
              {hidden} more in this kit {hidden === 1 ? 'is' : 'are'} hidden by the search. They are still
              in it, just not listed.{' '}
              <button className="wz-rail-change" onClick={onClearQuery}>Show all</button>
            </p>
          )}

          {inPack.length > 0 && <p className="wz-kit-contents-label mono">In this kit</p>}
          <ul className="wz-kit-contents" data-testid="kit-contents">
            {inPack.map((choice) => (
              <KitRow
                key={choice.key}
                choice={choice}
                ticked={ticked.has(choice.key)}
                onToggle={() => toggle(choice.key)}
              />
            ))}
          </ul>

          {extra.length > 0 && (
            <>
              <p className="wz-kit-contents-label mono">
                Add more: everything else this look can build
              </p>
              <ul className="wz-kit-contents wz-kit-contents--extra" data-testid="kit-extras">
                {extra.map((choice) => (
                  <KitRow
                    key={choice.key}
                    choice={choice}
                    ticked={ticked.has(choice.key)}
                    onToggle={() => toggle(choice.key)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
