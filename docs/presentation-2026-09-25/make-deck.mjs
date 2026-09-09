/**
 * A STARTING-POINT generator for the 25 September 2026 deck, and nothing more than that.
 *
 * The deck itself is `NoaCG-2026-09-25.pptx` beside this file. That file is the artifact: it is
 * opened, presented and hand-edited in PowerPoint or LibreOffice, and a hand edit ALWAYS wins.
 * So this script refuses to write over a file that exists. To rebuild from scratch, move or
 * delete the old deck first, which is a deliberate act rather than a side effect of running a
 * command. Nothing in `npm run build` runs this.
 *
 * Content of record: `docs/DEMO_2026-09-25.md`. Every sentence on a slide traces to that file's
 * evidence column, and the speaker notes name the beat, its status on 2026-09-09 and the file
 * that proves it.
 *
 * THIS SCRIPT IS ALLOWED TO DRIFT FROM THE DECK, AND NOTHING CHECKS THAT IT HAS NOT. The deck
 * was built from this exact script on 2026-09-09 and never again: from the first hand edit on,
 * the deck is the one that is true, and this file is the record of how it started. No gate
 * lints it (`eslint .` scopes its rules to src/, scripts/, e2e/, api/ and render-worker/) and no
 * gate runs it (`pptxgenjs` is not a project dependency), so a broken generator stays green.
 * That is accepted on purpose: the alternative is a generator that rewrites the owner's slides.
 *
 * Run it once, from the repository root, with pptxgenjs installed ad hoc (it is not a project
 * dependency and never becomes one for a one-off deck):
 *
 *     npm install --no-save pptxgenjs
 *     node docs/presentation-2026-09-25/make-deck.mjs [--out <path.pptx>]
 *
 * Typefaces: the brand faces (Space Grotesk, IBM Plex Sans, JetBrains Mono) are not installed
 * on the presenting laptop, and a .pptx cannot carry a fallback stack, so the deck is set in
 * Arial and Consolas, which every Windows and Office install has. If the brand faces are
 * installed later, PowerPoint's Home > Replace > Replace Fonts swaps them in one go.
 */

import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import PptxGenJS from 'pptxgenjs';

// ---------------------------------------------------------------------------------------------
// Where the deck goes, and the refusal that keeps a hand-edited deck safe.
// ---------------------------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const outFlag = process.argv.indexOf('--out');
const asked = outFlag > -1 && process.argv[outFlag + 1] ? process.argv[outFlag + 1] : resolve(HERE, 'NoaCG-2026-09-25.pptx');
// NORMALISE THE EXTENSION HERE, not in the library. `pres.writeFile()` appends '.pptx' to a name
// that lacks one, so the path a caller names and the path that gets written are not the same
// path - and an existence check on the first one lets `--out deck` destroy `deck.pptx`. We write
// the file ourselves below, so this is the only place the final name is decided.
const OUT = asked.toLowerCase().endsWith('.pptx') ? resolve(asked) : resolve(`${asked}.pptx`);

// ---------------------------------------------------------------------------------------------
// Brand tokens (NoaCG-Brand-Kit/BRAND-MANUAL.md §3) and the type stack this deck can rely on.
// pptxgenjs colours are six hex digits with no '#'.
// ---------------------------------------------------------------------------------------------

const VOID = '0A0C10'; // base canvas
const PANEL = '141922'; // surfaces
const INPUT = '0E1014'; // a code panel: always darker than its parent
const HAIRLINE = '262F3C'; // quiet dividers
const AMBER = 'F6A623'; // the one accent, in small doses
const PAPER = 'E8EDF2'; // text
const MID = 'C6CCD6'; // secondary text
const DIM = '8B98A8'; // muted text (the wordmark's "CG" grey)
const FAINT = '6B7382'; // hints and microlabels

const DISPLAY = 'Arial';
const BODY = 'Arial';
const MONO = 'Consolas';

// Canvas: 16:9 wide, 13.333 x 7.5 inches. One margin everywhere.
const W = 13.333;
const M = 0.7;
const CW = W - 2 * M; // content width

const TOTAL_SLIDES = 7;

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'NoaCG Studio';
pres.title = 'NoaCG Studio, 25 September 2026';

// ---------------------------------------------------------------------------------------------
// Small helpers so every slide is built from the same handful of pieces. Every text box is a
// real text box (isTextBox) with no internal padding (margin 0), so edges line up with shapes.
// ---------------------------------------------------------------------------------------------

/** A text box. `runs` is a string or an array of pptxgenjs runs. */
function text(slide, runs, opts) {
  slide.addText(runs, { isTextBox: true, margin: 0, valign: 'top', fontFace: BODY, color: PAPER, ...opts });
}

