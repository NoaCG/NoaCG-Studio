// PUBLISH, THE CASPARCG SLOT AND THE LINKS of the playout dashboard (home/ProductionPage.tsx):
// the state, the sign-in follow-through and the handlers behind the header's action slot, the
// Playout panel's Publish, Load, Unload and Replace, and Setup › Links… (parent spec
// docs/work-specs/production-page-refactor/spec.md, phase 4).
//
// Three parts, because the page returns early while its production is missing and a hook cannot
// be called after that return. `useProductionPublish` holds the state and the effect that finishes
// a Publish pressed while signed out; the page calls it where that effect always stood, so effects
// run in the order they did. `publishActions` and `publishFacts` are called by the page after the
// return on every render, so each handler and fact closes over that render's values exactly as the
// inline code did. The rehearsal the first publish clears stays the page's (`onFirstPublish`): the
// live map and PROGRAM are not this module's.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { saveAs } from 'file-saver';
import {
  loadShows,
  noteShowOutputOpened,
  setShowAudienceSlugs,
  setShowHostedSlug,
  setShowOutputSlug,
  setShowOutputSetup,
  refreshGraphicCopies,
  type Show,
} from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { accountCasparDefault, casparDestinationId, casparSwitch, destinationUrl, readOutputSetup, withCasparSwitch } from '../../model/outputSetup';
import { readDefaultOutput } from '../../backend/auth';
import {
  loadPlayoutSettings,
  playoutConfigured,
  putOutputOnAir,
  readState,
  slotAddress,
  slotOf,
  takeOutputOff,
  type PlayoutResult,
  type PlayoutSettings,
} from '../../control/playoutLink';
import type { Resolution } from '../../model/types';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../../model/projectFormat';
import { outputEmbedFileName, outputEmbedHtml } from '../../export/outputEmbed';
import { loadGraphics, templateForSavedGraphic, resolveSavedGraphicDoc } from '../../model/library';
import { hasLiveData } from '../../control/liveData';
import { claimJoinName, outputPageUrl, publishControlShow, PublishBehind, type CuePublished, type LiveCueMap } from '../../control/hostedControl';
import { fastEventGraphics } from '../../control/matchClockWire';
import { type CasparFacts } from './PlayoutPanel';
import { copyLink } from './copyLink';
import { flushTeamProduction, refreshTeams } from '../../backend/teamProductions';
import { type PayloadVersion } from '../../control/payloadVersion';
import { type HeldVersion } from '../../control/readiness';
import { slotHolds } from '../../control/prepareLive';
import { casparOutputTarget, type SlotReading, type StatusCheck } from '../../control/playoutStatus';
import type { AuthUiState } from '../auth/useAuthState';
import type { PrepareFlow } from '../control/PrepareForLive';
import type { useRundownHistory } from './useRundownHistory';

/**
 * What the account gate says, in the dialog's first line. Plain words about what the press does
 * and why it needs an account: publishing creates hosted rows (the output, control and audience
 * links) that must belong to someone who can take them down again. Everything else on this page
 * works without one, and the dialog's own second line says so.
 */
const PUBLISH_NEEDS_ACCOUNT =
  'Publishing a production puts it online, and that needs a free account. Sign in and it publishes straight away.';
const CLAIM_NEEDS_ACCOUNT =
  'Changing the audience link needs the account that published this production. Sign in first.';

