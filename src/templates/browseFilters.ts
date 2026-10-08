// The Browse filters' shape and their empty value, apart from the search engine (./search.ts)
// so the wizard can hold filter state without loading the catalog the engine searches.

import type { StyleTag } from '../model/fonts';
import type {
  CapabilityId,
  CategoryGroupId,
  GraphicCategoryId,
  MotionIntensity,
  PlacementId,
  ProgrammeFamilyId,
  ProgrammeFormatId,
  StructureId,
} from '../model/taxonomy';

export type FieldBucket = '1' | '2' | '3' | '4-5' | '6+' | 'repeating';

export interface BrowseFilters {
  query: string;
  /** Ranking facet — never hides (proposal §13.1). */
  family: ProgrammeFamilyId | null;
  format: ProgrammeFormatId | null;
  /** Strict facets. `group` is the lead dropdown's shelf (model/taxonomy.ts
   *  CATEGORY_GROUPS); `category` narrows further to one member category via the group's
   *  refinement chips. A set category always implies its group's result or narrower, so the
   *  two compose without ordering rules. */
  group: CategoryGroupId | null;
  category: GraphicCategoryId | null;
  fieldBucket: FieldBucket | null;
  style: StyleTag | null;
  structures: StructureId[];
  capabilities: CapabilityId[];
  placement: PlacementId | null;
  intensity: MotionIntensity | null;
}

export const NO_BROWSE_FILTERS: BrowseFilters = {
  query: '',
  family: null,
  format: null,
  group: null,
  category: null,
  fieldBucket: null,
  style: null,
  structures: [],
  capabilities: [],
  placement: null,
  intensity: null,
};
