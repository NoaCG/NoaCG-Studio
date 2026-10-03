// A ⚡ BUTTON THAT NAMES WHO IT ACTS ON: `{field|fallback}` inside a control label.
//
// A duel score's point buttons read "+1 ANNA" and "+1 SAM" rather than "Point to player 1": the
// operator looks for the name the audience sees, not for a position. So a declared label may name
// a field in braces, `+1 {f0|P1}`, and a surface that knows what is ON AIR shows that field's
// on-air value in its place. Everything else - an export, a hardware panel, the authoring
// surfaces - reads the plain label, the fallback in place of the braces ("+1 P1"), which is why
// `machineControls` hands every consumer that plain reading as `label` and keeps the declared text
// beside it only when it names a field.
//
// THIS MODULE IMPORTS NOTHING, so `scripts/control-labels.test.mjs` loads it with one
// `transpileModule` call. Keep it that way.

/** `{key}` or `{key|fallback}`. A key is a field id or a type's logical key. */
const FIELD_RE = /\{([A-Za-z_][\w-]*)(?:\|([^{}]*))?\}/g;

/** A short label reads at a glance on a live button; a longer one is a sentence. The validator
 *  warns above this many characters of the plain reading (`plainLabel`). */
export const CONTROL_LABEL_MAX = 16;

/** The fields a label names, in the order it names them. */
export function labelFields(label: string): { key: string; fallback: string }[] {
  return [...label.matchAll(FIELD_RE)].map((m) => ({ key: m[1], fallback: (m[2] ?? '').trim() }));
}

/** Rewrite each named field's key (a type's logical key to the `fN` id it compiled to). Answers
 *  null when `rename` does not know a key, so the caller can say which control named it. */
export function renameLabelFields(label: string, rename: (key: string) => string | undefined): string | null {
  let unknown = false;
  const out = label.replace(FIELD_RE, (_whole, key: string, fallback?: string) => {
    const id = rename(key);
    if (!id) unknown = true;
    return fallback === undefined ? `{${id}}` : `{${id}|${fallback}}`;
  });
  return unknown ? null : out;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The label with every named field read as its fallback: what a surface with no on-air values
 *  shows, and what the length warning measures. */
export function plainLabel(label: string): string {
  return tidy(label.replace(FIELD_RE, (_whole, _key, fallback?: string) => fallback ?? ''));
}

/**
 * Each label with its named fields read from what is ON AIR.
 *
 * `values` is what the graphic was last SENT (field id -> value), or null when nothing is on air;
 * an unsent edit is never read, so a button cannot name a player the audience does not see. A
 * field that is empty on air reads as its fallback. Two fields that read the SAME (two players both
 * called ANNA) read as fallback plus value, "P1 ANNA" and "P2 ANNA", so the two buttons can still
 * be told apart. A label naming no field comes back unchanged.
 */
export function liveLabels(labels: string[], values: Record<string, string> | null): string[] {
  const fallbackOf = new Map<string, string>();
  for (const label of labels) for (const f of labelFields(label)) if (!fallbackOf.has(f.key)) fallbackOf.set(f.key, f.fallback);
  if (fallbackOf.size === 0) return labels;
  const onAir = new Map([...fallbackOf.keys()].map((key) => [key, tidy(String(values?.[key] ?? ''))]));
  const shared = (key: string) => {
    const v = onAir.get(key)!.toLowerCase();
    return !!v && [...onAir].some(([other, value]) => other !== key && value.toLowerCase() === v);
  };
  const read = (key: string, fallback: string) => {
    const v = onAir.get(key)!;
    if (!v) return fallback;
    return shared(key) && fallback ? `${fallback} ${v}` : v;
  };
  return labels.map((label) =>
    tidy(label.replace(FIELD_RE, (_whole, key: string, fallback?: string) => read(key, (fallback ?? fallbackOf.get(key) ?? '').trim()))),
  );
}

/** The buttons with every field-naming label read from what is on air (`liveLabels`), for a
 *  surface that knows. A button whose label names no field is returned as it was. */
export function withLiveLabels<T extends { label: string; labelTemplate?: string }>(
  buttons: T[],
  values: Record<string, string> | null,
): T[] {
  if (!buttons.some((b) => b.labelTemplate)) return buttons;
  const read = liveLabels(buttons.map((b) => b.labelTemplate ?? b.label), values);
  return buttons.map((b, i) => (b.labelTemplate ? { ...b, label: read[i] } : b));
}
