// THE DESIGN-KNOWLEDGE LAYER - general graphics intelligence, in modules a cheap model loads
// only when they apply (docs/PRO_HARNESS_PLAN.md §3).
//
// WHAT THIS IS. The visual knowledge NoaCG has accumulated - docs/DESIGN_LANGUAGE.md's taste
// numbers, docs/DESIGN_PRINCIPLES.md's twelve principles, the owner's blind-read verdicts in
// docs/VISUAL_TASTE_REVIEW.md, the retired creative pilot's knowledge cards, the agent door's
// design notes - factored by SUBJECT rather than by graphic type. A lower third and a scoreboard
// do not need two lessons in hierarchy; they need one lesson in hierarchy and their own
// semantics (fields, operator events, machine), which `typeSemantics.ts` supplies from the type
// registry. That split is the whole point: graphic types add what they MEAN and how they are
// OPERATED, never a private copy of how to design.
//
// WHAT IT IS NOT. Not the legibility rules - those are numbers in src/model/designRules.ts and
// reach the model through `designRulesPromptBlock`, never copied here (one module, zero drift).
// Not a gate - a card is what the model reads BEFORE it designs; the instruments measure what it
// did afterwards, and only the measurement decides. Not one giant prompt: `knowledgeForRequest`
// picks a core set of about six cards and adds the rest by trigger, and the model can ask for
// any card by id.
//
// WRITTEN AS INSPECTION. Every line states what to look at and what earns a pass, never a list
// of named failures - a prohibition suppresses the behaviour it constrains (src/ai/AGENTS.md).
// The failure record at the end is the one deliberate exception, and it is phrased as "the
// frame that fails shows…" so the model reads it as a check, not a ban.
//
// Pure module: strings only. The numbers here are DESIGN_LANGUAGE's ratified taste ranges, and
// a change there is a change here in the same commit.

export type KnowledgeId =
  | 'hierarchy'
  | 'composition'
  | 'spacing-and-shape'
  | 'typography'
  | 'colour'
  | 'motion'
  | 'safe-area-and-placement'
  | 'text-and-its-box'
  | 'mark-and-imagery'
  | 'density'
  | 'live-numbers'
  | 'package-consistency'
  | 'on-air-reading'
  | 'failure-record';

export interface KnowledgeCard {
  id: KnowledgeId;
  title: string;
  /** One line for the index the model sees before it asks for a card. */
  summary: string;
  /** Words in a brief, a field kind or a type id that make this card load by itself. */
  triggers: string[];
  body: string;
}