/** The mono microlabel every slide opens with: where we are in the ninety minutes. */
function label(slide, s) {
  text(slide, s.toUpperCase(), { x: M, y: 0.55, w: CW, h: 0.3, fontFace: MONO, fontSize: 12, color: AMBER, charSpacing: 2 });
}

/** A slide heading. */
function heading(slide, s, y = 0.9, size = 44) {
  text(slide, s, { x: M, y, w: CW, h: 0.9, fontFace: DISPLAY, fontSize: size, bold: true, charSpacing: -1 });
}

/** A mono section head inside a column or a panel. */
function head(slide, s, x, y, w) {
  text(slide, s.toUpperCase(), { x, y, w, h: 0.26, fontFace: MONO, fontSize: 11, color: AMBER, charSpacing: 2 });
}

/** A surface panel. */
// NO `line` PROPERTY, deliberately: omitting it is pptxgenjs's own "draw no outline". Asking for
// `line: { width: 0 }` does the opposite, because the library reads it as `options.line.width || 1`
// and 0 is falsy, so a zero-width request becomes a 1pt stroke and every panel lands half a point
// larger per side than the geometry above says. A caller that wants an outline passes one in opts,
// which is spread last and replaces this shape's whole line setting.
function panel(slide, x, y, w, h, opts = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: PANEL }, ...opts });
}

/** The quiet line at the foot of a slide. */
function foot(slide, s, y = 6.75) {
  text(slide, s, { x: M, y, w: CW - 1.2, h: 0.3, fontSize: 14, color: FAINT });
}

/** The slide counter, bottom right. */
function counter(slide, n) {
  text(slide, `${n} / ${TOTAL_SLIDES}`, { x: W - M - 1.0, y: 6.78, w: 1.0, h: 0.25, fontFace: MONO, fontSize: 11, color: FAINT, align: 'right' });
}

/** A new slide on the void, numbered. */
function newSlide(n) {
  const slide = pres.addSlide();
  slide.background = { color: VOID };
  counter(slide, n);
  return slide;
}

/** A numbered step: an amber mono number in the gutter, then the step and, on its own line, where to go. */
function step(slide, n, x, y, w, main, pointer, mainSize = 19) {
  text(slide, String(n).padStart(2, '0'), { x, y: y + 0.05, w: 0.5, h: 0.3, fontFace: MONO, fontSize: 14, color: AMBER });
  // The paragraph break exists only when a pointer follows, so a bare step ends without an
  // empty line for a hand editor to find.
  const runs = [{ text: main, options: { fontSize: mainSize, color: PAPER, breakLine: Boolean(pointer), paraSpaceAfter: 4 } }];
  if (pointer) runs.push({ text: pointer, options: { fontSize: 13, fontFace: MONO, color: DIM } });
  text(slide, runs, { x: x + 0.55, y, w: w - 0.55, h: 0.95 });
}

/** A straight connector with an arrowhead at its end. */
function arrow(slide, x, y, w, h, color, flipV = false) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h, flipV, line: { color, width: 1.5, endArrowType: 'triangle' } });
}

// =============================================================================================
// 1. TITLE. Script §0 and §1: the room has just sat down; the slide says what the ninety
//    minutes are and who drives.
// =============================================================================================
{
  const s = newSlide(1);

  // The bar mark, built to the brand construction: bar height 1x, gap 0.5x, radius 0.2x,
  // widths 100 / 66 / 40. Here 1x = 0.2 in.
  const u = 0.2;
  for (const [i, wf] of [1, 0.66, 0.4].entries()) {
    // No `line`, for the reason spelled out on `panel()`: the bar widths are the construction, and
    // a 1pt stroke on a 0.2in bar is a visible error in the mark.
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 0.75 + i * 1.5 * u, w: 4 * u * wf, h: u, rectRadius: 0.2 * u, fill: { color: AMBER } });
  }
  text(s, [
    { text: 'Noa', options: { bold: true, color: PAPER } },
    { text: 'CG', options: { color: DIM } },
  ], { x: M + 4 * u + u, y: 0.72, w: 3, h: 0.5, fontFace: DISPLAY, fontSize: 28, charSpacing: -1 });
  text(s, 'STUDIO', { x: M + 4 * u + u, y: 1.2, w: 3, h: 0.25, fontFace: MONO, fontSize: 11, color: DIM, charSpacing: 3 });

  text(s, '25 SEPTEMBER 2026  ·  STUDENTS AND YLE  ·  HANDS ON', { x: M, y: 2.35, w: CW, h: 0.3, fontFace: MONO, fontSize: 12, color: AMBER, charSpacing: 2 });
  text(s, 'Your own graphics,\non your own systems.', { x: M, y: 2.8, w: CW, h: 1.9, fontFace: DISPLAY, fontSize: 56, bold: true, charSpacing: -1.5, lineSpacingMultiple: 0.98 });
  text(s, 'Draw one, or ask your coding agent for one. Put it on air from a browser. Then run it on whatever you already have in the room.', { x: M, y: 4.85, w: 9.2, h: 1.0, fontSize: 22, color: MID, lineSpacingMultiple: 1.15 });
  foot(s, 'Ninety minutes. You drive; we drive only what needs a playout box or an agent subscription.');

  s.addNotes(
    'BEFORE THE ROOM, NOT IN IT. B0, the network: the 2026-08-20 Yle demo failed on Yle\'s network, and the diag screenshot from that network (https://noacg.studio/app?diag=1) is still an open owner item, docs/acceptance/owner-queue/2026-09-09-g-yle-network-diag-screenshot.md. If it has not arrived, the phone hotspot is the plan and you say so in the room. This deck opens from a file and needs no network.\n' +
    'B1: the morning of, check https://noacg.studio/version.json against the tip of main.\n\n' +
    'THE CLOCK. 10 opening, 30 road 1, 25 road 2, 20 on air, 5 close. A beat that runs long is cut at the next beat\'s boundary, never stretched.\n\n' +
    'WHO DRIVES. They do, on their own laptops. We drive the CasparCG box, the OGraf renderer and one agent on the screen.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 (the five calls, timing), §1 (B0, B1).',
  );
}

