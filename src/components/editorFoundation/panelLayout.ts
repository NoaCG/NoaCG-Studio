export interface PanelLayout { project: number; inspector: number; timeline: number }
export type PanelSize = keyof PanelLayout;
export const PANEL_LAYOUT_KEY = 'spx-gfx-editor-layout';
export const PANEL_MIN = { project: 180, inspector: 240, timeline: 180 };
export const CANVAS_MIN = 240, WORKSPACE_MIN = 200, DIVIDER_SIZE = 6;
export const defaultPanelLayout = (height = 768): PanelLayout => ({ project: 230, inspector: 280, timeline: Math.round(Math.max(240, Math.min(340, height * .31))) });

export function parsePanelLayout(raw: string | null, height: number): PanelLayout {
  try {
    const value = JSON.parse(raw ?? 'null') as { v?: unknown; sizes?: PanelLayout } | null;
    const sizes = value?.sizes;
    if (value?.v === 1 && sizes && ['project', 'inspector', 'timeline'].every(key => {
      const n = sizes[key as PanelSize]; return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 10000;
    })) return { project: sizes.project, inspector: sizes.inspector, timeline: sizes.timeline };
  } catch { /* Invalid preferences do not block authoring. */ }
  return defaultPanelLayout(height);
}

/** Clamp the visible layout only; a smaller window never rewrites the retained preference. */
export function fitPanelLayout(preferred: PanelLayout, width: number, height: number, chrome: number, projectOpen: boolean) {
  const inspectorMax = Math.max(PANEL_MIN.inspector, width - CANVAS_MIN - (projectOpen ? PANEL_MIN.project + DIVIDER_SIZE * 2 : DIVIDER_SIZE));
  const inspector = Math.max(PANEL_MIN.inspector, Math.min(inspectorMax, preferred.inspector));
  const projectMax = Math.max(PANEL_MIN.project, width - CANVAS_MIN - inspector - DIVIDER_SIZE * 2);
  const timelineMax = Math.max(PANEL_MIN.timeline, height - chrome - WORKSPACE_MIN);
  return {
    sizes: { inspector, project: Math.max(PANEL_MIN.project, Math.min(projectMax, preferred.project)), timeline: Math.max(PANEL_MIN.timeline, Math.min(timelineMax, preferred.timeline)) },
    max: { inspector: inspectorMax, project: projectMax, timeline: timelineMax },
  };
}
