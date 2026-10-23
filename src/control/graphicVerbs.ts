// THE WEB-GRAPHIC VERBS of the production page: the one sender (`send`, which drives this page's
// PROGRAM monitor and, published, the wire) and the operator's verbs over it - Take, Out, All out,
// Update, the ± bump, Next, a ⚡ event and Snap (production-page refactor spec §2 and §4).
//
// Moved out of ProductionPage with their order, sentences and guards unchanged (phase 12). Each verb
// follows spec §4.2: what it captures at the press (the cue, the graphic, the verb, its options and
// the selection, all from the render that handled the press), what it waits on (the draft's save and
// the history group), what it reads after the wait (the draft through `cueView`, the bound values
// through `resolvedOf`, the newest tree through `boundNow`), and how it treats the answer: the live
// marker moves only for a graphic the send left alone since the press (`leftAlone`, §4.1 R3). After
// the session's end nothing more is sent (`send` refuses) and an answer changes nothing (the
// session's folds are no-ops).
//
// The page's callbacks, mapped:
//
//   sendVerb, runVerb            `send(batches, label, allOut)`, `run(batches, label)`
//   takeGraphicCue, takeCue      `takeGraphic(cue, label, direct)`, `take(cue)`
//   updateLive, bumpLive,        `update(sel)`, `bump(sel, field, delta)`, `next(sel)`, `out(sel)`
//   nextLive, outLive
//   takeOffAir, outAll           `takeOff(graphic)`, `allOut()`
//   fireEvent, pressEvent        `event(sel, button)`
//   snapTo                       `snap(sel, group, state)`
//   afterBoundPress, boundPresses this module's per-graphic queue of bound presses
//
// The page still owns the draft (until phase 13), the tree, the monitor, the arm engine, the folder
// runs and the note line, so they come in through `page`: the phase's temporary interface, read once
// at each press so a press sees the render it was made from, as the page's closures did. `cueView`,
// `resolvedOf` and `flush` are the temporary interfaces phase 13 removes. Browser-only modules
// (control/hostedControl.ts, control/controlModel.ts) arrive through `io`. Runtime imports carry `.ts`
// so Node resolves them (scripts/graphic-verbs.test.mjs); everything else is a type.

import type { ShowCue } from '../model/shows';
import type { TreeWrite } from '../model/productionData';
import type { ControlButton, PressSend } from './controlModel';
import type { ControlSendItem } from './hostedControl';
import type { ArmSpec } from './cueAuto';
import type { LiveCueMap, VerbSent } from './liveCue';
import type { ServerVerb } from './serverPlayout';
import type { PlayoutSession } from './playoutSession';
import type { createSendDebts } from './failedSends';
import { ALL_OUT_CONFIRM_MS, allOutTargets } from './allOut.ts';
import { moveLiveCue } from './airState.ts';
import { clearAllCueBatches, clearCueItems, takeCueItems } from './cueItems.ts';
import { markerAuto } from './cueAuto.ts';
import { ATTEMPT_TIMEOUT_MS, RESEND_WINDOW_MS } from './failedSends.ts';
import { leftAlone, withLiveCue } from './liveCue.ts';
import { staleSentence } from './seqSend.ts';

/** What one send came to: landed, with what it left alone, or the note line's sentence. */
export type Sent = ({ ok: true } & VerbSent) | { ok: false; note: string };

/** A graphic cue's Take, as one cue's or a folder's whole Take says it. */
interface GraphicTake {
  ok: boolean;
  note: string;
}

/** The selection a verb acts on, as the render that handled the press drew it (./verbView.ts). */
export interface VerbSelection {
  selectedCue: ShowCue | null;
  selectedGraphic: string | null;
  /** Anything is up on the selected cue's layer, or the selected server cue is up. */
  selectedLayerLive: boolean;
  /** The selected cue is a server cue this page has up. */
  selectedPlayoutLive: boolean;
  /** The cue the editor is pointed at, and whether it is the one on air. */
  editingCue: ShowCue | null;
  editingIsLive: boolean;
  /** The cue live on the selected layer: what an event or a snap reads its values from. */
  airCue: ShowCue | null;
}