// =============================================================================================
// 2. WHAT NOACG IS. Beat O1. Four sentences, each with a row in docs/PROMISE_AUDIT.md; the
//    slide may not claim more than the audit grades, exactly as the landing page may not.
// =============================================================================================
{
  const s = newSlide(2);
  label(s, 'Opening  ·  10 min');
  heading(s, 'What NoaCG is');

  const claims = [
    ['Free and open source.', 'AGPL-3.0. There is no edition to buy.'],
    ['The code is the graphic.', 'Real HTML, CSS and JavaScript. A single-file export runs from a file, with no internet.'],
    ['Export to what you already run.', 'SPX Graphics, CasparCG, OBS and vMix, H2R, LiveOS, OGraf.'],
    ['No account until you publish.', 'Create, edit and export with none. A free one to publish a production and get its URL.'],
  ];
  const gap = 0.22;
  const pw = (CW - gap) / 2;
  const ph = 2.15;
  claims.forEach(([title, body], i) => {
    const x = M + (i % 2) * (pw + gap);
    const y = 1.9 + Math.floor(i / 2) * (ph + gap);
    panel(s, x, y, pw, ph);
    text(s, String(i + 1).padStart(2, '0'), { x: x + 0.35, y: y + 0.3, w: 0.6, h: 0.25, fontFace: MONO, fontSize: 12, color: AMBER });
    text(s, title, { x: x + 0.35, y: y + 0.65, w: pw - 0.7, h: 0.45, fontFace: DISPLAY, fontSize: 24, bold: true, charSpacing: -0.5 });
    text(s, body, { x: x + 0.35, y: y + 1.15, w: pw - 0.7, h: 0.95, fontSize: 17, color: MID, lineSpacingMultiple: 1.15 });
  });
  foot(s, 'noacg.studio');

  s.addNotes(
    'O1. Every sentence on this slide has a row in docs/PROMISE_AUDIT.md, cited by its promise text: "Free and open source, AGPL-3.0, no paid edition"; "No lock-in: real HTML/CSS/JS, self-contained packages, runs from a local file with no internet" (WORKS WITH A STATED LIMITATION: the single-file targets and the SPX folder run from a file; an OGraf or LiveOS package is ES modules and needs an http server, which is why the slide says single-file); "Exports to SPX Graphics, CasparCG, OBS and vMix, H2R, LiveOS, OGraf"; "No account to create, edit and export"; "A production ... one persistent output URL" (the free account).\n\n' +
    'IF ASKED. CasparCG Connect through the CLI agent has not been run against real hardware; the exported package has (docs/STUDENT_RELEASE_ACCEPTANCE.md §2).\n\n' +
    'Source: docs/DEMO_2026-09-25.md §2 O1; docs/PROMISE_AUDIT.md.',
  );
}

