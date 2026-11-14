import { DEFAULT_GRAPHICS_FORMAT, DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';
import type { Resolution, SpxTemplate } from '../model/types';
import { neutralSpineFor } from './types/neutralDesign';

/** An empty, fully authorable graphic on the existing source/runtime contract. */
export function createBlankTemplate(res: Resolution = DEFAULT_GRAPHICS_RESOLUTION, fps = DEFAULT_GRAPHICS_FORMAT.fps): SpxTemplate {
  return neutralSpineFor([], { name: 'Untitled graphic', lines: [], resolution: res, fps });
}
