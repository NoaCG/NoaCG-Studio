import { useMemo } from 'react';
import { PACKS, type TemplatePack } from '../../../templates/packs';
import { kitChoices, kitSize, type KitChoice } from '../../../templates/kit';
import { paletteById } from '../../../model/wizard';
import type { Palette } from '../../../model/templateVocabulary';
import { kitPaletteFor } from '../kitPlan';
import MiniPreview from '../MiniPreview';

/** The graphics ticked when a kit is picked: its starter, about ten. */
export function defaultSelectionFor(pack: TemplatePack): string[] {
  return [...pack.starter];
}

/** The palette a kit builds this design in (`kitPaletteFor`), as the value a preview takes. */
function kitPalette(pack: TemplatePack, choice: KitChoice): Palette | undefined {
  const id = kitPaletteFor(pack, choice.variant);
  return id ? paletteById(id) : undefined;
}

/**
 * The kit card's COVER: its signature graphic (the starter's first), in the kit's own Style.
 * The design is resolved through `kitChoices`, the same resolver the create path runs, so the
 * picture on the card is the graphic the kit really starts with.
 */
function coverOf(pack: TemplatePack): KitChoice | null {
  try {
    return kitChoices(pack).find((c) => c.key === pack.starter[0]) ?? null;
  } catch {
    return null;
  }
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
function KitRow({
  choice,
  palette,
  ticked,
  onToggle,
}: {
  choice: KitChoice;
  palette: Palette | undefined;
  ticked: boolean;
  onToggle: () => void;
}) {
  const kind = typeLabel(choice.typeId);
  return (
    <li>
      <label className={`wz-kit-item${ticked ? ' is-on' : ''}`}>
        <span className="wz-kit-thumb">
          <MiniPreview variant={choice.variant} palette={palette} />
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
  /** The chosen kit, or null while the user is still picking one. */
  pack: TemplatePack | null;
  /** The ticked contents, by `KitChoice.key`. */
  selected: string[];
  onPack: (pack: TemplatePack) => void;
  onSelected: (keys: string[]) => void;
  /** The Browse step's search box, shared with the one-graphic side. */
  query: string;
  onClearQuery: () => void;
}

/**
 * THE KIT PICKER - the second half of the Browse step once its mode switch says "a whole kit"
 * (docs/PACK_TAXONOMY.md).
 *
 * Two moves, in this order because the second is an edit of the first: pick the KIT (the kind
 * of production - "which show am I running?"), then edit the set with checkboxes. A kit has ONE
 * Style, so there is nothing else to choose here: its cover shows that Style, and the Style
 * steps change it later, per graphic or across the whole kit.
 *
 * About ten graphics arrive ticked (the kit's starter). The rest of the kit's own library sits
 * under them one tick away, and every other graphic type that resolves in the kit's Style sits
 * behind a closed disclosure below that, so a big library never buries the ten that matter.
 * Sections are fixed by MEMBERSHIP, never by the tick, so a card does not jump when it is ticked.
 *
 * THE COUNT ON SCREEN IS THE COUNT THAT GETS BUILT: from the moment a kit is chosen the number
 * comes from the SELECTION, because the whole point of the picker is that the user can move it
 * in either direction.
 */
export default function KitPicker({ pack, selected, onPack, onSelected, query, onClearQuery }: Props) {
  /** What this kit can contain. Resolution can throw on a config error (an unfilled matrix
   *  cell) - that is a build-time bug, not a user error, so it degrades to an empty offer
   *  rather than taking the step down. */
  const choices = useMemo(() => {
    if (!pack) return [];
    try {
      return kitChoices(pack);
    } catch {
      return [];
    }
  }, [pack]);
  // Resolved once: one cover per kit, each the kit's signature graphic.
  const covers = useMemo(() => new Map(PACKS.map((p) => [p.id, coverOf(p)])), []);

  const ticked = new Set(selected);
  const toggle = (key: string) =>
    onSelected(ticked.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  // A kit matches on its NAME, on what it is for, and on the reference formats it serves -
  // which is what makes "wedding" find Worship & Ceremony and "auction" find Creator Stream.
  const shows = PACKS.filter((p) => matches(query, p.name, p.description, p.formats.join(' ')));
  // A row matches on the design's name AND on its graphic TYPE, because those are two
  // different words for the same thing and a person types either: the ticker type's minimal
  // design is called "Wire Rotator", so searching "ticker" has to find it.
  const visible = choices.filter((c) => matches(query, c.variant.name, c.typeId));
  const starter = visible.filter((c) => c.inStarter);
  const library = visible.filter((c) => c.inPack && !c.inStarter);
  const others = visible.filter((c) => !c.inPack);
  // THE COUNT IS THE WHOLE SELECTION, never the visible rows. Filtering hides rows; it does
  // not untick them, and a number that fell while the user typed would read as the kit
  // shrinking under them.
  const chosen = choices.filter((c) => ticked.has(c.key));
  // Only TICKED rows can be reassured about: a search that hides some of them says so, because
  // a count of ten over three cards looks like a bug in the count.
  const hidden = chosen.length - visible.filter((c) => ticked.has(c.key)).length;
  // A ticked "any other graphic" keeps its section open, so the tick stays in sight.
  const othersOpen = others.some((c) => ticked.has(c.key)) || query.trim() !== '';

  const row = (choice: KitChoice) => (
    <KitRow
      key={choice.key}
      choice={choice}
      palette={pack ? kitPalette(pack, choice) : undefined}
      ticked={ticked.has(choice.key)}
      onToggle={() => toggle(choice.key)}
    />
  );

  return (
    <div className="wz-kit" data-testid="kit-picker">
      <p className="wz-kit-lede">
        A kit is a set of graphics for one kind of production, in one Style. Pick yours: about
        ten graphics come ticked, and you can add or drop any of them.
      </p>

      {shows.length === 0 && (
        <div className="wz-browse-empty" data-testid="kit-no-shows">
          <p className="hint">No kit matches “{query.trim()}”.</p>
          <button className="wz-filter" onClick={onClearQuery}>✕ Clear the search</button>
        </div>
      )}

      <div className="wz-kit-grid" role="list">
        {shows.map((p) => {
          const active = p.id === pack?.id;
          const cover = covers.get(p.id);
          const size = kitSize(p);
          return (
            <button
              key={p.id}
              role="listitem"
              className={`wz-kit-card${active ? ' is-active' : ''}`}
              onClick={() => onPack(p)}
              data-kit={p.id}
              aria-pressed={active}
            >
              <span className="wz-kit-thumb wz-kit-cover" data-testid="kit-cover">
                {cover && <MiniPreview variant={cover.variant} palette={kitPalette(p, cover)} />}
              </span>
              <span className="wz-kit-card-text">
                <strong>{p.name}</strong>
                <span className="hint">{p.description}</span>
                <span className="wz-kit-count mono">
                  {size.starter} graphics{size.more > 0 ? ` · ${size.more} more` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {pack && (
        <div className="wz-kit-detail" data-testid="kit-detail">
          <div className="wz-kit-detail-head">
            <h3>{pack.name}</h3>
            {/* The promise, live: this is the number of graphics the wizard will build. */}
            <span className="wz-kit-total mono" data-testid="kit-total">
              {chosen.length} graphic{chosen.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* A search narrows what is SHOWN, never what is chosen - so say so. */}
          {hidden > 0 && (
            <p className="wz-kit-filtered hint" data-testid="kit-filtered">
              {hidden} more in this kit {hidden === 1 ? 'is' : 'are'} hidden by the search. They are still
              in it, just not listed.{' '}
              <button className="wz-rail-change" onClick={onClearQuery}>Show all</button>
            </p>
          )}

          {starter.length > 0 && <p className="wz-kit-contents-label mono">In the kit</p>}
          <ul className="wz-kit-contents" data-testid="kit-contents">
            {starter.map(row)}
          </ul>

          {library.length > 0 && (
            <>
              <p className="wz-kit-contents-label mono">More for {pack.name}</p>
              <ul className="wz-kit-contents wz-kit-contents--extra" data-testid="kit-library">
                {library.map(row)}
              </ul>
            </>
          )}

          {others.length > 0 && (
            // Closed by default: every other graphic type in this Style is an offer for the
            // unusual show, and eighty cards open on arrival would bury the kit itself. It is
            // keyed on `othersOpen` so a search or a tick inside it re-opens it.
            <details className="wz-kit-others" open={othersOpen} key={othersOpen ? 'open' : 'closed'}>
              <summary className="wz-kit-contents-label mono">
                Any other graphic in this Style ({others.length})
              </summary>
              <ul className="wz-kit-contents wz-kit-contents--extra" data-testid="kit-extras">
                {others.map(row)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