// =============================================================================================
// 3. THE ONE PICTURE. Beat O2: your artwork or your agent, then a library, then a production,
//    then one URL. The script says the deck is this picture plus the beat headings; this is the
//    picture, drawn in native shapes so it can be moved by hand.
// =============================================================================================
{
  const s = newSlide(3);
  label(s, 'Opening  ·  The shape of the session');
  heading(s, 'Two roads in, one road out.');

  const nodeH = 1.25;
  // The three rows share their centres with the target boxes on the right: 2.75, 3.875, 5.0 in.
  const topY = 2.75 - nodeH / 2; // artwork
  const midY = 3.875 - nodeH / 2; // the library / production / URL row
  const botY = 5.0 - nodeH / 2; // agent
  const cy = (y) => y + nodeH / 2;

  // A node: a panel with a title and a one-line sub. `you` puts the YOU tag above the title.
  const node = (x, y, w, title, sub, { you = false, hot = false } = {}) => {
    panel(s, x, y, w, nodeH, hot ? { line: { color: AMBER, width: 1.5 } } : {});
    if (you) text(s, 'YOU', { x: x + 0.22, y: y + 0.18, w: 1, h: 0.2, fontFace: MONO, fontSize: 10, color: AMBER, charSpacing: 2 });
    text(s, title, { x: x + 0.22, y: y + (you ? 0.42 : 0.3), w: w - 0.4, h: 0.35, fontFace: DISPLAY, fontSize: 18, bold: true });
    text(s, sub, { x: x + 0.22, y: y + (you ? 0.78 : 0.7), w: w - 0.4, h: 0.45, fontSize: 12.5, color: DIM });
  };

  // Columns, left to right.
  const c1 = { x: M, w: 3.0 };
  const c2 = { x: 4.2, w: 2.0 };
  const c3 = { x: 6.6, w: 2.0 };
  const c4 = { x: 9.0, w: 1.85 };
  const c5 = { x: 11.35, w: W - M - 11.35 };

  head(s, 'Road 1 and road 2', c1.x, 1.85, 4);
  text(s, "THE ROOM'S SYSTEMS", { x: W - M - 3, y: 1.85, w: 3, h: 0.26, fontFace: MONO, fontSize: 11, color: AMBER, charSpacing: 2, align: 'right' });

  node(c1.x, topY, c1.w, 'Your artwork', 'Illustrator, Figma or Inkscape. An SVG.', { you: true });
  node(c1.x, botY, c1.w, 'Your coding agent', 'Claude Code, Codex, or the CLI alone.', { you: true });
  node(c2.x, midY, c2.w, 'Library', 'One record, either road.');
  node(c3.x, midY, c3.w, 'Production', 'Cues. Take, Update, Out.');
  node(c4.x, midY, c4.w, 'One URL', 'The output, live.', { hot: true });

  // Both roads meet in the library.
  arrow(s, c1.x + c1.w, cy(topY), c2.x - (c1.x + c1.w), cy(midY) - cy(topY), DIM);
  arrow(s, c1.x + c1.w, cy(midY), c2.x - (c1.x + c1.w), cy(botY) - cy(midY), DIM, true);
  // Library to production to one URL.
  arrow(s, c2.x + c2.w, cy(midY), c3.x - (c2.x + c2.w), 0, DIM);
  arrow(s, c3.x + c3.w, cy(midY), c4.x - (c3.x + c3.w), 0, DIM);

  // The URL fans out to whatever the room runs; these three are the amber lines.
  const tH = 0.7;
  const targets = ['OBS', 'CasparCG', 'OGraf'];
  const tYs = [cy(topY) - tH / 2, cy(midY) - tH / 2, cy(botY) - tH / 2];
  targets.forEach((name, i) => {
    panel(s, c5.x, tYs[i], c5.w, tH);
    text(s, name, { x: c5.x, y: tYs[i], w: c5.w, h: tH, fontFace: DISPLAY, fontSize: 14, bold: true, align: 'center', valign: 'middle' });
  });
  const fx = c4.x + c4.w;
  const fw = c5.x - fx;
  arrow(s, fx, cy(topY), fw, cy(midY) - cy(topY), AMBER, true);
  arrow(s, fx, cy(midY), fw, 0, AMBER);
  arrow(s, fx, cy(midY), fw, cy(botY) - cy(midY), AMBER);

  // The second door out of the library: a package, played with no network.
  text(s, 'Or export a package from the library and play the file with no network at all.', { x: c2.x, y: midY + nodeH + 0.2, w: 2.9, h: 0.6, fontSize: 12.5, color: DIM, lineSpacingMultiple: 1.15 });

  text(s, 'Both roads end in the library. From there it is the same three steps, so we do that part once, together, at the end.', { x: M, y: 6.0, w: CW, h: 0.5, fontSize: 17, color: MID });

  s.addNotes(
    'O2. This is the deck the script asked for: one picture plus the beat headings. Say the shape out loud now so the room knows why on-air comes last: an imported SVG and an agent-made graphic both become a library record, both go into a production, and both air through one output URL (§0, call 2).\n\n' +
    'ORDER. Road 1 goes first because the whole room can do it with no terminal, no subscription and no account (§0, call 3).\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 calls 2 and 3, §2 O2.',
  );
}

