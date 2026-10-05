// Central state for the video editor (zustand), mirroring templateStore's contracts:
// applyProject is the undoable mutation choke point (AI results, settings patches, asset
// changes all snapshot for undo), setSource is manual typing into the engine's source
// field (no history spam - Monaco's own undo covers keystrokes), and an 800 ms-debounced
// subscription autosaves the project.
// Completely parallel to templateStore: the SPX store never sees video state or vice versa.

import { create } from 'zustand';
import type { AssetFile } from '../model/types';
import type { ReferencePurpose } from '../model/imagePurpose';
import type { VideoChatMessage, VideoInput, VideoProject } from '../model/videoTypes';
import { createDefaultVideoProject, withVideoSource } from '../model/videoTypes';
import { loadCurrentVideoProject, saveCurrentVideoProject } from '../model/videoProject';
import { canAuthorAccount, commitDurableWrites } from '../model/durableStore';

export type VideoPanelTab = 'chat' | 'content' | 'settings' | 'assets' | 'export';

// Coalesces a run of edits to the SAME input into ONE undo checkpoint (a colour drag, a
// headline typed character by character). Any other mutation clears it (via resetCoalesce)
// so the next field edit starts a fresh checkpoint - see setInputValue.
let inputEditKey: string | null = null;
function resetCoalesce(): void {
  inputEditKey = null;
}

interface VideoProjectState {
  project: VideoProject;
  /** Snapshots taken before each apply, for undo (30-cap, like templateStore). */
  history: VideoProject[];
  /** Undone snapshots for redo; any NEW edit clears it (the classic undo-tree cut). */
  future: VideoProject[];
  /** The side panel's active tab in the video shell. */
  activePanel: VideoPanelTab;
  /** Latest compile/runtime error from the preview pipeline (null = healthy). */
  previewError: string | null;
  /** Bumped after an AI apply so the player restarts from frame 0. */
  replayNonce: number;
  /** Label of the AI stage in flight ('Planning motion…'), or null. Blocks concurrent sends. */
  busy: string | null;
  /** A refinement another panel wants run (the Settings panel's "update the code" offer).
   *  The CHAT panel picks it up and runs it down the ONE AI path - so the turn shows up in
   *  the conversation, and failures, undo, and "apply anyway" all behave as they always do. */
  pendingRequest: string | null;
  /** True when the last autosave failed (storage quota) - the shell shows a warning. */
  autosaveFailed: boolean;

  /** Replace the whole document (wizard create, reopen). Clears history - a clean break. */
  loadProject: (project: VideoProject) => void;
  /** Undoable apply - AI results (tsx + plan + chat in ONE snapshot), asset changes. */
  applyProject: (next: VideoProject) => void;
  /** Undoable settings change (duration/fps/size/name/transparent/model/exportPrefs). */
  patchSettings: (patch: Partial<VideoProject>) => void;
  /** Edit one editable input's value. Consecutive edits to the SAME key coalesce into one
   *  undo checkpoint (so a colour drag or typed headline is a single undo). Takes the whole
   *  input, not just its key, because the panel also shows inputs INFERRED from the code
   *  (model/videoInputInfer.ts) that the project has never declared - editing one adopts it
   *  into the project there and then. */
  setInputValue: (input: VideoInput, value: string | number) => void;
  /** Reset every editable input to its declared default - ONE undoable checkpoint. */
  resetInputs: () => void;
  /** Manual code typing into the project's live source (tsx or html, whichever the
   *  engine reads): no history snapshot (Monaco native undo), clears redo. */
  setSource: (source: string) => void;
  /** Append a chat message without a snapshot (optimistic user turns, error notes). */
  appendChat: (msg: VideoChatMessage) => void;
  /** Drop the last chat message (roll back an optimistic user turn on failure). */
  dropLastChat: () => void;
  addAsset: (asset: AssetFile) => void;
  removeAsset: (path: string) => void;
  /** What an upload is FOR (model/imagePurpose.ts). Undefined = composition material. */
  setAssetUse: (path: string, use: ReferencePurpose | undefined) => void;
  undo: () => void;
  redo: () => void;
  setActivePanel: (tab: VideoPanelTab) => void;
  setPreviewError: (error: string | null) => void;
  requestReplay: () => void;
  setBusy: (label: string | null) => void;
  setAutosaveFailed: (failed: boolean) => void;
  /** Ask the AI for a change from outside the chat (reveals the Chat tab; the panel runs it). */
  requestAi: (request: string) => void;
  clearPendingRequest: () => void;
}

