// The starting-soon catalog — the HOLDING SCREEN set: everything the audience looks at while
// the show is not happening. Before it starts, between its parts, when it breaks, and after it
// ends. Family-consistent with the rest of the package (docs/DESIGN_LANGUAGE.md §8).
//
// Browse order groups them by moment rather than by style, because that is how an operator
// reaches for them: the front door first, then the middle of the show, then the end.

import type { TemplateVariant } from '../../model/wizard';
import { ss01 } from './ss01';
import { ss02 } from './ss02';
import { ss03 } from './ss03';
import { ss04 } from './ss04';
import { ss05 } from './ss05';
import { ss06 } from './ss06';
import { ss07 } from './ss07';
import { ss08 } from './ss08';
import { ss09 } from './ss09';
import { ss10 } from './ss10';
import { ss11 } from './ss11';
import { ss12 } from './ss12';
import { ss13 } from './ss13';
import { ss14 } from './ss14';
import { ss15 } from './ss15';
import { ss16 } from './ss16';
import { ss17 } from './ss17';
import { ss18 } from './ss18';
import { ss19 } from './ss19';
import { ss20 } from './ss20';
import { ss21 } from './ss21';
import { ss22 } from './ss22';
import { ss23 } from './ss23';
import { ss24 } from './ss24';

export const STARTING_SOON: TemplateVariant[] = [
  // ── Before the show ──
  ss04, // noacg holding screen — House Hold (sibling lt11 / card05)
  ss01, // minimal holding screen
  ss02, // sport holding screen
  ss03, // glass holding screen
  ss05, // minimal — counts to a wall-clock start time
  ss10, // minimal — the quiet ceremony hold
  ss11, // sport — the venue / doors-open hold
  ss18, // editorial - the printed paper programme, counting to a start time
  ss20, // glass - the layered event badge: kicker tab, plaque, countdown strap, room ribbon
  ss21, // noacg - the minute rule: the wait graduated across the frame, with a traveller on it
  // ── During the show ──
  ss06, // noacg — the BRB break card
  ss12, // glass — the compact returning-soon capsule over the picture
  ss07, // glass — the scheduled intermission
  ss13, // noacg — the between-items schedule hold
  ss19, // sport - the poster break card, built around the clock itself
  ss08, // minimal — the technical pause, deliberately clockless
  // ── After the show ──
  ss09, // noacg — the sign-off / offline card
  ss17, // noacg - typed sign-off with logo slot
  ss14, // minimal - typed sign-off with logo slot
  ss15, // sport - typed sign-off with logo slot
  ss16, // glass - typed sign-off with logo slot
  // The three game-show families' sign-offs (type: sign-off)
  ss22, // sticker - a big paper label on a halftone accent field
  ss23, // showtime - a bulb-lit plaque on a burgundy curtain
  ss24, // arcade - a pixel-cornered neon panel on a scanline screen
];

export function startingSoonById(id: string): TemplateVariant | undefined {
  return STARTING_SOON.find((v) => v.id === id);
}
