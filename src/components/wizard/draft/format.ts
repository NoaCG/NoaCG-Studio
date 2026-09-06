// The draft's PROJECT-FORMAT helpers, held apart from ./core.ts so they are a leaf every
// capability can read (docs/WORKFLOW_ARCHITECTURE.md §5.5, wizard row 2).
//
// WHY THEY ARE NOT IN ./core.ts. Import-graphic sits behind ../import/index.ts, and ./core.ts
// reads that index for the capability's build passes - so any VALUE edge from an import step
// back into ./core.ts closes a cycle ./core.ts -> ../import -> <step> -> ./core.ts, which
// `no-circular` in .dependency-cruiser.cjs refuses (it tolerates only cycles carrying a
// type-only edge). Every import step but one already reaches ./core.ts for types alone;
// ImportStep CALLS these two, which is the one value edge. Living here, they carry a
// type-only edge back and the cycle is gone. Anything else a capability step calls at
// runtime belongs here for the same reason.

import {
  DEFAULT_GRAPHICS_FORMAT,
  projectFormatById,
  type ProjectFormatSelection,
} from '../../../model/projectFormat';
import type { DraftPatch, WizardDraft } from './core';

export function draftFormatSelection(draft: WizardDraft): ProjectFormatSelection {
  const preset = projectFormatById(draft.resolutionId);
  if (preset?.aspectId === draft.aspectId) {
    return { aspectId: draft.aspectId, resolutionId: preset.id, fps: draft.fps };
  }
  return DEFAULT_GRAPHICS_FORMAT;
}

export function formatDraftPatch(selection: ProjectFormatSelection): DraftPatch {
  return { ...selection, formatTouched: true };
}
