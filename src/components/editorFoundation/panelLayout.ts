import type { PanelLayout } from '../../model/editorPanelLayout';
export { defaultPanelLayout, readPanelLayout, encodePanelLayout, PANEL_LAYOUT_KEY } from '../../model/editorPanelLayout';
export type { PanelLayout } from '../../model/editorPanelLayout';
export type PanelSize = keyof PanelLayout;
export const PANEL_MIN = { project: 180, inspector: 240, timeline: 180 };
export const CANVAS_MIN = 240, WORKSPACE_MIN = 200, DIVIDER_SIZE = 6;
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