export const KNOWLEDGE_CARDS: readonly KnowledgeCard[] = [
  {
    id: 'hierarchy',
    title: 'Hierarchy',
    summary: 'One thing is read first; everything else is visibly smaller or quieter.',
    triggers: [],
    body: `Decide the ONE element this graphic exists to show before drawing anything, then make everything
else support it. Rank the content, then express the rank with size, weight and position - the three
that survive at broadcast distance; never with colour alone (it has to read on a monochrome monitor).
What earns a pass: the eye lands first on the primary field; a viewer who reads only that line still
gets the point. Type sizes step DOWN the declared field order. A difference is decisive or absent: a
10% size step reads as a mistake, a 40% step reads as intent. Between a heading and its supporting
line the ratio is about 1.8-2.2 : 1; closer than 1.5 : 1 looks indecisive. Two emphases is none - an
element that is neither the emphasis nor support of it is deleted, not quietened.`,
  },
  {
    id: 'composition',
    title: 'Composition and alignment',
    summary: 'Every element is placed against something; nothing floats, nothing collides.',
    triggers: [],
    body: `Every edge lines up with another edge or is clearly, deliberately offset. The near-miss - two
edges a few pixels apart - is what reads as broken; exact alignment and a large deliberate offset
both read as intent. Align toward the anchor: a left-anchored graphic left-aligns, a right-anchored
one right-aligns; centring is for a centred composition only, and a centred block sitting at the
left safe margin fails. Text aligns to the panel, rule or shape behind it, never to a frame
coordinate. Pick one balance and commit: asymmetric usually suits a frame shared with live
pictures, and an asymmetric layout still needs its counterweight. A strong composition usually has
a DEVICE - two text roles given two distinguishable shapes (a pill kicker over a bar, a rule that
the name sits on, a chip beside a slab) - decided second, right after reading the brief, so that
palette, spacing and motion serve it. What earns a pass: the mark is centred in its container, the
accent is fused to an edge or sits on a shared axis, the kicker and headline share one left edge, and
nothing is drawn on top of anything it did not mean to cover.`,
  },
  {
    id: 'spacing-and-shape',
    title: 'Spacing, air and shape',
    summary: 'Air is a component with a size; related things sit closer than unrelated ones; one shape language.',
    triggers: [],
    body: `Treat emptiness as allocated, not left over. Inside a panel the text sits in generous padding -
about 0.5-0.7em above and below, 1.0-1.4em left and right of the type it holds - and cramped padding
is the first tell of an amateur graphic. Lines that read as one unit sit 4-10px apart (a name and its
role); a kicker sits 8-14px away from them. Proximity says "these belong together", so unrelated
things get more air than related ones. Size the panel BY its content plus its air (width: fit-content
with a max-width cap), never pour content into a box sized first; a strap spends WIDTH, never height.
One shape language per graphic: one corner radius, one accent weight, one gap value, and the accent
appears in small sharp doses - a bar fused to an edge, an underline, a kicker chip - not as the whole
panel. Shadows lift, never smear: one soft large shadow over several small ones. Families that read
as designed: minimal (hairlines, whitespace, 0-2px radius), editorial (printed rules, tracked caps
kickers, flat surfaces), cinematic (a scrim, light wide type, no panel), sport (slabs, skew painted
on a layer, heavy condensed type), glass (soft radius, blur, keyline). What earns a pass: the
padding is even on opposite sides, the gap between text and any rule is real, and the panel is as
wide as its longest line wants and no wider.`,
  },
  {
    id: 'typography',
    title: 'Typography',
    summary: 'One family, contrast by weight and size, tracked caps for labels, floors respected.',
    triggers: [],
    body: `One typeface per graphic, two at most (heading + label). Contrast comes from weight and size,
never from more faces. At 1080p a name or headline sits around 44-92px at weight 600-800 with a
tight line-height (1.05-1.15) and 0 to -0.01em tracking; the upper half of that range is
flagship-show territory. A role or title line sits around 22-46px at weight 400-500, line-height
1.2-1.35. A kicker or label (LIVE, a category) is 16-22px, weight 600-700, uppercase with 0.08-0.2em
tracking - small caps breathe. Large text tightens, small caps open up. The legibility floors and
the contrast floors are stated separately in the BROADCAST LEGIBILITY RULES block and they bind;
when a hierarchy cannot work above the floor, the graphic is too dense - cut a line rather than
shrink one. Wrapped lines balance (text-wrap: balance) and long unbroken words break rather than
escape. What earns a pass: the heading is unmistakably the heaviest and largest type, the supporting
line is a clear step down, and no informational text is thin grey on a dark panel.`,
  },
  {
    id: 'colour',
    title: 'Colour',
    summary: 'Exactly one accent, used sharply; a neutral text and panel system; the brand\'s colours as identity.',
    triggers: ['colour', 'color', 'brand', 'palette', 'accent'],
    body: `Exactly one accent colour per graphic plus a neutral text and panel system; two accents read as a
mistake. Neutral panels are near-black with a little colour in them (rgba(8-18, 8-20, 14-28, 0.85-0.95)),
never pure #000. Primary text is white or the brand's light; the supporting line drops to 65-80% of
that, never a second pure white. The accent appears where it does a job - a bar, an underline, a
kicker's chip, a gradient edge - and rarely as a whole surface (sport may slab it deliberately).
Gradients stay in one hue or adjacent hues, 90-135 degrees, subtle. Every colour flows through the
:root variables (--accent, --text-color, --text-dim, --panel-bg) so the whole graphic retints as one;
a hard-coded colour elsewhere is a defect. When the customer gave brand colours they are IDENTITY:
accent and panel are used exactly, and only the furniture (text, dim text) moves to reach the contrast
floor. What earns a pass: one accent, everything readable on the surface it actually sits on, and the
palette driving the composition rather than tinting somebody else's.`,
  },
  {
    id: 'motion',
    title: 'Motion',
    summary: 'Entrances ease out in reading order; exits ease in and are faster; transform and opacity only.',
    triggers: ['animation', 'motion', 'entrance', 'reveal', 'stinger'],
    body: `Animate only transform (x, y, scale, skew), opacity and clip-path - never left, top, width, height
or margin. Entrances use OUT-direction eases (power2.out, power3.out, expo.out; back.out(1.4-1.8) for a
snappy pop) and take 0.5-1.4s in total; above about 0.9s reads as deliberate broadcast pacing, fast
overlays stay at the low end. Exits use IN-direction eases and run 30-60% FASTER than the entrance;
nobody needs to read something leaving. Elements arrive in READING order with 60-250ms staggers -
accent, then heading, then supporting line - as one gesture with parts, never as several animations
that happen to overlap. One gsap.timeline() per direction. Text reveals slide from behind a mask or
wipe with clip-path; text never reveals by scaling (it squashes the glyphs). Linear easing is for
continuous travel only (tickers, clocks, progress). Bounce and elastic are for a playful brief only.
On the hold at most ONE element may keep moving, and nothing may pulse for decoration. Entrances are
fromTo tweens so play() after stop() renders correctly. What earns a pass: the entrance delivers the
information in the order it is read and the exit is over before anyone notices it.`,
  },
  {
    id: 'safe-area-and-placement',
    title: 'Safe area and placement',
    summary: 'Information stays inside the title-safe inset; decoration may bleed; growth goes away from the edge.',
    triggers: ['corner', 'bug', 'ticker', 'full', 'fullscreen', 'strap', 'crawl'],
    body: `The safe area binds INFORMATION, not decoration: text, marks and anything a viewer must read stay
inside the inset (the RULES block states the pixels; the catalog's lower thirds sit 119-120px from the
frame edge), while a band, a rule or a scrim may run to the frame edge when the design means it to.
Anchor a lower graphic with bottom:, not top:, so a wrapped line grows UPWARD and never sinks out of
the safe area; anchor a corner graphic to its corner so growth moves inward. Frame-anchored geometry -
a near-full-width band, a 16:9 window - is sized against the frame and does not follow the type
scale. A band that is not full-bleed carries EQUAL margins on both sides; one margin reads as a
mistake. What earns a pass: every glyph and mark inside the safe inset on the hold AND on the
long-string frame, and anything that touches the frame edge touches it on purpose.`,
  },
  {
    id: 'text-and-its-box',
    title: 'Text and its box',
    summary: 'Every field lives in the shape drawn under it; the text owns alignment, the box owns growth.',
    triggers: [],
    body: `An operator will type something longer, shorter or emptier than the sample, and the graphic must
look designed at every length - that is the whole test, and the long-string frame is where it is
judged. Every field lives INSIDE the shape drawn under it: every glyph, descenders and the trailing
letter-space included, sits in its box and nothing is cut off. The text owns its alignment (a centred
label is centred on both axes of its shape, gap left equals gap right and gap above equals gap
below); the box owns its growth, and it grows the way the design implies - a strap gets wider or grows
upward, a plate on a fixed board does not grow at all and its text wraps or shrinks inside it - and
everything else stays exactly where it was. A one-line identity field (a person's role, a team name)
stays one line. Live numbers keep a fixed-width digit slot so a score does not shift the layout when
it changes. What earns a pass: the hold frame and the long frame show the same composition with only
the intended box changed, and no glyph has left the box it belongs to.`,
  },
  {
    id: 'mark-and-imagery',
    title: 'Brand mark and pictures',
    summary: 'The platform seats the mark; it is centred in its container, sized to the text, never plated.',
    triggers: ['logo', 'mark', 'crest', 'image', 'portrait', 'photo', 'sponsor'],
    body: `A brand mark is never redrawn, cropped, filtered, rounded or stretched: it is placed as supplied.
The platform owns WHERE it sits (the design declares a slot; the compiler fills it), so a design's job
is to leave that slot room. A mark inside a container is centred in it on both axes. Its clear space
is about a quarter of its height on every side, and it is sized relative to the text block it stands
beside - roughly the height of the text it accompanies - never to the frame. A mark between an accent
and text is optically balanced, not crowded. A mark gets NO backing field painted around it: a well is
composition only when the design draws it as part of the panel; a neutral rectangle behind a logo is
a patch and reads as one. A single-ink mark that cannot read on the surface is knocked to white or
black, never plated. A package's mark is on every piece or on none. A picture the operator supplies
(a portrait, cover art) gets a visible designed placeholder for the empty state, never an invisible
slot. What earns a pass: the mark reads on the surface it sits on, sits on the design's grid, and
takes no more than its share of the graphic.`,
  },
  {
    id: 'density',
    title: 'Density',
    summary: 'Fewer things, bigger; every rank costs air; a layout that cannot afford one cuts a line.',
    triggers: ['list', 'rows', 'items', 'table', 'standings', 'schedule', 'agenda', 'credits', 'board'],
    body: `Broadcast graphics are read in seconds over a moving picture, so density is the enemy of
legibility, not a sign of information. Every level of hierarchy costs air; a rank the layout cannot
afford is cut, not squeezed. A board of peer rows holds about eight at broadcast size on a full frame
and fewer on a strap; a column of figures right-aligns so the numbers line up; a repeated list is ONE
multi-line field the runtime renders, never a field per row. A full-frame graphic is the discipline
case: one dominant element, one supporting group, and a lot of deliberate emptiness; filling the frame
because it is there is the failure. When the long-string frame gets crowded the answer is less
content or a bigger stage, never smaller type below the floors. What earns a pass: every item on the
frame can be named for what it does, and removing any of them would lose information.`,
  },
  {
    id: 'live-numbers',
    title: 'Live numbers',
    summary: 'A changing figure never changes the shape of its graphic: tabular digits in an even-width face.',
    triggers: ['score', 'clock', 'timer', 'countdown', 'count', 'percent', 'tally', 'number', 'vote'],
    body: `A score, a clock, a tally, a percentage or a count repaints many times a second, and with
proportional digits "11:11" is narrower than "00:00", so the box twitches on every tick - the most
visible way an on-air graphic reads as amateur. Every changing figure sets font-family: var(--font-numeric)
AND font-variant-numeric: tabular-nums; the second alone silently does nothing on a face without the
feature. Digit slots are sized for the WIDEST value the operator can enter (three-digit scores,
two-digit minutes), and a value that changes pops ONLY the changed figure, never the panel around it.
A figure typed once and never repainted (a year, a rank) needs none of this. What earns a pass: the
frame with the sample values and the frame with the widest values show the same geometry.`,
  },
  {
    id: 'package-consistency',
    title: 'Package consistency',
    summary: 'Graphics from one show read as one show: one palette, one type voice, one shape and motion language.',
    triggers: ['package', 'set', 'kit', 'family', 'sibling', 'show'],
    body: `A channel does not need one lower third; it needs a lower third, a bug, a card, a board and a
holding screen that visibly belong together. Coherence is REPETITION: the same accent weight, the same
corner radius, the same gap scale, the same easing pair, the same typeface and case rules on every
piece, with the :root variables carrying palette and type across the set. Variety is spent ACROSS the
package - a bug looks like a bug and a card like a card - never inside one graphic. The mark sits on
every piece or on none. What earns a pass: shown side by side, two pieces would be believed to come
from the same designer on the same day.`,
  },
  {
    id: 'on-air-reading',
    title: 'How the result is judged',
    summary: 'Over real footage, at viewing distance, for eight seconds, with an operator\'s real text.',
    triggers: [],
    body: `The graphic is judged as a viewer meets it: composited over a moving picture, at the size a TV or
a phone shows it, for a few seconds, with the words an operator typed on the day rather than the
sample. It is judged again with every text lengthened and every number widened, and in every state the
operator can put it in. It is airable when a broadcaster would put it on screen as delivered - no
tweak first. Across every blind read the owner has done, the failures were GEOMETRY: an accent line
drawn over the first letters, a logo on a white box taller than the panel beside it, a chip sitting
low in its band, padding uneven from side to side, text on the panel's own rule, a band with one
margin. Colour and motion were almost never the complaint. So spend the effort where the failures
live: alignment, spacing, proportion, and what happens to the box when the text grows.`,
  },
  {
    id: 'failure-record',
    title: 'The frames that failed',
    summary: 'What an unairable frame has shown, in the owner\'s blind reads - each one a check to run on your render.',
    triggers: [],
    body: `Each line is a frame that failed and why; check your own render for the same thing.
- A green accent bar drawn on top of the first letters of every line: "always the big mistake that makes it unairable".
- An amber rule sitting 25px right of the name it belongs to, aligned to nothing.
- A yellow top line that stops short of the panel's edges: it reads as a mistake, not a detail.
- A logo on a white box taller than the panel beside it; a logo on a black backing on a light design.
- A white DEVELOPING chip sitting low in its band: centred means centred on both axes.
- Boxes that grow with their text and stop aligning with the background; the last step overflowing it.
- A stat panel whose label is 130px and whose figure - the reason it exists - is 18px.
- A podium whose scores are the smallest thing on it.
- A purple pill, an orange number, an orange glow, a yellow gradient blob and a yellow label on one graphic.
- A red accent on a blue design: it looks like a mistake; the second accent goes.
- Black text on a red band that starts 120px in on the left and runs off the right of the frame.
- Dark blue text on dark grey: not enough contrast to air.
- A team name cut off mid-word by the tile beside it once the long string is typed.
- A fixed-width banner that should scale with the text and does not.`,
  },
];