const initialProject = loadCurrentVideoProject() ?? createDefaultVideoProject();

export const useVideoProjectStore = create<VideoProjectState>((rawSet) => {
  const set = (patch: Partial<VideoProjectState> | ((state: VideoProjectState) => Partial<VideoProjectState>)) => rawSet(state => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    return !canAuthorAccount() && 'project' in next ? {} : next;
  });
  return {
  project: initialProject,
  history: [],
  future: [],
  activePanel: 'chat',
  previewError: null,
  replayNonce: 0,
  busy: null,
  autosaveFailed: false,
  pendingRequest: null,

  loadProject: (project) => {
    // Creation/reopen persists IMMEDIATELY (not on the typing debounce): a reload right
    // after creating must restore the new project, and docKind's boot guard checks the
    // slot synchronously.
    resetCoalesce();
    saveCurrentVideoProject(project);
    set({
      project,
      history: [],
      future: [],
      previewError: null,
      busy: null,
      pendingRequest: null,
      activePanel: 'chat',
    });
  },

  applyProject: (next) => {
    resetCoalesce();
    set((s) => ({
      project: next,
      history: [...s.history, s.project].slice(-30),
      future: [],
    }));
  },

  patchSettings: (patch) => {
    resetCoalesce();
    set((s) => ({
      project: { ...s.project, ...patch },
      history: [...s.history, s.project].slice(-30),
      future: [],
    }));
  },

  setInputValue: (input, value) =>
    set((s) => {
      const declared = s.project.inputs.some((i) => i.key === input.key);
      // An input the code declares but the project doesn't (inferred from a `fields.x ?? default`
      // read) is adopted on its first edit: until someone changes it, the code's own fallback is
      // the value, so there is nothing to store.
      const inputs = declared
        ? s.project.inputs.map((i) => (i.key === input.key ? { ...i, value } : i))
        : [...s.project.inputs, { ...input, value }];
      // Coalesce a run of edits to the same key: reuse the checkpoint made on the first edit
      // of the run (don't push another). Any other mutation cleared inputEditKey first.
      const coalesce = inputEditKey === input.key;
      inputEditKey = input.key;
      return {
        project: { ...s.project, inputs },
        history: coalesce ? s.history : [...s.history, s.project].slice(-30),
        future: [],
      };
    }),

  resetInputs: () => {
    resetCoalesce();
    set((s) => ({
      project: { ...s.project, inputs: s.project.inputs.map((i) => ({ ...i, value: i.default })) },
      history: [...s.history, s.project].slice(-30),
      future: [],
    }));
  },

  setSource: (source) => {
    resetCoalesce();
    set((s) => ({ project: withVideoSource(s.project, source), future: [] }));
  },

  appendChat: (msg) =>
    set((s) => ({ project: { ...s.project, chat: [...s.project.chat, msg] } })),

  dropLastChat: () =>
    set((s) => ({ project: { ...s.project, chat: s.project.chat.slice(0, -1) } })),

  addAsset: (asset) => {
    resetCoalesce();
    set((s) => ({
      project: {
        ...s.project,
        assets: [...s.project.assets.filter((a) => a.path !== asset.path), asset],
      },
      history: [...s.history, s.project].slice(-30),
      future: [],
    }));
  },

  removeAsset: (path) => {
    resetCoalesce();
    set((s) => {
      // The tag goes with the file. A stale entry would re-tag the next upload that happened
      // to reuse the path, turning someone's logo into a mood board.
      const { [path]: _dropped, ...assetUses } = s.project.assetUses ?? {};
      return {
        project: {
          ...s.project,
          assets: s.project.assets.filter((a) => a.path !== path),
          ...(Object.keys(assetUses).length ? { assetUses } : { assetUses: undefined }),
        },
        history: [...s.history, s.project].slice(-30),
        future: [],
      };
    });
  },

  setAssetUse: (path, use) => {
    resetCoalesce();
    set((s) => {
      const { [path]: _previous, ...rest } = s.project.assetUses ?? {};
      const assetUses = use ? { ...rest, [path]: use } : rest;
      return {
        project: {
          ...s.project,
          // Absent rather than empty: an absent map IS "every asset is composition material",
          // and writing `{}` would persist a difference that means nothing.
          assetUses: Object.keys(assetUses).length ? assetUses : undefined,
        },
        history: [...s.history, s.project].slice(-30),
        future: [],
      };
    });
  },

  undo: () => {
    resetCoalesce();
    set((s) => {
      if (s.history.length === 0) return {};
      const prev = s.history[s.history.length - 1];
      return {
        project: prev,
        history: s.history.slice(0, -1),
        future: [...s.future, s.project].slice(-30),
      };
    });
  },

  redo: () => {
    resetCoalesce();
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[s.future.length - 1];
      return {
        project: next,
        history: [...s.history, s.project].slice(-30),
        future: s.future.slice(0, -1),
      };
    });
  },

  setActivePanel: (activePanel) => set({ activePanel }),
  setPreviewError: (previewError) => set({ previewError }),
  requestReplay: () => set((s) => ({ replayNonce: s.replayNonce + 1 })),
  setBusy: (busy) => set({ busy }),
  setAutosaveFailed: (autosaveFailed) => set({ autosaveFailed }),

  requestAi: (request) => set({ pendingRequest: request, activePanel: 'chat' }),
  clearPendingRequest: () => set({ pendingRequest: null }),
  };
});

