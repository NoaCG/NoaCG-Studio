import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { StyleTag } from '../../../model/fonts';
import type { TemplateVariant } from '../../../model/wizard';
import {
  CAPABILITIES,
  CATEGORY_GROUP_OF,
  categoryGroupById,
  COMPLEXITY_LABELS,
  FAMILIES,
  FORMATS,
  graphicCategoryById,
  INTENSITY_LABELS,
  MOTION_STYLE_LABELS,
  SEMANTIC_LABELS,
  STRUCTURE_LABELS,
  STYLE_FAMILY_LABELS,
  type CapabilityId,
  type CategoryGroupId,
  type GraphicCategoryId,
  type MotionIntensity,
  type ProgrammeFamilyId,
  type ProgrammeFormatId,
  type StructureId,
} from '../../../model/taxonomy';
import {
  browseTemplates,
  mostRestrictiveFilter,
  offeredCapabilityFilters,
  offeredIntensities,
  offeredStructures,
  NO_BROWSE_FILTERS,
  type BrowseFilters,
  type BrowseResult,
  type FieldBucket,
} from '../../../templates/search';
import { browsableCategories, browsableGroups, type TemplateMeta } from '../../../templates/templateMeta';
import type { TemplatePack } from '../../../templates/packs';
import MiniPreview from '../MiniPreview';
import KitPicker from './KitPicker';
import ProjectFormatPicker from '../../ProjectFormatPicker';
import { useMyEntitlement } from '../../useMyEntitlement';
import {
  draftFormatSelection,
  formatDraftPatch,
  type DraftPatch,
  type WizardDraft,
} from '../draft';

interface Props {
  draft: WizardDraft;
  filters: BrowseFilters;
  /** React setter so every chip applies as a FUNCTIONAL update — two toggles in one
   *  batch must compose, not overwrite each other through a stale closure. */
  onFilters: Dispatch<SetStateAction<BrowseFilters>>;
  onDraft: (patch: DraftPatch) => void;
  onPickVariant: (variant: TemplateVariant) => void;
  /** The zero-result escape hatch: hand the search over to Create with AI. */
  onAi: () => void;
  /** The saved brand's family when the footer's "Use current project's colors & typeface" is
   *  on — ranks the package's siblings first without becoming a filter chip (§13.3). */
  brandFamily: StyleTag | null;
  /** ONE GRAPHIC or A WHOLE KIT — the step's first question (see the segmented control). */
  buildMode: BuildMode;
  onBuildMode: (mode: BuildMode) => void;
  /** The kit half's state, held by the wizard so Back returns to the set as it was left. */
  kitPack: TemplatePack | null;
  kitFamily: StyleTag | null;
  kitSelected: string[];
  onKitPack: (pack: TemplatePack) => void;
  onKitFamily: (family: StyleTag) => void;
  onKitSelected: (keys: string[]) => void;
}

/** What this walk is going to produce. The step asks it first because everything below the
 *  switch answers to it: a design grid answers "which graphic", a kit picker "which show". */
export type BuildMode = 'one' | 'kit';

type SortMode = 'relevance' | 'simplest';

/**
 * HOW MANY DESIGNS THE STEP RENDERS AT ONCE, and how many one press adds (handoff §2b:
 * "2x2 template cards, Show 12 more").
 *
 * It renders a PAGE because the alternative was measured: the unfiltered catalog put 429 live
 * MiniPreview cards on one grid, 30,215px of scroll, on the step whose whole job is choosing
 * one of them. Lazy iframes keep that cheap to PAINT, but nothing makes it possible to READ -
 * a storefront that shows everything shows nothing.
 *
 * Twelve, not four as the mockup's narrow column drew: the grid here is `auto-fill` and takes
 * three or four cards per row at a laptop width, so twelve is the same three rows the
 * reference shows and the "more" press stays a deliberate act rather than a treadmill.
 */
const PAGE_SIZE = 12;

const FIELD_BUCKETS: FieldBucket[] = ['1', '2', '3', '4-5', '6+', 'repeating'];
const BUCKET_LABEL: Record<FieldBucket, string> = {
  '1': '1 field', '2': '2 fields', '3': '3 fields', '4-5': '4–5 fields',
  '6+': '6+ fields', repeating: '↻ Repeating',
};
const COMPLEXITY_RANK = { simple: 0, standard: 1, advanced: 2 } as const;