const CARD_BY_ID = new Map(KNOWLEDGE_CARDS.map((c) => [c.id, c]));

/** The cards every design reads, whatever the type. Six, about 1,600 tokens together. */
export const CORE_KNOWLEDGE: readonly KnowledgeId[] = [
  'on-air-reading',
  'hierarchy',
  'composition',
  'spacing-and-shape',
  'typography',
  'text-and-its-box',
];

export function knowledgeCard(id: string): KnowledgeCard | null {
  return CARD_BY_ID.get(id as KnowledgeId) ?? null;
}

/** The index the model sees: id and one line each, so it can ask for a card by name. */
export function knowledgeIndex(): string {
  return KNOWLEDGE_CARDS.map((c) => `- ${c.id}: ${c.summary}`).join('\n');
}

export interface KnowledgeRequest {
  brief: string;
  /** The type id, when the request resolved to one. */
  typeId?: string | null;
  /** Field kinds and labels the graphic carries. */
  fields?: readonly { label: string; kind: string }[];
  /** Whether a brand mark rides the request. */
  hasMark?: boolean;
  /** Whether brand colours ride the request. */
  hasBrandColours?: boolean;
  /** How many graphics the package holds - more than one loads the consistency card. */
  packageSize?: number;
}

/**
 * Which cards a request loads BEFORE the first design: the core set plus whatever the request
 * triggers. Deliberately conservative - a model that wants more asks for it by id, and every
 * card it never asks for is context a cheap model did not have to carry.
 */