// =============================================================================================
// 4. ROAD 1: YOUR OWN GRAPHIC. Script §3, beats R1.1 to R1.6. The left half is what the room
//    does now; the right half is the two sentences the script says to say before they are asked.
// =============================================================================================
{
  const s = newSlide(4);
  label(s, 'Road 1  ·  30 min  ·  You drive');
  heading(s, 'Your own graphic');

  const lx = M;
  const lw = 7.0;
  const steps = [
    ['Draw it to the five rules, or take a sample.', '/docs#svg-rules  ·  samples: lower-third, scorebug, quiz-board'],
    ['Drop it. The layer names become the field names.', 'noacg.studio/app  >  New graphic  >  Import graphic'],
    ['Type a name longer than you drew for. Watch what the panel does.', 'the Fields step: wider, then a new line, and only then smaller'],
    ['Pick what it does. The quiz board locks and reveals; the scorebug counts.', 'the Fields step  >  Behaviour'],
    // NEVER "Create project". That button is reachable from every step of this road and it does
    // NOT save (CreationWizard.tsx create() -> applyDraftProject() with no arguments: "Saving
    // stays the user's move"). Finish's doors are the ones that save on purpose, so the room is
    // sent to Finish and to a door by name. See docs/backlog/create-project-is-a-door-that-saves-nothing.md.
    ['Finish: name it, then take the production door. It saves the graphic and puts it in a show.', 'the Finish step  >  Add to the production'],
  ];
  steps.forEach(([main, pointer], i) => step(s, i + 1, lx, 1.9 + i * 0.98, lw, main, pointer));

  const rx = 8.1;
  const rw = W - M - rx;
  const pad = 0.3;
  panel(s, rx, 1.9, rw, 1.95);
  head(s, 'Say it before they ask', rx + pad, 1.9 + pad, rw - 2 * pad);
  text(s, [
    { text: 'If a long name does not grow the way you meant, the answer is one dropdown on the Fields step: ', options: {} },
    { text: 'When the text is too long', options: { bold: true } },
    { text: '.', options: {} },
  ], { x: rx + pad, y: 1.9 + pad + 0.35, w: rw - 2 * pad, h: 1.2, fontSize: 16, color: MID, lineSpacingMultiple: 1.15 });

  panel(s, rx, 4.0, rw, 1.3);
  text(s, [
    { text: 'A typeface Google does not have, or a licensed one, takes the ', options: {} },
    { text: 'upload', options: { bold: true } },
    // The Typefaces row lives on the FIELDS step (MapSvgFieldsStep.tsx, the "Upload font file…"
    // button), which on this road is Start, Design, Fields, Animation, Finish - two screens
    // before the end, not the last one.
    { text: ' road in the Typefaces row, on the Fields step.', options: {} },
  ], { x: rx + pad, y: 4.0 + pad, w: rw - 2 * pad, h: 0.9, fontSize: 16, color: MID, lineSpacingMultiple: 1.15 });

  panel(s, rx, 5.45, rw, 1.05);
  head(s, 'The guide', rx + pad, 5.45 + pad, rw - 2 * pad);
  text(s, 'noacg.studio/docs#first-graphic', { x: rx + pad, y: 5.45 + pad + 0.32, w: rw - 2 * pad, h: 0.35, fontFace: MONO, fontSize: 16, color: AMBER });

  s.addNotes(
    '§3, R1.1 to R1.6. Status on 2026-09-09: WORKS on the shipped samples for all six beats, with one exception. R1.4, behaviour on artwork nobody at NoaCG drew, is pinned by e2e/import-svg-behaviour.spec.ts, but you have not looked at your OWN quiz board since the three text-box fixes (docs/TEXT_BOX_BINDING.md). The 12th is that walk.\n\n' +
    'R1.3 ON THEIR OWN FILE. The growth default is measured off the geometry and for some exporter shapes it disagrees with what the designer meant (docs/backlog/svg-growth-default-across-exporters.md). That is why the dropdown sentence is said out loud rather than waited for.\n\n' +
    'THE ROAD, IN SCREENS. Start, Design, Fields, Animation, Finish (src/components/wizard/CreationWizard.tsx, STEP_TITLES_SVG). "Create project" sits in the footer from Design onwards and it does NOT save - it builds with defaults for everything not yet reached and hands you to the code editor (create() calls applyDraftProject() with no arguments; both Finish doors save on purpose). DO NOT name it in the room: send people to Finish and to a door by name. docs/backlog/create-project-is-a-door-that-saves-nothing.md is the open question about whether that button should be renamed or should save.\n\n' +
    'R1.5. A Yle designer\'s licensed face takes the upload road, in the Typefaces row on the FIELDS step - two screens before the end. The Google door is offered only where Google has the family.\n\n' +
    'NOT A BEAT. The live-vote encore needs a fixture brought by hand and has two open backlog items; only if the room is ahead of the clock.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §3; the guide is docs.html #first-graphic, landed 2026-09-09.',
  );
}

