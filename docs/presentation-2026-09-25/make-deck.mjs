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
 * evidence column, and the speaker notes name the beat, its status on the date each note gives
 * (2026-09-10 for slides 1, 4, 6 and 7, 2026-09-09 for the rest) and the file that proves it.
 *
 * THIS SCRIPT IS ALLOWED TO DRIFT FROM THE DECK, AND NOTHING CHECKS THAT IT HAS NOT. The deck
 * was built from this script on 2026-09-09 and rebuilt from it on 2026-09-10, with nobody's hand
 * edit in between, and the two matched on that day. From the first hand edit on,
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
const OUT = resolve(asked.toLowerCase().endsWith('.pptx') ? asked : `${asked}.pptx`);

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

/** A surface panel.
 *
 *  NO `line` PROPERTY, deliberately: omitting it is pptxgenjs's own "draw no outline". Asking for
 *  `line: { width: 0 }` does the opposite, because the library reads it as
 *  `options.line.width || 1` and 0 is falsy, so a zero-width request becomes a 1pt stroke and
 *  every panel lands half a point larger per side than the geometry above says. A caller that
 *  wants an outline passes one in `opts`, which is spread last and replaces the whole setting. */
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
  text(s, 'Draw one, or ask your coding agent for one. Put it on air from a browser, on our player. Then take it to whatever you already run.', { x: M, y: 4.85, w: 9.2, h: 1.1, fontSize: 22, color: MID, lineSpacingMultiple: 1.15 });
  foot(s, 'Ninety minutes. You drive; we drive only the agent on the screen.');

  s.addNotes(
    'BEFORE THE ROOM, NOT IN IT. B0, the network: the 2026-08-20 Yle demo failed on Yle\'s network, and the diag screenshot from that network (https://noacg.studio/app?diag=1) is the owner\'s own, off the ledger since 2026-09-10 - "I will take care of the Yle network screenshot when I get there, you do not have to remind me" - so nothing here reminds him again. If it has not happened, the phone hotspot is the plan and you say so in the room. That fallback carries more weight since §0 call 4: with air ending at our own hosted player, a network that blocks the app takes the whole session rather than one beat. This deck opens from a file and needs no network.\n\n' +
    'B1: the morning of, check https://noacg.studio/version.json against the tip of main.\n\n' +
    'THE CLOCK, re-cut 2026-09-10 for calls 4 and 6: 10 opening, 20 road 1, 25 drawing in small groups, 25 road 2, 10 on air and the close. A beat that runs long is cut at the next beat\'s boundary, never stretched.\n\n' +
    'WHO DRIVES. They do, on their own laptops, for everything the day now contains. We drive one agent on the screen. Nobody drives a playout box: §0 call 4 took OBS, CasparCG and the OGraf renderer off the day, and they are a studio session later.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 (the six calls, the re-cut timing), §1 (B0, B1).',
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
    'IF ASKED. The exported package has run on the owner\'s own CasparCG since 2026-08-05 (docs/STUDENT_RELEASE_ACCEPTANCE.md §2). Since 2026-09-10 the output URL and CasparCG Connect have both aired on a real 2.3.2 and a real 2.5.0, on a screen consumer (§5 A4 and A6). SDI, a Decklink card and pressing Put on air from noacg.studio are still unproven.\n\n' +
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
  text(s, 'YOUR SYSTEMS, LATER', { x: W - M - 3, y: 1.85, w: 3, h: 0.26, fontFace: MONO, fontSize: 11, color: AMBER, charSpacing: 2, align: 'right' });

  node(c1.x, topY, c1.w, 'Your artwork', 'Illustrator, Figma or Inkscape. An SVG.', { you: true });
  node(c1.x, botY, c1.w, 'Your coding agent', 'Claude Code, Codex, or the CLI alone.', { you: true });
  node(c2.x, midY, c2.w, 'Library', 'One record, either road.');
  node(c3.x, midY, c3.w, 'Production', 'Cues. Take, Update, Out.');
  node(c4.x, midY, c4.w, 'One URL', 'Plays on our player.', { hot: true });

  // Both roads meet in the library.
  arrow(s, c1.x + c1.w, cy(topY), c2.x - (c1.x + c1.w), cy(midY) - cy(topY), DIM);
  arrow(s, c1.x + c1.w, cy(midY), c2.x - (c1.x + c1.w), cy(botY) - cy(midY), DIM, true);
  // Library to production to one URL.
  arrow(s, c2.x + c2.w, cy(midY), c3.x - (c2.x + c2.w), 0, DIM);
  arrow(s, c3.x + c3.w, cy(midY), c4.x - (c3.x + c3.w), 0, DIM);

  // The URL also reaches what the room already runs, but NOT ON THE DAY: §0 call 4 (2026-09-10)
  // ends air at our own player and moves every playout box to a later studio session. So the
  // three targets and their arrows are dim, and the one amber box is the URL itself.
  const tH = 0.7;
  const targets = ['OBS', 'CasparCG', 'OGraf'];
  const tYs = [cy(topY) - tH / 2, cy(midY) - tH / 2, cy(botY) - tH / 2];
  targets.forEach((name, i) => {
    panel(s, c5.x, tYs[i], c5.w, tH);
    text(s, name, { x: c5.x, y: tYs[i], w: c5.w, h: tH, fontFace: DISPLAY, fontSize: 14, bold: true, color: DIM, align: 'center', valign: 'middle' });
  });
  const fx = c4.x + c4.w;
  const fw = c5.x - fx;
  arrow(s, fx, cy(topY), fw, cy(midY) - cy(topY), DIM, true);
  arrow(s, fx, cy(midY), fw, 0, DIM);
  arrow(s, fx, cy(midY), fw, cy(botY) - cy(midY), DIM);

  // The second door out of the library: a package, played with no network.
  text(s, 'Or export a package from the library and play the file with no network at all.', { x: c2.x, y: midY + nodeH + 0.2, w: 2.9, h: 0.6, fontSize: 12.5, color: DIM, lineSpacingMultiple: 1.15 });

  text(s, 'Both roads end in the library. From there it is the same three steps, so we do that part once, together, at the end.', { x: M, y: 6.0, w: CW, h: 0.5, fontSize: 17, color: MID });

  s.addNotes(
    'O2. This is the deck the script asked for: one picture plus the beat headings. Say the shape out loud now so the room knows why on-air comes last: an imported SVG and an agent-made graphic both become a library record, both go into a production, and both air through one output URL (§0, call 2).\n\n' +
    'ORDER. Road 1 goes first because the whole room can do it with no terminal, no subscription and no account (§0, call 3).\n\n' +
    'THE RIGHT-HAND COLUMN IS LATER, NOT TODAY. On the day the URL plays on our own hosted player and nowhere else (§0 call 4, owner 2026-09-10). OBS, CasparCG and OGraf are drawn dim because they are where the same URL or package goes in a studio session afterwards. Say that once, here, so nobody spends the session waiting for the box.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 calls 2, 3 and 4, §2 O2.',
  );
}

