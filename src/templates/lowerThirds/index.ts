// The lower-third catalog: 60 hand-tuned designs across six style families. Each is a
// TemplateVariant whose create(options) generates a complete, teachable SPX template (see
// shared.ts + docs/DESIGN_LANGUAGE.md).
//
// SIX DESIGNS WERE RETIRED 2026-08-28 as measured near-duplicates (card-pair-sweep, the
// rendered-card instrument): lt10 (rendered twin of ls16), lt21 (of lt27), and the four
// hand-authored logo variants lt23 / lt29 / lt36 / lt47, whose plain siblings (lt02, lt25,
// lt32, lt15) already carry the shared optional mark slot - so at default render the pair was
// the same card twice. Do not re-mint the retired ids.
//
// The set is built as a MATRIX, not a list, so the wizard's filter chips always have somewhere to
// land. Every family answers the same questions:
//   · how many inputs   — 1 (name only) · 2 (name + role) · 3 (+ organisation/location) · 4 · 5
//   · where it sits     — left-anchored · right-anchored (mirrored, never just moved) · centred
//   · how big it is     — compact (a tag) · standard (a strap) · extended (a board)
//   · does it hold a logo — none · a leading mark · a trailing mark
// A design that only moves an existing one across the frame is not in here; a mirrored design
// re-sides its accent, because a right-anchored graphic with a left-hand accent bar points its
// loudest element into the middle of the picture.
//
// Beyond the matrix sits the SPECIALIST pack (./specialist, ls01…ls40): straps drawn for ONE
// production each — interview duos, host-and-guest pairings, commentary booths, athletes,
// esports, worship, academic, politics, analysis, music, live-and-location, creator identity,
// and broadcast journalism (a quotation, a translation, a caller, a location slate, breaking
// and developing marks, a fact check, the parliamentary register).
// They are the same kind of thing mechanically, and they answer the matrix's questions too;
// what sets them apart is that the production decides their hierarchy (a squad number set
// larger than the name, a party colour leading the candidate, a scripture reference outranking
// the reader). They are appended, never interleaved, so every design above keeps its position.


import type { TemplateVariant } from '../../model/wizard';
import { lt01 } from './lt01';
import { lt02 } from './lt02';
import { lt03 } from './lt03';
import { lt04 } from './lt04';
import { lt05 } from './lt05';
import { lt06 } from './lt06';
import { lt07 } from './lt07';
import { lt08 } from './lt08';
import { lt09 } from './lt09';
import { lt11 } from './lt11';
import { lt12 } from './lt12';
import { lt13 } from './lt13';
import { lt14 } from './lt14';
import { lt15 } from './lt15';
import { lt16 } from './lt16';
import { lt17 } from './lt17';
import { lt18 } from './lt18';
import { lt19 } from './lt19';
import { lt20 } from './lt20';
import { lt22 } from './lt22';
import { lt24 } from './lt24';
import { lt25 } from './lt25';
import { lt26 } from './lt26';
import { lt27 } from './lt27';
import { lt28 } from './lt28';
import { lt30 } from './lt30';
import { lt31 } from './lt31';
import { lt32 } from './lt32';
import { lt33 } from './lt33';
import { lt34 } from './lt34';
import { lt35 } from './lt35';
import { lt37 } from './lt37';
import { lt38 } from './lt38';
import { lt39 } from './lt39';
import { lt40 } from './lt40';
import { lt41 } from './lt41';
import { lt42 } from './lt42';
import { lt43 } from './lt43';
import { lt44 } from './lt44';
import { lt45 } from './lt45';
import { lt46 } from './lt46';
import { lt48 } from './lt48';
import { lt49 } from './lt49';
import { lt50 } from './lt50';
import { lt51 } from './lt51';
import { lt52 } from './lt52';
import { lt53 } from './lt53';
import { lt54 } from './lt54';
import { SPECIALIST_LOWER_THIRDS } from './specialist';
import { lt55 } from './lt55';
import { lt56 } from './lt56';
import { lt57 } from './lt57';
import { lt58 } from './lt58';
import { lt59 } from './lt59';
import { lt60 } from './lt60';
import { lt61 } from './lt61';
import { lt62 } from './lt62';
import { lt63 } from './lt63';
import { lt64 } from './lt64';
import { lt66 } from './lt66';
import { lt67 } from './lt67';
import { lt68 } from './lt68';
import { lt69 } from './lt69';
import { lt70 } from './lt70';


