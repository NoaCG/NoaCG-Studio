// THE HEIGHT HALF OF THE STAGE CONTRACT: a staged panel must not grow TALLER either.
//
// `stageBoxCss` (shared/base.ts) stops a board changing WIDTH with the operator's text. That is
// half the job, and on several categories it is the smaller half: the text that can no longer
// widen a board wraps onto another row and makes it taller instead. Measured 2026-08-20 over the
// registry, quiz, alert, public-info and results-board move ONLY vertically - their widths were
// already pinned by a `min-width` floor, which is not a fix but a change of axis.
//
// THE ROOM IS THE DESIGN'S OWN, AND NOBODY HAS TO TYPE IT. A line's reserve is the number of rows
// it occupies with the design's OWN sample text - the content the design was calibrated against,
// and the content sitting in the emitted HTML before any operator touches it. So this runtime
// measures each line once, at load, and holds every later value to what it found. That is the same
// derivation the stage width uses (the width a design settles at with realistic content), and it
// means a category can be flipped without annotating hundreds of designs with row counts that
// would then have to be re-measured every time a typeface or a size step moved.
//
// SHRINK, NEVER CLIP. Past the reserve the line reduces its font size, down to a floor - the same
// lever and the same 55% floor as `fitPlacedText` (shared/textFit.ts), and for the same reason:
// size is the honest answer, a horizontal condense distorts the typeface the user chose, and an
// ellipsis silently drops the operator's words. Below the floor the line is unreadable on air,
// which is worse than tight, so it stops there and the panel is allowed to be the one thing that
// gives - by then the operator has typed something no board was drawn to hold.
//
// WHY THE SHRINK STEP IS A SQUARE ROOT. Reducing font size shortens the text AND the row it sits
// on, so a wrapped block's height falls roughly with the SQUARE of the size: half the size is a
// quarter of the height. Scaling by the linear ratio (`room / scrollHeight`) therefore overshoots
// hard - a line 20% too tall would come back 20% smaller when 10% was enough - and the first draft
// of this made a two-row headline visibly smaller than its own subtitle. `sqrt` converges in two
// passes and lands on a size a designer would have picked.
//
// It is design-owned JS, emitted OUTSIDE the marked ANIMATION region like `shared/clock.ts` and
// the category motion runtimes, so the timeline never rewrites it and it survives every export.

/** The marker an assembler tests for - present means the runtime is already emitted. */
export const STAGE_FIT_MARKER = 'function fitStagedText';

/**
 * The design-owned JS a staged graphic needs, appended to whatever runtime the design already
 * ships. ONE function, called from every assembler's `runtimeExtraJs` seam, so a category that
 * gains a stage cannot emit the width without the height half - the failure mode there is a
 * panel that holds its width perfectly and grows downward instead, which looks like the fix
 * working right up until someone types a long line.
 *
 * No stage means no runtime at all: a hugging design gets byte-identical output to before.
 *
 * A FULL-FRAME design passes `true` rather than a width. Its panel is the frame, so it has no
 * `stageWidth` to declare and looked stable by construction - and it was, on the outside. The
 * plates INSIDE it were not: a nominee tag grew 636 -> 1498px while the card around it stood
 * still. "Nothing to declare" is not the same as "nothing to hold".
 */
export function stageExtraJs(
  staged: number | boolean | undefined,
  prefix: string,
  designJs: string | undefined,
): string {
  const own = (designJs ?? '').trim();
  if (!staged) return own;
  return own ? `${own}\n\n${stageFitRuntimeJs(prefix)}` : stageFitRuntimeJs(prefix);
}

/**
 * The emitted runtime, for a category whose masked lines are `.<prefix>-mask > span`.
 *
 * Deliberately ES5 and comment-rich: it ships inside the user's own template.js, where it has to
 * read as ordinary code a professional can edit.
 */