// =============================================================================================
// 4. ROAD 1: YOUR OWN GRAPHIC. Script §3 under owner call 6 (2026-09-10). The take-home is the
//    session's main work, so the right column leads with it before the two practical cautions.
// =============================================================================================
{
  const s = newSlide(4);
  label(s, 'Road 1  ·  20 min  ·  You drive');
  heading(s, 'Your own graphic');

  const lx = M;
  const lw = 7.0;
  const steps = [
    ['Take the lower-third sample, or a file you drew to the five rules.', '/docs#svg-rules  ·  samples: lower-third, scorebug, quiz-board'],
    ['Drop it. The layer names become the field names.', 'noacg.studio/app  >  New graphic  >  Import graphic'],
    ['Type a name longer than you drew for. Watch what the panel does.', 'the Fields step: wider, then a new line, and only then smaller'],
    ['Pick what it does. The quiz board locks and reveals; the scorebug counts.', 'the Fields step  >  Behaviour'],
    // NEVER "Create project". That button stands beside the Design, Fields and Animation steps of
    // this road and it does NOT save (CreationWizard.tsx create() -> applyDraftProject() with no
    // arguments: "Saving stays the user's move"). The two doors the default studio shows on Finish
    // do save, so the room is sent to Finish and to a door by name.
    // See docs/backlog/create-project-is-a-door-that-saves-nothing.md.
    ['Finish: name it, then take the production door. It saves the graphic and puts it in a show.', 'the Finish step  >  Add to the production'],
  ];
  steps.forEach(([main, pointer], i) => step(s, i + 1, lx, 1.9 + i * 0.94, lw, main, pointer));

  const rx = 8.1;
  const rw = W - M - rx;
  // ONE INSET FOR THE WHOLE COLUMN. Every head, body and pointer starts at rx + pad, so the left
  // edges line up down the column; a body nudged wider to win a line reads as a misprint from the
  // back of a room. When copy does not fit, the size or the panel height moves, never the inset.
  const pad = 0.22;
  const tw = rw - 2 * pad; // the one text width in this column

  // Heights read off a LibreOffice render of the built deck, not estimated: the take-home body is
  // three lines at this width and each caution is three, so both panels carry the same 0.22 in of
  // air top and bottom.
  panel(s, rx, 1.9, rw, 2.0);
  head(s, 'The take-home  ·  25 min in groups', rx + pad, 2.12, tw);
  text(s, [
    { text: 'Small groups, in Illustrator: ', options: {} },
    { text: 'a lower-third quiz template', options: { bold: true, color: PAPER } },
    { text: ' and ', options: {} },
    { text: 'a scoreboard', options: { bold: true, color: PAPER } },
    { text: '. Started here, finished in your own time, sent in.', options: {} },
  ], { x: rx + pad, y: 2.44, w: tw, h: 1.15, fontSize: 14, color: MID, lineSpacingMultiple: 1.15 });
  text(s, '/docs#svg-rules  ·  /docs#svg-export', { x: rx + pad, y: 3.45, w: tw, h: 0.25, fontFace: MONO, fontSize: 12, color: DIM });

  // THE TWO CAUTIONS SHARE ONE PANEL. They are one thought - what to say before the room asks -
  // and the take-home above them needs the height that a second head and a second pair of pads
  // would have spent.
  panel(s, rx, 4.1, rw, 2.5);
  head(s, 'Say it before they ask', rx + pad, 4.32, tw);
  text(s, [
    { text: 'If a long name does not grow the way you meant, the answer is one dropdown on the Fields step: ', options: {} },
    { text: 'When the text is too long', options: { bold: true } },
    { text: '.', options: {} },
  ], { x: rx + pad, y: 4.64, w: tw, h: 0.85, fontSize: 14, color: MID, lineSpacingMultiple: 1.15 });
  text(s, [
    { text: 'A typeface Google does not have, or a licensed one, takes the ', options: {} },
    { text: 'upload', options: { bold: true } },
    // The Typefaces row lives on the FIELDS step (MapSvgFieldsStep.tsx, the "Upload font file…"
    // button), which on this road is Start, Design, Fields, Animation, Finish - two screens
    // before the end, not the last one.
    { text: ' road in the Typefaces row, on the Fields step.', options: {} },
  ], { x: rx + pad, y: 5.6, w: tw, h: 0.85, fontSize: 14, color: MID, lineSpacingMultiple: 1.15 });

  // foot() hands its argument to text(), which takes runs as readily as a string, so the guide
  // rides in the slide's own foot line with the URL set apart in mono amber.
  foot(s, [
    { text: 'The guide, step by step:  ', options: {} },
    { text: 'noacg.studio/docs#first-graphic', options: { fontFace: MONO, color: AMBER } },
  ]);

  s.addNotes(
    '§3, R1.1 to R1.7. Status on 2026-09-10: WORKS on the shipped samples for the six road beats, with one exception. R1.4, behaviour on artwork nobody at NoaCG drew, is pinned by e2e/import-svg-behaviour.spec.ts, but you have not looked at your OWN quiz board since the three text-box fixes (docs/TEXT_BOX_BINDING.md). The 12th is that walk.\n\n' +
    'TWO PIECES OF DRAWING, AND THEY MUST NOT BE CONFUSED (§0 call 6, owner 2026-09-10). What the room imports and plays inside the session is ONE SIMPLE GRAPHIC, a lower third, because the session is proving the road works end to end. The real artwork is the take-home: small groups draw a lower-third quiz template and a scoreboard in Illustrator, start them here, finish them in their own time and send them in. The 25 minutes on the panel are the re-cut clock in §0, and they come out of what road 1 and on air used to have.\n\n' +
    'R1.7 HAS ONE HOLE AND IT IS NOT IN THE PRODUCT. How a finished file comes BACK - where a group sends it, in what format, and what we do with it - is not written anywhere yet. §7 row 17; one paragraph in the student one-page index (G2) closes it. If the room asks and it is still open, take an address and say we will write back rather than inventing a route at the front.\n\n' +
    'WHY THE SAMPLES ARE THE ROAD IN THE ROOM. docs/svg-samples/quiz-board.svg and scorebug.svg are the two files e2e/import-svg-behaviour.spec.ts drives all the way through behaviour, so a group that follows their layer naming gets a working quiz and a working scoreboard rather than a static picture. R1.4 is what their own file will do when it comes back.\n\n' +
    'R1.3 ON THEIR OWN FILE. The growth default is measured off the geometry and for some exporter shapes it disagrees with what the designer meant (docs/backlog/svg-growth-default-across-exporters.md). That is why the dropdown sentence is said out loud rather than waited for.\n\n' +
    'THE ROAD, IN SCREENS. Start, Design, Fields, Animation, Finish (src/components/wizard/CreationWizard.tsx, STEP_TITLES_SVG). "Create project" sits in the footer beside Design, Fields and Animation - not on Start, not on Finish - and it does NOT save: it builds with defaults for everything not yet reached and hands you to the code editor (create() calls applyDraftProject() with no arguments). The two doors the default studio shows on Finish, the production one and Export, both save. DO NOT name Create project in the room: send people to Finish and to a door by name. docs/backlog/create-project-is-a-door-that-saves-nothing.md is the open question about whether that button should be renamed or should save.\n\n' +
    'R1.5. A Yle designer\'s licensed face takes the upload road, in the Typefaces row on the FIELDS step - two screens before the end. The Google door is offered only where Google has the family.\n\n' +
    'NOT A BEAT. The live-vote encore needs a fixture brought by hand and has two open backlog items; only if the room is ahead of the clock.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 call 6, §3 R1.1 to R1.7, §7 row 17; the guide is docs.html #first-graphic, landed 2026-09-09.',
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
    // NOT "prints a link that opens at once", which R2.4 measured false on noacg.studio: the link
    // lands on Home, with the graphic in Recent graphics. And `login` goes quiet after Allow
    // although the key is already stored. §7 row 14 carries both, and both workarounds are here.
    cmd('npx -y @noacg/cli login          '), note('# once; quiet after Allow? Ctrl-C is safe'), nl,
    cmd('npx -y @noacg/cli save ./sb      '), note('# then open it from Home, Recent graphics'),
  ], { x: M + 0.3, y: codeY + 0.22, w: CW - 0.6, h: codeH - 0.4, fontFace: MONO, fontSize: 14, lineSpacingMultiple: 1.25 });

  // The measured number, and the honest sentence about the leg nobody has timed.
  const lw = 5.4;
  text(s, '24.8 s', { x: M, y: 4.0, w: lw, h: 0.95, fontFace: DISPLAY, fontSize: 60, bold: true, color: AMBER, charSpacing: -2 });
  text(s, [
    { text: 'Tool time for the seven CLI verbs', options: { bold: true, color: PAPER } },
    // NOT "the only verb that opens a browser": all seven authoring verbs do, because they reach
    // the studio through BridgeClient.connect(), which launches one (cli/src/bridgeClient.ts:158).
    // validate is the slow one for what it does INSIDE that browser. The slide says "they all"
    // about the four verbs printed above it, which are four of those seven.
    // TWO NUMBERS, SAID AS TWO (R2.5): two runs, on two days, under different conditions. Adding
    // them into one clock would claim a single walk that nobody made.
    { text: ', measured by hand on 2026-09-09. They all start a browser to reach the studio; validate is 10.7 s of it. Then save put a graphic in the live library in 9.3 s, on 2026-09-10. The hop from the library to air is still untimed.', options: {} },
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
    'R2.5: TWO NUMBERS, AND THE LAST HOP IS UNTIMED. 24.8 s is the seven local verbs, a local build against a dev server on 2026-09-09. 9.3 s is save into the live library, the published 0.3.0 against noacg.studio on 2026-09-10. About thirty-five seconds of tool time from an empty folder to a graphic in your library, said as the two numbers. The hop from the library to a production\'s output URL has not been timed (§7 row 15). Do not round up to a minute and do not say "minutes to air".\n\n' +
    'R2.4, THE TWO DEFECTS THE LIVE SAVE FOUND (§7 row 14). The link save prints lands on Home, not on the graphic; the graphic is in Recent graphics 5 s later, so say "it is in your library" and open it from there. And login stores the key and then hangs instead of exiting: warn the room that the terminal goes quiet after they press Allow, and that Ctrl-C is safe. The two comments in the code panel say both.\n\n' +
    'ON THIS LAPTOP, BEFORE THE DAY (§7 row 16). The global @noacg/cli here is 0.2.0 and the MCP server prefers it over npx, so R2.3 would run a year of fixes behind with nothing on screen saying so. One command: npm i -g @noacg/cli@latest.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §4 R2.1 to R2.5, §7 rows 14, 15 and 16; docs/AGENT_CLI.md "Time to air, measured".',
  );
}