/** The publish, slot and links state, and the sign-in follow-through of a Publish. */
export function useProductionPublish({ authStatus, signInOpen }: { authStatus: AuthUiState['status']; signInOpen: boolean }) {
  /** The Playout panel under the playout status (home/PlayoutStatusControl.tsx): opened by a press,
   *  and by itself right after a publish, where the next step is. */
  const [statusOpen, setStatusOpen] = useState(false);
  /** Setup › Links… (home/ProductionLinks.tsx). */
  const [linksOpen, setLinksOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** A publish is on the wire: the status reads "Publishing…". */
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState<'output' | 'control' | 'join' | 'presenter' | null>(null);
  /** The readable audience name being typed, and what the database said about the last claim. */
  const [nameDraft, setNameDraft] = useState('');
  const [nameNote, setNameNote] = useState<string | null>(null);
  /** Publish found another production on the slot: Load waits for "Replace". */
  const [replaceAsk, setReplaceAsk] = useState(false);
  /** A Load or Unload is on its way to the Bridge: a second press waits for it. */
  const [slotBusy, setSlotBusy] = useState(false);
  const slotBusyRef = useRef(false);
  /**
   * Publish was pressed while signed out, and the sign-in dialog is up because of it.
   * Signing in from that dialog finishes what the press asked for, so the reader does not have to
   * find the button a second time; closing the dialog without signing in forgets the press, so a
   * sign-in much later (from the topbar, say) never puts a production online by surprise. If the
   * two auth updates ever arrive in separate renders, the press is forgotten and the button is
   * simply pressed again - the safe direction to fail in.
   */
  const publishAfterSignIn = useRef(false);
  const publishRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!publishAfterSignIn.current) return;
    if (authStatus === 'signed-in') {
      publishAfterSignIn.current = false;
      void publishRef.current();
    } else if (!signInOpen) {
      publishAfterSignIn.current = false;
    }
  }, [authStatus, signInOpen]);
  return {
    statusOpen, setStatusOpen, linksOpen, setLinksOpen, busy, setBusy, publishing, setPublishing, copied, setCopied,
    nameDraft, setNameDraft, nameNote, setNameNote, replaceAsk, setReplaceAsk, slotBusy, setSlotBusy, slotBusyRef,
    publishAfterSignIn, publishRef,
  };
}

export type ProductionPublishState = ReturnType<typeof useProductionPublish>;

/** What the handlers read from the page: this render's values, and the page's own verbs. */
interface PublishActionsIo {
  show: Show;
  setShows: (shows: Show[]) => void;
  setNote: (note: string | null) => void;
  backendConfigured: boolean;
  authStatus: AuthUiState['status'];
  needsSignIn: boolean;
  openSignIn: (reason?: string) => void;
  user: AuthUiState['user'];
  outputUrl: string | null;
  browserOutputUrl: string | null;
  hostedSlug: string | null;
  slotReadable: boolean;
  outputSlot: SlotReading | undefined;
  onAirChanged: (what: 'air' | 'stop', result: PlayoutResult, target: string) => void;
  flushDraft: () => Promise<unknown>;
  history: Pick<ReturnType<typeof useRundownHistory>, 'closeGroup'>;
  casparOn: boolean;
  accountCaspar: boolean | null | undefined;
  publishedReaders: ReadonlySet<string>;
  setPublishedReaders: (readers: ReadonlySet<string>) => void;
  setPublishedStamp: (stamp: PayloadVersion) => void;
  fastEventGraphicsRef: MutableRefObject<Set<string>>;
  liveCueRef: { readonly current: LiveCueMap };
  /** The first publish found graphics taken in rehearsal: the page takes them out of PROGRAM. */
  onFirstPublish: (rehearsed: string[]) => void;
  prepareFlow: Pick<PrepareFlow, 'run'>;
  /** Each cue's appearance and adjust records for the published payload, measured for the
   *  production as it will be published (playout adjustments): what the hosted page's Take
   *  carries and its Adjust block edits. */
  appearanceFor?: (show: Show) => Promise<CuePublished | undefined>;
}

