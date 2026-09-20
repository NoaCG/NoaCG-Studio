// The infographic catalog: stat callouts, bar charts, agenda and poll boards, the title
// pack's list boards, the goal and milestone rails, and the sports fixtures board.
// Family-consistent with the rest of the package (docs/DESIGN_LANGUAGE.md §8).

import type { TemplateVariant } from '../../model/wizard';
import { ig01 } from './ig01';
import { ig02 } from './ig02';
import { ig03 } from './ig03';
import { ig04 } from './ig04';
import { ig05 } from './ig05';
import { ig06 } from './ig06';
import { ig07 } from './ig07';
import { ig08 } from './ig08';
import { ig09 } from './ig09';
import { ig10 } from './ig10';
import { ig11 } from './ig11';
import { ig12 } from './ig12';
import { ig13 } from './ig13';
import { ig14 } from './ig14';
import { ig15 } from './ig15';
import { ig16 } from './ig16';
import { ig17 } from './ig17';
import { ig18 } from './ig18';
import { ig19 } from './ig19';
import { ig20 } from './ig20';
import { ig21 } from './ig21';
import { ig22 } from './ig22';
import { ig23 } from './ig23';
import { ig24 } from './ig24';
import { ig25 } from './ig25';
import { ig26 } from './ig26';
import { ig27 } from './ig27';
import { ig28 } from './ig28';
import { ig29 } from './ig29';
import { ig30 } from './ig30';
import { ig31 } from './ig31';
import { ig32 } from './ig32';
import { ig33 } from './ig33';
import { ig34 } from './ig34';
import { ig35 } from './ig35';
import { ig36 } from './ig36';
import { ig37 } from './ig37';
import { ig38 } from './ig38';
import { ig39 } from './ig39';
import { ig40 } from './ig40';
import { ig41 } from './ig41';
import { ig42 } from './ig42';

export const INFOGRAPHICS: TemplateVariant[] = [
  ig01, // Big stat count-up
  ig02, // Bar chart grow
  ig03, // bench-winner infographic variant
  ig04, // bench-winner infographic variant
  ig05, // bench-winner infographic variant
  ig06, // bench-winner infographic variant
  ig07, // bench-winner election results bars
  ig08, // House Schedule — noacg agenda board (sibling lt11 / ig06)
  ig09, // Frost Schedule — glass agenda board (sibling lt08 / ig02)
  ig10, // Volt Schedule — sport agenda board (sibling lt06 / card02)
  ig11, // House Poll — noacg bar chart (sibling lt11 / ig08)
  ig12, // Volt Poll — sport bar chart (sibling lt06 / card02)
  ig13, // Clean Poll — minimal bar chart (sibling lt01 / ig06)
  // ── The title / topic / information pack's two list boards ──
  ig14, // Fact Sheet — minimal key facts (key-facts)
  ig15, // Frost Facts — glass key facts (key-facts)
  ig16, // Volt Facts — sport key numbers (key-facts)
  ig17, // House Facts — house key facts (key-facts)
  ig18, // Recap Board — minimal recap / actions (recap-card)
  ig19, // Frost Recap — glass recap (recap-card)
  ig20, // Volt Recap — sport half-time notes (recap-card)
  ig21, // House Actions — house recap (recap-card)
  ig22, // House Goal — noacg goal meter, total + progress bar (sibling lt11 / ig05)
  ig23, // Frost Goal — glass goal ring, share of the target (sibling lt08 / ig04)
  ig30, // Clean Goal - minimal measured goal bar
  ig31, // Volt Goal - sport measured goal bar
  ig24, // House Milestones — noacg tier rail with reached nodes (sibling lt11 / ig22)
  ig25, // Volt Milestones — sport tier rail, leaning markers (sibling lt05 / ig03)
  ig32, // Clean Milestones - minimal measured tier rail
  ig33, // Frost Milestones - glass measured tier rail
  // ── The sports pack: fixtures and results, on one board (docs/SPORTS_PACK.md) ──
  ig26, // House Fixtures — noacg void panel, amber score chips (sibling ig08)
  ig27, // Volt Fixtures — sport slab, filled score blocks (sibling ig10)
  ig28, // Frost Fixtures — glass card, tinted score pills (sibling ig09)
  ig29, // Club Fixtures — minimal flat panel, the local results board (sibling ig06)
  // ── The election night mini-pack: one count, three boards (editorial, sibling lt25) ──
  ig34, // Seat Board - one bar per party, growing to the seats it has won
  ig35, // Majority Meter - a coalition running across the chamber toward the majority line
  ig36, // Turnout Dial - a printed dial filling to the turnout, with the swing
  ig37, // House Forecast - the weather pack's 3-day board: day, condition, high/low
  ig38, // Results Rail - the count-night side dashboard: one washed row per district
  ig39, // Key Figures - the printed two-column stat list: label left, big figure right
  // The three game-show families' key-facts boards (key-facts type) - a show's how-to-play card
  ig40, // Sticker Facts - a paper label, terms on accent chips (sibling lt68)
  ig41, // Showtime Facts - a playbill on a marquee plaque (sibling lt69)
  ig42, // Arcade Facts - an instructions screen (sibling lt70)
];

export function infographicById(id: string): TemplateVariant | undefined {
  return INFOGRAPHICS.find((v) => v.id === id);
}