/** What the one sender needs from the page, as its latest render has it. Set before anything else
 *  the page draws, since the data dispatch sends with it while the production is still opening. */
export interface VerbSender {
  /** The published slug, or null before the first publish. */
  published: string | null;
  showId: Parameters<GraphicVerbIo['sendControlVerbs']>[0]['showId'];
  /** Unpublished: move PROGRAM and this page's countdowns for one batch, and log what was sent. */
  here: (batch: ControlSendItem[]) => void;
  logSent: (items: ControlSendItem[]) => void;
  /** What a timed cue's Take marker arms (the arm engine's `specFor`). */
  armSpecFor: (cueId: string) => ArmSpec | null;
  /** Published: apply a command here first, minted id and all (`applyCommand`). */
  applyHere: Parameters<GraphicVerbIo['sendControlVerbs']>[0]['applyHere'];
  fastEvent: (graphic: string) => boolean;
  /** The record of failed sends (a getter: the page renews it with the wire). */
  debts: () => ReturnType<typeof createSendDebts>;
  /** Something that could air a graphic is reporting now. */
  outputUsable: () => boolean;
  /** The send's drawn state: one more or one fewer in flight, owed, when the log last took one,
   *  and a graphic sent with nothing reporting. */
  sending: (delta: 1 | -1) => void;
  owed: (owed: boolean) => void;
  loggedAt: (at: number) => void;
  noOutput: () => void;
  /** The note line: a sentence, or a fold over the one shown (a landed send settling a debt). */
  note: (next: string | ((shown: string | null) => string | null)) => void;
}

/** What the module needs from the page while the page still owns it, as its latest render has it. */
export interface GraphicPage {
  /** Every graphic of the production. */
  graphics: readonly { name: string }[];
  /** The live map this render drew (the page's render copy of the `air` part). */
  liveCue: LiveCueMap;
  /** What each graphic was last sent, as this render drew it. */
  aired: Record<string, Record<string, string>>;
  /** The graphic layers that are up, and the server cues this page put up. */
  liveLayers: readonly { graphic: string }[];
  livePlayoutLayers: readonly { cue: ShowCue }[];
  graphicOf: (cue: ShowCue) => string | null;
  /** The cue as typed, draft included (temporary, until phase 13). */
  cueView: (cue: ShowCue) => { values: Record<string, string> };
  /** One graphic's bound values from the newest resolution (temporary, until phase 13). */
  resolvedOf: (graphic: string) => Record<string, string>;
  /** Save the typed draft and close the history group (temporary, until phase 13). */
  flush: () => Promise<void>;
  /** A graphic's bound fields, field key to tree path. */
  boundFields: (graphic: string) => Record<string, string>;
  /** One graphic's bound values from the newest tree (the one a press's write moves at once). */
  boundNow: (graphic: string) => Record<string, string>;
  /** Refuse a bound press while the published tree is unread, saying why; true when it may go. */
  boundReady: () => boolean;
  /** Move the production tree (an operator press). */
  patchBound: (writes: TreeWrite[]) => Promise<void>;
  /** Write a cue's values as an edit (the ± bump on an unbound field). */
  writeCue: (cueId: string, values: Record<string, string>) => void;
  /** Persist values a live event accepted, outside preparation history (when authoring is allowed). */
  writeLive: (cueId: string, values: Record<string, string>) => void;
  /** A server cue's verb, its outcome said on the note line; true when it went. */
  playoutVerb: (cue: ShowCue, verb: ServerVerb, label: string, options?: { cut?: boolean }) => Promise<boolean>;
  /** The folders' bookkeeping a Take of a cue does (control/folderPlayout.ts). */
  clearMisses: (ids: readonly string[]) => void;
  noteStep: (cue: ShowCue) => void;
  /** All out's other halves: stop every folder still being sent, clear what no cue names. */
  stopFolders: () => void;
  outUnnamed: () => Promise<void>;
  /** All out's fallback sentence through the Bridge (the publish flow's). */
  clearThroughBridge: (note: string) => Promise<string>;
  clearing: (on: boolean) => void;
}

