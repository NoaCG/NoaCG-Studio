// The ARTWORK'S OWN FIELDS of an imported SVG, as SPX DataFields: one per bound text layer,
// numeric samples as real number fields, the countdown layer as its LENGTH in minutes, the
// credits layer as the whole list in one multi-line box, and the picture layers after the text.
// Split out of svg.ts so the behaviour compiler can read the same list without importing the
// assembler that imports it.

import { clockSampleMinutes } from '../../assets/svgImport';
import type { SpxField } from '../../model/types';
import type { DesignSvg } from '../../model/wizard';
import { asClockMode, clockReadout, type ClockMode } from '../behaviours/clock';
import { creditsArtworkFields, creditsIndex, creditsSampleText } from './creditsRoll';

/** The design's CLOCK (templates/behaviours/clock.ts): the field its time layer is, and its mode,
 *  or null. A clock whose layer is no longer a field is no clock, as the compiler reads it
 *  (behaviour.ts). Its field stays the operator's text field: typing a time corrects the clock. */
export function boundClock(svg: DesignSvg): { index: number; mode: ClockMode; count: 'up' | 'down'; start: string } | null {
  const extra = (svg.extras ?? []).find((e) => e.kind === 'clock');
  if (!extra || extra.kind !== 'clock') return null;
  const index = svg.fields.findIndex((f) => f.candidateId === extra.field);
  if (index === -1) return null;
  const mode = asClockMode(extra.mode);
  return { index, mode, ...clockReadout(mode, svg.fields[index].sample) };
}

/** The ONE countdown field of a design (plan P2 "clock ftype"): the first text layer bound
 *  as a countdown, or -1. One, because the shared clock runtime (templates/shared/clock.ts)
 *  drives one display; a second countdown choice binds as plain text. A design that carries the
 *  CLOCK has no countdown field at all: one clock engine per graphic, and the clock's is the
 *  match clock, so a layer still flagged as a countdown binds as plain text too. */
export function countdownIndex(svg: DesignSvg): number {
  if (boundClock(svg)) return -1;
  return svg.fields.findIndex((f) => f.countdown);
}

/** The SPX DataFields: one per bound text layer (numeric samples as real number fields;
 *  the countdown layer as its LENGTH in minutes, the drawn readout converted - "10:00" is
 *  ten; the credits layer as ONE textarea holding the sample's lines), then one per bound
 *  picture layer. */
export function svgFields(svg: DesignSvg): SpxField[] {
  const clock = countdownIndex(svg);
  const credits = creditsIndex(svg);
  const artworkCredits = creditsArtworkFields(svg);
  return [
    ...svg.fields.map((f, i): SpxField => {
      // Keep stable field ids for the shared behavior compiler, but offer no editable control
      // for immutable artwork. Its empty holder never writes into the original text.
      if (artworkCredits.has(i)) return { field: `f${i}`, ftype: 'hidden', title: f.title, value: '' };
      if (i === clock) {
        return {
          field: `f${i}`,
          ftype: 'number',
          title: `${f.title} (minutes)`,
          value: String(clockSampleMinutes(f.sample) ?? 5),
        };
      }
      if (i === credits) {
        // The whole credit list in one box, one line per drawn baseline (docs/END_CREDITS.md):
        // the operator pastes into it, and the drawn layer becomes the sample the looks are
        // read from (creditsRoll.ts), never a field id.
        return { field: `f${i}`, ftype: 'textarea', title: f.title, value: creditsSampleText(svg) };
      }
      return {
        field: `f${i}`,
        ftype: f.numeric ? 'number' : 'textfield',
        title: f.title,
        value: f.sample,
      };
    }),
    ...svg.images.map((f, i): SpxField => ({
      field: `f${svg.fields.length + i}`,
      ftype: 'filelist',
      title: f.title,
      value: '',
      // The SPX picker lists the project's images/ folder, like every image field.
      assetfolder: './images/',
      extension: 'png',
    })),
  ];
}
