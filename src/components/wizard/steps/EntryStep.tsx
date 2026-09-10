import { useMemo } from 'react';
import { loadGraphics } from '../../../model/library';
import { loadShows } from '../../../model/shows';
import { hasCurrentVideoProject, listSavedVideoProjects } from '../../../model/videoProject';
import { useAdvancedMode } from '../../useAdvancedMode';

interface Props {
  onTemplates: () => void;
  onImportGraphic: () => void;
  onAi: () => void;
  onVideo: () => void;
  onBlank: () => void;
  /**
   * Go to Home. `section` is null for the dashboard, or one of Home's own sections for the
   * shortcuts beside it — the row offers "Graphics" and "Productions" because those are the
   * two answers to "pick up where you left off", and landing on the dashboard to click one
   * of them again is a stop the reference removes.
   */
  onHome: (section?: string | null) => void;
}

/**
 * Step 0 — the app's home moment. A hero states what NoaCG Studio is and who it's for, then
 * two halves: the HOME row (all saved work — the wizard is not the place to browse it, Home
 * is) and ways to start something new. Broadcast-graphics paths sit together; "Video or
 * animation with AI" is one separated line marked Beta, because it creates a STANDALONE
 * video — not a live broadcast graphic.
 *
 * THREE DIVERGENCES FROM re-design/handoff.md §2a ARE DELIBERATE. They are listed here so
 * nobody "fixes" the screen back towards the picture:
 *  - there is no "Start from a kit" card (see the note at the bottom of this comment);
 *  - a card ACTS ON CLICK; the reference draws radio dots and a Continue button, which is a
 *    second press for a choice that has already been made unambiguously;
 *  - Blank stays behind Advanced mode (docs/GOALS_ARCHIVE.md "Student release" step 4), so the
 *    default studio shows three cards where the reference shows four.
 *
 * The old per-graphic "Recent" chips are gone deliberately: in the default studio they
 * opened the EDITOR, the demoted surface, and Home's rows (control page, productions,
 * export) are the honest continuation of saved work.
 *
 * "Import graphic" is deliberately its own card and a MANUAL path — no AI anywhere in it.
 * A user who designed their graphic in Photoshop wants NoaCG to make it broadcast-ready
 * (fields, animation, export), not to regenerate it. Existing .html / SPX templates (and
 * logos to design around) go through Create with AI instead.
 *
 * THERE IS NO "Start from a kit" CARD. A kit is not a different way of starting — it is the
 * same walk over a whole set — so "one graphic or the whole kit" is asked at the top of the
 * BROWSE step, where designs are chosen and the answer can be changed without walking back
 * here. (This reverses docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18, 2026-07-23; see the reversal
 * recorded there.)
 */