/**
 * THE TYPE SELECT'S VALUE VOCABULARY, read back into the two filters it answers.
 *
 * The control offers two levels in one list (proposal §19 Option A), so its value has to say
 * WHICH level a row is: `group:<id>` for a whole shelf, `cat:<id>` for one member category,
 * empty for no type filter at all. A bare id could not tell the two apart — the ids share no
 * namespace by accident today and would collide the first time a shelf and a category were
 * named alike.
 *
 * A category ALWAYS sets its shelf too. The two filters AND together in `passesStrictFilters`,
 * so a category with no shelf would still be correct — but the chip, the count and the value
 * the control reads back all describe the pair, and leaving one half unset is how those three
 * come to disagree.
 */
function typeSelection(value: string): Pick<BrowseFilters, 'group' | 'category'> {
  if (value.startsWith('cat:')) {
    const category = value.slice(4) as GraphicCategoryId;
    return { group: CATEGORY_GROUP_OF[category], category };
  }
  if (value.startsWith('group:')) {
    return { group: value.slice(6) as CategoryGroupId, category: null };
  }
  return { group: null, category: null };
}

/** "2 names", "3 items" — a counted field semantic. The plural is not a bare `+ 's'`: a
 *  semantic whose own label is already plural takes none, or the results card offered
 *  "3 itemss" and every reader who noticed learned something true about how the line was
 *  written. */
function countedSemantic(semantic: string, n: number): string {
  const word = SEMANTIC_LABELS[semantic as keyof typeof SEMANTIC_LABELS].toLowerCase();
  if (n === 1) return word;
  return word.endsWith('s') ? `${n} ${word}` : `${n} ${word}s`;
}

/** "2 names + 2 roles" — the card's field summary off counts + semantics (proposal §12.3). */
function fieldSummary(meta: TemplateMeta): string {
  const { visible, visibleRange } = meta.fieldCounts;
  const bySemantic = new Map<string, number>();
  meta.fieldSemantics.slice(0, visible).forEach((s) => {
    bySemantic.set(s, (bySemantic.get(s) ?? 0) + 1);
  });
  const parts = [...bySemantic.entries()].slice(0, 3).map(([s, n]) => countedSemantic(s, n));
  const range = visibleRange[1] > visible ? ` (up to ${visibleRange[1]})` : '';
  return `${visible} field${visible === 1 ? '' : 's'}${range}: ${parts.join(' + ')}`;
}

function capabilityBadges(meta: TemplateMeta): string[] {
  return meta.capabilities
    .map((id) => CAPABILITIES.find((c) => c.id === id))
    .filter((c): c is (typeof CAPABILITIES)[number] => !!c)
    .slice(0, 3)
    .map((c) => c.name);
}

/** Everything the CARD deliberately leaves out (proposal §12.3): the full field schema,
 *  every programme format, and the complete structure/capability/motion metadata. */
function DetailPanel({ meta }: { meta: TemplateMeta }) {
  const formatNames = FORMATS.filter((f) => meta.programmeFormats.includes(f.id)).map((f) => f.name);
  const universal = graphicCategoryById(meta.category).relevance === 'all';
  return (
    <div className="wz-variant-detail" role="group" aria-label={`${meta.name} details`}>
      <p className="hint">{meta.description}</p>
      <h4>Editable fields</h4>
      <ul>
        {meta.fieldSchema.map((field, i) => {
          // The semantic is only worth showing when it says something the operator label
          // does not — "f0 Name · Name" is noise.
          const semantic = SEMANTIC_LABELS[meta.fieldSemantics[i]];
          const adds = semantic && semantic.toLowerCase() !== field.title.toLowerCase();
          return (
            <li key={field.field}>
              <code>{field.field}</code> {field.title}
              {adds && <span className="muted"> · {semantic}</span>}
            </li>
          );
        })}
      </ul>
      <h4>Arrangement</h4>
      <p>{meta.structures.map((s) => STRUCTURE_LABELS[s]).join(' · ')}</p>
      {meta.capabilities.length > 0 && (
        <>
          <h4>What it can do</h4>
          <p>{meta.capabilities.map((c) => CAPABILITIES.find((k) => k.id === c)?.name ?? c).join(' · ')}</p>
        </>
      )}
      <h4>Motion</h4>
      <p>
        {INTENSITY_LABELS[meta.motion.intensity]}
        {meta.motion.styles.length > 0 && ` · ${meta.motion.styles.map((s) => MOTION_STYLE_LABELS[s]).join(', ')}`}
      </p>
      <h4>Suits</h4>
      <p>{universal ? 'Any programme format' : formatNames.join(' · ')}</p>
    </div>
  );
}