// =============================================================================================
// 6. ON AIR. Script §5 under owner call 4 (2026-09-10). The day ends at the hosted player, so
//    the other playout targets are named as a later studio session rather than offered as choices.
// =============================================================================================
{
  const s = newSlide(6);
  label(s, 'On air  ·  10 min  ·  Everyone, on our own player');
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

  // WHERE THE DAY ENDS, on the left and outlined, and what is deliberately NOT happening, on the
  // right and quieter. Both panels inset every line by the same `pad` as the step row above them.
  // The right panel's smaller type is the hierarchy, not a way to squeeze copy in: it is an aside.
  const airW = 8.3;
  const airT = airW - 2 * pad;
  panel(s, M, 3.7, airW, 2.85, { line: { color: AMBER, width: 1.5 } });
  head(s, 'Today, this is air', M + pad, 3.98, airT);
  text(s, 'The output URL is the player.', { x: M + pad, y: 4.34, w: airT, h: 0.4, fontFace: DISPLAY, fontSize: 22, bold: true });
  text(s, 'A browser tab on noacg.studio, playing your graphic at full size. Nothing to install, no box to configure, no setting to get right. Take a cue on the dashboard and it is up on the tab in front of the room.', { x: M + pad, y: 4.84, w: airT, h: 1.3, fontSize: 16, color: MID, lineSpacingMultiple: 1.15 });
  text(s, '/docs#dashboard', { x: M + pad, y: 6.2, w: airT, h: 0.25, fontFace: MONO, fontSize: 12, color: PAPER });

  const laterX = 9.2;
  const laterW = W - M - laterX;
  const laterT = laterW - 2 * pad;
  panel(s, laterX, 3.7, laterW, 2.85);
  head(s, 'Not today', laterX + pad, 3.98, laterT);
  text(s, 'Your own systems, later', { x: laterX + pad, y: 4.3, w: laterT, h: 0.3, fontFace: DISPLAY, fontSize: 16, bold: true });
  // "Written up" is left to the pointer under it: /docs#export IS the write-up, and the sentence
  // saying so cost the line that kept the body clear of that pointer.
  text(s, 'OBS, a CasparCG box, an SPX rundown, an OGraf renderer. Each is a package or a URL away. We do them in a studio session, not on a room full of laptops.', { x: laterX + pad, y: 4.72, w: laterT, h: 1.3, fontSize: 13, color: MID, lineSpacingMultiple: 1.15 });
  text(s, '/docs#export', { x: laterX + pad, y: 6.2, w: laterT, h: 0.25, fontFace: MONO, fontSize: 12, color: PAPER });

  foot(s, 'Publishing a production needs a free account. Nothing before it does.');

  s.addNotes(
    '§5, and §0 call 4 (owner, 2026-09-10) is why this slide is short. ON THE DAY AIR STOPS AT THE NOACG PLAYER IN THE CLOUD: a graphic is imported and played on our own hosted player, and seeing it work there is the proof the room gets. No OBS on a student laptop, no CasparCG box, no playout configuration of any kind. Real playout is a separate studio session later. This replaces the earlier call, which prepared four targets and chose between them on the day - if you are holding a printed deck older than 2026-09-10, the four-target slide is the one it has.\n\n' +
    'A1 WORKS. A2 WORKS except the eyes-on half of the imported quiz over the hosted log (docs/acceptance/IMPORTED_QUIZ_HOSTED_WALK.md step 2), which the 12th is.\n\n' +
    'IF SOMEBODY ASKS FOR THEIR OWN SYSTEM, the beats are still written in §5 and still true. Take one, do not take four, and do not put it on the clock. The cheapest is A5, an exported package played from a file with no network at all: WORKS, proven on the owner\'s own server, and the CasparCG package has carried an operator page since 2026-09-04.\n\n' +
    'WHAT A REAL CASPARCG NOW SAYS (2026-09-10, docs/acceptance/owner-queue/2026-09-10-bh-a-real-casparcg-has-now-run-the-output-url.md). Both servers on this laptop have aired a published production through their screen consumer. A4 (CG 1-20 ADD with the output URL) works on a real 2.3.2 and a real 2.5.0. A6 (Put on air through the CLI agent) aired end to end on 2.5.0 only: on 2.3.2 AMCP answered 202 and the channel stayed empty, for the origin reason below, and the same production loaded by hand aired on that server a minute later. Three things from that walk are worth having if it comes up. 2.3.x is Chromium 71, measured, not the 75 or 88 the compatibility table used to infer; its flex gaps collapse, which src/assets/flexGapShim.js now puts back, while color-mix, backdrop-filter, the inset shorthand, clamp/min/max and aspect-ratio are still dropped there (docs/PLAYOUT_COMPATIBILITY.md §2). A channel restart drops the layer, and one re-issued CG ADD brings the graphic back at its LIVE state rather than the cue\'s authored one. And Put on air sends the output URL OF THE PAGE IT IS PRESSED ON, so pressing it on a dev server sends a URL 2.3.x cannot parse while AMCP still answers 202 and the row still says it worked.\n\n' +
    'WHAT IS STILL UNPROVEN THERE: SDI, a Decklink card, the venue\'s network, and pressing Put on air from https://noacg.studio, where the browser\'s Local Network Access prompt needs a person. The acceptance lines in docs/STUDENT_RELEASE_ACCEPTANCE.md §1 sit unticked and the owner ticks them; none of it is on the 25th.\n\n' +
    'A7, OGRAF. The catalog packages, the agent packages and, on 2026-09-09, an imported quiz board WITH its behaviour have all been driven in SuperFly\'s ograf-server (docs/OGRAF.md). Which renderer Yle runs is still not recorded: docs/acceptance/owner-queue/2026-09-10-be-which-ograf-renderer-yle-runs.md.\n\n' +
    'A8 is not a beat. Said out loud if asked: today NoaCG packages and the renderer controls.\n\n' +
    'B2. Email confirmation is off, so a sign-up works at once. If the dialog still says "Check your email to confirm your account", tell the room to ignore that line (docs/backlog/sign-up-says-check-your-email-with-confirmations-off.md).\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 call 4, §5, §7 rows 3 and 10. Row 2, the output URL on a real CasparCG, closed on 2026-09-10 with the walk above.',
  );
}