// Autosave the working video project (debounced) whenever the document changes, mirroring
// templateStore's autosaver. A failed save (video assets are big) raises a visible flag
// instead of losing work silently.
//
// The write is CONFIRMED, not assumed: the durable store takes it optimistically and reports a
// refusal a moment later (model/durableStore.ts), so `saveCurrentVideoProject` returning true
// only means it was accepted. `commitDurableWrites` waits for the real answer and claims it -
// which is also what keeps the shell's own warning the thing the user sees, rather than the
// app-level "Could not save" dialog talking over it about a background autosave.
let videoSaveTimer: ReturnType<typeof setTimeout> | null = null;
function flushPendingVideo() {
  if (!videoSaveTimer) return;
  clearTimeout(videoSaveTimer);
  videoSaveTimer = null;
  saveCurrentVideoProject(useVideoProjectStore.getState().project);
}
if (typeof window !== 'undefined') {
  window.addEventListener('noacg-account-authoring-pausing', flushPendingVideo);
  window.addEventListener('noacg-account-authoring-flush', flushPendingVideo);
}
useVideoProjectStore.subscribe((state, prev) => {
  if (state.project === prev.project) return;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spx-account-edit-pending'));
  if (videoSaveTimer) clearTimeout(videoSaveTimer);
  videoSaveTimer = setTimeout(() => {
    videoSaveTimer = null;
    const accepted = saveCurrentVideoProject(useVideoProjectStore.getState().project);
    void (accepted ? commitDurableWrites() : Promise.resolve('refused')).then((failure) => {
      const failedNow = !!failure;
      if (useVideoProjectStore.getState().autosaveFailed !== failedNow) {
        useVideoProjectStore.getState().setAutosaveFailed(failedNow);
      }
    });
  }, 800);
});
