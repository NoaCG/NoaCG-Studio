// The canonical editable-field vocabulary shared across the product's two authoring worlds.
//
// NoaCG has one idea of "an editable field the operator changes without touching code" that
// shows up in two places today: an SPX template's DataFields (model/types.ts SpxField ->
// control/controlModel.ts operator controls) and an AI video project's editable inputs
// (model/videoTypes.ts VideoInput -> the Content panel). Both mapped an ftype/type onto a
// control independently, and the two lists were free to drift. This module is the single
// source of truth for the KINDS of control a field can get, so "the field types the product
// supports" is defined once and every surface references it - the groundwork for one shared
// Template Definition across Remotion, SPX, and operator controls.
//
// The kinds are the union across both worlds:
//   text    - a single line of copy (SPX textfield; a video text input)
//   lines   - a line-list editor (SPX textarea: ticker items, credits, a schedule) [SPX only]
//   number  - a numeric stepper (SPX number; a video number input)
//   color   - a colour swatch + hex (SPX color; a video color input)
//   select  - a fixed set of choices (SPX dropdown; a video select input)
//   toggle  - a boolean switch (SPX checkbox) [SPX only]
//   image   - a picker that references an image by name (SPX filelist; a video image input)
//
// A given world uses a subset: the video Template Definition exposes text/number/color/
// select/image; the SPX operator panel adds lines/toggle for its textarea/checkbox ftypes.
export type FieldKind = 'text' | 'lines' | 'number' | 'color' | 'select' | 'toggle' | 'image';

/** The subset of FieldKind the AI video Template Definition (VideoInput) exposes. */
export type VideoFieldKind = Extract<FieldKind, 'text' | 'number' | 'color' | 'select' | 'image'>;

/**
 * A field's value. Numbers stay numbers in the world that types them (a video number input);
 * SPX sample data is a flat string map, so the SPX surfaces stringify at the boundary. A
 * control always emits its kind's natural type - a number for `number`, a string otherwise.
 */
export type FieldValue = string | number;

/** One choice of a `select` field. */
export interface FieldOption {
  label: string;
  value: string;
}

/**
 * Everything a control needs to render ONE editable field - the shared shape both worlds
 * adapt into: an SPX DataField becomes a descriptor via control/controlModel.ts
 * `fieldDescriptors`, and a video project's VideoInput via model/videoTypes.ts
 * `videoInputDescriptor`. Every surface that lets a human change a field renders descriptors,
 * never raw fields, so the SPX Data panel, the SPX operator panel, and the video Content panel
 * are literally the same component (components/fields/FieldControl.tsx) and cannot drift. The
 * standalone controlpanel.html export renders the same descriptors in dependency-free vanilla
 * JS (control/controlPanelHtml.ts) - keep that renderer in step with this one.
 */
export interface FieldDescriptor {
  /** The field's identity in its own world: 'f0' (SPX) or the `fields.<key>` prop (video). */
  key: string;
  /** The human label the operator sees. */
  label: string;
  kind: FieldKind;
  /** The authored default: the code fallback and the per-field Reset target. */
  defaultValue: FieldValue;
  /** `select` only: the allowed choices. */
  options?: FieldOption[];
  /** `number` only: advisory bounds. A DECLARED step also fixes the stepper's increment; a
   *  field that declares none (every SPX number field) lets the operator pick the bump size. */
  min?: number;
  max?: number;
  step?: number;
  /** A field a foreign OGraf manifest declares (E1.2a): a source's value reaches it as the JSON it
   *  is (control/sourceMapping.ts `projectSource`), never as text. Only the source route's
   *  descriptors carry it, read from the published panel (api/_lib/dataTick.ts `descriptorsOf`). */
  typed?: true;
}

/** Clamp a number to a descriptor's advisory bounds. */
export function clampToField(d: FieldDescriptor, n: number): number {
  let v = n;
  if (d.min != null) v = Math.max(d.min, v);
  if (d.max != null) v = Math.min(d.max, v);
  return v;
}
