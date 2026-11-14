/** Versioned editor layout preferences; unknown records remain owned by their newer reader. */
export interface PanelLayout { project: number; inspector: number; timeline: number }
export const PANEL_LAYOUT_KEY = 'spx-gfx-editor-layout';
const VERSION = 1;
export const defaultPanelLayout = (height = 768): PanelLayout => ({ project: 230, inspector: 280, timeline: Math.round(Math.max(240, Math.min(340, height * .31))) });
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
function record(raw: string | null) {
  try { return object(JSON.parse(raw ?? 'null')); } catch { return null; }
}
const writable = (value: Record<string, unknown> | null) => !value || !Object.prototype.hasOwnProperty.call(value, 'v') || value.v === VERSION;
function sizesOf(value: unknown): PanelLayout | null {
  const sizes = object(value);
  if (!sizes || !['project', 'inspector', 'timeline'].every(key => typeof sizes[key] === 'number' && Number.isFinite(sizes[key]) && sizes[key] > 0 && sizes[key] <= 10000)) return null;
  return { project: sizes.project as number, inspector: sizes.inspector as number, timeline: sizes.timeline as number };
}
export function readPanelLayout(raw: string | null, height: number): { sizes: PanelLayout; writable: boolean } {
  const value = record(raw), allowed = writable(value);
  return { sizes: allowed && value?.v === VERSION ? sizesOf(value.sizes) ?? defaultPanelLayout(height) : defaultPanelLayout(height), writable: allowed };
}
/** Re-read before every write, including when another build supplied a newer record mid-session. */
export function encodePanelLayout(raw: string | null, sizes: PanelLayout): string | null {
  const value = record(raw);
  if (!writable(value) || !sizesOf(sizes)) return null;
  const current = value?.v === VERSION ? value : {};
  return JSON.stringify({ ...current, v: VERSION, sizes: { ...object(current.sizes), ...sizes } });
}