/** One template card: preview still + the strict info budget of proposal §12.3, with
 *  everything else one click away in the detail panel. The info button is a SIBLING of
 *  the card button (never nested — a button inside a button is invalid) and swallows its
 *  own click so opening details never picks the template. */
function ResultCard({
  r,
  selected,
  detailOpen,
  onPick,
  onToggleDetail,
}: {
  r: BrowseResult;
  selected: boolean;
  detailOpen: boolean;
  onPick: () => void;
  onToggleDetail: () => void;
}) {
  const category = graphicCategoryById(r.meta.category);
  const familyNames = FAMILIES.filter((f) => r.meta.programmeFamilies.includes(f.id))
    .slice(0, 2)
    .map((f) => f.name);
  return (
    <div className="wz-variant-cell">
    <button className={`wz-variant ${selected ? 'selected' : ''}`} onClick={onPick} title={r.meta.description}>
      <MiniPreview variant={r.variant} />
      {/* THE CAPTION IS THE NAME, AND THE LINE UNDER IT IS WHAT THE GRAPHIC IS.
          The style family used to sit here, opposite the name, in its own family colour — the
          second-loudest thing on every card, and the owner read the grid cold on 2026-08-26:
          "I get the AI slop feeling with those names". It is a FILTER, not an identity, so it
          has moved down to the quiet last line beside the complexity. What takes its place in
          the eye is the category line, which is the answer to the question a search was asked:
          typing "credit" and getting cards headed Crawl, Pager and Column Roll reads as the
          wrong result until the card says "Credits & thanks" where a reader is looking. */}
      <div className="wz-variant-cap">
        <strong>{r.meta.name}</strong>
      </div>
      <div className="wz-browse-meta">
        <span className="wz-browse-cat">
          {category.name}
          {r.meta.subtype ? ` · ${r.meta.subtype.replace(/-/g, ' ')}` : ''}
        </span>
        {familyNames.length > 0 && category.relevance !== 'all' && (
          <span className="wz-browse-fams">{familyNames.join(' · ')}</span>
        )}
        <span className="wz-browse-fields">{fieldSummary(r.meta)}</span>
        {capabilityBadges(r.meta).length > 0 && (
          <span className="wz-browse-caps">{capabilityBadges(r.meta).join(' · ')}</span>
        )}
        <span className="wz-browse-complexity">
          {COMPLEXITY_LABELS[r.meta.complexity]} ·{' '}
          <span className="wz-style-tag">{STYLE_FAMILY_LABELS[r.meta.styleFamily]}</span>
        </span>
      </div>
    </button>
      <button
        className="wz-variant-info"
        aria-expanded={detailOpen}
        title={detailOpen ? 'Hide the details' : 'All its fields, formats and motion'}
        onClick={onToggleDetail}
      >
        {detailOpen ? '✕' : 'ⓘ'}
      </button>
      {detailOpen && <DetailPanel meta={r.meta} />}
    </div>
  );
}

/**
 * The Browse step — the faceted Start-from-template storefront
 * (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12, groups in §4c): search + ONE category-GROUP
 * dropdown with live counts (ten shelves over the 27 graphic categories) + the selected
 * shelf's member-category chips + style families + programme format (ranking, optional) +
 * field buckets, with the specialist facets behind one Filters disclosure. Replaces the
 * Category → Template pair for the catalog flow; filter state lives in the wizard so Back
 * returns with filters intact.
 *
 * IT SHOWS A PAGE, NOT THE CATALOG (re-design/handoff.md §2b). The facets are unchanged and
 * still narrow the whole catalog — what changed is that the RESULT is a first page plus
 * "Show N more", and that the chip strip became a select (then a shelf select over the grown
 * catalog). All the same fix: the step's own chrome must not be the thing between a person
 * and a design.
 *
 * IT IS ALSO THE ONE DOOR TO A KIT. There is no separate "Start from a kit" entry card any
 * more (which reverses docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18's 2026-07-23 ratification — the
 * reasoning and the reversal are recorded there): the outcome the old card protected is now a
 * SEGMENTED CONTROL at the top of this step, so "one graphic or the whole set" is a question
 * asked once, in the place where designs are chosen, and answered again at any time without
 * walking back to Entry and losing the walk.
 */
