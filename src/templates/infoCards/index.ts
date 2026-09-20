// The info-card catalog: designs per style family, each the visual sibling of a
// lower third (docs/DESIGN_LANGUAGE.md §8). Built on shared.ts + the shared presets.
//
// The set now covers two jobs. The first nine are INFORMATION cards — a heading with lines
// under it. The rest are SET-PIECE cards, where the layout itself carries a convention that
// existed long before television did: a reading, a lyric, a quotation, a translation, an
// order of service, and the ceremony cards. Those are grouped last.

import type { TemplateVariant } from '../../model/wizard';
import { card01 } from './card01';
import { card02 } from './card02';
import { card03 } from './card03';
import { card04 } from './card04';
import { card05 } from './card05';
import { card06 } from './card06';
import { card07 } from './card07';
import { card08 } from './card08';
import { card09 } from './card09';
import { card10 } from './card10';
import { card11 } from './card11';
import { card12 } from './card12';
import { card13 } from './card13';
import { card14 } from './card14';
import { card15 } from './card15';
import { card16 } from './card16';
import { card17 } from './card17';
import { card18 } from './card18';
import { card19 } from './card19';
import { card20 } from './card20';
import { card21 } from './card21';
import { card22 } from './card22';
import { card23 } from './card23';
import { card24 } from './card24';
import { card25 } from './card25';
import { card26 } from './card26';
import { card27 } from './card27';
import { card28 } from './card28';
import { card29 } from './card29';
import { card30 } from './card30';
import { card31 } from './card31';
import { card32 } from './card32';
import { card33 } from './card33';
import { card34 } from './card34';
import { card35 } from './card35';
import { card36 } from './card36';
import { card37 } from './card37';
import { card38 } from './card38';
import { card39 } from './card39';
import { card40 } from './card40';
import { card41 } from './card41';
import { card42 } from './card42';
import { card43 } from './card43';
import { card44 } from './card44';
import { card45 } from './card45';
import { card46 } from './card46';
import { card47 } from './card47';
import { card48 } from './card48';
import { card49 } from './card49';
import { card50 } from './card50';
import { card51 } from './card51';
import { card52 } from './card52';
import { card53 } from './card53';
import { card54 } from './card54';
import { card55 } from './card55';
import { card56 } from './card56';
import { card57 } from './card57';
import { card58 } from './card58';
import {
  card59,
  card60,
  card61,
  card62,
  card63,
  card64,
  card65,
  card66,
} from './infoSystems/editorial';
import { card67, card68, card69, card70, card71 } from './infoSystems/cinematic';
import { card72 } from './card72';
import { card73 } from './card73';
import { card74 } from './card74';
import { card75 } from './card75';
import { card76 } from './card76';
import { card77 } from './card77';
import { card78 } from './card78';
import { card79 } from './card79';
import { card80 } from './card80';
import { card81 } from './card81';
import { card82 } from './card82';
import { card83 } from './card83';
import { card84 } from './card84';
import { card85 } from './card85';
import { card86 } from './card86';