export default function EntryStep({ onTemplates, onImportGraphic, onAi, onVideo, onBlank, onHome }: Props) {
  const advanced = useAdvancedMode((s) => s.advanced);
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
      {/* THE HERO IS A HEADLINE AND TWO LINES (re-design/handoff.md §2a) — nothing else.
          It used to carry a 40px BrandLogo above the title and a row of SPX / CasparCG /
          OGraf mono chips below the subtitle. Both are gone, and neither is a trim for space:
          the wizard's own topbar already wears the brand two inches higher, so a second logo
          states the same fact twice on the one screen where the reader has a decision to
          make; and three export targets rendered as CHIPS read as filters or as status,
          because that is what a row of small bordered pills means everywhere else in this
          app. The targets belong in the sentence, where they are a promise rather than
          furniture — which is exactly where the reference puts them. */}
      <div className="wz-hero">
        {/* THE HEADLINE IS THE LANDING PAGE'S, VERBATIM. A visitor arrives here seconds after
            reading it, and the app repeating the promise word for word is what makes the two
            surfaces one product. It also names the half most tools stop short of: creating a
            graphic is not the job, putting it on air is. */}
        <h1 className="wz-hero-title">
          Create live graphics. <span>Run the show.</span>
        </h1>
        {/* THE SUBTITLE CARRIES BOTH ROUTES TO AIR, and every export target rather than a
            sample of three: naming SPX, CasparCG and OGraf alone read as the whole list, which
            told an OBS, vMix, H2R or LiveOS user this was not for them.

            THE CONTROLLER ROUTE NAMES ITS MECHANISM, because "run it from the cloud" sounds
            like a platform you have to move onto, and the truth is the opposite: the playout
            client the studio already runs adds ONE browser source and never touches it again.
            That sentence is the answer to "do I have to change my setup", so it says the thing
            the operator actually does rather than where the software lives.

            It says BROWSER SOURCE, never "HTML overlay". `HTML overlay (OBS / vMix)` is the
            name of an export TARGET - a downloadable folder of files - so using the phrase for
            the live URL would make one term mean two products on the one screen. */}
        <p className="wz-hero-sub">
          Choose your graphics, then pick who drives them. Our controller runs the show live
          through one browser source your playout client loads once, or export them for OGraf,
          CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix.
        </p>
      </div>

      {/* ── Home: saved work first — creation is not the only door. Shown only when there
             IS work to continue; see hasSavedWork.

             A ROW, NOT A CARD, and it carries its own shortcuts (handoff §2a). Home holds two
             kinds of saved thing and the reader already knows which one they want, so the row
             names them: the body opens the dashboard, "Graphics" and "Productions" go
             straight to their section. Those are SIBLING buttons of the body button, never
             nested inside it — a button inside a button is invalid, and the same sibling
             pattern the Browse card's ⓘ uses. ── */}
      {hasSavedWork && (
      <div className="wz-continue" data-testid="wz-continue">
        <div className="wz-continue-row">
          <button className="wz-entry-card wz-continue-card" onClick={() => onHome(null)} data-entry="continue">
            <span className="wz-entry-icon">⌂</span>
            <span className="wz-continue-text">
              <strong>Home</strong>
              <span className="hint">
                Your saved graphics, productions, control panels, and videos — pick up where
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

      {/* THE TWO-COLUMN GRID (re-design/handoff.md §2a). Every card is the same two blocks: a
          TITLE ROW carrying the icon beside the title, then the description in a block of its
          own. The icon used to be a third stacked line, which put each card's copy at a
          different y and let the longest description make its whole grid row taller than the
          other (measured at 1366x768: row 1 179px, row 2 138px). Card copy is kept to what the
          row reserves — a card that needs a fourth line is a card that needs shorter copy.
          THREE cards in a two-column grid leave no hole: an ODD LAST CARD spans both columns
          (`.wz-entry-card:last-child:nth-child(odd)`), so the default studio reads as a full
          block and Advanced mode's fourth card restores the plain 2x2. */}
      <div className="wz-entry">
        <button className="wz-entry-card wz-entry-card--primary" onClick={onTemplates} data-entry="template">
          <span className="wz-entry-head">
            <span className="wz-entry-icon">▤</span>
            <strong>Start from a template</strong>
          </span>
          {/* The kit is named HERE because there is no kit card — this sentence is the only
              thing on the front page that says a whole set is possible, and the switch that
              does it sits at the top of Browse (see the note above). */}
          <span className="hint">Pick a design — one graphic, or the whole kit a show needs in one look — then choose your fields, style and animation. Tweak the code it writes, or never open it.</span>
        </button>
        <button className="wz-entry-card" onClick={onAi} data-entry="ai">
          <span className="wz-entry-head">
            <span className="wz-entry-icon">✦</span>
            {/* BETA, like the video door: the adapt-first pipeline is shipped and metered, but
                it is the least settled surface in the studio, and a card that promises the same
                polish as the catalog sets the wrong expectation for what comes back. */}
            <strong>
              Create with AI <span className="wz-beta-tag">Beta</span>
            </strong>
          </span>
          {/* THE TESTING PHASE IS SAID IN WORDS, NOT ONLY AS A TAG (owner, 2026-08-29). "Beta"
              is a label a reader can carry any meaning into; what this door actually owes them
              before they open it is that the RESULT is not settled yet. It leads the
              description rather than trailing it, because a caution nobody reaches is not a
              caution, and it sits INSIDE the .hint block so the card's three reserved lines
              still hold the whole of the copy — the entry grid's height budget is measured by
              e2e/wizard-entry-fit.spec.ts, and a fourth line pushes the video strip below the
              fold. It is brighter than the hint, never a second amber: the Beta tag on this
              card's own title is already the one accent the card is allowed. The fuller
              sentence — what varies, and what to reach for instead — is one screen in, on the
              AI step's own ⓘ, where the reader has actually opened the door. */}
          <span className="hint">
            <span className="wz-testing-note" data-testid="ai-testing-note">
              Still in testing - results vary.
            </span>{' '}
            Describe the graphic you need and NoaCG adapts a proven design to it. Drop in a
            logo, mood board or brand colours.
          </span>
        </button>
        <button className="wz-entry-card" onClick={onImportGraphic} data-entry="import-graphic">
          <span className="wz-entry-head">
            <span className="wz-entry-icon">▦</span>
            <strong>Import graphic</strong>
          </span>
          {/* IT NAMES SVG FIRST, because that is the import the Design step calls the best one
              (its text layers arrive as fields on their own) and a card that says only "image"
              reads as the raster road to anyone holding a drawing. It also names .html / .zip,
              because this card is where that file's owner looks: the same drop zone takes all of
              them (ImportDesignStep's `accept`), and the AI card used to be the only place either
              was mentioned — so anyone holding a finished template had to guess that the AI door,
              which they had every reason to avoid, was the way in. "No AI" and "already finished"
              are the same errand. Keep this copy no LONGER than it is: the entry grid's height
              budget is measured by e2e/wizard-entry-fit.spec.ts. */}
          <span className="hint">Bring your own artwork in — no AI: a layered SVG brings its text in as fields, a PNG or JPEG you place text on. Already have it as .html or .zip? Drop that in instead.</span>
        </button>
        {/* Blank's only outcome is the code editor, so the card is an Advanced-mode door
            (docs/GOALS_ARCHIVE.md "Student release" step 4). */}
        {advanced && (
          <button className="wz-entry-card" onClick={onBlank} data-entry="blank">
            <span className="wz-entry-head">
              <span className="wz-entry-icon">‹›</span>
              <strong>Blank project</strong>
            </span>
            <span className="hint">A minimal valid template — pure code-first, no training wheels.</span>
          </button>
        )}
      </div>

      {/* ── The video world, clearly apart: a standalone rendered video, not a live graphic.
             ONE QUIET LINE (handoff §2a). It was a full card with a three-line hint, which
             gave the BETA side-door more vertical weight than "Import graphic" — a shipped
             mode — and spent the entry step's tightest resource on the option fewest people
             want. What the line has to say is what makes it different from everything above
             it: it renders to a FILE, and it opens the other workspace. The rest was
             examples, and a mode nobody has chosen yet does not need examples.

             THE STRIP HAS NO LEADING LABEL. "Not a live graphic?" sat outside the card and
             indented it 160px, so the one row on the step that is not flush with the grid was
             the row already marked as the odd one out — the offset read as a layout fault
             rather than as separation, which the dashed rule above it already provides. The
             distinction the label carried is now the first words of the card's own hint,
             where it belongs to the thing it describes. ── */}
      <div className="wz-video-strip" data-testid="wz-video-strip">
        <button className="wz-entry-card wz-entry-card--video" onClick={onVideo} data-entry="video">
          <span className="wz-entry-icon">▶</span>
          <strong>
            Video or animation with AI <span className="wz-beta-tag">Beta</span>
          </strong>
          <span className="hint">Not a live graphic: it renders to a file, in the separate Video workspace.</span>
          <span className="wz-video-strip-go" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
