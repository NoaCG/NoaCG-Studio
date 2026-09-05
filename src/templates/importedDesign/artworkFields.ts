// The ARTWORK'S OWN FIELDS of an imported SVG, as SPX DataFields: one per bound text layer,
// numeric samples as real number fields, the countdown layer as its LENGTH in minutes, and the
// picture layers after the text. Split out of svg.ts so the behaviour compiler can read the same
// list without importing the assembler that imports it.

import { clockSampleMinutes } from '../../assets/svgImport';
import type { SpxField } from '../../model/types';
import type { DesignSvg } from '../../model/wizard';

/** The ONE countdown field of a design (plan P2 "clock ftype"): the first text layer bound
 *  as a countdown, or -1. One, because the shared clock runtime (templates/shared/clock.ts)
 *  drives one display; a second countdown choice binds as plain text. */
export function countdownIndex(svg: DesignSvg): number {
  return svg.fields.findIndex((f) => f.countdown);
}

/** The SPX DataFields: one per bound text layer (numeric samples as real number fields;
 *  the countdown layer as its LENGTH in minutes, the drawn readout converted - "10:00" is
 *  ten), then one per bound picture layer. */
export function svgFields(svg: DesignSvg): SpxField[] {
  const clock = countdownIndex(svg);
  return [
    ...svg.fields.map((f, i): SpxField =>
      i === clock
        ? {
            field: `f${i}`,
            ftype: 'number',
            title: `${f.title} (minutes)`,
            value: String(clockSampleMinutes(f.sample) ?? 5),
          }
        : {
            field: `f${i}`,
            ftype: f.numeric ? 'number' : 'textfield',
            title: f.title,
            value: f.sample,
          },
    ),
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
