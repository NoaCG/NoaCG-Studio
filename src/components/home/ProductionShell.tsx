import { useRef } from 'react';
import SyncStatus from '../SyncStatus';
import { routeHash, type ProductionSub } from '../../app/router';
import type { Show, ShowCue } from '../../model/shows';
import type { ControlFollowStatus } from '../../control/hostedControl';
import {
  useCueShortcutSet,
  usePlayoutVerbKeys,
  useRundownEditKeys,
  type PlayoutVerb,
  type VerbPress,
  type RundownEditKey,
} from '../playoutKeys';
import { ProductionSetupMenu } from './ProductionSetupMenu';
import RailResizer, { useRailWidth } from './RailResizer';
import BrandLogo from '../BrandLogo';
import NewGraphicButton from '../NewGraphicButton';
import { IconTv } from '../icons';
import { panelTone, type PanelAnswerState } from '../control/PanelControl';
import { useTeamsUi } from '../teams/teamsUi';
import { useTeamsAvailable } from '../teams/useTeamsAvailable';
import { useTeamState } from '../teams/useTeamState';
import { editedWhen } from '../teams/teamLabels';
import { dismissTeamNote, teamMemberName } from '../../backend/teamProductions';

/** One empty rundown, so a production without cues hands the shortcut hook a stable list. */
const NO_CUES: readonly ShowCue[] = [];

/** The shell: header + the two-column body, plus the keyboard verbs. Split out so the page body
 *  above reads as the surface it is rather than as chrome wrapped around a surface. */
