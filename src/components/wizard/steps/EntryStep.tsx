import { useMemo, type ReactNode } from 'react';
import { useAuthState } from '../../auth/useAuthState';
import { useAuthUi } from '../../auth/authUi';
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
  /** The production used last, or the productions list when there is none. */
  onOpenPlayout: () => void;
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
 * "Import graphic" is deliberately its own card and a MANUAL path — no AI anywhere in it.
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

  return (
    <div className="wz-entry-wrap">
      {/* THE HERO IS A HEADLINE AND TWO LINES (re-design/handoff.md §2a) — nothing else. No
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
        {/* THE SUBTITLE CARRIES BOTH ROUTES TO AIR, and every export target rather than a
            sample of three. The controller route names its MECHANISM (one browser source the
            playout client loads once), because that is the answer to "do I have to change my
            setup". It says BROWSER SOURCE, never "HTML overlay", which is the name of an export
            TARGET. */}
        <p className="wz-hero-sub">
          Choose your graphics, then pick who drives them. Our controller runs the show live
          through one browser source your playout client loads once, or export them for OGraf,
          CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix.
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
            <span className="wz-entry-icon">⌂</span>
            <span className="wz-continue-text">
              <strong>Home</strong>
              <span className="hint">
                Your saved graphics, productions, control panels and videos. Pick up where
                you left off.
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

      {/* FOUR EQUAL CARDS (owner, 2026-09-27). The three ways to start, in the order the owner
          ranks them - your own AI coding agent through the NoaCG CLI, your own artwork, a
          template - then the video door as a fourth card of the same size, greyed.

          SAME SIZE AND SAME TREATMENT means no card is tinted as the primary: the order says
          which one leads, and a tinted border on one card read as "this one is different",
          which is what the owner reported about the Import card. Every card is the same two
          blocks - a title row with its icon, then a description reserving three lines - so
          every card's copy starts at the same y and the row is one height. A card that needs a
          fourth line needs shorter copy: the step's height is a budget at 1366x768
          (e2e/wizard-entry-fit.spec.ts). Phones stack the same four in the same order. */}
      <div className="wz-entry">
        <button className="wz-entry-card" onClick={onAi} data-entry="ai">
          <span className="wz-entry-head">
            <IconAgent />
            {/* BETA: the adapt-first pipeline is shipped and metered, but it is the least
                settled surface in the studio. */}
            <strong>
              Create with AI <span className="wz-beta-tag">Beta</span>
            </strong>
          </span>
          {/* THE TESTING PHASE IS SAID IN WORDS, NOT ONLY AS A TAG (owner, 2026-08-29), and it
              LEADS the hint, inline, so the three reserved lines still hold the whole card. The
              rest names the route the studio recommends first: the user's own coding agent
              driving the NoaCG CLI (the AI step's AgentRouteCard says how). */}
          <span className="hint">
            <span className="wz-testing-note" data-testid="ai-testing-note">
              Still in testing - results vary.
            </span>{' '}
            Use your own AI coding agent with the NoaCG CLI, or describe it here.
          </span>
        </button>
        <button className="wz-entry-card" onClick={onImportGraphic} data-entry="import-graphic">
          <span className="wz-entry-head">
            <IconVector />
            <strong>Import graphic</strong>
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
        <button className="wz-entry-card" onClick={onTemplates} data-entry="template">
          <span className="wz-entry-head">
            <IconTemplate />
            <strong>Start from a template</strong>
          </span>
          {/* The kit is named HERE because there is no kit card: the switch that makes a whole
              set sits at the top of Browse. */}
          <span className="hint">
            Pick a design, one graphic or a whole kit. Then set its fields, style and motion.
          </span>
        </button>
        {/* THE VIDEO DOOR IS GREYED, NOT HIDDEN (owner, 2026-09-27). It makes a rendered FILE in
            the separate Video workspace, not a live graphic, and it is not ready to recommend.
            It keeps its place so nobody wonders where it went. A visitor we KNOW is signed out
            (`needsSignIn`, never true offline or while a session is still resolving) cannot
            enter the Video workspace: pressing the card opens the sign-in dialog instead, so
            "Sign in to try it." is a door and not a disabled dead end. While auth is loading
            the card behaves as signed in, and VideoStep keeps its own sign-in gate.
            ITS ACCESSIBLE NAME IS THE MODE'S FULL NAME, "Video or animation with AI", the name
            the Video step, the Videos section and the video specs use; the visible title drops
            "with AI" only because four titles share one laptop row. The note stays announced
            as the description. `--video` stays as the card's stable hook
            (scripts/landing-shots.mjs crops by it). */}
        <button
          className="wz-entry-card wz-entry-card--muted wz-entry-card--video"
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
            Not recommended yet. It renders a video file, not a live graphic.
            {needsSignIn && ' Sign in to try it.'}
          </span>
        </button>
      </div>

      {/* ── THE PLAYOUT ROW (owner, 2026-09-27): nobody should have to make a graphic before
             they can have a rundown. Two plain actions that work on a first-ever visit with
             nothing saved: "Open Playout" goes to the production used last, or to the
             productions list when there is none; "New production" makes an empty one and
             opens its rundown, where its own add-graphics control is waiting.
             A ROW, NOT A FIFTH CARD: it is the other half of the product, running the show,
             not a way to start a graphic. Its buttons are secondary, never amber - the cards
             above are what the step recommends. ── */}
      <div className="wz-playout" data-testid="wz-playout">
        <span className="wz-playout-text">
          <IconRundown />
          <span className="wz-playout-copy">
            <strong>Run the show</strong>
            <span className="hint">Line up graphics in a production and take them to air.</span>
          </span>
        </span>
        <span className="wz-playout-actions">
          <button onClick={onOpenPlayout} data-entry="open-playout">Open Playout</button>
          <button onClick={onNewProduction} data-entry="new-production">New production</button>
        </span>
      </div>
    </div>
  );
}

/* ── THE ENTRY ICONS: ONE DRAWN SET ──────────────────────────────────────────────────────────
   The cards used to wear Unicode glyphs (▤ ✦ ▦ ▶), which render in whatever font the platform
   has, at four different weights, and read as generic placeholders (owner, 2026-09-27). These
   are drawn for this screen on one grid: 24-unit viewBox, 1.6 stroke, round joins, drawing
   `currentColor` like the house set in components/icons.tsx. The four cards share ONE idea -
   the same 18x15 screen, and what goes on it: a terminal prompt (your coding agent), a vector
   path with its anchors (your artwork), a lower third (a template), a play mark (a rendered
   video). The Playout row's rundown marks its on-air line with the one filled dot. */
function EntryIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="wz-entry-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
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