/** The matrix above, in browse order: the generalist straps, grouped by style family. */
const GENERAL_LOWER_THIRDS: TemplateVariant[] = [
  // NoaCG house (the product's own on-air look — brand-kit overlays as templates)
  lt11, // House Strap — amber bar + void blur panel, mono kicker title
  lt12, // House Breaking — accent label chip over a void headline panel
  lt13, // House Interview — three-line strap: name / org / mono location
  lt50, // House Tag — the compact house strap: bar, void panel, one name
  lt51, // House Center — the bar turned horizontal over a centred void panel
  lt52, // House Right — mirrored: bar on the outside edge, type ragged-left
  lt53, // House Board — logo well + four lines, the long-interview board
  lt54, // House Signature — words, bar, then the channel mark (trailing logo)
  lt14, // House Handle — the compact social mark (the social-handle type's design)
  lt55, // House Call — call-to-action strap: amber action chip + the target it points at
  // Minimal / clean
  lt01, // Hairline — vertical hairline accent, pure typography
  lt02, // Underline — accent underline draws in between name and title
  lt03, // Side Tag — quiet panel with keyline + accent bar
  lt04, // Kicker — light panel, accent kicker chip above the name
  lt19, // Rule Under — name only, over a rule the width of the name
  lt20, // Quiet Center — short rule over a centred name and role
  lt22, // Stack Three — name / role / tracked organisation, one tall rule
  lt24, // Credential Strap — five inputs: two headlines over a ruled meta band
  lt18, // Line Handle — compact minimal social mark (social-handle type, minimal)
  lt60, // Lowercase Quiet - no capitals, no accent bar: weight and a hairline carry it
  // Editorial (the magazine / newsroom voice: rules, kickers, printed hierarchy)
  lt25, // Masthead — a rule across the top, name, tracked accent kicker
  lt26, // Byline — publication kicker printed above the name and role
  lt27, // Column Rule — right-anchored sidebar, type ragged-left
  lt28, // Feature Center — centred kicker, rule, name and role on paper
  lt30, // Dateline — four inputs, closing on a ruled dateline in accent caps
  lt31, // Standfirst — name only on a flat ink panel, opened by a short rule
  lt59, // Byline Serif - the catalog's first serif strap, printed on paper stock
  lt63, // Broadsheet Band - the full-width paper band; name and role share one row
  lt67, // Matte Window - the framed cut-out: a paper mat with a window of picture, the name inside
  // Cinematic (the documentary voice: scrims, hairlines, wide light caps)
  lt32, // Scrim — name and role on a scrim that fades into the shot
  lt33, // Wide Caps — one name in very wide tracked caps, centred
  lt34, // Title Strap — centred name over a hairline, role beneath
  lt35, // Letterbox — three lines under a full-width hairline, rising scrim
  lt37, // Slate — four right-anchored rows against a hairline column
  lt38, // Fade Rule — compact right-anchored pair over a dissolving hairline
  // Sport / esport (bold: slabs, heavy caps, hard shadows)
  lt05, // Angle Slab — skewed slab, condensed caps
  lt06, // Split Bar — stepped name/team bars, bold accent
  lt07, // Number Badge — accent badge (logo slot) + slab text
  lt39, // Block Caps — one name in heavy caps behind a solid accent block
  lt40, // Chevron — a clip-path chevron driving into the slab
  lt41, // Team Bar — crest well + accent bar + player / club / stat (leading logo)
  lt42, // Right Slam — mirrored slab: accent bar on the outside edge
  lt43, // Center Slab — centred slab closed by a full-width accent bar
  lt44, // Stat Strip — five inputs: player and club over a row of stat cells
  lt17, // Volt Handle — compact sport social mark (social-handle type, sport)
  lt57, // Volt Call — leaning call-to-action slab (call-to-action type, sport)
  lt58, // Clean Call - minimal hairline call-to-action strap
  lt61, // Poster Slab - a condensed poster billing on a cut slab
  lt66, // Top Corner - the corner block: a standing slab in the top corner, name stacked in caps
  lt62, // House Weather - current conditions: place, tabular temperature, condition, wind
  // The three game-show families - each the lower third of a quiz + score + strap set
  lt68, // Sticker Strap - neo-brutal paper label, ink title strip (lower-third type, sticker)
  lt69, // Showtime Strap - marquee pill led by a lit star (lower-third type, showtime)
  lt70, // Arcade Strap - pixel-cornered neon player tag (lower-third type, arcade)
  // Modern social / glass
  lt08, // Frosted Card — backdrop-blur glass card (logo slot)
  lt09, // Gradient Pill — compact pill, name + handle inline
  lt15, // Frost Strap — glass lower third with a real accent edge (lower-third type, glass)
  lt45, // Glass Chip — the smallest glass design, centred
  lt46, // Glass Column — soft accent edge + three voices
  lt48, // Glass Tag — right-anchored capsule: an accent dot and one name
  lt49, // Glass Board — logo well + four lines, the remote-guest board
  lt16, // Frost Handle — compact glass social mark (social-handle type, glass)
  lt64, // Portrait Column - the tall side panel: a standing column with the name stacked down it
  lt56, // Frost Call — frosted call-to-action pill (call-to-action type, glass)
];

/**
 * The browsable lower thirds: the matrix first, then the SPECIALIST pack (./specialist) —
 * designs drawn for one production each.
 *
 * Order matters: someone who opens the category without a production in mind meets the
 * universal straps first, and someone who has one finds the specialists through the browse
 * facets rather than by scrolling. Appending rather than interleaving also keeps every
 * existing design exactly where it has always been in the grid.
 */
export const LOWER_THIRDS: TemplateVariant[] = [...GENERAL_LOWER_THIRDS, ...SPECIALIST_LOWER_THIRDS];

export function lowerThirdById(id: string): TemplateVariant | undefined {
  return LOWER_THIRDS.find((v) => v.id === id);
}