// =============================================================================================
// 5. ROAD 2: YOUR CODING AGENT. Script §4, beats R2.1 to R2.6. The number is docs/AGENT_CLI.md
//    "Time to air, measured". R2.5 is a GAP in the script: the leg from the library to air has
//    no stopwatch on it, and the slide says so next to the number rather than saying "minutes".
// =============================================================================================
{
  const s = newSlide(5);
  label(s, 'Road 2  ·  25 min  ·  Everyone, then those with an agent');
  heading(s, 'Your coding agent');

  head(s, 'Everyone, no agent needed', M, 1.85, 6);
  const codeY = 2.2;
  const codeH = 1.55;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: codeY, w: CW, h: codeH, rectRadius: 0.1, fill: { color: INPUT }, line: { color: HAIRLINE, width: 0.75 } });
  const cmd = (t) => ({ text: t, options: { color: PAPER } });
  const note = (t) => ({ text: t, options: { color: FAINT } });
  const nl = { text: '', options: { breakLine: true } };
  text(s, [
    cmd('npx -y @noacg/cli scaffold --type scoreboard --design neutral --out ./sb'), nl,
    cmd('npx -y @noacg/cli validate ./sb --screenshots ./shots'), nl,
    cmd('npx -y @noacg/cli login          '), note('# once; a browser asks one question'), nl,
    cmd('npx -y @noacg/cli save ./sb      '), note('# prints a link that opens at once'),
  ], { x: M + 0.3, y: codeY + 0.22, w: CW - 0.6, h: codeH - 0.4, fontFace: MONO, fontSize: 14, lineSpacingMultiple: 1.25 });

  // The measured number, and the honest sentence about the leg nobody has timed.
  const lw = 5.4;
  text(s, '24.8 s', { x: M, y: 4.0, w: lw, h: 0.95, fontFace: DISPLAY, fontSize: 60, bold: true, color: AMBER, charSpacing: -2 });
  text(s, [
    { text: 'Tool time for the seven CLI verbs', options: { bold: true, color: PAPER } },
    // NOT "the only verb that opens a browser": every one of them does, because they all reach the
    // studio through BridgeClient.connect(), which launches one (cli/src/bridgeClient.ts:158).
    // validate is the slow one for what it does INSIDE that browser.
    { text: ', measured by hand on 2026-09-09. They all start a browser to reach the studio; validate is 10.7 s of it because it also runs the gate and writes three full-size frames. The rest of the clock is what the agent spends designing, plus the hop to a player. Nobody has put a stopwatch on that last leg end to end yet, so this is the number there is.', options: {} },
  ], { x: M, y: 5.0, w: lw, h: 1.7, fontSize: 14.5, color: MID, lineSpacingMultiple: 1.2 });

  // With an agent: the three steps.
  const rx = 6.7;
  const rw = W - M - rx;
  head(s, 'With Claude Code or Codex', rx, 4.0, rw);
  step(s, 1, rx, 4.4, rw, 'Paste the one prompt. It installs, checks itself, and asks what to make.', '/docs#agent-install', 16);
  step(s, 2, rx, 5.3, rw, 'Say what you want. "A clean scoreboard for a floorball stream: home, away, period, clock."', null, 16);
  step(s, 3, rx, 5.95, rw, 'It authors, validates with screenshots, fixes what the validator reports, and saves.', null, 16);

  s.addNotes(
    '§4. R2.1 is for everyone, subscription or not. R2.3: you drive one agent on the screen; the evidence is the 2026-08-22 round, 25 of 25 cells validator-clean and every one airable in your own blind read (benchmarks/agent/rounds/2026-08-22/VERDICT.md).\n\n' +
    'THE NUMBER. docs/AGENT_CLI.md, "Time to air, measured": one walk, one machine, 2026-09-09, against a dev server on the branch\'s own build (not 0.3.0 from npm), from an empty folder. 24.8 s is doctor + types + scaffold + validate + inspect + screenshot + pack. Setup once per machine is another 8.7 s.\n\n' +
    'R2.5: THE CLOUD LEG IS UNTIMED. The measurement stopped at the package\'s own fallback player. The cloud save and the studio\'s output URL were not walked: save refused against the dev server (the CLI\'s key store is per origin) and writing into the live library from an unattended session was not done. The script carries that leg as §7 row 8, the live save with a stopwatch on it. Do not say "minutes to air" as a measured claim; the slide\'s wording is the honest one.\n\n' +
    'UNSEEN SINCE 2026-08-23. R2.1 against noacg.studio and R2.4 the live save (§7 row 8), and B5 the install lines on a fresh machine, last executed 2026-08-22 for Claude Code and 2026-08-27 for Codex, with the Codex side of the noacg-mcp split not re-verified (§7 row 6). Both are cheap to close before the day.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §4, §7 rows 6, 8; docs/AGENT_CLI.md "Time to air, measured".',
  );
}

