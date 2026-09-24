// The document-kind switch: whether the working project is an SPX graphic or a video.
// Persisted so a reload restores the world you were working in. App.tsx no longer picks a shell
// from it: the old code editor it used to choose is closed, and the video shell has #/video.

import { create } from 'zustand';
import type { DocKind } from '../model/videoTypes';
import { loadDocKind, saveDocKind } from '../model/docKind';

interface DocKindState {
  kind: DocKind;
  setKind: (kind: DocKind) => void;
}

export const useDocKindStore = create<DocKindState>((set) => ({
  kind: loadDocKind(),
  setKind: (kind) => {
    saveDocKind(kind);
    set({ kind });
  },
}));
