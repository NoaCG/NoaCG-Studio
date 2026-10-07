import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthState } from '../../auth/useAuthState';
import { useAuthUi } from '../../auth/authUi';
import { Svg } from '../../icons';
import { loadGraphics } from '../../../model/library';
import { loadShows } from '../../../model/shows';
import { hasCurrentVideoProject, listSavedVideoProjects } from '../../../model/videoProject';

interface Props {
  onTemplates: () => void;
  onImportGraphic: () => void;
  onAi: () => void;
  onVideo: () => void;
  /**
   * Go to Home. `section` is null for the dashboard, or one of Home's own sections for the
   * shortcuts beside it — the row offers "Graphics" and "Productions" because those are the
   * two answers to "pick up where you left off", and landing on the dashboard to click one
   * of them again is a stop the reference removes.
   */
  onHome: (section?: string | null) => void;
  /** Open this production, or the productions list when `productionId` is null (none saved). */
  onOpenPlayout: (productionId: string | null) => void;
  /** Make an empty production and open its rundown. */
  onNewProduction: () => void;
}

/**
 * Step 0 — the app's home moment. A hero states what NoaCG Studio is, then the HOME row (all
 * saved work, only when there is some), four equal start cards, and the Playout row: the two
 * halves of the product, making graphics and running the show, both reachable from the first
 * screen with nothing saved.
 *
 * DELIBERATE DIVERGENCES FROM re-design/handoff.md §2a, listed so nobody "fixes" the screen
 * back towards the picture:
 *  - there is no "Start from a kit" card: a kit is the same walk over a whole set, so "one
 *    graphic or the whole kit" is asked at the top of the BROWSE step (this reverses
 *    docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18, 2026-07-23);
 *  - a card ACTS ON CLICK; the reference draws radio dots and a Continue button, which is a
 *    second press for a choice that has already been made unambiguously;
 *  - there is no Blank card. Blank's only outcome was the old code editor, which no door opens
 *    any more (owner, 2026-09-24).
 *
 * "Import graphics" is deliberately its own card and a MANUAL path — no AI anywhere in it.
 */