// =============================================================================================
// 6. ON AIR. Script §5. Both roads have put a graphic in the library; from here the beats are
//    the same. The four targets are the four the script prepares. A6 (Connect) is not shown
//    unless the 12th proves it, and A8 is not a beat.
// =============================================================================================
{
  const s = newSlide(6);
  label(s, "On air  ·  20 min  ·  You drive, then the room's boxes");
  heading(s, 'One production, one URL');

  const gap = 0.2;
  const pad = 0.28;

  // The three steps everyone does.
  const sw = (CW - 2 * gap) / 3;
  const sy = 1.9;
  const sh = 1.6;
  const stepsRow = [
    [{ text: 'Library row  >  ', options: {} }, { text: '+ Production', options: { bold: true, color: PAPER } }, { text: '  >  a cue  >  ', options: {} }, { text: 'Start production', options: { bold: true, color: PAPER } }, { text: '.', options: {} }],
    [{ text: 'Two links appear behind ', options: {} }, { text: 'Links', options: { bold: true, color: PAPER } }, { text: ': the output URL and the control URL.', options: {} }],
    [{ text: 'Take. Update. Out.', options: { bold: true, color: PAPER } }, { text: ' Hand the control link to a phone and it is a second operator.', options: {} }],
  ];
  stepsRow.forEach((runs, i) => {
    const x = M + i * (sw + gap);
    panel(s, x, sy, sw, sh);
    text(s, String(i + 1).padStart(2, '0'), { x: x + pad, y: sy + pad, w: 0.6, h: 0.25, fontFace: MONO, fontSize: 12, color: AMBER });
    text(s, runs, { x: x + pad, y: sy + pad + 0.32, w: sw - 2 * pad, h: sh - pad - 0.35, fontSize: 15, color: MID, lineSpacingMultiple: 1.15 });
  });

  // The four targets, prepared in advance and picked on the day: who, the target, the route.
  const tw = (CW - 3 * gap) / 4;
  const ty = sy + sh + 0.2;
  const th = 2.85;
  const targets = [
    ['Everyone', 'OBS, on your laptop', "Browser source, the output URL, 1920x1080, your channel's fps.", '/docs#obs'],
    ["The room's box", 'CasparCG 2.3, the URL', 'CG 1-20 ADD 1 "<URL>" 1, loaded once, then cued from the dashboard.', '/docs#casparcg-url'],
    ['No network', 'CasparCG or SPX, a file', 'Export the package, play the file, drive it from the bundled control panel.', '/docs#export'],
    ['For Yle', 'An OGraf renderer', 'Export as an OGraf package, or take a starter from noacg.studio/ograf.', 'noacg.studio/ograf'],
  ];
  targets.forEach(([who, title, body, pointer], i) => {
    const x = M + i * (tw + gap);
    panel(s, x, ty, tw, th);
    text(s, who.toUpperCase(), { x: x + pad, y: ty + pad, w: tw - 2 * pad, h: 0.22, fontFace: MONO, fontSize: 10.5, color: AMBER, charSpacing: 2 });
    text(s, title, { x: x + pad, y: ty + pad + 0.32, w: tw - 2 * pad, h: 0.75, fontFace: DISPLAY, fontSize: 18, bold: true, lineSpacingMultiple: 1.05 });
    text(s, body, { x: x + pad, y: ty + pad + 1.1, w: tw - 2 * pad, h: 0.8, fontSize: 14, color: MID, lineSpacingMultiple: 1.15 });
    text(s, pointer, { x: x + pad, y: ty + th - pad - 0.28, w: tw - 2 * pad, h: 0.28, fontFace: MONO, fontSize: 12, color: PAPER, valign: 'bottom' });
  });

  foot(s, 'Publishing a production needs a free account. Nothing before it does.');

  s.addNotes(
    '§5. A1 WORKS. A2 WORKS except the eyes-on half of the imported quiz over the hosted log (docs/acceptance/IMPORTED_QUIZ_HOSTED_WALK.md step 2), which the 12th is. Status of the four targets on 2026-09-09:\n\n' +
    'OBS (A3): UNSEEN (box). The route is written and the output page\'s recovery is pinned, but no written tick exists for the OBS half because §1 of docs/STUDENT_RELEASE_ACCEPTANCE.md has no OBS line. You have done it; on the 12th you write the line and tick it.\n\n' +
    'CASPARCG WITH THE URL (A4): UNSEEN (box). The output page is compiled down to what 2.3.x runs; unseen on a real box until the 12th ticks the §8.7 line. If it is red there, the file export is the fallback in the same room.\n\n' +
    'CASPARCG OR SPX WITH A FILE (A5): WORKS, proven on your own server; the CasparCG package has carried an operator page since 2026-09-04.\n\n' +
    'OGRAF (A7): catalog and agent packages were driven in SuperFly\'s ograf-server on 2026-08-18 and 2026-08-22 (docs/OGRAF.md). An imported-SVG graphic WITH behaviour has not been driven in an external renderer (§7 row 7), and which renderer Yle runs is asked in the same owner message as the network screenshot.\n\n' +
    'NOT ON THE SLIDE. A6, CasparCG Connect through the CLI agent: show it only if the 12th proves it on hardware; A4 does the same job by hand. A8, NoaCG driving a production on an OGraf renderer with the renderer in control: not a beat; if asked, today NoaCG packages and the renderer controls.\n\n' +
    'B2. Email confirmation is off, so a sign-up works at once. If the dialog still says "Check your email to confirm your account", tell the room to ignore that line (docs/backlog/sign-up-says-check-your-email-with-confirmations-off.md).\n\n' +
    'Source: docs/DEMO_2026-09-25.md §5, §7 rows 2, 3, 7, 10, 11; docs/STUDENT_RELEASE_ACCEPTANCE.md §1, §2.',
  );
}

