// A FOLDER'S TAKE, OUT AND STEP, and how Out, All out and the session's end stop one still being
// sent (docs/CLIP_PLAYBACK_PLAN.md §6.6 and §20.1; production-page refactor spec §2, §4.2).
//
// Moved out of ProductionPage with its order, sentences and bookkeeping unchanged (production-page
// refactor, phase 10). What the folders remember lives in the session's `folders` part: where each
// One-by-one folder's step stands, why the last folder Take missed each cue, and which folders are
// still being sent. The runs themselves, each with its stop flag, are this module's: nothing draws
// them, and Out, All out and the session's end set the flag synchronously, so a run reads it between
// members and after every answer. A run stopped by Out or All out sends nothing more, and a member
// whose take lands after the stop is taken back off (cut after All out). A run stopped by the
// session's end sends nothing at all: what the server already accepted stands (§4.1 R3).
//
// The page's refs and callbacks, mapped:
//
//   folderRuns (a ref)            the runs here; `running(id)` and `stopAll(reason)`
//   folderSteps, takeMisses,      the `folders` part, written with one `session.apply` each
//   sendingFolders (page state)
//   clearMisses, noteStep         `clearMisses(ids)`, `noteStep(cue)`
//   hearCommand's misses fold     `settleMisses(settle)`: a failed send that landed after all
//   takeFolder, outFolder,        `take(folder)`, `out(folder)`, `step(folder)`, `off(cues)`
//   stepFolder, stepOff
//
// The verbs a folder sends with (`serverVerb`, `takeGraphic`, `takeCue`, `send`) and the live map
// (`liveCueOf`, `setLiveCue`, the session's `air` part as the page draws it) come in through
// `page`, read once at each press so a press sees the render it was made from, as the page's
// closures did. The clock comes in through `io`. Runtime imports carry `.ts` so
// Node resolves them (scripts/folder-playout.test.mjs); everything else is a type.

import type { PlayoutItem, ShowCue, ShowFolder } from '../model/shows';
import type { ControlSendItem } from './hostedControl';
import type { LiveCueMap, VerbSent } from './liveCue';
import type { FoldersPart, PlayoutSession } from './playoutSession';
import type { FolderRundown, GraphicMember, MemberResult, MemberTake, SequenceMember, ServerVerb, ServerVerbOutcome } from './serverPlayout';
import type { ServerOwnership } from './serverState';
import { folderMode } from '../model/showFolders.ts';
import { clearAllCueBatches, clearCueItems } from './cueItems.ts';
import { cueOnAir } from './folderAir.ts';
import { folderStep, type StepMember } from './folderStep.ts';
import { leftAlone, pressOuts, withLiveCue } from './liveCue.ts';
import { clockRank, runTogether, togetherNote, togetherPlan } from './serverPlayout.ts';

/** Why a run stopped: Out on its folder, All out (what lands after is cut), or the session's end
 *  (nothing more is sent at all). */
export type StopReason = 'out' | 'all-out' | 'ended';

interface Run {
  stop: null | StopReason;
}

type Sent = ({ ok: true } & VerbSent) | { ok: false; note: string };

/** What the module needs from the page while the page still owns it (the phase's temporary
 *  interface), as its latest render has it. */
export interface FolderPage {
  cues: readonly ShowCue[];
  /** The rundown's folders and their cues in rundown order. */
  folders: ReadonlyMap<string, ShowFolder>;
  members: ReadonlyMap<string, readonly ShowCue[]>;
  items: readonly PlayoutItem[];
  itemOf: (cue: ShowCue) => PlayoutItem | null;
  graphicOf: (cue: ShowCue) => string | null;
  /** Where each One-by-one folder's step stands, as this render drew it (the PREVIEW and NEXT
   *  marks read the same). */
  folderSteps: FoldersPart['folderSteps'];
  /** A One-by-one folder's cues as its step reads them. */
  stepMembers: (folderId: string) => StepMember[];
  folderName: (folder: ShowFolder) => string;
  /** Why a Take of this folder or cue would not go, or null (control/takeBlockers.ts). */
  takeBlocker: (target: ShowCue | ShowFolder) => string | null;
  /** Why a step's next cue would not go, or null. */
  stepBlocker: (cue: ShowCue) => string | null;
  /** The rundown as an All-together plan reads it. */
  together: FolderRundown;
  /** The store's ownership part as it stands now. */
  ownership: () => ServerOwnership;
  liveCueOf: () => LiveCueMap;
  setLiveCue: (fold: (map: LiveCueMap) => LiveCueMap) => void;
  /** One verb on the playout server, reporting nothing; null when the cue has no item. */
  serverVerb: (cue: ShowCue, verb: ServerVerb, label: string, options?: { cut?: boolean; takenAt?: number }) => Promise<ServerVerbOutcome | null>;
  /** An Out on a graphic is a press on its live candidate's layer (control/selectionAir.ts
   *  `pressOuts`). */
  selectionAired?: (graphic: string, cueId: string, take: { status: 'none' }, moves: boolean) => { landed: () => void; undo: (failed?: { uncertain?: true; stale?: true }) => void };
  /** A graphic cue's Take, reporting nothing; null when its graphic is gone. */
  takeGraphic: (cue: ShowCue, label: string) => Promise<MemberTake | null>;
  /** A cue's own Take, as its TAKE button runs it. */
  takeCue: (cue: ShowCue) => Promise<void>;
  /** The page's sender (`sendVerb`). */
  send: (batches: ControlSendItem[][], label: string) => Promise<Sent>;
  /** Save the draft and close the history group. */
  flush: () => Promise<void>;
  note: (text: string) => void;
}