// =============================================================================================
// 7. CLOSE. Script §6 under owner call 5 (2026-09-10). G2 is two one-page indexes, so the slide
//    names the room's handout and the owner's running order beside the guide they both point into.
// =============================================================================================
{
  const s = newSlide(7);
  // No minutes of its own: §0's re-cut gives on air AND the close one shared 10, and slide 6
  // already carries that 10. A separate "5 min" here made the slides add up to 95.
  label(s, 'Close  ·  in the same 10 min');
  heading(s, 'The guide is the docs page.');
  // The URL's glyphs end near x = 5.9 in Consolas 40; the box stops at 6.3 so it never reaches
  // the panel beside it.
  text(s, 'noacg.studio/docs', { x: M, y: 1.92, w: 5.6, h: 0.8, fontFace: MONO, fontSize: 40, color: AMBER });

  // The two one-page indexes (owner call 5). Wide enough that each entry is two lines, with a
  // paragraph gap between them so they read as two pages and not one run-on sentence.
  // THE VERTICAL BUDGET IS TIGHT AND WAS MEASURED, not estimated: the heading's descenders end
  // near y 1.61, the foot's glyphs start near 6.79, and between them sit this panel (four lines
  // and a gap, about 1.0 in of text) and a four-item column. The panel's top and bottom air
  // match, and every gap is about 0.18 in; moving any one number means re-rendering the slide.
  const ix = 6.5;
  const iw = W - M - ix;
  const ipad = 0.22;
  panel(s, ix, 1.82, iw, 1.69);
  head(s, 'In your hand, and afterwards a file', ix + ipad, 2.04, iw - 2 * ipad);
  text(s, [
    // PARAGRAPH SPACING GOES ON THE PARAGRAPH'S FIRST RUN. pptxgenjs 4 writes an <a:pPr> before
    // EVERY run of a multi-run paragraph (measured 2026-09-10 across this whole deck), while the
    // schema allows one, as the first child. A reader that keeps only the first would drop a
    // spacing option set on a later run, though LibreOffice honours it and shows the gap. Put on
    // the first run, it lands in the first <a:pPr> - step() does the same.
    { text: 'For the room', options: { bold: true, color: PAPER, paraSpaceAfter: 5 } },
    { text: ' - the road in order, both URLs, a link into every section below, and the take-home brief.', options: { breakLine: true } },
    { text: 'For whoever runs it', options: { bold: true, color: PAPER } },
    { text: ' - the same beats as a running order, who drives each, and the clock.', options: {} },
  ], { x: ix + ipad, y: 2.3, w: iw - 2 * ipad, h: 0.98, fontSize: 14, color: MID });

  const cols = [
    ['Road 1', [['#first-graphic', 'the whole road, step by step'], ['#svg', 'rules, layers, fonts, export']]],
    ['Road 2', [['#claude-code', 'the CLI and both agents'], ['#agent-install', 'the one prompt']]],
    ['On air', [['#dashboard', 'production, cues, links'], ['#obs', 'the browser source'], ['#casparcg', 'URL, file, versions'], ['#export', 'every package']]],
  ];
  const gap = 0.3;
  const cw = (CW - 2 * gap) / 3;
  cols.forEach(([title, items], i) => {
    const x = M + i * (cw + gap);
    // Heads sit about 0.18 in under the index panel; four items at 0.66 end about 0.18 in above
    // the foot's glyphs.
    head(s, title, x, 3.7, cw);
    items.forEach(([anchor, desc], k) => {
      const y = 4.06 + k * 0.66;
      text(s, anchor, { x, y, w: cw, h: 0.32, fontFace: MONO, fontSize: 18, color: PAPER });
      text(s, desc, { x, y: y + 0.34, w: cw, h: 0.3, fontSize: 14, color: DIM });
    });
  });
  foot(s, 'Free, open source, no account until you publish. Take it home.');

  s.addNotes(
    'G1. The end-to-end SVG page is /docs#first-graphic, landed 2026-09-09; the CLI page was end to end already. Each section is pinned by e2e/docs.spec.ts.\n\n' +
    'G2 IS TWO PAGES, NOT ONE (owner, 2026-09-10, §0 call 5), and it is still a GAP: §7 row 12, written in the week of the 22nd. The student page is the one that is handed out and then shared as a file afterwards, and the take-home brief from R1.7 lives on it - which is also where §7 row 17, how a finished file comes back, gets its one paragraph. The owner page is your running order: the same beats, who drives each, and the clock from §0. Until both exist, print this deck\'s notes pages, one slide per page with the notes under it.\n\n' +
    'THE ANCHORS ON THIS SLIDE ARE THE GUIDE, NOT THE DAY. #obs and #casparcg stay on the list because the guide covers them and people take it home; the session itself stops at our own player (§0 call 4), which is what slide 6 says.\n\n' +
    'Source: docs/DEMO_2026-09-25.md §0 calls 4 and 5, §6 G1 and G2, §7 rows 12 and 17.',
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
