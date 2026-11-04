/**
 * The library as the walk sees it (walkState.ts `LibraryIo`): the name index, the effect rule,
 * the two writes, and the reimport half (import/draft.ts `reimportIo`). The Finish doors' save
 * (`saveBuiltGraphic`) and the editor door's reading (`reimportForEditor`) both take it, so the
 * two ask one library the same questions.
 */
import { graphicNameIndex, librarySaveEffect } from '../../../model/library';
import { saveCurrentGraphic, saveGraphicAs } from '../../../store/saveActions';
import { syncSampleData, useTemplateStore } from '../../../store/templateStore';
import { reimportIo } from '../import';
import type { LibraryIo } from './walkState';

export const walkLibrary = (): LibraryIo => ({
  index: graphicNameIndex,
  effect: librarySaveEffect,
  linkTo: (id) => useTemplateStore.getState().setSaved({ graphicId: id, dirty: true, status: 'idle' }),
  saveCurrent: (name) => saveCurrentGraphic({ name }),
  saveAs: (name) => saveGraphicAs(name, { kind: 'standalone' }),
  ...reimportIo(useTemplateStore, syncSampleData),
});