export default function EntryStep({
  onTemplates,
  onImportGraphic,
  onAi,
  onVideo,
  onHome,
  onOpenPlayout,
  onNewProduction,
}: Props) {
  const { needsSignIn } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  /** Is there anything to continue? Home holds graphics, productions and videos, so any of
   *  them counts. On a first-ever visit there is nothing, and offering the loudest card on
   *  the screen as a door to an empty room is a false lead - creation leads instead. */
  const hasSavedWork = useMemo(
    () =>
      loadGraphics().length > 0 ||
      loadShows().length > 0 ||
      listSavedVideoProjects().length > 0 ||
      hasCurrentVideoProject(),
    [],
  );
  /** The production the Run the show card opens and names. "Last used" is the one saved most
   *  recently: every rundown edit, publish and graphic add stamps `updatedAt`, so it is the one
   *  the user touched last without a second record to keep in step. Nothing records which
   *  production this browser last OPENED, so a team production another member saved later
   *  wins; a per-browser "last opened" record would be a new store.
   *  RE-READ ON EVERY `spx-data-changed` (Home's rule): team productions arrive from the server
   *  after the step mounts and leave on sign-out, and a card naming a production that is gone,
   *  or missing one that just arrived, would open the wrong thing. */
  const [dataRev, setDataRev] = useState(0);
  useEffect(() => {
    const onData = () => setDataRev((r) => r + 1);
    window.addEventListener('spx-data-changed', onData);
    return () => window.removeEventListener('spx-data-changed', onData);
  }, []);
  const lastProduction = useMemo(
    () => loadShows().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dataRev` is the model's change signal
    [dataRev],
  );

  return (
    <div className="wz-entry-wrap">
      {/* THE HERO IS A HEADLINE AND ITS INTRO (re-design/handoff.md §2a) — nothing else. No
          second brand mark (the topbar wears one two inches higher) and no row of export-target
          chips (a row of small bordered pills reads as filters or status in this app). */}
      <div className="wz-hero">
        {/* THE HEADLINE IS THE LANDING PAGE'S, VERBATIM. A visitor arrives here seconds after
            reading it, and the app repeating the promise word for word is what makes the two
            surfaces one product. */}
        <h1 className="wz-hero-title">
          Create live graphics. <span>Run the show.</span>
        </h1>
        {/* A normal link opts into the alpha on a fresh boot and is bookmarkable on any host.
            It opens the current graphic; it never creates or replaces a document. */}
        <a className="wz-editor-alpha" href="/app?editor=foundation#/editor-foundation">
          Open editor <span className="wz-beta-tag">Alpha</span>
        </a>
        {/* THE INTRO IS THE OWNER'S, VERBATIM (2026-09-28): the product flow in reading order -
            make graphics first (the three ways the cards below offer), then use them however
            the production works. It names EVERY route to air - the browser source NoaCG plays
            itself, NoaCG Playout driving CasparCG through NoaCG Bridge, and the downloaded
            templates - and every export target rather than a sample of three. It says BROWSER
            SOURCE, never "HTML overlay", which is the name of an export TARGET. */}
        <p className="wz-hero-sub">
          Start from a template, create graphics with AI, or import your own SVGs. Then use them
          however your production works: play them directly from NoaCG through a browser source,
          connect NoaCG Playout to CasparCG with NoaCG Bridge, or download the graphics as HTML
          templates for OGraf, CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix.
        </p>
      </div>

      {/* ── Home: saved work first — creation is not the only door. Shown only when there
             IS work to continue; see hasSavedWork.

             A ROW, NOT A CARD, and it carries its own shortcuts (handoff §2a). The body opens
             the dashboard, "Graphics" and "Productions" go straight to their section. Those are
             SIBLING buttons of the body button, never nested inside it — a button inside a
             button is invalid. ── */}
      {hasSavedWork && (
      <div className="wz-continue" data-testid="wz-continue">
        <div className="wz-continue-row">
          <button className="wz-entry-card wz-continue-card" onClick={() => onHome(null)} data-entry="continue">
            <IconHome />
            <span className="wz-continue-text">
              <strong>Home</strong>
              <span className="hint">
                Your saved graphics, productions, control panels and videos.
              </span>
            </span>
          </button>
          <span className="wz-continue-jump">
            <button onClick={() => onHome('graphics')} data-entry="continue-graphics">Graphics</button>
            <button onClick={() => onHome('productions')} data-entry="continue-productions">Productions</button>
          </span>
        </div>
      </div>
      )}

      {/* FOUR EQUAL CARDS, in the owner's order (2026-09-28): the three ways to make graphics -
          a template, your own artwork, AI - then the video door as a fourth card of the same
          size, greyed. The intro above names the same three ways; its sentence order is the
          owner's copy and is not meant to match the row.

          SAME SIZE AND SAME TREATMENT means no card is tinted as the primary: the order says
          which one leads, and a tinted border on one card read as "this one is different",
          which is what the owner reported about the Import card. Every card is the same two
          blocks - a title row with its icon, then a description reserving three lines - so
          every card's copy starts at the same y and the row is one height. A card that needs a
          fourth line needs shorter copy: the step's height is a budget at 1366x768
          (e2e/wizard-entry-fit.spec.ts). Phones stack the same four in the same order.

          NO CAVEATS ON THE CARDS (owner, 2026-09-28): Create with AI carries no Beta tag and no
          "still in testing" line, and the greyed Video card no "not recommended" sentence. A
          first screen that hedges its doors is not understandable at once; the grey is the
          Video card's whole signal. */}
      <div className="wz-entry">
        <button className="wz-entry-card" onClick={onTemplates} data-entry="template">
          <span className="wz-entry-head">
            <IconTemplate />
            <strong>Start from a template</strong>
          </span>
          {/* The kit is named HERE because there is no kit card: the switch that makes a whole
              set sits at the top of Browse. */}
          <span className="hint">
            Pick a design, one graphic or a whole kit.
          </span>
        </button>
        <button className="wz-entry-card" onClick={onImportGraphic} data-entry="import-graphic">
          <span className="wz-entry-head">
            <IconVector />
            <strong>Import graphics</strong>
          </span>
          {/* A MANUAL path: a designer wants their drawing made broadcast-ready, not
              regenerated. SVG leads because its text layers arrive as fields on their own;
              .html / .zip are named because the same drop zone takes a finished template
              (ImportDesignStep's `accept`), and this card is where its owner looks. */}
          <span className="hint">
            SVG from Illustrator, no AI. Its text layers become fields. PNG, JPEG, .html or .zip
            work too.
          </span>
        </button>
        <button className="wz-entry-card" onClick={onAi} data-entry="ai">
          <span className="wz-entry-head">
            <IconAgent />
            <strong>Create with AI</strong>
          </span>
          {/* The route the studio recommends first: the user's own coding agent driving the
              NoaCG CLI (the AI step's AgentRouteCard says how), then describing it here. */}
          <span className="hint">
            Use your own AI coding agent with the NoaCG CLI, or describe it here.
          </span>
        </button>
        {/* THE VIDEO DOOR IS GREYED, NOT HIDDEN (owner, 2026-09-27). It makes a rendered FILE in
            the separate Video workspace, not a live graphic, and it keeps its place so nobody
            wonders where it went. A visitor we KNOW is signed out
            (`needsSignIn`, never true offline or while a session is still resolving) cannot
            enter the Video workspace: pressing the card opens the sign-in dialog instead, so
            "Sign in to try it." is a door and not a disabled dead end. While auth is loading
            the card behaves as signed in, and VideoStep keeps its own sign-in gate.
            ITS ACCESSIBLE NAME IS THE MODE'S FULL NAME, "Video or animation with AI", the name
            the Video step, the Videos section and the video specs use; the visible title drops
            "with AI" only because four titles share one laptop row. The hint stays announced
            as the description. */}
        <button
          className="wz-entry-card wz-entry-card--muted"
          onClick={needsSignIn ? () => openSignIn('Sign in to try video or animation with AI.') : onVideo}
          aria-label="Video or animation with AI"
          aria-describedby="wz-video-note"
          data-entry="video"
        >
          <span className="wz-entry-head">
            <IconVideo />
            <strong>Video or animation</strong>
          </span>
          <span className="hint" id="wz-video-note">
            Renders a video file, not a live graphic.
            {needsSignIn && ' Sign in to try it.'}
          </span>
        </button>
      </div>

      {/* ── RUN THE SHOW (owner, 2026-09-27 and 2026-09-28): nobody should have to make a
             graphic before they can have a rundown, and the rundown is one press from here.
             A PRESSABLE CARD ON THE HOME ROW'S CHASSIS: the owner found a text row with two
             small buttons broke the screen, where everything else is a card you press. The body
             opens the production used last and NAMES it, so the press is not a guess; with none
             saved it opens the productions list and says so. "New production" is a SIBLING
             button, never nested, and works on a first-ever visit: it makes an empty production
             and opens its rundown. Full width under the four start cards rather than a fifth
             card in their row: running the show is the other half of the product, not a way to
             start a graphic. ── */}
      <div className="wz-continue-row wz-playout" data-testid="wz-playout">
        <button
          className="wz-entry-card wz-continue-card"
          onClick={() => onOpenPlayout(lastProduction?.id ?? null)}
          data-entry="open-playout"
        >
          <IconRundown />
          <span className="wz-continue-text">
            <strong>Run the show</strong>
            {lastProduction ? (
              <span className="hint">
                Open “
                <span className="wz-playout-name" title={lastProduction.name}>
                  {lastProduction.name}
                </span>
                ”, your latest production, and take its graphics to air.
              </span>
            ) : (
              <span className="hint">
                Line up graphics in a production and take them to air. You have no production
                yet, so this opens your productions list.
              </span>
            )}
          </span>
        </button>
        <span className="wz-continue-jump">
          <button onClick={onNewProduction} data-entry="new-production">New production</button>
        </span>
      </div>
    </div>
  );
}

/* ── THE ENTRY ICONS: ONE DRAWN SET ──────────────────────────────────────────────────────────
   The cards used to wear Unicode glyphs (▤ ✦ ▦ ▶), which render in whatever font the platform
   has, at four different weights, and read as generic placeholders (owner, 2026-09-27). These
   are drawn for this screen on the house set's wrapper (components/icons.tsx `Svg`: 24-unit
   viewBox, round joins, `currentColor`), a size up and a lighter 1.6 stroke. The four cards
   share ONE idea - the same 18x15 screen, and what goes on it: a lower third (a template), a
   vector path with its anchors (your artwork), a terminal prompt (your coding agent), a play
   mark (a rendered video). The Playout row's rundown marks its on-air line with the one filled
   dot, and the Home row wears a house on the same grid. */
function EntryIcon({ children }: { children: ReactNode }) {
  return (
    <Svg className="wz-entry-icon" size={22} strokeWidth={1.6}>
      {children}
    </Svg>
  );
}

/** The shared 18x15 screen every start-card icon draws on. */
function ScreenIcon({ children }: { children: ReactNode }) {
  return (
    <EntryIcon>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      {children}
    </EntryIcon>
  );
}

function IconAgent() {
  return (
    <ScreenIcon>
      <path d="M7 10l3 2.25L7 14.5M12.5 15H17" />
    </ScreenIcon>
  );
}

function IconVector() {
  return (
    <ScreenIcon>
      <path d="M7.5 14C7.5 11 11 8.5 15 8.5" />
      <rect x="6" y="14" width="3" height="3" rx="0.6" />
      <rect x="15" y="7" width="3" height="3" rx="0.6" />
    </ScreenIcon>
  );
}

function IconTemplate() {
  return (
    <ScreenIcon>
      <path d="M6.5 14.5h8M6.5 16.75h5" />
    </ScreenIcon>
  );
}

function IconVideo() {
  return (
    <ScreenIcon>
      <path d="M10.25 9.25v5.5L14.75 12z" />
    </ScreenIcon>
  );
}

function IconHome() {
  return (
    <EntryIcon>
      <path d="M3.5 11L12 4l8.5 7M6 9v10.5h12V9M10 19.5v-5h4v5" />
    </EntryIcon>
  );
}

function IconRundown() {
  return (
    <EntryIcon>
      <path d="M9.5 7H20M9.5 12H20M9.5 17H20" />
      <circle cx="5" cy="7" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.1" />
      <circle cx="5" cy="17" r="1.1" />
    </EntryIcon>
  );
}