export interface FolderPlayoutIo {
  /** The clock a server take is stamped with (`performance.now`). */
  now: () => number;
}

export interface FolderPlayout {
  /** Take a Play-through or All-together folder. */
  take: (folder: ShowFolder) => Promise<void>;
  /** Take all of a folder off, each server cue with its own fade out and its graphics together. */
  out: (folder: ShowFolder) => Promise<void>;
  /** One press on a One-by-one folder. */
  step: (folder: ShowFolder) => Promise<void>;
  /** Take cues off for a step; false, with the note said, when one did not go off. */
  off: (cues: readonly ShowCue[]) => Promise<boolean>;
  /** Stop every folder still being sent. All out also sends every One-by-one folder to the top. */
  stopAll: (reason: 'all-out' | 'ended') => void;
  /** A folder's Take or step is still being sent. */
  running: (folderId: string) => boolean;
  /** Forget why these cues' last folder Take missed them: they were taken since, or taken off. */
  clearMisses: (ids: readonly string[]) => void;
  /** A cue of a One-by-one folder went on air, by whatever route: the folder's step stands on it. */
  noteStep: (cue: ShowCue) => void;
  /** A failed send landed after all: each member's failure it settled is no miss any more.
   *  `settle` answers null for a sentence it settled (./failedSends.ts `heard`). */
  settleMisses: (settle: (shown: string) => string | null) => void;
}

/** Move the `folders` part. */
function writeFolders(session: PlayoutSession, fold: (folders: FoldersPart) => FoldersPart) {
  session.apply((parts) => ({ ...parts, folders: fold(parts.folders) }));
}