export const INFO_CARDS: TemplateVariant[] = [
  // ── Information cards ──
  card05, // House Title — noacg mono kicker + huge display title (sibling lt11)
  card01, // Hairline Card — minimal, sibling of lt01 Hairline
  card02, // Slab Card — sport, sibling of lt05 Angle Slab
  card03, // Frosted Panel — glass, sibling of lt08 Frosted Card
  card04, // bench-winner card variant
  card06, // House Topic — noacg topic card, amber bar + void panel (sibling lt11)
  card07, // Clean Title — minimal title card (sibling lt01 / lt02)
  card08, // Slab Title — sport title card, leaning slab (sibling lt05 / card02)
  card09, // Frost Title — glass title card, frosted panel (sibling lt08 / card03)
  // ── The title / topic / information pack ──
  card10, // Session Title — minimal session opener (title-card)
  card11, // Keynote Title — glass keynote opener (title-card)
  card12, // Segment Title — sport segment opener (title-card)
  card13, // Service Title — house ceremony opener (title-card)
  card14, // Chapter Card — minimal chapter marker (topic-card)
  card15, // Question Card — glass question card (topic-card)
  card16, // Topic Slab — sport talking point (topic-card)
  card17, // Key Term — house explainer card (topic-card)
  card18, // Now & Next — minimal now/next (now-next)
  card19, // Frost Now Next — glass now-playing (now-next)
  card20, // Volt Now Next — sport now/next slab (now-next)
  card21, // House Now Next — house now/next (now-next)
  card22, // News Headline — minimal headline + body (headline-card)
  card23, // Frost Headline — glass announcement (headline-card)
  card24, // Volt Headline — sport report (headline-card)
  card25, // House Headline — house release note (headline-card)
  card26, // Clean Steps — minimal numbered process (process-steps)
  card27, // Frost Checklist — glass checklist (process-steps)
  card28, // Volt Process — sport runsheet (process-steps)
  card29, // House Runbook — house process (process-steps)
  card30, // Public Advisory — minimal public information (notice-card)
  card31, // Frost Advisory — glass venue advisory (notice-card)
  card32, // Alert Slab — sport safety notice (notice-card)
  card33, // House Notice — house service notice (notice-card)
  card34, // Statement Card — minimal long text (statement-card)
  card35, // Reading Card — glass reading (statement-card)
  card36, // Translation Slab — sport translation (statement-card)
  card37, // House Statement — house long text (statement-card)
  card38, // House Product — noacg live-shopping card, shot + price row (sibling lt11 / card06)
  card39, // Frost Product — glass live-shopping card, stacked shot + price row (sibling card03)
  card72, // Clean Product - minimal product card
  card73, // Volt Product - sport product slab
  card40, // Volt Offer — sport flash-offer slab, claim + promo code (sibling lt05 / card02)
  card41, // Clean Offer — minimal panel-free offer card (sibling lt01 / card07)
  card74, // House Offer - noacg offer card
  card75, // Frost Offer - glass offer card
  card42, // Clean Listing — minimal property/lot/resource card (sibling lt03 / ig05)
  card43, // House Lot — noacg auction/listing card, live value block (sibling lt11 / card38)
  card76, // Volt Listing - sport listing slab
  card77, // Frost Listing - glass listing card
  card44, // House Scan — noacg QR card, quiet-zone tile + address (sibling lt11 / card38)
  card45, // Clean Scan — minimal stacked QR card (sibling lt01 / card07)
  card78, // Volt Scan - sport QR card with protected white tile
  card79, // Frost Scan - glass QR card with protected white tile
  card46, // Frost Location — glass travel/location card, drawn pin (sibling card03 / card39)
  card47, // Volt Location — sport venue marker, drawn pin (sibling lt05 / card02)
  card48, // House Sponsors — noacg sponsor strip, four partner slots (sibling lt11 / bug02)
  card49, // Clean Partners — minimal partners board, 3 × 2 slot grid (sibling lt01 / card42)
  // ── Words on screen: readings, lyrics, quotes, translations ──
  card50, // Scripture — a verse set for reading aloud (minimal)
  card51, // Lyric Line — now and next, the singalong format (glass)
  card52, // Quotation — a pull quote with a subordinate attribution (minimal)
  card53, // Translation — spoken above, translation below and brighter (glass)
  card57, // Order of Service — the order number beside the item (minimal)
  // ── Ceremony ──
  card56, // Award Card — category held, winner on Continue (noacg)
  card58, // Graduate — one name at a time for the walk (noacg)
  card54, // Wedding Card — the couple, the date, the place (minimal)
  card55, // In Memoriam — one name, the years, one line (minimal)
  // Editorial information system - siblings of lt25-lt31.
  card59, // Edition Title - session / segment opener
  card60, // Rundown Column - topic / coming up
  card61, // Fact Check Desk - quote / fact check
  card62, // Explainer Folio - headline + readable explanation
  card63, // Public Notice Sheet - official notice + action
  card64, // Results Ledger - compact agenda / results board
  card65, // Sponsor Read - disclosure-first prepared copy
  card66, // Prepared Caption - prepared, not timed, caption band
  // Cinematic information system - siblings of lt32-lt38.
  card67, // Chapter Scrim - chapter title
  card68, // Now Playing Scrim - current / next
  card69, // Documentary Quote - long quotation + source
  card70, // Location Scrim - place + context
  card71, // Prepared Lyric - prepared caption / lyric
  // Typographic voices - the pack answering docs/CATALOG_VARIETY.md §3's missing voices.
  card80, // Broadsheet Title - serif headline on paper, two-column standfirst (sibling lt59)
  card81, // Lowercase Title - no capitals anywhere, on paper (sibling lt60)
  card82, // Poster Topic - outlined index numeral beside a condensed topic (sibling lt61)
  card83, // Stacked Words - the type IS the composition, with a vertical spine label
  // The three game-show families' openers (title-card type)
  card84, // Sticker Title - one big paper label, kicker on an ink strip (sibling lt68)
  card85, // Showtime Title - a bulb-lit marquee plaque (sibling lt69)
  card86, // Arcade Title - a pixel-cornered neon title screen (sibling lt70)
];

export function infoCardById(id: string): TemplateVariant | undefined {
  return INFO_CARDS.find((v) => v.id === id);
}