export function knowledgeForRequest(request: KnowledgeRequest): KnowledgeId[] {
  const ids = new Set<KnowledgeId>(CORE_KNOWLEDGE);
  const haystack = [
    request.brief,
    request.typeId ?? '',
    ...(request.fields ?? []).map((f) => `${f.label} ${f.kind}`),
  ].join(' ').toLowerCase();
  for (const card of KNOWLEDGE_CARDS) {
    if (card.triggers.some((t) => haystack.includes(t))) ids.add(card.id);
  }
  if (request.hasMark || (request.fields ?? []).some((f) => f.kind === 'image')) ids.add('mark-and-imagery');
  if (request.hasBrandColours) ids.add('colour');
  if ((request.fields ?? []).some((f) => f.kind === 'number')) ids.add('live-numbers');
  if ((request.fields ?? []).filter((f) => f.kind === 'text' || f.kind === 'lines').length > 4) ids.add('density');
  if ((request.packageSize ?? 1) > 1) ids.add('package-consistency');
  // Motion is loaded for every design: the animation region is one of the three writable
  // regions and a design without a motion decision ships the spine's default.
  ids.add('motion');
  return [...ids];
}

/** The cards as one block the model reads, each under its title. */
export function renderKnowledge(ids: readonly string[]): string {
  const cards = ids.map((id) => knowledgeCard(id)).filter((c): c is KnowledgeCard => Boolean(c));
  return cards.map((c) => `## ${c.title}\n${c.body.trim()}`).join('\n\n');
}