export function createFolderPlayout(session: PlayoutSession, io: FolderPlayoutIo, page: () => FolderPage): FolderPlayout {
  const runs = new Map<string, Run>();
  /** Move one field of the part; a fold that answers the same object writes nothing. */
  const field = <K extends 'folderSteps' | 'takeMisses'>(key: K) => (fold: (m: FoldersPart[K]) => FoldersPart[K]) =>
    writeFolders(session, (f) => {
      const next = fold(f[key]);
      return next === f[key] ? f : { ...f, [key]: next };
    });
  const steps = field('folderSteps');
  const misses = field('takeMisses');

  const clearMisses = (ids: readonly string[]) =>
    misses((m) => (ids.some((id) => id in m) ? Object.fromEntries(Object.entries(m).filter(([id]) => !ids.includes(id))) : m));

  const noteStep = (cue: ShowCue) => {
    const folder = cue.folderId ? page().folders.get(cue.folderId) : undefined;
    if (folder && folderMode(folder) === 'manual') steps((m) => (m[folder.id] === cue.id ? m : { ...m, [folder.id]: cue.id }));
  };

  /** Whether a cue is on air now, from the store as it stands and liveCue as last set. */
  const onAirNow = (p: FolderPage, cue: ShowCue) => cueOnAir(cue, { items: p.items, ownership: p.ownership(), liveCue: p.liveCueOf(), graphicName: p.graphicOf });

  /** Run a folder's Take once at a time, and let Out and All out stop it. Nothing runs once the
   *  session has ended (it may have ended during the save wait). */
  const runFolder = async (folderId: string, work: (run: Run) => Promise<void>) => {
    if (!session.alive()) return;
    const run: Run = { stop: null };
    runs.set(folderId, run);
    writeFolders(session, (f) => ({ ...f, sending: new Set(f.sending).add(folderId) }));
    try {
      await work(run);
    } finally {
      runs.delete(folderId);
      writeFolders(session, (f) => {
        const sending = new Set(f.sending);
        sending.delete(folderId);
        return { ...f, sending };
      });
    }
  };

  /** Take back off a member whose take landed after Out or All out stopped its folder's Take. After
   *  the session's end nothing is sent: what the server accepted stands. */
  const offLate = async (p: FolderPage, m: SequenceMember | GraphicMember, reason: StopReason | null) => {
    if (reason === 'ended' || !session.alive()) return;
    const cut = reason === 'all-out';
    if ('item' in m) {
      const off = await p.serverVerb(m.cue, 'out', cut ? 'All out' : 'Out', cut ? { cut: true } : {});
      if (off && !off.ok) p.note(off.note);
      return;
    }
    const settle = p.selectionAired ? pressOuts(p.selectionAired, [m.graphic]) : null;
    const sent = await p.send([clearCueItems(m.graphic)], 'Out');
    settle?.(sent);
    if (!sent.ok) p.note(sent.note);
    else if (!leftAlone(sent).includes(m.graphic)) p.setLiveCue((lc) => withLiveCue(lc, m.graphic, null));
  };

  const take = async (folder: ShowFolder) => {
    const p = page();
    const members = p.members.get(folder.id) ?? [];
    const blocked = p.takeBlocker(folder);
    if (blocked) {
      p.note(`Take was not sent: ${blocked}`);
      return;
    }
    if (runs.has(folder.id)) return;
    await p.flush();
    await runFolder(folder.id, async (run) => {
      clearMisses(members.map((c) => c.id));
      if (folderMode(folder) === 'through') {
        const outcome = await p.serverVerb(members[0], 'take', `Take of ${p.folderName(folder)}`);
        if (!outcome) return;
        if (run.stop) {
          // Out came while the Take was on its way: what it put up goes back off.
          if (outcome.ok) for (const m of members) if (onAirNow(p, m)) await offLate(p, { cue: m, item: p.itemOf(m)! }, run.stop);
          return;
        }
        p.note(outcome.note);
        return;
      }
      const plan = togetherPlan(members, p.together);
      if (!plan.ok) {
        p.note(`Take was not sent: ${plan.reason}`);
        return;
      }
      // The clock follows the longest file that ends: each take is stamped by its rank.
      const t0 = io.now();
      const rank = clockRank(plan.server);
      const results: MemberResult[] = await runTogether(plan, {
        server: async (m) => (await p.serverVerb(m.cue, 'take', `Take of ${m.cue.label}`, { takenAt: t0 + (rank.get(m.cue.id) ?? 0) })) ?? { ok: false, note: `${m.cue.label} plays a file this production no longer lists.` },
        graphic: async (g) => (await p.takeGraphic(g.cue, `Take of ${g.cue.label}`)) ?? { ok: false, note: `${g.cue.label} points at a graphic this production no longer has.` },
        off: (m) => offLate(p, m, run.stop),
        stopped: () => run.stop !== null,
      });
      if (run.stop) return;
      misses((m) => ({ ...m, ...Object.fromEntries(results.filter((r) => !r.ok).map((r) => [r.cueId, r.note])) }));
      p.note(togetherNote(p.folderName(folder), results));
    });
  };

  /** Take these graphic cues' graphics off together, as one Out. The failure's sentence, or null. */
  const graphicsOff = async (p: FolderPage, graphicCues: readonly ShowCue[]): Promise<string | null> => {
    const graphics = [...new Set(graphicCues.map(p.graphicOf).filter((g): g is string => !!g))];
    if (!graphics.length) return null;
    const settle = p.selectionAired ? pressOuts(p.selectionAired, graphics) : null;
    const sent = await p.send(clearAllCueBatches(graphics), 'Out');
    settle?.(sent);
    if (!sent.ok) return sent.note;
    const off = graphics.filter((g) => !leftAlone(sent).includes(g));
    p.setLiveCue((m) => off.reduce((acc, g) => withLiveCue(acc, g, null), m));
    return null;
  };

  const out = async (folder: ShowFolder) => {
    const p = page();
    const run = runs.get(folder.id);
    if (run && !run.stop) run.stop = 'out';
    // A One-by-one folder taken off starts again from its first cue.
    steps((m) => (m[folder.id] === null ? m : { ...m, [folder.id]: null }));
    const members = p.members.get(folder.id) ?? [];
    clearMisses(members.map((c) => c.id));
    const notes: string[] = [];
    for (const cue of members.filter((c) => c.source === 'playout' && onAirNow(p, c))) {
      const off = await p.serverVerb(cue, 'out', `Out of ${cue.label}`);
      if (off && !off.ok) notes.push(off.note);
    }
    const graphicsFailed = await graphicsOff(p, members.filter((c) => c.source !== 'playout' && onAirNow(p, c)));
    if (graphicsFailed) notes.push(graphicsFailed);
    p.note(notes.length ? `Out: ${p.folderName(folder)} did not take all of it off. ${notes.join(' ')}` : `✓ Out: ${p.folderName(folder)}`);
  };

  const offWith = async (p: FolderPage, cues: readonly ShowCue[]): Promise<boolean> => {
    for (const cue of cues.filter((c) => c.source === 'playout')) {
      const res = await p.serverVerb(cue, 'out', `Out of ${cue.label}`);
      if (res && !res.ok) {
        p.note(res.note);
        return false;
      }
    }
    const failed = await graphicsOff(p, cues.filter((c) => c.source !== 'playout'));
    if (failed) p.note(failed);
    return !failed;
  };

  /**
   * ONE PRESS ON A ONE-BY-ONE FOLDER, decided again from the store as it stands at the press: the
   * folder's graphics that are up go off, then the next cue's own Take; or, at the end, the graphics
   * off and back to the top. A clip or audio file is never stopped. Nothing at all is sent when the
   * next cue could not be taken. Out and All out stop a press still being sent, as they stop a
   * folder's Take.
   */
  const step = async (folder: ShowFolder) => {
    if (runs.has(folder.id)) return;
    const p = page();
    const name = p.folderName(folder);
    const up = new Set((p.members.get(folder.id) ?? []).filter((c) => onAirNow(p, c)).map((c) => c.id));
    const next = folderStep(p.stepMembers(folder.id), p.folderSteps[folder.id], up);
    if (next.kind === 'none') {
      p.note(`Everything in ${name} is on air. 0 takes it off.`);
      return;
    }
    const cue = next.kind === 'take' ? p.cues.find((c) => c.id === next.cueId) : undefined;
    const blocked = cue ? p.stepBlocker(cue) : null;
    if (blocked) {
      p.note(`Take was not sent: ${blocked}`);
      return;
    }
    await p.flush();
    await runFolder(folder.id, async (run) => {
      const off = next.off.map((id) => p.cues.find((c) => c.id === id)).filter((c): c is ShowCue => !!c);
      if (!(await offWith(p, off))) return;
      if (!cue) {
        steps((m) => ({ ...m, [folder.id]: null }));
        p.note(`✓ ${name}: back to its first cue`);
        return;
      }
      if (run.stop) return;
      await p.takeCue(cue);
      // Out or All out came while the take was on its way: what it put up goes back off, and the
      // folder stays back at the top, where Out put it, whatever that take remembered.
      if (!run.stop) return;
      const item = p.itemOf(cue);
      if (item) {
        if (onAirNow(p, cue)) await offLate(p, { cue, item }, run.stop);
      } else {
        const graphic = p.graphicOf(cue);
        if (graphic) await offLate(p, { cue, graphic, layer: 0 }, run.stop);
      }
      steps((m) => ({ ...m, [folder.id]: null }));
    });
  };

  const stopAll = (reason: 'all-out' | 'ended') => {
    // A folder's Take still being sent sends nothing more, and what of it lands after is cut too:
    // nothing airs after the panic control.
    for (const run of runs.values()) run.stop = reason;
    if (reason === 'ended') {
      runs.clear();
      return;
    }
    // Every One-by-one folder starts again from its first cue.
    steps((m) => Object.fromEntries(Object.keys(m).map((id) => [id, null])));
  };

  session.onDispose(() => stopAll('ended'));

  return {
    take,
    out,
    step,
    off: (cues) => offWith(page(), cues),
    stopAll,
    running: (folderId) => runs.has(folderId),
    clearMisses,
    noteStep,
    settleMisses: (settle) =>
      misses((m) => {
        const kept = Object.entries(m).filter(([, missed]) => settle(missed) !== null);
        return kept.length === Object.keys(m).length ? m : Object.fromEntries(kept);
      }),
  };
}