export function stageFitRuntimeJs(prefix: string): string {
  return `// Hold every line to the room this design gives it, so the panel never grows taller than
// it was drawn. Called after each update() (see update() above) and once the fonts are in.
//
// The room is measured ONCE, from the design's own sample text, and remembered on the element:
// that is "the rows this line was drawn for". Everything the operator types afterwards is fitted
// into it by reducing the font size, never past STAGE_FIT_MIN of the design size.
var STAGE_FIT_MIN = 0.55;        // never shrink below 55% of the size the design asks for
// …and never below the CATALOG'S OWN TYPE FLOOR either, whatever the design size was. 55% of a
// 32px letter is 17.6px, which is under the 20px this catalogue holds every graphic to
// (scripts/type-floor.mjs, DESIGN_LANGUAGE §1) - so the relative floor alone let the fit shrink
// text into illegibility and the type-floor gate caught four variants doing it. Past this point
// a tight line is the better failure: the words stay readable and the panel still holds.
var STAGE_FIT_FLOOR_PX = 20;
var stageCalibrated = false;     // true once the design's own sample has been measured

// A RESERVE IS A LAYOUT NUMBER, AND A RECT IS THE VISUAL BOX - the two stop agreeing the moment
// anything above the line is TRANSFORMED. \`getBoundingClientRect\` reports the box after every
// ancestor transform has been applied, so a line inside a CSS-animated badge is measured through
// whatever that animation was doing on the frame the fit happened to run. Both halves of that were
// shipping (measured 2026-08-23/24, on the run that made e2e/catalog-baseline.spec.ts flake with a
// DRIFTING element set - nothing about the graphics had moved, the measurement had):
//
//   - gt03's badge SCALES as it pops, so its clock reserved 412px, 417px and 418px across three
//     runs for an element that is 400px in layout - the reserve was the pop, frozen at whatever
//     moment the fit landed on.
//   - gt04's badge only TRANSLATES, which should cost nothing - but the rect still comes back
//     through the composited matrix, so its height alternates between 399.9999694824219 and
//     400.0000305175781 from frame to frame, and \`Math.ceil\` turns that into 400 or 401.
//
// So the reserve is read off the LAYOUT box instead. \`getComputedStyle().height\` is the used
// height in px - sub-pixel, and blind to transforms, which is exactly the difference that matters
// (\`offsetHeight\` is blind to them too but rounds to a whole pixel, and a reserve rounded DOWN is
// a clipped design). It is the content box unless the element says otherwise, so the padding and
// border are added back to keep this the border box the rest of this file measures in.
//
// Snapped to 1/64 px, Blink's own layout unit, so a used value that comes back with a float tail
// still lands on one number every time. A genuine sub-pixel reserve (188.5) is untouched and still
// rounds up to a whole 189 where the caller asks for that.
function stageLayoutHeight(el, cs) {
  var h = parseFloat(cs.height);
  if (!(h >= 0)) return Math.round(el.getBoundingClientRect().height * 64) / 64;  // not laid out
  if (cs.boxSizing !== 'border-box') {
    h += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
      (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  }
  return Math.round(h * 64) / 64;
}

// THE PANELS THIS RUNTIME LOOKS AFTER, kept in a shared list rather than baked into each
// function as one selector.
//
// It matters when a graphic is INSERTED into another (blocks/templateInsert.ts). Both templates
// carry this same runtime, so the merged file declares these functions twice and the later
// declaration wins - and if each copy had its own hardcoded selector, the losing graphic would
// silently stop being fitted. Registering the selector instead means whichever copy survives
// still fits BOTH panels, which is what makes the duplicate harmless rather than quietly
// destructive. It is also why these names can sit in that file's scaffold allowlist honestly:
// they are assembler scaffolding, like setFieldValue, not design-owned logic.
var STAGE_FIT_BOXES = (window.__noacgStageFitBoxes = window.__noacgStageFitBoxes || []);
if (STAGE_FIT_BOXES.indexOf('.${prefix}-box') < 0) STAGE_FIT_BOXES.push('.${prefix}-box');

function stageFitBoxes() {
  var found = [];
  for (var i = 0; i < STAGE_FIT_BOXES.length; i++) {
    var els = document.querySelectorAll(STAGE_FIT_BOXES[i]);
    for (var j = 0; j < els.length; j++) found.push(els[j]);
  }
  return found;
}

// One row of this line, at the size the design asks for. \`line-height: normal\` computes to a
// keyword rather than a number on some faces, so fall back to the CSS default ratio.
function stageLineHeight(el, cs, design) {
  var line = parseFloat(cs.lineHeight);
  return (line && !isNaN(line)) ? line : design * 1.2;
}

// ONE ROW'S CONTENT HEIGHT for this element's face - a DIFFERENT box from the one above, and the
// distinction is the whole reason this function exists. \`line-height\` says how much room a row
// TAKES; the FACE decides how tall its own glyph box IS, and on most of the bundled faces that is
// about 1.2em whatever line-height says (measured: Space Grotesk 1.17, Inter 1.14, Manrope 1.24,
// Oswald 1.29, Saira 1.35). \`scrollHeight\` reads the second box, so a row drawn with the tighter
// line-height of the two reports an overflow that is not there and shrinks for nothing.
//
// Measured once per face and cached on the window, for the same reason the box list is: a board
// rebuilds its rows on every update, and a graphic inserted into another carries a second copy of
// this file. The probe is a zero-height, zero-leading box, so its scrollHeight is the glyph box
// and nothing else.
var STAGE_FACE_RATIOS = (window.__noacgStageFaceRatios = window.__noacgStageFaceRatios || {});
function stageFaceHeight(cs, design) {
  var key = cs.fontFamily + '|' + cs.fontWeight + '|' + cs.fontStyle;
  var ratio = STAGE_FACE_RATIOS[key];
  if (!ratio) {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;height:0;line-height:0;white-space:nowrap;visibility:hidden';
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontStyle = cs.fontStyle;
    probe.style.fontSize = '100px';
    probe.textContent = 'Hxpg';                 // an ascender, an x-height, two descenders
    document.body.appendChild(probe);
    ratio = probe.scrollHeight / 100;
    document.body.removeChild(probe);
    if (!(ratio > 0)) ratio = 1.2;              // a face that will not measure gets the CSS default
    STAGE_FACE_RATIOS[key] = ratio;
  }
  return ratio * design;
}

// EVERY LEAF TEXT ELEMENT inside the staged panel, not just the masked lines the presets
// choreograph. A poll's option rows, a standings board's names and a queue's entries are built by
// the design's own runtime from a textarea, so they carry no mask - and they are exactly where
// the remaining height came from once the masked lines were held. A leaf that already fits is
// left alone, so widening the net costs nothing on the designs that did not need it.
function stagedLines() {
  var boxes = stageFitBoxes();
  var all = [];
  for (var b = 0; b < boxes.length; b++) {
    var kids = boxes[b].querySelectorAll('*');
    for (var k = 0; k < kids.length; k++) all.push(kids[k]);
  }
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (el.children.length) continue;                       // not a leaf: its children carry the text
    var text = (el.textContent || '').trim();
    if (!text) continue;                                    // nothing to fit
    // A one- or two-character leaf is a glyph, a letter chip or a single digit: it cannot
    // wrap, so it has no room to be held to - and reserving one clipped sn03's avatar, whose
    // icon sits inside a fixed circular frame that was never ours to resize.
    if (text.length < 3) continue;
    if (el.className && String(el.className).indexOf('noacg-data-source') >= 0) continue;
    // A DESIGN THAT ALREADY BOUNDS ITS OWN LINE IS LEFT ALONE. \`-webkit-line-clamp\` is the
    // author saying how many rows this line may have; imposing a reserve on top of that fights
    // a decision already made, and the audience pack's own gate caught it - a clamped question
    // ended up taller than the clamp allows. The rule is the one the stage follows everywhere:
    // where the design has stated the room, the runtime does not restate it.
    var clamp = window.getComputedStyle(el).webkitLineClamp;
    if (clamp && clamp !== 'none') continue;
    out.push(el);
  }
  return out;
}

function fitStagedText() {
  var lines = stagedLines();
  for (var i = 0; i < lines.length; i++) fitOneStagedLine(lines[i]);
  holdStageHeight();
}

// THE OUTER GUARANTEE. Fitting the lines is what SHOULD keep the panel its own size, and on a
// design whose text is all in lines it does. It is not enough on a board whose runtime rebuilds
// its own rows: the row elements are replaced wholesale on every update, so anything remembered
// on them is gone, and one reflow the fit did not see would move the panel again. Reserving the
// panel's own height closes that for good - measured once, from the design's own content, on the
// same terms as everything else here.
function holdStageHeight() {
  var boxes = stageFitBoxes();
  for (var i = 0; i < boxes.length; i++) holdOneStageBox(boxes[i]);
}

function holdOneStageBox(box) {
  var room = parseFloat(box.getAttribute('data-stage-room') || '');
  if (!room) {
    box.style.height = '';
    // The panel's own reserve reads the layout box for the same reason its lines do: a panel
    // whose content animates would otherwise reserve whatever that animation was mid-way through.
    room = stageLayoutHeight(box, window.getComputedStyle(box));
    if (!room) return;
    box.setAttribute('data-stage-room', room);
  }
  box.style.boxSizing = 'border-box';   // the reserve is the border box it was measured from
  // HEIGHT, and deliberately NOT overflow:hidden - the same lesson as the lines above, one
  // level up. The height is what holds the panel; hiding the overflow as well cut content on
  // 17 designs at their OWN default text. If a value ever beats the shrink floor it bleeds a
  // little rather than losing words, and the panel still has not moved.
  // A FLOOR, not a fixed height. The panel must not SHRINK when a value is short - that is the
  // wobble - but it has to be allowed to grow when a value is so long that the shrink hits the
  // 20px type floor and still does not fit. Pinning it there instead makes the runtime bench
  // fail with siblings overlapping by 71%: with the words held at a legible size and the panel
  // refusing to give, the only thing left to collide is the content.
  box.style.minHeight = room + 'px';
}

// THE WIDTH OF THE TEXT ITSELF, and deliberately NOT \`scrollWidth\`. A design's backdrop is often
// a pseudo-element that OVERHANGS its box on purpose - ss02's slab and chip both lean -8deg, and
// a skewed absolutely-positioned layer counts towards the element's scrollable overflow. So
// scrollWidth reported 936 against a 920px row and the runtime read a painted lean as the
// headline running out of its box: 92px shipped at 66px, at the design's own default words.
// A Range over the element's own text nodes measures letters and nothing else, and on a wrapped
// block its rects are the line boxes - so the widest ROW is what gets compared, which is the
// number that decides whether anything is actually outside the box.
function stageTextWidth(el) {
  if (!document.createRange) return el.scrollWidth;
  var range = document.createRange();
  range.selectNodeContents(el);
  var rects = range.getClientRects();
  var widest = 0;
  for (var i = 0; i < rects.length; i++) if (rects[i].width > widest) widest = rects[i].width;
  return widest || el.scrollWidth;
}

// The room across, on the same terms: the CONTENT box, since that is the box the text sits in.
// Taken from the RECT and not from \`clientWidth\`, because clientWidth is rounded to whole pixels
// and the text width beside it is not - and half a pixel on a chip 50px across is a 1% overflow
// that is not there. Seventeen designs sat just past the fit's 0.5% tolerance on nothing else.
// \`clientWidth\` still answers one question the rect cannot: an inline box reports 0 there, and an
// inline box has no content width to hold anything to.
function stageContentWidth(el, cs) {
  if (!el.clientWidth) return 0;
  var w = el.getBoundingClientRect().width
    - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)
    - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  return w > 0 ? w : 0;
}

// THE BOX A LINE IS DRAWN IN, if it has one: the nearest ancestor that actually paints - a tile,
// a chip, a coloured severity square. That box is FURNITURE, and furniture does not stretch to fit
// a longer word; the words fit the furniture. Found by walking up rather than by class name, so it
// works on any design without being told which of its elements are boxes.
function drawnBoxOf(el) {
  for (var p = el.parentNode; p && p.nodeType === 1 && p !== document.body; p = p.parentNode) {
    var cs = window.getComputedStyle(p);
    var bg = cs.backgroundColor;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return p;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return p;
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return p;
  }
  return null;
}

// Everything this runtime pins on a line, taken back off. Used by the recalibration below, which
// has to put every line back to the design's own CSS BEFORE it measures any of them - the fit runs
// in document order, so anything still pinned is a sibling whose height is about to decide the
// reserve of the line being measured.
function stageUnpin(el) {
  el.style.fontSize = '';
  el.style.maxWidth = '';
  el.style.height = '';
  el.style.whiteSpace = '';
  el.style.overflowWrap = '';
  el.style.textAlign = '';
  el.style.display = '';
}

function fitOneStagedLine(el) {
  el.style.fontSize = '';                       // back to the design size before measuring
  el.style.maxWidth = '';
  var cs = window.getComputedStyle(el);
  var design = parseFloat(cs.fontSize);
  if (!design) return;

  // A LINE INSIDE A DRAWN BOX IS GOVERNED BY THAT BOX, not by its own calibrated reserve. The
  // reserve says "this line had one row when the design was drawn", which is the right rule for a
  // line standing on its own and the wrong one inside a tile: the tile has its own width and
  // height, and a label that outgrows them runs straight out of the colour. The owner caught
  // exactly this on the alert strip, where "ADVISORY" became "ADVISORY WISNIEWSKA" and left the
  // blue square on both sides - a defect every gate here missed, because they all measured
  // whether the PANEL moved and none asked whether the text stayed inside its own box.
  var box = drawnBoxOf(el);
  var limitW = 0;
  var room = 0;
  // WHAT THE DESIGN'S OWN SAMPLE ACTUALLY FILLED, remembered beside the reserve and used for
  // nothing else. \`room\` is a LINE BOX and the overflow test below reads a CONTENT box; measuring
  // the reserve in one and the excess in the other made every line whose line-height sits under
  // its face's content ratio report an overflow at the design's OWN default text and shrink
  // permanently, with no operator input at all. Measured 2026-08-23 across the 290 staged
  // designs: 200 of them shipped a smaller font than their CSS declares, worst -23%, on 457 of
  // 459 shrunk lines - a designer typing 103px and getting 79px. So the excess is measured
  // against what this line settled at when the design was drawn: its own sample fits itself by
  // definition, and only what the operator types PAST it shrinks.
  var fill = 0;

  // THE LINE MAY BE ITS OWN BOX. On the alert strip the severity tile IS the label element - the
  // blue square is that element's own background - so looking at ANCESTORS finds only the panel,
  // which the label sits happily inside while spilling out of the colour it is painted on. The
  // element's own TEXT against its own content box is the honest test, and it is also the
  // discriminator that leaves an auto-width chip alone: a box that grows with its text never
  // reports an overflow, so only a box with a width of its own is ever touched here.
  var contentW = stageContentWidth(el, cs);
  if (contentW > 0 && stageTextWidth(el) > contentW + 2) {
    limitW = contentW;
    // BOTH AXES COME FROM THE BOX AS DRAWN, and the height has to be the one measured at
    // calibration rather than the one it happens to have now: an auto-height element grows as it
    // wraps, so reading it live gives a ceiling that keeps rising and the line just keeps
    // wrapping. al03 then wrapped its way straight through the bottom of the alert panel and the
    // runtime bench caught it clipped mid-line. A tall tile still affords two rows; a one-row
    // slot still has to shrink. The box as drawn decides which.
    room = parseFloat(el.getAttribute('data-stage-selfh') || '');
    if (!room) {
      room = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      if (room > 0) el.setAttribute('data-stage-selfh', room);
    }
    if (!(room > 0)) room = 0;
    if (limitW > 0) {
      el.style.whiteSpace = 'normal';
      el.style.overflowWrap = 'break-word';
      el.style.height = '';
      box = el;                                 // it governs itself; centring below still applies
      // The same sample-fill the calibrated branch below records, on the same terms: the box as
      // drawn decides the ROOM, and what the design's own words filled decides what "past it"
      // means. Read after the height is cleared, so it is the content and not the pin.
      fill = parseFloat(el.getAttribute('data-stage-selffill') || '');
      if (!fill && !stageCalibrated) {
        fill = el.scrollHeight;
        if (fill) el.setAttribute('data-stage-selffill', fill);
      }
    }
  }

  // ONLY THE SELF-BOX CASE INTERVENES. A line overflowing an ANCESTOR that paints is real and the
  // sweep reports it, but the runtime does not touch it: the box is somebody else's layout, and
  // wrapping a line inside it moved panels the catalogue has its own contracts about - the sports
  // gate caught .scoreboard-event wrapping into ten rows and taking sb19 210px past what a card
  // may grow. The defect the owner found was the other kind: the alert tile IS the label element,
  // and that one the line can fix without reaching into a layout it does not own.
  if (box && box !== el) box = null;

  // The reserve, remembered from the first measurement - the design's own sample decides it.
  if (!limitW) {
    room = parseFloat(el.getAttribute('data-stage-room') || '');
    fill = parseFloat(el.getAttribute('data-stage-fill') || '');
  }
  if (!limitW && !room) {
    if (stageCalibrated) {
      // A line the design never showed us: it was BUILT by the design's own runtime after load
      // (a poll's options, a standings row, a queue entry), so a rebuild wipes the reserve every
      // time and re-measuring here would take it from the operator's value instead of the
      // design's. One row is the honest answer for a row - that is what a row is - and it is
      // what a board does with a long club name: keep the row, shrink the name.
      room = stageLineHeight(el, cs, design);
      // ONE ROW IS ONE ROW IN BOTH BOXES. The reserve is the row's line box; what has to fit
      // inside it is the row's glyph box, and on a face whose content ratio beats the design's
      // line-height those are not the same number. Taking the row's own face here is what keeps
      // a short club name at full size instead of shrinking it for a wrap that never happened.
      fill = stageFaceHeight(cs, design);
    } else {
      el.style.height = '';                     // measure the natural block, not a reserve
      if (cs.display === 'inline') el.style.display = 'inline-block';
      // The RENDERED height, not scrollHeight: the latter answers "does this overflow", and
      // leaves out the box's own bottom padding, which under-reserves and then clips at the
      // design's OWN content - 37 variants did exactly that.
      // Round up: a reserve a sub-pixel short of the design's own line is a clipped design.
      // Off the LAYOUT height, so the round-up answers the design and not whatever an animated
      // ancestor was doing on this frame - see the note on stageLayoutHeight above.
      room = Math.ceil(stageLayoutHeight(el, cs));
      // …and the overflow the design already had at its own sample, which is the number the
      // shrink test needs and the rect cannot give.
      fill = el.scrollHeight;
    }
    if (!room) return;                          // not laid out yet; a later pass will catch it
    el.setAttribute('data-stage-room', room);
    if (fill) el.setAttribute('data-stage-fill', fill);
  }
  // A real HEIGHT, not a max-height. A cap stops the line growing and lets it SHRINK, so a
  // short value still moves the panel - just in the other direction, which is the same defect
  // wearing the opposite sign. Measured 2026-08-20: with a cap, alert still moved 16px and
  // public-info 27px between a short value and a long one, entirely at the short end.
  // INLINE-BLOCK, never block. A height needs a block-level box, but promoting an inline span
  // to full block makes it fill its parent instead of shrink-wrapping, which re-wraps the row
  // around it and clipped 9 designs sideways at their OWN content.
  if (cs.display === 'inline') el.style.display = 'inline-block';
  // …AND NEVER ON A MULTI-COLUMN BLOCK. A definite height is what tells a multicol container to
  // stop balancing: it fills the first column to that height, the second, and then keeps going
  // into OVERFLOW COLUMNS to the RIGHT - outside the box, where the design's reveal mask clips
  // them away. So the words do not bleed a hair past the bottom, they disappear sideways, and
  // both of the probes below report a comfortable fit while it happens: scrollHeight sees no
  // vertical overflow because there is none, and a Range's rects are line boxes INSIDE a column,
  // each one narrower than the box. card80's two-column standfirst sat 0.25px inside its own
  // reserve at its own sample text, so the nightly's renderer spilled a third column where this
  // one does not (issue #36).
  //
  // An indefinite height is what the shrink lever needs anyway: with the height left alone the
  // container balances into the columns the design asked for and grows DOWNWARD, which is the
  // overflow scrollHeight can see - so the loop below shrinks the type to the reserve exactly as
  // it does for every other line, instead of being blind to it.
  var multicol = cs.columnCount !== 'auto' || cs.columnWidth !== 'auto';
  // HEIGHT ONLY, never overflow:hidden. The height is what holds the layout - that is the whole
  // contract. Hiding the excess as well only CUTS the words when the reserve is a sub-pixel
  // short, which the overflow gate caught on eleven designs at their OWN content; a hair of
  // bleed is a better failure than a clipped letter.
  el.style.height = multicol ? '' : room + 'px';

  // The bigger of the two floors wins: a design already at the floor never shrinks at all.
  var floor = Math.max(design * STAGE_FIT_MIN, Math.min(design, STAGE_FIT_FLOOR_PX));
  // The excess is measured against the LARGER of the two: the room the design gave the line, and
  // what the design's own words filled it with. The reserve stays the room - that is what holds
  // the panel - but "too tall" has to mean taller than the design ever was, never taller than a
  // box the browser was never going to keep the glyphs inside.
  var over = Math.max(room, fill || 0);
  for (var pass = 0; pass < 4; pass++) {
    var tallBy = over > 0 ? (el.scrollHeight / over) : 1;
    // Sideways too: a line inside a fixed row or a HELD chip cannot reflow, so it runs out of the
    // box's side rather than off its bottom. Same lever, same floor - only the axis differs.
    // Against the BOX when there is one - a line whose own width is free grows with its text, so
    // its own box and its text agree forever and it never reports the overflow that is plainly
    // there on screen. What it has to fit inside is the furniture around it.
    var wideBy = 1;
    var limit = limitW > 0 ? limitW : stageContentWidth(el, window.getComputedStyle(el));
    if (limit > 0) wideBy = stageTextWidth(el) / limit;
    if (tallBy <= 1.005 && wideBy <= 1.005) break;    // it fits - leave the size alone
    var current = parseFloat(window.getComputedStyle(el).fontSize);
    // A wrapped block's height falls with the SQUARE of the size (shorter text, shorter rows),
    // so the linear ratio overshoots; the square root converges in about two passes. Width is
    // linear in the size, so that axis takes the ratio as it stands.
    var byHeight = tallBy > 1 ? Math.sqrt(1 / tallBy) : 1;
    var byWidth = wideBy > 1 ? (1 / wideBy) : 1;
    var next = Math.max(floor, current * Math.min(byHeight, byWidth));
    if (next >= current) break;                 // no progress left to make
    el.style.fontSize = next + 'px';
    if (next === floor) break;                  // at the floor: as small as it may go
  }

  // ONCE IT HAS WRAPPED, CENTRE IT. A label that took two rows inside a tile was drawn as one,
  // and a ragged left edge in a coloured square reads as a mistake rather than a choice; centred,
  // two short rows read as the label they are. Only inside a drawn box, and only once the line
  // actually occupies more rows than the design gave it - a single row keeps the alignment its
  // designer chose.
  if (box) {
    var lh = stageLineHeight(el, window.getComputedStyle(el), design);
    if (lh > 0 && el.scrollHeight > lh * 1.5) el.style.textAlign = 'center';
  }
}

// Measure the design's own rows before any update() arrives. This file loads in <head>, so the
// lines do not exist yet - wait for the DOM, then again for the webfonts: the design's face loads
// with font-display: swap, and the FALLBACK wraps differently, so a reserve taken before the swap
// would be the wrong number of rows.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fitStagedText);
} else {
  fitStagedText();
}
if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
  document.fonts.ready.then(function () {
    // Re-measure from scratch: the reserve taken against the fallback face is not this design's.
    // EVERY remembered number goes, not just the reserve - a sample-fill or a drawn-box height
    // measured against the fallback is the fallback's, by exactly the same argument, and a face
    // ratio keyed on a family whose file had not arrived is measuring the substitute.
    STAGE_FACE_RATIOS = window.__noacgStageFaceRatios = {};
    var lines = stagedLines();
    for (var i = 0; i < lines.length; i++) {
      lines[i].removeAttribute('data-stage-room');
      lines[i].removeAttribute('data-stage-fill');
      lines[i].removeAttribute('data-stage-selfh');
      lines[i].removeAttribute('data-stage-selffill');
      // …AND WHAT THE FIRST PASS PINNED, on EVERY line, before ANY line is re-measured. Each line
      // clears its own before measuring itself, which is not the same thing: the lines are fitted
      // in order, so while line 1 is being measured lines 2..n are still holding the FALLBACK
      // pass's heights, and a row pinned half a pixel off its natural height moves the box the
      // line above it is measured in. Measured on the alert strip: its severity tiles reserved 188
      // with the siblings still pinned and 189 from a clean sheet - a whole pixel of the shipped
      // reserve decided by leftovers.
      stageUnpin(lines[i]);
    }
    var boxes = stageFitBoxes();
    for (var b = 0; b < boxes.length; b++) {
      boxes[b].removeAttribute('data-stage-room');
      boxes[b].style.height = '';
      // …AND THE RESERVE ITSELF, which is the one number the first version of this forgot. The
      // panel's reserve is written as a \`min-height\`, so leaving it in place while re-measuring
      // makes the fallback pass a FLOOR under the real one: the panel can only ever come back the
      // same or taller, and what it keeps is whatever the substitute face happened to fill. Which
      // face the first pass saw is decided by whether the woff2 had arrived by DOMContentLoaded -
      // a property of the machine's load, not of the design - so this is how a timing difference
      // became a shipped reserve. Measured on the alert strip: 189px held against a real 188.5px,
      // and its four severity tiles, sized inside that panel, moved with it.
      boxes[b].style.minHeight = '';
    }
    fitStagedText();
    // Calibration is over: from here the design's own content has been seen, and anything that
    // appears later was built by the design's runtime rather than drawn by its author.
    stageCalibrated = true;
  });
} else {
  stageCalibrated = true;
}`;
}