export default function ProductionShell({
  show,
  status,
  liveLayers,
  follow,
  resolveWaiting,
  sub,
  onTab,
  onHome,
  onBack,
  onAllOut,
  allOutEnabled,
  allOutClearing = false,
  panel,
  onPanel,
  panelDialog,
  onPlayoutSettings,
  onLinks,
  onLook,
  views,
  onExport,
  onKey,
  onEditKey,
  renders,
  children,
}: {
  show: Show;
  /** The one playout status and its panel (home/PlayoutStatusControl.tsx), with its action slot. */
  status: React.ReactNode;
  liveLayers: { layer: number }[];
  follow: ControlFollowStatus | null;
  /** The follow's resolve is failing and being retried - the server is not answering. */
  resolveWaiting?: boolean;
  sub: ProductionSub | null;
  /** Back to Playout IN THIS TAB. The workspaces are links now, never calls into here. */
  onTab: () => void;
  onHome: () => void;
  onBack: () => void;
  onAllOut: () => void;
  /** Whether anything is up to clear - the graphics on the log, or a server cue through the
   *  Bridge, which `liveLayers` does not count. */
  allOutEnabled?: boolean;
  /** An All out is on its way and not yet confirmed by the server's heads. */
  allOutClearing?: boolean;
  /** Whether this page answers a hardware panel (control/PanelControl.tsx), the door to its
   *  dialog, and the dialog while it is open. */
  panel: PanelAnswerState;
  onPanel: () => void;
  panelDialog?: React.ReactNode;
  onPlayoutSettings: () => void;
  onLinks?: () => void;
  /** Setup › Look (home/ProductionLook.tsx). */
  onLook?: () => void;
  /** Which views the production uses, and how many audience submissions are waiting. */
  views: { data: boolean; audience: boolean; waiting: number };
  onExport: () => void;
  onKey: (key: PlayoutVerb, press?: VerbPress) => void;
  onEditKey: (key: RundownEditKey) => boolean;
  /** The page's render count, for the spec that proves a clip's clock does not re-render it. */
  renders?: number;
  children: React.ReactNode;
}) {
  // The verb keys (docs/PLAYOUT_DASHBOARD.md §2) come from the SHARED keymap, so the hosted
  // control page cannot drift away from this one again — see components/playoutKeys.ts.
  //
  // ONLY WHILE PLAYOUT IS THE SURFACE ON SCREEN. This shell renders on Data and Messages too,
  // with the playout column hidden behind them, so bound-while-mounted meant SPACE ran Take
  // from a screen showing neither monitor. The hosted page has no workspaces and passes nothing.
  const shortcuts = useCueShortcutSet(show.cues ?? NO_CUES);
  usePlayoutVerbKeys(onKey, sub === null, shortcuts.bindings);
  useRundownEditKeys(onEditKey, sub === null);
  const teamsAvailable = useTeamsAvailable();
  const openShare = useTeamsUi((s) => s.openShare);
  const openTeam = useTeamsUi((s) => s.openTeam);
  const teamState = useTeamState();
  // A TEAM production says so in the header: its team's chip (the door to the team), who saved
  // it last, and whether this tab's own edit has reached the server yet (TEAMS_PLAN §6).
  const team = show.teamId ? teamState.teams.find((t) => t.id === show.teamId) ?? null : null;
  const head = teamState.heads[show.id];
  const saving = teamState.saving[show.id];
  const teamNote = teamState.notes[show.id];
  const edited = team && head ? `edited by ${teamMemberName(team.id, head.updatedBy)}, ${editedWhen(head.updatedAt)}` : '';
  // THE RUNDOWN'S WIDTH (home/RailResizer): the grid's second column and the handle on its edge
  // both read `--pd-rail-w`, so the two can never disagree about where the divider is.
  const body = useRef<HTMLElement>(null);
  const rail = useRailWidth(body);
  // The views the switcher lists: the ones this production uses, and always the one on screen.
  const tabs = (['data', 'audience'] as const).filter((tab) => sub === tab || views[tab]);
  const panelState = panelTone(panel);

  return (
    <div className="app playout-dashboard" data-testid="production-page" data-renders={renders}>
      <header className="pd-header">
        <a className="brand brand-home" href="/" title="NoaCG Studio front page">
          <BrandLogo size={22} />
        </a>
        {/* BACK AND HOME, two separate promises (owner, 2026-09-23). Back returns to wherever
            you came from - the dashboard, the list, the graphic being made - and falls back to
            the list only when this page was opened cold. Home always goes to the dashboard. Both are labelled
            words rather than a bare arrow, so neither is mistaken for the other, and Home is
            the word alone like every Home door (src/components/AGENTS.md). The logo before them
            is the site root, as on every surface, so Home is the word and not the logo. */}
        <button className="pd-back" onClick={onBack} data-testid="production-back">
          ← Back
        </button>
        <button className="pd-home" onClick={onHome} data-testid="production-home">
          Home
        </button>
        {/* The wizard door, in the SHARED LEFT ORDER every shell uses (owner walk, 2026-08-29:
            "it should be in the same place on every page") - logo, Home, ＋ New graphic, so it
            is the first thing after Home rather than adrift in the right cluster, where the
            owner found it. It is the SAME door as the rail's "＋ New graphic for this
            production…" - both carry this production, so a graphic made from here joins the
            show you are standing in. Keeping it left also puts the width of the whole header
            between it and ■ All out: a hand reaching for the panic control must never land on
            navigation. */}
        <NewGraphicButton productionId={show.id} />
        <h1 title={show.name}><IconTv /> <span className="pd-name">{show.name}</span></h1>
        {/* THE ONE PLAYOUT STATUS, beside the production's name where its state has always been
            read (docs/work-specs/playout-workflow-simplification AC-1, AC-2): a colour and a
            short text, worst first, and a press opens the Playout panel. Its width is fixed, so a
            state that changes during a show never moves what is beside it, and the one action
            slot after it (Publish, Load or Publish changes) keeps its own width too. */}
        {status}
        {shortcuts.conflicts.length > 0 && <span role="status">Conflicting cue shortcuts disabled: {shortcuts.conflicts.join(', ')}</span>}
        {/* NOT JOINED, AND ONLY THEN. A healthy production says nothing new here: the line
            appears when the log's channel has never joined, which is the state that used to
            be invisible. Commands do still arrive - the durable road polls every 30 s - so
            this says SLOW rather than broken, and it is deliberately not an error colour. */}
        {/* THE SERVER IS NOT ANSWERING. The follow cannot start without the resolve, so this is
            said instead of nothing, and it goes away by itself when the server answers. */}
        {resolveWaiting ? (
          <span
            className="pd-mode pd-mode-idle"
            data-testid="production-follow"
            title="The server is not answering. Retrying."
          >
            ○ server not answering, retrying
          </span>
        ) : follow && !follow.everJoined && (
          <span
            className="pd-mode pd-mode-idle"
            data-testid="production-follow"
            title={`Live connection not joined (${follow.status || 'none'}). Commands arrive about every 30 s.`}
          >
            ○ not joined, polling
          </span>
        )}
        {/* The workspaces (docs/INTERACTIVE_PLAYOUT_PLAN.md D6): Playout is the operating
            surface, Data the production's own tables. One shared record underneath — a row
            typed on the Data tab is loadable into a cue the moment you switch back.

            THEY OPEN IN THEIR OWN BROWSER TAB, so Playout never leaves the screen. Owner,
            2026-08-21: "the buttons that we have and the side pages we have feel a bit
            dangerous to swap between. I think the playout should always be open." Data and
            Audience are AUTHORING surfaces, and authoring while the thing you are steering is
            off-screen is how a live mistake happens. (The Audience view is called Messages now;
            its route stays `audience`.)
            This needed the durable store's CROSS-TAB INVALIDATION first (model/durableStore.ts):
            two tabs on one production used to overwrite each other, so shipping this before that
            would have made the losing path the default rather than an unlucky one.
            They are real routes with real history, so these are real links - middle-click and
            Ctrl-click start working, which they never did as buttons. The one already open is a
            plain marker rather than a link to itself, and Playout stays a button because it
            returns IN THIS TAB, where the monitors already are.

            ONLY THE VIEWS THIS PRODUCTION USES (owner, 2026-10-03). A plain production has no
            switcher at all; Setup always lists Data and Messages. The view you are standing
            on is always listed, so nothing disappears under the operator. Messages carries the
            count of messages waiting in its inbox. */}
        {tabs.length > 0 && (
          <nav className="pd-tabs" aria-label="Production workspaces">
            <button className={sub === null ? 'on' : undefined} onClick={onTab} data-testid="tab-playout">
              Playout
            </button>
            {tabs.map((tab) => {
              const label = tab === 'data' ? 'Data' : 'Messages';
              const count =
                tab === 'audience' && views.waiting > 0 ? (
                  <span className="pd-tab-count" title={`${views.waiting} waiting in the inbox`} data-testid="tab-audience-count">
                    {views.waiting > 99 ? '99+' : views.waiting}
                  </span>
                ) : null;
              return sub === tab ? (
                <span key={tab} className="on" aria-current="page" data-testid={`tab-${tab}`}>
                  {label}
                  {count}
                </span>
              ) : (
                <a
                  key={tab}
                  href={routeHash({ view: 'production', id: show.id, sub: tab })}
                  target="_blank"
                  rel="noopener"
                  data-testid={`tab-${tab}`}
                >
                  {label}
                  {count}
                </a>
              );
            })}
          </nav>
        )}
        <div className="spacer" />
        {/* THE LIVE STATUSES, then SETUP, then ■ All out (owner, 2026-10-03: "share, panel,
            export, at least could be under its own settings tab"). The header keeps what is
            pressed live, and the doors opened before a show live in the Setup menu
            (home/ProductionSetupMenu.tsx). What must be SEEN during a show shows here without
            opening anything: a team production's team and save state, and a panel this page
            answers. Each status sits LEFT of Setup and ■ All out because its width changes with
            its state and the cluster is right-aligned, so those two never move (owner,
            2026-10-01: operators build muscle memory).
            Team identity and its door live inside Setup, gated by useTeamsAvailable.
            The cloud chip stays visible: an operator must not miss a save that is late or failed. */}
        {/* One chip for both kinds of production (playout-workflow-simplification AC-12): a team
            production reads its own save, in the same words. */}
        <SyncStatus team={show.teamId ? { productionId: show.id, saving, note: teamNote } : undefined} />
        {/* WHO ANSWERS THE PANEL (panel lease L8), only with a panel paired or answering: "Panel ✓"
            here and "Panel …" taking it, which open its dialog as the Setup menu's item does; on
            another page, one quiet "Use panel here" that moves it, naming that page in its tooltip,
            so a laptop header keeps its room for the production's name. */}
        {panelState === 'held' ? (
          <button
            className="pd-panel-status pd-panel-status--held"
            onClick={panel.useHere}
            title={`${panel.holder} answers the Stream Deck panel. Press to answer it here.`}
            data-testid="panel-header-use-here"
          >
            Use panel here
          </button>
        ) : panelState !== 'off' && (
          <button
            className={`pd-panel-status pd-panel-status--${panelState}`}
            onClick={onPanel}
            title={panelState === 'ok' ? 'This page answers the Stream Deck panel' : 'Connecting to the Stream Deck panel…'}
            data-testid="panel-header-status"
            data-state={panelState}
          >
            Panel {panelState === 'ok' ? '✓' : '…'}
          </button>
        )}
        <ProductionSetupMenu
          showId={show.id}
          team={teamsAvailable && team ? { name: team.name, detail: `Shared with team “${team.name}”${edited ? ` · ${edited}` : ''}`, open: () => openTeam(team.id) } : undefined}
          onShare={teamsAvailable && !show.teamId ? () => openShare(show.id, show.name) : undefined}
          panel={panel}
          onPanel={onPanel}
          onPlayoutSettings={onPlayoutSettings}
          onLinks={onLinks}
          onLook={onLook}
          onExport={onExport}
        />
        {panelDialog}
        <button
          className="pd-allout"
          disabled={!(allOutEnabled ?? liveLayers.length > 0)}
          onClick={onAllOut}
          title="Play every live layer off and clear the frame"
          data-testid="verb-out-all"
          data-clearing={allOutClearing ? 'true' : undefined}
        >
          {allOutClearing ? 'Clearing…' : '■ All out'}
        </button>
      </header>
      {/* A teammate's save changed this production under the operator, or a save failed. Said
          once, in words, and dismissable - never silent (TEAMS_PLAN §3). */}
      {teamNote && (
        <div className="pd-team-note" role="status" data-testid="production-team-note">
          <span>{teamNote}</span>
          <div className="spacer" />
          <button onClick={() => dismissTeamNote(show.id)}>OK</button>
        </div>
      )}
      <main className="pd-body" ref={body} style={{ '--pd-rail-w': `${rail.width}px` } as React.CSSProperties}>
        {children}
        {/* Only beside the playout surface: Data and Audience take the whole body and have no
            rundown to resize. The phone hides it, where the rundown is a row of the one column. */}
        {sub === null && <RailResizer {...rail} />}
      </main>
    </div>
  );
}
