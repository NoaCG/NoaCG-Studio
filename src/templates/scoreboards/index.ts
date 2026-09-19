// The scoreboard catalog: two-team score straps, family-consistent with the rest of the
// package (docs/DESIGN_LANGUAGE.md §8) — each variant names its lower-third sibling.

import type { TemplateVariant } from '../../model/wizard';
import { sb01 } from './sb01';
import { sb02 } from './sb02';
import { sb03 } from './sb03';
import { sb04 } from './sb04';
import { sb05 } from './sb05';
import { sb06 } from './sb06';
import { sb07 } from './sb07';
import { sb08 } from './sb08';
import { sb09 } from './sb09';
import { sb10 } from './sb10';
import { sb11 } from './sb11';
import { sb12 } from './sb12';
import { sb13 } from './sb13';
import { sb14 } from './sb14';
import { sb15 } from './sb15';
import { sb16 } from './sb16';
import { sb17 } from './sb17';
import { sb18 } from './sb18';
import { sb19 } from './sb19';
import { sb20 } from './sb20';
import { sb21 } from './sb21';
import { sb22 } from './sb22';
import { sb23 } from './sb23';
import { sb24 } from './sb24';
import { sb25 } from './sb25';
import { dc01 } from './dc01';
import { sb26 } from './sb26';
import { sb27 } from './sb27';
import { sb28 } from './sb28';

export const SCOREBOARDS: TemplateVariant[] = [
  sb01, // Match Strip — sport leaning slab (sibling lt05/lt06)
  sb02, // Quiet Score — minimal corner stack (sibling lt01)
  sb03, // House Score — noacg void strip, amber accent edge (sibling lt11)
  sb04, // Frost Score — glass frosted strip, soft accent bar (sibling lt08)
  // ── The sports pack: the compact scorebug in all four families ──
  sb05, // House Scorebug — noacg void strip, colour chips, clock tile (sibling sb03)
  sb06, // Volt Scorebug — sport slab, colour bars, countdown tile (sibling sb01)
  sb07, // Frost Scorebug — glass pill, colour dots, hairline clock end (sibling sb04)
  sb08, // Club Scorebug — minimal panel-free stack, the local/amateur board (sibling sb02)
  // ── The sports pack: the full match board in all four families ──
  sb09, // House Match Board — noacg void panel, crests, period breakdown (sibling sb05)
  sb10, // Volt Match Board — sport slab, colour bands, period cells (sibling sb06)
  sb11, // Frost Match Board — glass card, stacked competitors, set columns (sibling sb07)
  sb12, // Club Match Board — minimal flat panel, the local/amateur board (sibling sb08)
  // ── The sports pack: match status and the final score, in all four families ──
  sb13, // House Status Card — noacg void panel, live pip (sibling sb09)
  sb14, // Volt Status Card — sport accent banner result slate (sibling sb10)
  sb15, // Frost Status Card — glass centred card, status pill (sibling sb11)
  sb16, // Club Status Card — minimal flat card, the local/amateur result (sibling sb12)
  // ── The sports pack: the match event card (subs, cards, penalties, goals) ──
  sb17, // House Event Card — noacg void panel, marked fact rows (sibling sb05)
  sb18, // Volt Event Card — sport strap, colour minute block (sibling sb06)
  sb19, // Frost Event Card — glass card, soft minute chip (sibling sb07)
  sb20, // Club Event Card — minimal flat card, the local/amateur event (sibling sb08)
  // ── Three boards the pack had no shape for: a wire strip, an arena object, a corner board ──
  sb23, // Wire Bug — editorial flat cells, the club colour as the ground (sibling lt25)
  sb24, // Arena Board — sport leaning plates with lit score wells (sibling sb06)
  sb25, // Court Board — sport stacked club plates + a chamfered clock module (sibling sb06)
  // ── The podium board: game-show contestant scores (types/podiumScore.ts) ──
  sb21, // Volt Podiums — sport slab, four name-over-points columns, spotlight (sibling sb01)
  sb22, // House Podiums — noacg void strip, amber chip columns, spotlight (sibling sb03)
  // ── The duel score: two players, a quiz show's running score (types/duelScore.ts) ──
  sb26, // Sticker Score — neo-brutal labels either side of an accent diamond (sibling qz13/lt68)
  sb27, // Showtime Score — one marquee pill, medallion scores, a lit star (sibling qz14/lt69)
  sb28, // Arcade Score — pixel-cornered neon bar, glowing figures (sibling qz15/lt70)
  // ── The speaking timer: a debate's two clocks (types/speakingTimer.ts) ──
  dc01, // Debate Floor — minimal flat panel, two equal halves, the floor rail (sibling lt01)
];

export function scoreboardById(id: string): TemplateVariant | undefined {
  return SCOREBOARDS.find((v) => v.id === id);
}