/** The publish, slot and links handlers, built on every render after the page's early return. */
export function publishActions(state: ProductionPublishState, io: PublishActionsIo) {
  const { setBusy, setPublishing, setCopied, nameDraft, setNameDraft, setNameNote, setReplaceAsk, setStatusOpen, setSlotBusy, slotBusyRef, publishAfterSignIn, publishRef } = state;
  const {
    show, setShows, setNote, backendConfigured, authStatus, needsSignIn, openSignIn, user, outputUrl, browserOutputUrl,
    hostedSlug, slotReadable, outputSlot, onAirChanged, flushDraft, history, casparOn, accountCaspar, publishedReaders,
    setPublishedReaders, setPublishedStamp, fastEventGraphicsRef, liveCueRef, onFirstPublish, prepareFlow,
  } = io;
  /**
   * THE ACCOUNT GATE for the three verbs here that write hosted rows: publish, unpublish and
   * claiming the audience name. Row-level security only lets an account touch its own
   * `control_shows` row, and a signed-out write is not refused - it matches no row and reports
   * success. So without this, a signed-out Unpublish said "unpublished" while the output kept
   * running, and a claim said the new name was live when nothing had changed. Returns true when
   * the verb must stop. Offline (no backend) it never blocks: those verbs answer for themselves
   * there, and an offline build must grow no auth UI.
   */
  const accountBlocks = (reason: string): boolean => {
    if (!backendConfigured) return false;
    if (authStatus === 'loading') {
      setNote('Still checking your account. Try that again in a moment.');
      return true;
    }
    if (needsSignIn) {
      openSignIn(reason);
      return true;
    }
    return false;
  };

  /**
   * Claim the readable audience name. The database owns every rule (0035's shape constraint,
   * reserved list and unique index), so this only asks and reports - and on success it adopts
   * the name locally, because `joinUrl` is built from the stored slug and would otherwise keep
   * showing the old one until a republish.
   */
  const claimName = async () => {
    if (accountBlocks(CLAIM_NEEDS_ACCOUNT)) return;
    setBusy(true);
    try {
      const failure = await claimJoinName(show.id, nameDraft);
      if (failure) {
        setNameNote(failure);
        return;
      }
      const claimed = nameDraft.trim();
      setShows(setShowAudienceSlugs(show.id, { joinSlug: claimed, presenterSlug: show.presenterSlug }));
      setNameDraft('');
      setNameNote(`✓ The audience link is now /join/${claimed}`);
    } catch (e) {
      setNameNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The OUTPUT EMBED (export/outputEmbed.ts) - the output URL packaged as a template FILE.
   * It lives beside the URL rather than in the production's export dialog because it is not a
   * package of the graphics at all: it is the same live output the URL addresses, in the one
   * shape a host that lists template files (SPX, and CasparCG's own template folder) can load.
   * The resolution is the stage's, derived exactly as `buildOutputPayload` derives it, so the
   * size the file quotes to the operator is the size the renderer actually paints.
   */
  const downloadEmbed = () => {
    if (!outputUrl) return;
    const library = loadGraphics();
    const resolution = show.graphics.reduce<Resolution>((r, g) => {
      const res = templateForSavedGraphic(g, library).resolution;
      return { width: Math.max(r.width, res.width), height: Math.max(r.height, res.height), label: r.label };
    }, DEFAULT_GRAPHICS_RESOLUTION);
    const html = outputEmbedHtml({ production: show.name, outputUrl: browserOutputUrl ?? outputUrl, resolution });
    saveAs(new Blob([html], { type: 'text/html' }), outputEmbedFileName(show.name));
    // The file IS the output URL, so downloading it sets an output up exactly as copying the
    // link does - and the header's heartbeat starts answering for both.
    setShows(noteShowOutputOpened(show.id));
    setNote('✓ Template file downloaded');
  };

  const copy = (kind: 'output' | 'control' | 'join' | 'presenter', text: string) => {
    void copyLink(text).then((ok) => {
      if (!ok) return;
      // Taking the output URL is what turns "is the output connected?" into a question worth
      // asking on this header - see the heartbeat readout in ProductionShell.
      if (kind === 'output') setShows(noteShowOutputOpened(show.id));
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
    });
  };

  /**
   * LOAD THIS PRODUCTION ON ITS CASPARCG SLOT through the Bridge: what Publish does by itself with
   * CasparCG switched on, and the panel's Load. The slot is read first, and another production on
   * it is replaced only after "Replace" (`replace`). A failure names the step in the note.
   */
  const slotAction = async (work: () => Promise<void>): Promise<void> => {
    if (slotBusyRef.current) return;
    slotBusyRef.current = true;
    setSlotBusy(true);
    try {
      await work();
    } finally {
      slotBusyRef.current = false;
      setSlotBusy(false);
    }
  };
  const loadOnSlot = (url: string, replace = false): Promise<void> => slotAction(async () => {
    const settings = loadPlayoutSettings();
    const where = slotAddress(slotOf(settings));
    if (!playoutConfigured(settings)) {
      setNote(`Pair NoaCG Bridge to load the output on ${where}.`);
      return;
    }
    if (!replace) {
      const reading = await readState(settings, settings.channel);
      // A Bridge that reads slots but could not read this one cannot say whether another
      // production is there, so nothing is replaced on a guess.
      if (!reading.reply && slotReadable) {
        setNote(`Load on ${where} was not sent: cannot read ${where}. ${reading.result.detail}`.trim());
        return;
      }
      const slug = new URL(url).searchParams.get('production');
      const holds = reading.reply ? slotHolds(reading.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null, slug) : null;
      if (holds === 'other') {
        setReplaceAsk(true);
        setStatusOpen(true);
        return;
      }
    }
    setReplaceAsk(false);
    const casparId = casparDestinationId(loadShows().find((s) => s.id === show.id)?.outputSetup) ?? 'casparcg';
    const result = await putOutputOnAir(settings, destinationUrl(url, casparId) ?? url);
    onAirChanged('air', result, casparOutputTarget(settings));
    if (result.state !== 'ok') setNote(`Load on ${where} failed: ${result.detail}`);
  });
  /** LOAD THE LOST OUTPUT AGAIN BY ITSELF (control/bridgeWatch.ts, issue #1657): as Load, but only
   *  onto a slot that still reads empty, and never while another output action is out, so it cannot
   *  load twice beside the operator's own press or replace anything. The watch shows the outcome, so
   *  no note: the Bridge's answer, or null when nothing was sent. */
  const reloadOnSlot = async (url: string): Promise<PlayoutResult | null> => {
    let result: PlayoutResult | null = null;
    await slotAction(async () => {
      const settings = loadPlayoutSettings();
      if (!playoutConfigured(settings)) return;
      const reading = await readState(settings, settings.channel);
      if (!reading.reply) return;
      const slug = new URL(url).searchParams.get('production');
      if (slotHolds(reading.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null, slug) !== 'empty') return;
      const casparId = casparDestinationId(loadShows().find((s) => s.id === show.id)?.outputSetup) ?? 'casparcg';
      result = await putOutputOnAir(settings, destinationUrl(url, casparId) ?? url);
      onAirChanged('air', result, casparOutputTarget(settings));
    });
    return result;
  };
  /** Take this production's renderer off its CasparCG slot through the Bridge: where, and the note
   *  a failure leaves. */
  const takeOffSlot = async (): Promise<{ where: string; failed: string | null }> => {
    const settings = loadPlayoutSettings();
    const where = slotAddress(slotOf(settings));
    const result = await takeOutputOff(settings);
    onAirChanged('stop', result, casparOutputTarget(settings));
    return { where, failed: result.state === 'ok' ? null : `Unload from ${where} failed: ${result.detail}` };
  };
  const unloadFromSlot = (): Promise<void> => slotAction(async () => {
    const { failed } = await takeOffSlot();
    if (failed) setNote(failed);
  });
  /** THE OFFLINE CLEAR (docs/work-specs/offline-clear/spec.md): All out did not clear NoaCG
   *  graphics through the cloud, so this production's renderer comes off its CasparCG slot through
   *  the Bridge, which needs no cloud. A renderer loaded again boots into what the cloud still says
   *  is on air, which is why the note asks for All out before Load. Answers `base` with that said,
   *  or `base` alone when the slot does not hold this production's renderer. */
  const clearThroughBridge = async (base: string): Promise<string> => {
    if (outputSlot?.holds !== 'ours') return base;
    let said = '';
    await slotAction(async () => {
      const { where, failed } = await takeOffSlot();
      said = failed ?? `Unloaded NoaCG graphics from ${where}. When the connection is back, press All out before Load on ${where}.`;
    });
    return said ? `${base.replace(/\.?$/, '.')} ${said}` : base;
  };

  /** Publish; the version it wrote, or null when it did not (the note says why). The readiness
   *  flow owns preparation and reports the result in the status panel. */
  const publishNow = async (): Promise<HeldVersion | null> => {
    if (accountBlocks(PUBLISH_NEEDS_ACCOUNT)) {
      // Only a real sign-in prompt is worth finishing; the "still checking" answer is not one.
      if (needsSignIn) publishAfterSignIn.current = true;
      return null;
    }
    await flushDraft(); await history.closeGroup();
    setBusy(true);
    setPublishing(true);
    try {
      let current = loadShows().find((s) => s.id === show.id);
      let publishCaspar = casparOn;
      // NO CHOOSER (playout-workflow-simplification AC-4): a production that never had its output
      // set takes the CasparCG switch as it reads now, so the published payload and every later
      // page agree on it. Absence stays legacy; nothing is asked.
      if (current?.outputSetup && !readOutputSetup(current.outputSetup)?.destinations.length) {
        // A press before the account's "Use CasparCG in new productions" has answered asks it here,
        // rather than freezing the switch off for good.
        if (accountCaspar === undefined && user?.id) {
          const preference = await readDefaultOutput(user.id);
          publishCaspar = casparSwitch({
            setup: current.outputSetup,
            serverCues: (current.cues ?? []).some((c) => c.source === 'playout'),
            legacyActivity: false,
            accountDefault: accountCasparDefault(preference.setup),
          });
        }
        const result = setShowOutputSetup(show.id, withCasparSwitch(current.outputSetup, publishCaspar));
        setShows(result.shows);
        const failure = result.error ?? await commitDurableWrites();
        if (failure) throw new Error(failure);
        current = loadShows().find(s => s.id === show.id);
      }
      // Started before this press: then this is a re-publish, and open outputs are asked to prepare.
      const wasStarted = !!current?.hostedSlug;
      // THE PUBLISH GUARD (docs/work-specs/publish-guard/spec.md): a team production is pulled to
      // its latest record, this page's newer designs are copied into the record and saved, and the
      // payload is built from that. A published version ahead of it (a teammate who published in
      // between, or a newer design than this page's copy) is pulled in once more.
      const publishLatest = async () => {
        for (let attempt = 0; ; attempt += 1) {
          const team = !!loadShows().find((s) => s.id === show.id)?.teamId;
          if (team) await refreshTeams();
          const library = loadGraphics();
          // The payload's readers as this page saw them: one this publish drops is recorded (C6).
          const refreshed = refreshGraphicCopies(show.id, (g) => resolveSavedGraphicDoc(g, library), publishedReaders);
          setShows(refreshed.shows);
          if (refreshed.error) throw new Error(refreshed.error);
          // A team save that fails does not stop the publish (G2): an older design is still refused.
          if (team) await flushTeamProduction(show.id);
          else {
            const failure = await commitDurableWrites();
            if (failure) throw new Error(failure);
          }
          const latest = loadShows().find((s) => s.id === show.id);
          if (!latest) return null;
          try {
            return await publishControlShow(latest, await io.appearanceFor?.(latest));
          } catch (e) {
            if (!(e instanceof PublishBehind) || attempt > 0) throw e;
          }
        }
      };
      const published = current ? await publishLatest() : null;
      if (published) {
        setShowHostedSlug(show.id, published.slug);
        // The audience capabilities are minted by the database and read back, never chosen
        // here. A server without migration 0035 hands back nulls, which clears them — the
        // production simply has no join link, and nothing else about publishing changes.
        setShowAudienceSlugs(show.id, {
          joinSlug: published.joinSlug,
          presenterSlug: published.presenterSlug,
        });
        setShows(setShowOutputSlug(show.id, published.outputSlug ?? undefined, published.record));
        if (published.version) setPublishedStamp(published.version);
        // A REPUBLISH PINS A NEW PAYLOAD, and the follow effect does not run again for it (the
        // slug is deliberately the same one). A graphic that has just gained a clock would
        // otherwise keep its events on the fast road for the rest of the session, so the answer
        // is recomputed here from the library this publish pinned.
        const pinned = loadGraphics();
        fastEventGraphicsRef.current = fastEventGraphics(
          (current?.graphics ?? []).map((g) => ({ key: g.name, ...templateForSavedGraphic(g, pinned) })),
        );
        // What this publish carried, read from the record as it now stands (a retry may have taken a
        // teammate's change in): the graphics whose payload still reads a Sheet in its own code.
        const carried = loadShows().find((s) => s.id === show.id)?.graphics ?? [];
        setPublishedReaders(new Set(carried.filter((g) => hasLiveData(templateForSavedGraphic(g, pinned).js)).map((g) => g.name)));
        // REHEARSAL ENDS AT THE FIRST PUBLISH (AC-7): what a Take put up before it played on this
        // page only, so it leaves PROGRAM rather than be mistaken for air.
        if (!wasStarted) {
          const rehearsed = Object.keys(liveCueRef.current).filter((g) => liveCueRef.current[g]);
          if (rehearsed.length) {
            onFirstPublish(rehearsed);
          }
        }
        // PUBLISH LOADS THE CASPARCG SLOT (AC-5): the first publish with CasparCG switched on puts
        // this production's renderer on its slot, the step that used to be its own Put on air. It
        // asks before replacing another production, and a failure names the step.
        if (!wasStarted && publishCaspar && published.outputSlug) await loadOnSlot(outputPageUrl(published.outputSlug));
        return published.version ? { n: published.version.n, h: published.version.h } : null;
      }
      setNote('Publishing needs the cloud backend, and this build runs offline.');
      return null;
    } catch (e) {
      setNote(`Publish failed: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(false);
      setPublishing(false);
    }
  };
  // The FIRST publish opens the panel: the operator's next step is the browser source URL it now
  // holds. Publish changes and Check now leave the panel as it was.
  const publish = async () => {
    if (!hostedSlug) setStatusOpen(true);
    await prepareFlow.run();
  };
  // What the sign-in follow-through presses (`useProductionPublish`).
  publishRef.current = publish;
  return { claimName, downloadEmbed, copy, loadOnSlot, reloadOnSlot, unloadFromSlot, clearThroughBridge, publishNow, publish };
}

/** The header's one action and the Playout panel's CasparCG facts, from this render's values. */
export function publishFacts(state: ProductionPublishState, io: {
  started: boolean;
  casparOn: boolean;
  playoutIsConfigured: boolean;
  bridgeOk: boolean;
  outputSlot: SlotReading | undefined;
  cues: readonly unknown[];
  backendConfigured: boolean;
  needsSignIn: boolean;
  slotWhere: string;
  outputUrl: string | null;
  requiresPreparation: boolean;
  authoringAllowed: boolean;
  playoutStatus: { checks: StatusCheck[] };
  playoutSettings: PlayoutSettings;
  casparOutputMemory: string | undefined;
  casparTarget: string;
  flowBusy: boolean;
  publish: () => Promise<void>;
  loadOnSlot: (url: string, replace?: boolean) => Promise<void>;
}) {
  const {
    started, casparOn, playoutIsConfigured, bridgeOk, outputSlot, cues, backendConfigured, needsSignIn, slotWhere,
    outputUrl, requiresPreparation, authoringAllowed, playoutStatus, playoutSettings, casparOutputMemory, casparTarget,
    flowBusy, publish, loadOnSlot,
  } = io;
  const { replaceAsk, busy, slotBusy } = state;
  /** The CasparCG slot is this page's to show and act on: published, switched on, and the Bridge
   *  paired and answering. The header's Load and the panel's slot row read the same gate. */
  const slotInPlay = started && casparOn && playoutIsConfigured && bridgeOk;
  /** THE ONE ACTION SLOT (D1): Publish before the first publish, then whichever is due first -
   *  loading this production on its CasparCG slot, then publishing changes that renderers draw. The
   *  panel lists every due action. */
  const loadDue = slotInPlay && !!outputSlot && outputSlot.holds !== 'ours' && outputSlot.holds !== 'unreadable' && outputSlot.holds !== 'failed' && !replaceAsk;
  const headerAction: { label: string; testId: string; run: () => void; primary?: boolean; title?: string; unavailable?: boolean } | null = !started
    ? {
        label: 'Publish',
        testId: 'production-publish',
        run: () => void publish(),
        primary: cues.length > 0,
        title: !backendConfigured ? 'Publishing needs the cloud backend, and this build runs offline' : needsSignIn ? 'Needs a free account.' : undefined,
        unavailable: !backendConfigured,
      }
    : loadDue
      ? { label: `Load on ${slotWhere}`, testId: 'caspar-load', run: () => outputUrl && void loadOnSlot(outputUrl) }
      : requiresPreparation
        ? { label: 'Publish changes', testId: 'production-publish-changes', run: () => void publish() }
        : null;
  const bridgeCheckLine = playoutStatus.checks.find((c) => c.key === 'bridge');
  const slotCheckLine = playoutStatus.checks.find((c) => c.key === 'slot');
  // A Bridge before `state` cannot read the slot: the page says what it last sent there, and offers
  // both Load and Unload, since it cannot tell which is due.
  const slotLoadedHere = casparOutputMemory === casparTarget;
  const casparFacts: CasparFacts = {
    on: casparOn,
    locked: !authoringAllowed,
    unpaired: casparOn && !playoutIsConfigured,
    bridge: bridgeCheckLine
      ? {
          tone: bridgeCheckLine.tone,
          text: bridgeCheckLine.tone === 'ok' ? 'Bridge connected' : bridgeCheckLine.label,
          detail: bridgeCheckLine.tone === 'bad' || bridgeCheckLine.tone === 'warn' ? bridgeCheckLine.advice : undefined,
          host: bridgeCheckLine.tone === 'ok' ? playoutSettings.host : undefined,
        }
      : null,
    slot: slotInPlay
      ? {
          where: slotWhere,
          tone: slotCheckLine?.tone ?? 'idle',
          text: !outputSlot
            ? 'Checking…'
            : {
                ours: slotCheckLine?.tone === 'ok' ? 'Loaded' : 'Loading…',
                other: 'Another production',
                failed: 'Cannot read',
                unreadable: slotLoadedHere ? 'Loaded' : 'Unknown',
                // A lost output loading again by itself (control/bridgeWatch.ts, #1657).
                empty: slotCheckLine?.tone === 'warn' ? 'Reloading…' : 'Empty',
              }[outputSlot.holds],
          detail: outputSlot?.holds === 'empty' && slotCheckLine?.tone === 'bad' ? slotCheckLine.advice : undefined,
          canLoad: !!outputSlot && outputSlot.holds !== 'ours' && !replaceAsk,
          canUnload: outputSlot?.holds === 'ours' || outputSlot?.holds === 'unreadable',
        }
      : null,
    replaceAsk: replaceAsk ? { where: slotWhere } : null,
    busy: busy || flowBusy || slotBusy,
  };
  return { headerAction, casparFacts };
}
