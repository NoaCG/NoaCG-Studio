// The corner-bug catalog: the persistent on-air marks — the identity family. A bug is the
// visual sibling of its lower-third counterpart (docs/DESIGN_LANGUAGE.md §8), built on
// shared.ts + the shared presets.
//
// Browse order is by JOB, not by id: the general logo bugs first, then the station idents,
// live status, logo-only marks, sponsor strips, sponsor rotations, event idents, award marks
// and finally the location chips. Each job ships in all four style families.

import type { TemplateVariant } from '../../model/wizard';
import { bug01 } from './bug01';
import { bug02 } from './bug02';
import { bug03 } from './bug03';
import { bug04 } from './bug04';
import { bug05 } from './bug05';
import { bug06 } from './bug06';
import { bug07 } from './bug07';
import { bug08 } from './bug08';
import { bug09 } from './bug09';
import { bug10 } from './bug10';
import { bug11 } from './bug11';
import { bug12 } from './bug12';
import { bug13 } from './bug13';
import { bug14 } from './bug14';
import { bug15 } from './bug15';
import { bug16 } from './bug16';
import { bug17 } from './bug17';
import { bug18 } from './bug18';
import { bug19 } from './bug19';
import { bug20 } from './bug20';
import { bug21 } from './bug21';
import { bug22 } from './bug22';
import { bug23 } from './bug23';
import { bug24 } from './bug24';
import { bug25 } from './bug25';
import { bug26 } from './bug26';
import { bug27 } from './bug27';
import { bug28 } from './bug28';
import { bug29 } from './bug29';
import { bug30 } from './bug30';
import { bug31 } from './bug31';
import { bug32 } from './bug32';
import { bug33 } from './bug33';
import { bug34 } from './bug34';
import { bug35 } from './bug35';
import { bug36 } from './bug36';
import { bug37 } from './bug37';
import { bug38 } from './bug38';
import { bug39 } from './bug39';
import { bug40 } from './bug40';

export const CORNER_BUGS: TemplateVariant[] = [
  // The general logo bug — a mark and a caption (type: sponsor-bug).
  bug02, // House Clock — noacg logo/three-bar mark + live ticking clock (sibling lt11)
  bug01, // Glass Mark — glass, sibling of lt08 Frosted Card / lt09 Gradient Pill
  bug03, // Slab Bug — sport, solid slab + fused accent edge (sibling lt05 / lt06)
  bug04, // Hairline Bug — minimal, panel-free logo + accent underline (sibling lt01 / lt02)

  // Station / show ident — the channel's own mark (type: station-bug).
  bug05, // House Ident — noacg
  bug06, // Frost Ident — glass
  bug07, // Slab Ident — sport
  bug08, // Rule Ident — minimal

  // Live status — the on-air state, switched by the operator (type: live-bug).
  bug09, // House Live — noacg
  bug10, // Frost Live — glass
  bug11, // Volt Live — sport
  bug12, // Signal Live — minimal

  // Logo-only marks — no caption at all (type: logo-bug).
  bug13, // House Mark — noacg
  bug14, // Frost Mark — glass
  bug15, // Block Mark — sport
  bug16, // Clear Mark — minimal

  // Sponsor / partner strips — a kicker and up to three logos (type: sponsor-strip).
  bug17, // House Sponsor Strip — noacg
  bug18, // Frost Sponsor Strip — glass
  bug19, // Slab Sponsor Strip — sport
  bug20, // Quiet Sponsor Strip — minimal

  // Sponsor rotation — one slot, several partners, on a timer (type: sponsor-rotator).
  bug21, // House Sponsor Rotation — noacg
  bug22, // Frost Sponsor Rotation — glass
  bug23, // Slab Sponsor Rotation — sport
  bug24, // Quiet Sponsor Rotation — minimal

  // Event idents — the conference, festival or fixture mark (type: event-bug).
  bug25, // House Event Bug — noacg
  bug26, // Frost Event Bug — glass
  bug27, // Fixture Bug — sport
  bug28, // Session Bug — minimal

  // Award marks — winner, nominee, champion (type: award-bug).
  bug29, // House Award Bug — noacg
  bug30, // Gala Award Bug — glass
  bug31, // Champion Bug — sport
  bug32, // Laurel Bug — minimal

  // Location / status chips — where the camera is (type: status-chip).
  bug33, // House Location Chip — noacg
  bug34, // Frost Location Chip — glass
  bug35, // Venue Chip — sport
  bug36, // Quiet Location Chip — minimal
  bug37, // House Temp — the weather pack's corner temperature bug (noacg)
  // The three game-show families' logo-only marks (type: logo-bug)
  bug38, // Sticker Mark - the mark on a small paper label (sibling lt68)
  bug39, // Showtime Mark - the mark on a small marquee plaque (sibling lt69)
  bug40, // Arcade Mark - the mark in a pixel-cornered neon frame (sibling lt70)
];

export function cornerBugById(id: string): TemplateVariant | undefined {
  return CORNER_BUGS.find((v) => v.id === id);
}
