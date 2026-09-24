// The ARTWORK'S OWN FIELDS of an imported SVG, as SPX DataFields: one per bound text layer,
// numeric samples as real number fields, the countdown layer as its LENGTH in minutes, the
// credits layer as the whole list in one multi-line box, and the picture layers after the text.
// Split out of svg.ts so the behaviour compiler can read the same list without importing the
// assembler that imports it.

import { clockSampleMinutes } from '../../assets/svgImport';
import type { SpxField } from '../../model/types';
import type { DesignSvg } from '../../model/wizard';
import { creditsIndex, creditsSampleText } from './creditsRoll';

/** The ONE countdown field of a design (plan P2 "clock ftype"): the first text layer bound
 *  as a countdown, or -1. One, because the shared clock runtime (templates/shared/clock.ts)
 *  drives one display; a second countdown choice binds as plain text. */
export function countdownIndex(svg: DesignSvg): number {
  return svg.fields.findIndex((f) => f.countdown);
}

/** The SPX DataFields: one per bound text layer (numeric samples as real number fields;
 *  the countdown layer as its LENGTH in minutes, the drawn readout converted - "10:00" is
 *  ten; the credits layer as ONE textarea holding the sample's lines), then one per bound
 *  picture layer. */
export function svgFields(svg: DesignSvg): SpxField[] {
  const clock = countdownIndex(svg);
  const credits = creditsIndex(svg);
  return [
    ...svg.fields.map((f, i): SpxField => {
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