/** The browser-only doors the verbs call. */
export interface GraphicVerbIo {
  sendControlVerbs: typeof import('./hostedControl').sendControlVerbs;
  verbStale: typeof import('./hostedControl').verbStale;
  verbAired: typeof import('./hostedControl').verbAired;
  verbsLanded: typeof import('./hostedControl').verbsLanded;
  verbSentItems: typeof import('./hostedControl').verbSentItems;
  headsSay: typeof import('./hostedControl').headsSay;
  headsStillOn: typeof import('./hostedControl').headsStillOn;
  adjustedValue: (current: string | number | undefined, delta: number) => string;
  movedKeys: (button: ControlButton) => string[];
  pressSend: (button: ControlButton, bound: Record<string, string>, valueOf: (key: string) => string | number | undefined) => PressSend;
  nameList: (names: string[]) => string;
  /** The wall clock (ms), for when the log last took a send. */
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

export interface GraphicVerbs {
  send: (batches: ControlSendItem[][], label: string, allOut?: boolean) => Promise<Sent>;
  /** Send, and say so if it failed. What it came to when it landed, or null when it did not. */
  run: (batches: ControlSendItem[][], label: string) => Promise<VerbSent | null>;
  takeGraphic: (cue: ShowCue, label: string, direct?: boolean) => Promise<GraphicTake | null>;
  take: (cue: ShowCue) => Promise<void>;
  update: (sel: VerbSelection) => Promise<void>;
  bump: (sel: VerbSelection, fieldKey: string, delta: number) => Promise<void>;
  next: (sel: VerbSelection) => Promise<void>;
  out: (sel: VerbSelection) => Promise<void>;
  takeOff: (graphic: string) => Promise<void>;
  allOut: () => Promise<void>;
  event: (sel: VerbSelection, button: ControlButton) => Promise<void>;
  snap: (sel: VerbSelection, groupId: string | null, stateId: string) => Promise<void>;
}

/** Refused at the session's end: nothing more is sent for a production that is closed (§4.1 R3). */
const ENDED_NOTE = 'This production is closed, so nothing was sent.';

export function createGraphicVerbs(session: PlayoutSession, io: GraphicVerbIo, sender: () => VerbSender, readPage: () => GraphicPage): GraphicVerbs {
  /** The page as a press reads it. Once the production closed, its writes move nothing: no cue,
   *  no tree and no Bridge clear for a closed production (§4.1 R3), as the session's folds and the
   *  sender already refuse. */
  const page = (): GraphicPage => {
    const p = readPage();
    const alive = session.alive;
    return {
      ...p,
      patchBound: async (writes) => (alive() ? p.patchBound(writes) : undefined),
      writeCue: (cueId, values) => alive() && p.writeCue(cueId, values),
      writeLive: (cueId, values) => alive() && p.writeLive(cueId, values),
      clearThroughBridge: async (note) => (alive() ? p.clearThroughBridge(note) : note),
    };
  };
  /** Each graphic's last bound press, which the next one waits for. */
  const boundPresses = new Map<string, Promise<void>>();

  /** Move the live marker for these graphics (a no-op once the session ended). */
  const mark = (graphics: readonly string[], cueId: string | null) =>
    session.apply((parts) => ({ ...parts, air: moveLiveCue(parts.air, (m: LiveCueMap) => graphics.reduce((acc, g) => withLiveCue(acc, g, cueId), m)) }));

  // ── The one sender. ONE place a verb's commands go somewhere: the wire when published, the local
  // PROGRAM monitor always, so the two can never drift into two behaviours. ──
  const sendWith = async (p: VerbSender, batches: ControlSendItem[][], label: string, allOut = false): Promise<Sent> => {
    if (!session.alive()) return { ok: false, note: ENDED_NOTE };
    if (!p.published) {
      // Not published: the verbs still drive the local PROGRAM monitor, which is what makes the
      // whole surface usable (and provable) offline. Nothing leaves the machine.
      for (const batch of batches) p.here(batch);
      p.logSent(batches.flat());
      return { ok: true, skipped: [], superseded: [], pressedAgain: [] };
    }
    // A TIMED CUE'S TAKE MARKER carries what it arms, so every page following the log arms the same
    // countdown from the Take's own row (control/cueArmWire.ts). Every Take leaves here, whichever
    // control pressed it, so this is the one place that adds it.
    const marked = batches.map((batch) =>
      batch.map((item) => {
        if (item.msg.t !== 'cue' || !item.msg.cue || item.msg.auto || item.msg.direct) return item;
        const spec = p.armSpecFor(item.msg.cue);
        return spec ? { ...item, msg: { ...item.msg, auto: markerAuto(spec) } } : item;
      }),
    );
    p.sending(1);
    try {
      // BOTH ROADS, from this one press (control/commandRoads.ts): `applyHere` moves this page's own
      // monitor in zero hops, and the minted id is what makes doing both safe. Several batches are
      // ONE press: numbered and based together, now.
      const sent = await io.sendControlVerbs({
        slug: p.published,
        showId: p.showId,
        batches: marked,
        applyHere: p.applyHere,
        fastEvents: p.fastEvent,
        allOut,
      });
      p.note(p.debts().landed(marked.flat()));
      p.owed(p.debts().owed() > 0);
      p.loggedAt(io.now());
      // A graphic went up with nothing reporting that could air it: the status says "No output" in
      // red until something connects (playout-workflow-simplification AC-2). Never blocked.
      if (!allOut && !p.outputUsable() && marked.some((batch) => batch.some((item) => item.msg.t === 'play'))) p.noOutput();
      return { ok: true, ...sent };
    } catch (e) {
      // A verb whose picture MOVED HERE and then failed to send is a different sentence from one
      // that never happened: this monitor applied the commands before the round trip. A press
      // another screen had already overtaken was refused by the server (protocol 2, migration 0071).
      const note = io.verbStale(e)
        ? staleSentence(e as Error)
        : io.verbAired(e)
          ? `${label} is on this monitor only. It may not have reached the screens or the log (${(e as Error).message}). Send it again.`
          : `${label} failed: ${(e as Error).message}`;
      // Owed: the batch that failed, as it was sent, and those after it. The ones before it landed.
      const landed = io.verbsLanded(e);
      p.debts().failed([...(io.verbSentItems(e) ?? marked[landed] ?? []), ...marked.slice(landed + 1).flat()], note);
      p.owed(true);
      return { ok: false, note };
    } finally {
      p.sending(-1);
    }
  };

  /** A caller outside this module (the data dispatch, a folder run, a timed cue) sends with the page
   *  as it stands when it sends; the verbs below send with the page of their press. */
  const send = (batches: ControlSendItem[][], label: string, allOut = false) => sendWith(sender(), batches, label, allOut);

  const runWith = async (p: VerbSender, batches: ControlSendItem[][], label: string): Promise<VerbSent | null> => {
    const sent = await sendWith(p, batches, label);
    if (!sent.ok) p.note(sent.note);
    return sent.ok ? sent : null;
  };
  const run = (batches: ControlSendItem[][], label: string) => runWith(sender(), batches, label);

  /**
   * A PRESS MOVING A BOUND FIELD WAITS FOR THE ONE BEFORE IT on its graphic, then counts from the
   * tree that press left (`boundNow`): two goals in one round trip are two points (spec S1,
   * e2e/configured/playout-adjust-race.spec.ts). The wait ends when the press before it has had a
   * send's whole window and an attempt's time for its write (./failedSends.ts), so a link that never
   * answers cannot hold the next press; past it, the press counts from the tree as it stands.
   */
  const afterBoundPress = (graphic: string, press: () => Promise<void>): Promise<void> => {
    const before = boundPresses.get(graphic);
    let timer: unknown;
    const waited = before
      ? Promise.race([before, new Promise<void>((resolve) => (timer = io.setTimeout(resolve, RESEND_WINDOW_MS + 2 * ATTEMPT_TIMEOUT_MS)))])
      : Promise.resolve();
    const ran = waited.then(() => {
      io.clearTimeout(timer);
      return press();
    });
    // The next press waits for this one whether or not it failed.
    const settled = ran.catch(() => {});
    boundPresses.set(graphic, settled);
    void settled.then(() => {
      if (boundPresses.get(graphic) === settled) boundPresses.delete(graphic);
    });
    return ran;
  };

  /** A graphic cue's Take, reporting nothing: its sentence comes back, for one cue or a folder's
   *  whole Take to say. Null when its graphic is gone. */
  const takeGraphicWith = async (s: VerbSender, p: GraphicPage, cue: ShowCue, label: string, direct = false): Promise<GraphicTake | null> => {
    const graphic = p.graphicOf(cue);
    if (!graphic) return null;
    await p.flush();
    // Bound fields come from the LIVE tree, not from what this cue stored when it was prepared
    // (plan §2.7): otherwise taking an old cue would re-air a stale score.
    const values = { ...p.cueView(cue).values, ...p.resolvedOf(graphic) };
    const sent = await sendWith(s, [takeCueItems({ id: cue.id, graphic, values, ...(direct ? { direct: true, auto: cue.auto ? markerAuto({ auto: cue.auto, next: null }) : null } : {}) })], label);
    if (!sent.ok) return { ok: false, note: sent.note };
    // Superseded: this page's later press on the graphic stands, and its own handler set the chip.
    if (!leftAlone(sent).includes(graphic)) mark([graphic], cue.id);
    p.clearMisses([cue.id]);
    return { ok: true, note: `✓ ${label}: ${cue.label}` };
  };

  const takeGraphic = (cue: ShowCue, label: string, direct = false) => takeGraphicWith(sender(), page(), cue, label, direct);

  const take = async (cue: ShowCue) => {
    const s = sender();
    const p = page();
    if (cue.source === 'playout') {
      if (await p.playoutVerb(cue, 'take', 'Take')) {
        p.clearMisses([cue.id]);
        p.noteStep(cue);
      }
      return;
    }
    const taken = await takeGraphicWith(s, p, cue, 'Take');
    if (!taken) return;
    if (taken.ok) p.noteStep(cue);
    else s.note(taken.note);
  };

  const update = async (sel: VerbSelection) => {
    const s = sender();
    const p = page();
    const { editingCue, selectedGraphic: graphic } = sel;
    if (editingCue?.source === 'playout') {
      if (sel.selectedPlayoutLive) await p.playoutVerb(editingCue, 'update', 'Update');
      return;
    }
    if (!editingCue || !graphic || !sel.editingIsLive) return;
    await p.flush();
    // Same overlay as Take: ✎ Update must not push a bound field back to its prepared value.
    const data = { ...p.cueView(editingCue).values, ...p.resolvedOf(graphic) };
    await runWith(s, [[{ graphic, msg: { t: 'update', data } }]], 'Update');
  };

  /**
   * One press bumps a number field ON AIR: a PARTIAL update carrying just that field, plus the same
   * value into the edited cue so the cue and the air cannot drift apart. PARTIAL on purpose: a bump
   * must never publish a half-typed name. A BOUND field takes the other road: the press moves the
   * production tree, counted from the TREE, and nothing is written into this cue (plan §2.7, §2.9).
   */
  const bump = async (sel: VerbSelection, fieldKey: string, delta: number) => {
    const s = sender();
    const p = page();
    const { editingCue, selectedGraphic: graphic } = sel;
    if (!editingCue || !graphic || !sel.editingIsLive) return;
    const path = p.boundFields(graphic)[fieldKey];
    if (path) {
      await afterBoundPress(graphic, async () => {
        await p.flush();
        if (!p.boundReady()) return;
        await p.patchBound([{ path, text: io.adjustedValue(p.boundNow(graphic)[fieldKey], delta), verb: 'adjust' }]);
      });
      return;
    }
    await p.flush();
    const base = p.aired[graphic]?.[fieldKey] ?? p.cueView(editingCue).values[fieldKey] ?? '0';
    const next = io.adjustedValue(base, delta);
    p.writeCue(editingCue.id, { [fieldKey]: next });
    await runWith(s, [[{ graphic, msg: { t: 'update', data: { [fieldKey]: next } } }]], 'Update');
  };

  const next = async (sel: VerbSelection) => {
    const s = sender();
    const p = page();
    const { selectedCue, selectedGraphic: graphic } = sel;
    if (selectedCue?.source === 'playout') {
      if (sel.selectedPlayoutLive) await p.playoutVerb(selectedCue, 'next', 'Next');
      return;
    }
    if (!graphic || !sel.selectedLayerLive) return;
    await runWith(s, [[{ graphic, msg: { t: 'next' } }]], 'Next');
  };

  /** One graphic off, and its marker with it unless a later press stands. */
  const clearOne = async (s: VerbSender, graphic: string) => {
    const sent = await runWith(s, [clearCueItems(graphic)], 'Out');
    if (sent && !leftAlone(sent).includes(graphic)) mark([graphic], null);
  };

  const out = async (sel: VerbSelection) => {
    const s = sender();
    const p = page();
    const { selectedCue, selectedGraphic: graphic } = sel;
    if (selectedCue?.source === 'playout') {
      if (sel.selectedPlayoutLive) await p.playoutVerb(selectedCue, 'out', 'Out');
      return;
    }
    if (!graphic || !sel.selectedLayerLive) return;
    await clearOne(s, graphic);
  };

  /** Play a named graphic off air, if it is up. Removal goes through this first: the output page
   *  follows the LOG, so a graphic deleted while live would keep rendering on its layer. */
  const takeOff = async (graphic: string) => {
    const s = sender();
    const p = page();
    if (!p.liveCue[graphic]) return;
    await clearOne(s, graphic);
  };

  /** Clear the screen: every server cue this page put up goes off where it was taken, then whatever
   *  plays on a slot this rundown uses that no cue names, then every graphic this page or the
   *  server's heads say is up, in one send. */
  const allOut = async () => {
    const s = sender();
    const p = page();
    // A folder's Take still being sent sends nothing more, and what of it lands after is cut too:
    // nothing airs after the panic control. Every One-by-one folder starts again from its first cue.
    p.stopFolders();
    // The panic control cuts, as it always did, whatever fade out a clip is set to.
    for (const l of p.livePlayoutLayers) await p.playoutVerb(l.cue, 'out', 'All out', { cut: true });
    await p.outUnnamed();
    // WHAT THE SERVER SAYS IS ON, not only what this page believes (AC-13): a graphic whose cue
    // marker went missing, or one a renderer kept across a republish, is cleared too.
    const cleared = allOutTargets({
      local: p.liveLayers.map((l) => l.graphic),
      heads: s.published ? io.headsSay(s.published) : null,
      all: p.graphics.map((g) => g.name),
      published: !!s.published,
    });
    if (cleared.length === 0) return;
    p.clearing(true);
    try {
      const sent = await sendWith(s, clearAllCueBatches(cleared), 'All out', true);
      if (!sent.ok) {
        s.note(await p.clearThroughBridge(sent.note));
        return;
      }
      // A graphic this page pressed again while the All out was on its way stays as that later
      // press left it (the server skipped it, protocol 2), so it is not marked off here.
      const off = cleared.filter((g) => !leftAlone(sent).includes(g));
      mark(off, null);
      // Clearing… until the heads say each is off; one still on is named, never assumed gone.
      const still = s.published ? await io.headsStillOn(s.published, off, ALL_OUT_CONFIRM_MS) : [];
      if (still.length > 0) s.note(await p.clearThroughBridge(`All out did not clear ${io.nameList(still)}`));
    } finally {
      p.clearing(false);
    }
  };

  /** The data that belongs to AIR: the cue live on the selected layer, draft included. Events and
   *  snaps act on the live graphic, so their values come from ITS cue, read after the wait. */
  const airValues = (p: GraphicPage, sel: VerbSelection): Record<string, string> => (sel.airCue ? p.cueView(sel.airCue).values : {});

  const pressEvent = async (s: VerbSender, p: GraphicPage, sel: VerbSelection, button: ControlButton, graphic: string, bound: Record<string, string>, movedList: string[]) => {
    await p.flush();
    const values = airValues(p, sel);
    // A press that would move a SHARED value waits for the tree, and the EVENT waits with it.
    if (movedList.some((key) => bound[key]) && !p.boundReady()) return;
    // A field the press MOVES counts from what AIR shows; a field it only READS is the cue's own
    // value; a BOUND field reads from the production tree (plan §2.7).
    const moved = new Set(movedList);
    const boundValues = p.boundNow(graphic);
    const { payload, fields: adjusted, tree } = io.pressSend(button, bound, (key) =>
      bound[key]
        ? boundValues[key] ?? (moved.has(key) && button.adjust && key in button.adjust ? '0' : undefined)
        : moved.has(key)
          ? (p.aired[graphic]?.[key] ?? values[key] ?? (button.adjust && key in button.adjust ? '0' : ''))
          : values[key],
    );
    // Persist accepted live values directly; a live event is outside preparation history.
    if (Object.keys(adjusted).length > 0 && sel.airCue) p.writeLive(sel.airCue.id, adjusted);
    const msg = payload ? { t: 'event' as const, event: button.event, payload } : { t: 'event' as const, event: button.event };
    // THE SHARED VALUE MOVES ONLY IF THE EVENT WENT: the tree write is a separate row, so nothing
    // but this order keeps the two in step.
    const sent = await runWith(s, [[{ graphic, msg }]], `Event ${button.event}`);
    // Not `leftAlone`: an event that landed moves the tree even when a later press followed it.
    if (sent && ![...sent.skipped, ...sent.superseded].includes(graphic)) await p.patchBound(tree);
  };

  /** Fire a machine event on the live graphic. A press moving a bound field waits for the one before
   *  it on its graphic. */
  const event = (sel: VerbSelection, button: ControlButton): Promise<void> => {
    const s = sender();
    const p = page();
    const graphic = sel.selectedGraphic;
    if (!graphic || !sel.selectedLayerLive) return Promise.resolve();
    const bound = p.boundFields(graphic);
    const moved = io.movedKeys(button);
    if (!moved.some((key) => bound[key])) return pressEvent(s, p, sel, button, graphic, bound, moved);
    return afterBoundPress(graphic, () => pressEvent(s, p, sel, button, graphic, bound, moved));
  };

  /** Snap the live graphic straight to a state, with an update of the ON-AIR cue's values (a reset
   *  is two operations, docs/STATE_MACHINE_SCHEMA.md). A null group resets every group. */
  const snap = async (sel: VerbSelection, groupId: string | null, stateId: string) => {
    const s = sender();
    const p = page();
    const graphic = sel.selectedGraphic;
    if (!graphic || !sel.selectedLayerLive) return;
    await p.flush();
    const snapTo = groupId === null ? null : { [groupId]: stateId };
    await runWith(s, 
      [
        [
          { graphic, msg: { t: 'snap' as const, snap: snapTo } },
          { graphic, msg: { t: 'update' as const, data: airValues(p, sel) } },
        ],
      ],
      'Snap',
    );
  };

  return { send, run, takeGraphic, take, update, bump, next, out, takeOff, allOut, event, snap };
}