// =============================================================================================
// 7. CLOSE. Script §6, G1. The guide is the docs page; the anchors are the ones the script
//    names. G2, the printed one-page index, is a GAP and is not on this slide.
// =============================================================================================
{
  const s = newSlide(7);
  label(s, 'Close  ·  5 min');
  heading(s, 'The guide is the docs page.');
  text(s, 'noacg.studio/docs', { x: M, y: 1.95, w: CW, h: 0.8, fontFace: MONO, fontSize: 40, color: AMBER });

  const cols = [
    ['Road 1', [['#first-graphic', 'the whole road, step by step'], ['#svg', 'rules, layers, fonts, export']]],
    ['Road 2', [['#claude-code', 'the CLI and both agents'], ['#agent-install', 'the one prompt']]],
    ['On air', [['#dashboard', 'production, cues, links'], ['#obs', 'the browser source'], ['#casparcg', 'URL, file, versions'], ['#export', 'every package']]],
  ];
  const gap = 0.3;
  const cw = (CW - 2 * gap) / 3;
  cols.forEach(([title, items], i) => {
    const x = M + i * (cw + gap);
    head(s, title, x, 3.25, cw);
    items.forEach(([anchor, desc], k) => {
      const y = 3.65 + k * 0.7;
      text(s, anchor, { x, y, w: cw, h: 0.32, fontFace: MONO, fontSize: 18, color: PAPER });
      text(s, desc, { x, y: y + 0.34, w: cw, h: 0.3, fontSize: 14, color: DIM });
    });
  });
  foot(s, 'Free, open source, no account until you publish. Take it home.');

  s.addNotes(
    'G1. The end-to-end SVG page is /docs#first-graphic, landed 2026-09-09; the CLI page was end to end already. Each section is pinned by e2e/docs.spec.ts.\n\n' +
    'G2, THE PRINTED ONE-PAGE INDEX, DOES NOT EXIST and is not on this slide (§7 row 12). If the laptop dies, print this deck\'s notes pages: one slide per page with these notes under it.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §6, §7 row 12.',
  );
}

// THE REFUSAL IS THE FILESYSTEM'S OWN, and it is the last thing that happens. Building the deck
// into a buffer first and writing it with the 'wx' flag makes the check and the write one atomic
// act on one path: there is no window between them and no filename that can route around them.
// An `existsSync` guard up front could be defeated by any name the library would later rewrite.
const buf = await pres.write({ outputType: 'nodebuffer' });
try {
  await writeFile(OUT, buf, { flag: 'wx' });
} catch (e) {
  if (e?.code !== 'EEXIST') throw e;
  console.error(`make-deck: ${OUT} exists and may carry hand edits, so it is not overwritten.`);
  console.error('Move or delete it first if you really want a fresh starting point, or pass --out <other path>.');
  process.exit(2);
}
console.log(`make-deck: wrote ${OUT} (${TOTAL_SLIDES} slides)`);