export default function BrowseStep({
  draft,
  filters,
  onFilters,
  onDraft,
  onPickVariant,
  onAi,
  brandFamily,
  buildMode,
  onBuildMode,
  kitPack,
  kitFamily,
  kitSelected,
  onKitPack,
  onKitFamily,
  onKitSelected,
}: Props) {
  const set = (patch: Partial<BrowseFilters>) => onFilters((prev) => ({ ...prev, ...patch }));
  // One detail panel open at a time — the grid stays readable and Escape has one target.
  const [detailId, setDetailId] = useState<string | null>(null);

  // The facet controls collapse behind ONE toggle, at every width (re-design/handoff.md §2b).
  // They used to stack five rows deep before the first result card on desktop and ~1300px on a
  // phone, where only the phone got a drawer. Search, the type strip, the style chips, the
  // active chips and the results stay visible either way.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const intensities = useMemo(() => offeredIntensities(), []);
  const structures = useMemo(() => offeredStructures(), []);
  const capabilityFilters = useMemo(() => offeredCapabilityFilters(), []);
  // Designs an admin marked beta, internal or hidden that this visitor is not entitled to.
  // Removed before scoring rather than greyed - a card nobody can use is noise, and it would
  // otherwise inflate every category count and the "remove the most limiting filter" hint.
  const hiddenIds = useMyEntitlement().hiddenTemplates;
  // …which is why the GROUP options are derived from the same set: the dropdown prints each
  // count, so one that counted a design the visitor cannot pick would not match the result.
  const groups = useMemo(() => browsableGroups(hiddenIds), [hiddenIds]);
  const tiles = useMemo(() => browsableCategories(hiddenIds), [hiddenIds]);
  const catalogTotal = useMemo(() => groups.reduce((n, g) => n + g.count, 0), [groups]);
  // THE ONE VALUE THE TYPE SELECT READS BACK. A category answer always implies its shelf (the
  // two compose in `passesStrictFilters`), so the NARROWER of the pair is what the control
  // shows — otherwise choosing "Credits & thanks" would leave the box naming its whole shelf.
  const typeSelectValue = filters.category
    ? `cat:${filters.category}`
    : filters.group
      ? `group:${filters.group}`
      : '';
  const outcome = useMemo(
    () => browseTemplates(filters, { brandFamily, hiddenIds }),
    [filters, brandFamily, hiddenIds],
  );

  const [sort, sortSet] = useState<SortMode>('relevance');

  // HOW FAR DOWN THE RESULT THE READER HAS ASKED TO GO. `shownLimit` is a DEPTH, never a page
  // index: the grid below is always `slice(0, shownLimit)` of the CURRENT outcome, so a result
  // that changes under the reader re-flows into the same depth and no stale card can survive it.
  // Derived during render off a signature rather than reset in an effect: an effect would paint
  // one frame of the previous page's cards against the new filter, which on a step made of live
  // MiniPreview iframes is a visible flash of the wrong designs.
  //
  // THE SIGNATURE IS `filters` AND `sort`, AND THE TWO OMISSIONS ARE DELIBERATE - `outcome` above
  // reads a third and a fourth input, and this list is shorter on purpose:
  //
  //   · `brandFamily` is out under rule `wizard/feed-footer-brand-chooser-browse-context`,
  //     ratified 2026-09-07: it RE-RANKS and never filters, so every design the reader had is
  //     still in the result and merely in a new order, and collapsing them back to twelve would
  //     take away results they pressed for, under a chooser sitting in the footer where they
  //     pressed it.
  //   · `hiddenIds` is out because it has exactly one transition per mount - `[]` until the
  //     entitlement fetch lands, then the real list, and never again
  //     (components/useMyEntitlement.ts; offline it never changes at all). Keying on it would
  //     turn a slow connection into a depth reset.
  //
  // DO NOT READ THAT FIRST BULLET AS A GENERAL RULE ABOUT RE-RANKS, because the file does not keep
  // one. `sort` is in the signature by name, and `filters.family` / `filters.format` ride in
  // through the JSON - and all three are pure re-ranks too (`passesStrictFilters` ignores family
  // and format; `formatBoost` scores a non-match at zero and keeps it). So switching the sort or
  // picking a programme DOES collapse the depth today, and only the brand chooser does not. That
  // inconsistency is real and unresolved - it is written up in
  // docs/backlog/browse-rerank-controls-disagree-about-paging.md rather than settled here, since
  // the 2026-09-07 ruling covers the brand chooser alone and the rest is the owner's call.
  //
  // This comment used to read "reset by any change to what the result IS", which is the wording
  // that ruling withdrew as too strong. It outlived the ruling by a month and was then read back
  // as a defect report against code it no longer described, so it states the mechanism now.
  const resultKey = `${JSON.stringify(filters)}|${sort}`;
  const [paging, setPaging] = useState({ key: resultKey, shown: PAGE_SIZE });
  const shownLimit = paging.key === resultKey ? paging.shown : PAGE_SIZE;
  const showMore = () => setPaging({ key: resultKey, shown: shownLimit + PAGE_SIZE });

  const sortResults = (list: BrowseResult[]) =>
    sort === 'simplest'
      ? [...list].sort(
          (a, b) =>
            COMPLEXITY_RANK[a.meta.complexity] - COMPLEXITY_RANK[b.meta.complexity] ||
            a.meta.fieldCounts.visible - b.meta.fieldCounts.visible,
        )
      : list;

  const formatOptions = filters.family
    ? FORMATS.filter((f) => f.family === filters.family)
    : FORMATS;
  const selectedFormatName = FORMATS.find((f) => f.id === filters.format)?.name
    ?? FAMILIES.find((f) => f.id === filters.family)?.name;

  const activeStrict: { label: string; clear: () => void }[] = [];
  // ONE CONTROL, ONE CHIP. The shelf and the category are two levels of a single answer given
  // in a single select, so pushing a pill for each read as two filters the reader had set
  // separately — and removing the shelf's pill would have left a category chip with nothing
  // above it. The chip names the narrowest answer and clears the whole question.
  if (filters.group || filters.category) {
    activeStrict.push({
      label: filters.category
        ? graphicCategoryById(filters.category).name
        : categoryGroupById(filters.group!).name,
      clear: () => set({ group: null, category: null }),
    });
  }
  if (filters.fieldBucket) activeStrict.push({ label: BUCKET_LABEL[filters.fieldBucket], clear: () => set({ fieldBucket: null }) });
  if (filters.style) activeStrict.push({ label: STYLE_FAMILY_LABELS[filters.style], clear: () => set({ style: null }) });
  for (const s of filters.structures) {
    activeStrict.push({ label: STRUCTURE_LABELS[s], clear: () => set({ structures: filters.structures.filter((x) => x !== s) }) });
  }
  for (const c of filters.capabilities) {
    activeStrict.push({
      label: CAPABILITIES.find((k) => k.id === c)?.name ?? c,
      clear: () => set({ capabilities: filters.capabilities.filter((x) => x !== c) }),
    });
  }
  if (filters.intensity) activeStrict.push({ label: `Motion: ${INTENSITY_LABELS[filters.intensity]}`, clear: () => set({ intensity: null }) });
  const anyActive =
    activeStrict.length > 0 || filters.query.trim() !== '' || filters.family !== null || filters.format !== null;

  const relaxKey = outcome.total === 0 ? mostRestrictiveFilter(filters) : null;

  // THE PAGE. `best` and `also` are one ranking presented in two sections, so the limit is
  // spent on the ranking and the sections are what is left over — "Best for" first, then
  // whatever room remains goes to "Also works".
  const bestSorted = sortResults(outcome.best);
  const alsoSorted = sortResults(outcome.also);
  const shownBest = bestSorted.slice(0, shownLimit);
  const shownAlso = alsoSorted.slice(0, Math.max(0, shownLimit - bestSorted.length));
  const shownCount = shownBest.length + shownAlso.length;
  const remaining = outcome.total - shownCount;

  const drawerCount = activeStrict.length + (filters.family || filters.format ? 1 : 0);

  return (
    <div className="wz-browse">
      {/* THE STEP'S FIRST QUESTION — one graphic, or the whole set. A segmented control rather
          than two entry cards: the answer is cheap to change, and everything under it is the
          answer's own surface, so putting the switch at the top is what makes changing your
          mind cost one click instead of a walk back to the front page. */}
      <div className="wz-buildmode" role="group" aria-label="How much to make" data-testid="wz-buildmode">
        <button
          className={`wz-buildmode-opt ${buildMode === 'one' ? 'active' : ''}`}
          aria-pressed={buildMode === 'one'}
          onClick={() => onBuildMode('one')}
          data-build-mode="one"
        >
          <strong>One graphic</strong>
          <span className="hint">Pick a design and make it yours.</span>
        </button>
        <button
          className={`wz-buildmode-opt ${buildMode === 'kit' ? 'active' : ''}`}
          aria-pressed={buildMode === 'kit'}
          onClick={() => onBuildMode('kit')}
          data-build-mode="kit"
        >
          <strong>A whole kit</strong>
          <span className="hint">Every graphic a show needs, in one look, in one production.</span>
        </button>
      </div>

      {/* ONE SEARCH BOX, BOTH SIDES OF THE SWITCH — it is above the branch, not inside the
          one-graphic body. What it searches follows the answer: designs on one side, SHOWS and
          the graphics a kit can hold on the other. The facets stand down in kit mode (a field
          count or a style family is a question about one design, and means nothing when the
          question is "which show am I running"), but a list of 21 shows and ~50 addable
          graphics is exactly the kind of list a search box exists for. */}
      <input
        className="wz-browse-search"
        type="search"
        placeholder={
          buildMode === 'kit'
            ? 'Search shows and graphics — try “church”, “esports”, “ticker”…'
            : 'Search all templates — try “name graphic”, “countdown”, “church verse”…'
        }
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
        aria-label={buildMode === 'kit' ? 'Search shows and graphics' : 'Search templates'}
      />

      {/* Project format - the graphic's own frame, NOT a facet: nothing here narrows the
          results (browseTemplates never reads aspect), so it sits OUTSIDE the filter block
          and stays visible when the mobile drawer is shut. Inside it, changing 9:16 meant
          opening a control labelled "Filters" to make a decision that filters nothing.
          It is also ABOVE the build-mode branch: a kit's frame is one decision for the whole
          production, and the rail's foot reads it back for the whole walk either way. */}
      {/* No description line: the rail's foot now carries the format read-back for the whole
          walk, so repeating "choose the authored canvas" above it is one sentence of chrome
          on the step whose job is picking a design. */}
      <ProjectFormatPicker
        value={draftFormatSelection(draft)}
        onChange={(selection) => onDraft(formatDraftPatch(selection))}
        idPrefix="browse-format"
        className="wz-browse-format"
      />

      {buildMode === 'kit' ? (
        <KitPicker
          pack={kitPack}
          family={kitFamily}
          selected={kitSelected}
          onPack={onKitPack}
          onFamily={onKitFamily}
          onSelected={onKitSelected}
          query={filters.query}
          onClearQuery={() => set({ query: '' })}
        />
      ) : (
        <>
      {/* THE LEAD ROW (re-design/handoff.md §2b): ONE graphic-type dropdown, the style
          families, and ONE way in to everything else.

          THE TYPE CONTROL IS ONE SELECT WITH TWO LEVELS (proposal §19 Option A, ratified by
          the owner 2026-08-27). The ten SHELVES are selectable heading rows and the member
          CATEGORIES are indented options under them, so "Credits & thanks · 13" is a row a
          reader can SEE while scanning the list — it no longer appears only after picking the
          right shelf, which is exactly why the owner could not find a credit roll for his own
          programme. THE HEADING ITSELF IS THE WHOLE-SHELF ANSWER (owner walk 2026-08-28): the
          first cut used an `<optgroup>` label plus an "All <shelf>" row under it, because an
          optgroup label cannot be selected — and the owner read that pair as "written there
          double". A plain option styled as the heading is both the heading and the answer, so
          the duplicate row is gone and the list is one row shorter per shelf.

          THE CHIP ROW UNDER IT IS GONE with the same change. It was level two of THIS
          question drawn as a row of `.wz-filter` pills directly above the STYLE pills, which
          are a different facet drawn identically — the owner read the pair as "a third way of
          looking at things". One question is now one control, and the style row is the only
          chip row on the step.

          The style families stay CHIPS: six short answers a designer picks by feel and
          re-picks often, which is the case a chip row is for and a second dropdown is not. */}
      <div className="wz-browse-lead">
        <label className="wz-browse-type">
          {/* Hidden wording, real label — same device the format picker uses: the select's own
              text already says "Lower thirds · 82", so a visible caption would repeat it. */}
          <span className="project-format-label">Graphic type</span>
          <select
            data-testid="wz-browse-type"
            value={typeSelectValue}
            onChange={(e) => set(typeSelection(e.target.value))}
          >
            <option value="">All graphics · {catalogTotal}</option>
            {groups.map((g) => {
              const members = tiles.filter((t) => CATEGORY_GROUP_OF[t.category] === g.group);
              // A one-member shelf is its own category — a heading over a single indented row
              // that restates it is a level of nesting that answers nothing.
              if (members.length < 2) {
                return (
                  <option key={g.group} value={`group:${g.group}`}>
                    {g.name} · {g.count}
                  </option>
                );
              }
              // The indent is CHARACTERS, not CSS: a native select's popup honours very little
              // author styling (Windows Chromium draws its own), so the two levels must read
              // apart from the text alone. The .wz-type-shelf weight is a bonus where honoured.
              return [
                <option key={g.group} className="wz-type-shelf" value={`group:${g.group}`}>
                  {g.name} · {g.count}
                </option>,
                ...members.map((tile) => (
                  <option key={tile.category} value={`cat:${tile.category}`}>
                    {'   '}{tile.name} · {tile.count}
                  </option>
                )),
              ];
            })}
          </select>
        </label>
        {/* Second line of the lead grid, full width — see the CSS for why the row is a grid
            rather than one wrapping flex line (the step's column halves on a pick, and the
            chips collapsed into a vertical stack there). */}
        {/* The style row says which question it answers. One-word family labels ("Sport",
            "Cinematic") are plainer than the adjective pairs they replaced, but they also stop
            announcing what KIND of answer they are, so the caption carries that now. */}
        <div className="wz-filter-row" role="group" aria-label="Filter by style">
          <span className="wz-filter-lead">Style:</span>
          {(Object.keys(STYLE_FAMILY_LABELS) as StyleTag[]).map((t) => (
            <button
              key={t}
              className={`wz-filter ${filters.style === t ? 'active' : ''}`}
              onClick={() => set({ style: filters.style === t ? null : t })}
            >
              {STYLE_FAMILY_LABELS[t]}
            </button>
          ))}
        </div>
        {/* ONE disclosure, at every width. It used to be two nested ones — a mobile-only
            drawer holding a "More filters" details — so a desktop reader met five rows of
            facets before the first design, and a phone reader had to open two things to
            reach a capability. */}
        <button
          className="wz-browse-drawer-btn"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          {filtersOpen ? '▾' : '▸'} Filters{drawerCount > 0 ? ` (${drawerCount})` : ''}
        </button>
      </div>

      <div className="wz-browse-filters" data-open={filtersOpen || undefined}>
      {/* What are you making? (optional; ranks, never hides) */}
      <div className="wz-format row wz-browse-programme">
        <label>
          What are you making?
          <select
            value={filters.family ?? ''}
            onChange={(e) =>
              set({
                family: (e.target.value || null) as ProgrammeFamilyId | null,
                format: null,
              })
            }
          >
            <option value="">Any programme</option>
            {FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label>
          Specifically
          <select
            value={filters.format ?? ''}
            onChange={(e) => {
              const id = (e.target.value || null) as ProgrammeFormatId | null;
              const fam = id ? FORMATS.find((f) => f.id === id)?.family ?? filters.family : filters.family;
              set({ format: id, family: fam ?? null });
            }}
          >
            <option value="">{filters.family ? 'Whole family' : 'Any format'}</option>
            {formatOptions.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* How many operator inputs the design carries. */}
      <div className="wz-filter-row" role="group" aria-label="Filter by field count">
        {FIELD_BUCKETS.map((b) => (
          <button
            key={b}
            className={`wz-filter ${filters.fieldBucket === b ? 'active' : ''}`}
            onClick={() => set({ fieldBucket: filters.fieldBucket === b ? null : b })}
          >
            {BUCKET_LABEL[b]}
          </button>
        ))}
      </div>

      {/* The specialist facets, once nested inside a second `More filters` details of their
          own. One disclosure is enough — this whole block already is one. */}
      <div className="wz-browse-more">
        <div className="wz-filter-row">
          {structures.map((s: StructureId) => (
            <button
              key={s}
              className={`wz-filter ${filters.structures.includes(s) ? 'active' : ''}`}
              onClick={() =>
                set({
                  structures: filters.structures.includes(s)
                    ? filters.structures.filter((x) => x !== s)
                    : [...filters.structures, s],
                })
              }
            >
              {STRUCTURE_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="wz-filter-row">
          {capabilityFilters.map((c: CapabilityId) => (
            <button
              key={c}
              className={`wz-filter ${filters.capabilities.includes(c) ? 'active' : ''}`}
              onClick={() =>
                set({
                  capabilities: filters.capabilities.includes(c)
                    ? filters.capabilities.filter((x) => x !== c)
                    : [...filters.capabilities, c],
                })
              }
            >
              {CAPABILITIES.find((k) => k.id === c)?.name ?? c}
            </button>
          ))}
        </div>
        <div className="wz-filter-row">
          {intensities.map((i: MotionIntensity) => (
            <button
              key={i}
              className={`wz-filter ${filters.intensity === i ? 'active' : ''}`}
              onClick={() => set({ intensity: filters.intensity === i ? null : i })}
            >
              Motion: {INTENSITY_LABELS[i]}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Count + sort, then the active chips — all LEFT-FLUSH under the lead row, the way the
          reference reads it ("Showing 4 of 82 · sorted by relevance"). Right-aligning the
          count left it floating alone at the far edge of an empty row whenever no filter had
          a chip, which is the common case. */}
      <div className="wz-browse-bar">
        <div className="wz-browse-count">
          {/* "Showing 12 of 82", never a bare total: with a page on screen, a number that
              counted the whole result would describe something the reader cannot see, and one
              that counted the page would hide how much the filters actually left. */}
          <span data-testid="wz-browse-count">
            Showing {shownCount} of {outcome.total}
          </span>
          {/* WHICH PART OF THE QUESTION WAS DROPPED. A word no design in the catalog carries is
              left out of the match rather than allowed to take the whole result to zero
              (templates/search.ts `catalogVocabulary`), and a result the reader did not
              entirely ask for has to say so — otherwise "my show name graphic" quietly becomes
              a search for three of its four words. */}
          {outcome.ignored.length > 0 && (
            <span className="wz-browse-ignored" data-testid="wz-browse-ignored">
              ignoring {outcome.ignored.map((word) => `“${word}”`).join(', ')}
            </span>
          )}
          <select value={sort} onChange={(e) => sortSet(e.target.value as SortMode)} aria-label="Sort results">
            <option value="relevance">Relevance</option>
            <option value="simplest">Simplest first</option>
          </select>
        </div>
        <div className="wz-browse-chips">
          {activeStrict.map((chip) => (
            <button key={chip.label} className="wz-filter active" onClick={chip.clear} title="Remove this filter">
              {chip.label} ✕
            </button>
          ))}
          {anyActive && (
            <button className="wz-filter wz-filter-clear" onClick={() => onFilters(NO_BROWSE_FILTERS)}>
              ✕ Clear all
            </button>
          )}
        </div>
      </div>

      {/* Results — sectioned when a programme is chosen (ranking, never hiding), and PAGED.
          The page is taken off the ordered result as a whole and then split back into the two
          sections, so "Show more" walks the ranking rather than filling "Best for" to the end
          before the reader ever sees an "Also works" card. */}
      {outcome.total > 0 ? (
        <>
          {selectedFormatName && shownBest.length > 0 && (
            <h3 className="wz-browse-section">Best for {selectedFormatName.toLowerCase()}</h3>
          )}
          <div className="wz-variant-grid">
            {shownBest.map((r) => (
              <ResultCard
                key={r.meta.id}
                r={r}
                selected={draft.variantId === r.meta.id}
                detailOpen={detailId === r.meta.id}
                onPick={() => onPickVariant(r.variant)}
                onToggleDetail={() => setDetailId((id) => (id === r.meta.id ? null : r.meta.id))}
              />
            ))}
          </div>
          {selectedFormatName && shownAlso.length > 0 && (
            <>
              <h3 className="wz-browse-section">Also works</h3>
              <div className="wz-variant-grid">
                {shownAlso.map((r) => (
                  <ResultCard
                key={r.meta.id}
                r={r}
                selected={draft.variantId === r.meta.id}
                detailOpen={detailId === r.meta.id}
                onPick={() => onPickVariant(r.variant)}
                onToggleDetail={() => setDetailId((id) => (id === r.meta.id ? null : r.meta.id))}
              />
                ))}
              </div>
            </>
          )}
          {/* The rest of the result, one press at a time. It names HOW MANY it will add rather
              than saying "more", so the press is a known cost — and it disappears at the end
              of the list instead of going quiet, which is what tells a reader they have seen
              everything the filters left. */}
          {remaining > 0 && (
            <button className="wz-browse-more-btn" data-testid="wz-browse-more" onClick={showMore}>
              Show {Math.min(PAGE_SIZE, remaining)} more
            </button>
          )}
        </>
      ) : (
        <div className="wz-browse-empty">
          <p className="hint">No template matches this combination.</p>
          {relaxKey && (
            <button className="wz-filter" onClick={() => onFilters(clearFilterKey(filters, relaxKey))}>
              Remove the most limiting filter
            </button>
          )}
          <button className="wz-filter" onClick={onAi}>
            ✦ Create it with AI instead
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function clearFilterKey(filters: BrowseFilters, key: keyof BrowseFilters): BrowseFilters {
  const value = filters[key];
  return { ...filters, [key]: Array.isArray(value) ? [] : null } as BrowseFilters;
}
