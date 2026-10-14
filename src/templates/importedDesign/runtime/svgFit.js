// ── Text fit (SVG) ────────────────────────────────────────────────────────────
// SVG text neither wraps nor clips: a longer value would run past the artwork. So each bound
// layer has a BUDGET - the width of the text the DESIGNER drew - and a value wider than that
// is SHRUNK until it fits: a smaller line of the designer's own type, never a squeezed one.
// (Condensing to the drawn width, which is what this did before, distorts tracking and glyph
// shapes, so one extra letter visibly broke the typeface.) A value that fits is left exactly
// as drawn. Remove this block to let text run free instead.
//
// The budget is measured from the DRAWN text, never from whatever happens to be on screen.
// A playout renderer replays its control log the moment the page exists, so the first value
// measured there is usually the operator's: a graphic that took its budget from that never
// condensed at all, and the same file squished in the editor while running past the artwork
// on air. The drawn text is remembered before update() can be called, and the budget is
// re-measured once the real typeface has loaded (the first pass may have measured a
// fallback face). The shrink is set on the bound node; a run carrying its OWN font-size
// keeps it, which Illustrator only writes when a designer sized one word by hand.
var svgFitDrawn = {};                           // id -> the text the designer drew
var svgFitLines = {};                           // id -> the LINES they drew it on, for a block
var svgFitStep = {};                            // id -> the LEADING they drew those lines at, px
var svgFitWidths = {};                          // id -> that text's width, in the real face
var svgFitSizes = {};                           // id -> the font size it was drawn at, in px
var svgFitRoom = {};                            // id -> { width, lines } the design offers it
var svgFitAlign = {};                           // id -> { h, v } read off where the line was drawn
var svgFitPose = {};                            // id -> a copy of the line as drawn, to read it again
var svgFitExtra = {};                           // id -> WIDTH a growing panel gave this line
var svgFitShift = {};                           // id -> how far that panel's MIDDLE moved doing it
var svgFitExtraH = {};                          // id -> HEIGHT a growing panel may still give it
var svgFitOver = {};                            // id -> true when even the floor could not fit
var svgFitOwed = {};                            // id -> this line still needs measuring (below)
var SVG_FIT_FLOOR = 0.55;                       // REPORTED as too long below 55% of the drawn size
var SVG_FIT_HARD_FLOOR = 0.3;                   // …but it keeps shrinking to 30% rather than condensing
var SVG_SQUEEZE_FLOOR = 0.7;                    // never narrower than 70% of the glyphs' own width
var SVG_LINE_HEIGHT = __SVG_LINE_HEIGHT__;                      // a wrapped line's step, in ems

// EVERY line this design fits, of both kinds. The layers the DESIGNER drew are <text>/<tspan>
// inside the artwork; a PLACED line is an HTML span the design got afterwards - a stand-in for
// text that was exported as outlines, or a field added later - and it lives after </svg>, in
// the same box. One list, so one ladder walks them and one report names them.
function svgFitNodes() {
  var out = [];
  var drawn = document.querySelectorAll('.__PREFIX__-art text[id], .__PREFIX__-art tspan[id]');
  for (var i = 0; i < drawn.length; i++) {
    if (/^f\d+$/.test(drawn[i].id) && typeof drawn[i].getComputedTextLength === 'function') out.push(drawn[i]);
  }
  // data-fit="shrink" is the mode a placed line is born in and the only one that ever had a
  // runtime: a line the author set to run free, or to reflow in CSS, is saying the cap does
  // not apply to it, so the ladder leaves it exactly as it was.
  var placed = document.querySelectorAll('.__PREFIX__-box [data-fit="shrink"]');
  for (var j = 0; j < placed.length; j++) {
    if (/^f\d+$/.test(placed[j].id)) out.push(placed[j]);
  }
  return out;
}

// ── A MEASUREMENT NOBODY COULD TAKE IS NOT AN ANSWER ──────────────────────────
// Every number below is read off the LAID-OUT design, and the design is not always laid out
// when this file first runs. A playout renderer preloads its templates before anything is on
// air; a control page keeps its monitors in a display:none column while the operator is on
// another workspace; and a drawn state (drawnState.ts) is display:none from the first frame
// until the moment its state fires, so a bound layer inside one has no box at load BY DESIGN.
//
// A node in that condition measures 0 for everything. Recording that zero is what made the fit
// depend on WHEN it first ran rather than on the artwork and the value: the room was cached as
// nothing, the "have I measured this line?" test then read false forever, and the ladder skipped
// the line for the life of the graphic - it painted at the drawn size, on one line, across the
// artwork. Nothing could recover it, because every re-measure is a re-measure of a design that
// already has its answer.
//
// So an unmeasurable node records NOTHING and is marked OWED, and nothing fits a line it cannot
// measure. The debt is per LINE rather than per document, because the condition is: a quiz board
// always has a state that is off, so one flag for the whole graphic would be raised for the life
// of it and every update() would pay for a full re-measure that could never settle anything.
function svgFitLaidOut(el) {
  var box = el.getBoundingClientRect();
  if (box.width > 0 || box.height > 0) return true;
  // An EMPTY value has no box of its own and is perfectly measurable all the same, so the
  // parent answers for it: inside a display:none subtree nothing has a box at all. Without this
  // the two passes below would disagree about the same node - one skipping it and the other
  // measuring its room against a width that was never recorded.
  var parent = el.parentNode;
  var pbox = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
  return !!pbox && (pbox.width > 0 || pbox.height > 0);
}

/** Is any owed line NOW measurable? The one statement of it, read by the ladder, by the drawn
 *  states and by the load-time recovery, so the three cannot disagree about what is outstanding.
 *  A line that is owed and still hidden is not due: re-measuring would answer nothing and the
 *  next reveal asks again. */
function svgFitDue(within) {
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    // Owed either because a pass could not measure it, or because no pass has reached it at
    // all - the second is what a fit running before the load-time measurement would meet.
    var owed = svgFitOwed[el.id] || svgFitRoom[el.id] == null || svgFitWidths[el.id] == null;
    if (!owed || !svgFitLaidOut(el)) continue;
    if (within && within !== el && !(within.contains && within.contains(el))) continue;
    return true;
  }
  return false;
}

/** A line PLACED on the artwork rather than drawn in it - an HTML span, which measures and
 *  paints through different calls than an SVG text node does.
 *
 *  ASKED OF THE ELEMENT KIND, because it is asked of things that are not lines at all. It used
 *  to read "this node has no getComputedTextLength", which is a true test of "not an SVG <text>"
 *  and only means "placed" while the caller already knows it is holding a line. svgUserScale
 *  asks it of PANELS and FOLLOWERS - a rect, a path, a group, none of which have that method -
 *  so every growing panel was read as placed and converted its grant at svgPlacedScale's
 *  fallback of 1 instead of the frame's own scale. Invisible on a 1920x1080 artwork, where the
 *  two are the same number; measured on the millimetre scorebug, whose user units are 3.78 px
 *  each, it grew the plate 3.78 times too far and stood it 1040 px below the frame's bottom
 *  edge (2026-09-10). A placed line is an HTML element; everything drawn is an SVG one,
 *  whatever tag it is.
 *
 *  NOT the namespace string, which says the same thing and would put a literal http URL into the
 *  emitted code. The export bench scans emitted JS for URLs and cannot tell an XML namespace
 *  from a network reference (svgPaintLines below takes the namespace off the node for exactly
 *  this reason), so writing one here refuses every imported graphic at the publish door. */
function svgFitPlaced(el) {
  return !(el instanceof SVGElement);
}

/** Painted px per LAYOUT px for a placed line - what an entrance that scales the whole design
 *  puts between the two. A drawn layer never needs this: getComputedTextLength answers in the
 *  SVG's own user units, which no transform above it can move. */
function svgPlacedScale(el) {
  var slot = el.parentNode;
  var layout = slot && slot.offsetWidth;
  return layout > 0 ? slot.getBoundingClientRect().width / layout : 1;
}

/** The width of whatever text the node holds right now, in the space its room is measured in:
 *  user units for a drawn layer, LAYOUT px for a placed one. Each is compared only against its
 *  own room, and both spaces stand still while an entrance is mid-flight - so a value the design
 *  cannot hold is caught during the animation exactly as it is at rest. */
function svgTextWidth(el) {
  return svgFitPlaced(el)
    ? el.getBoundingClientRect().width / svgPlacedScale(el)
    : el.getComputedTextLength();
}

// THE ROOM A PLACED LINE GETS IS ITS OWN SLOT - the max-width its wrapper declares. Nothing was
// drawn behind it (it sits on empty artwork, or over shapes this template hides), so there is no
// shape to take a margin from, and the slot is the only statement anybody made about how much
// room the line has: measured from the outlined group's own box at import, or dragged on the
// canvas. That is the same sentence as the drawn line's fallback - a layer with no shape behind
// it keeps the width it was DRAWN at - and it is a WIDTH, so a placed line never wraps: the room
// below it belongs to artwork drawn for something else.
function svgFitSlot(el) {
  var slot = el.parentNode;
  if (!slot || !slot.offsetWidth) return 0;
  var cap = parseFloat(getComputedStyle(slot).maxWidth);
  // No cap at all: the wrapper hugs its line, so its own box is the only room on offer.
  return cap > 0 ? cap : slot.offsetWidth;
}

// ── THE LAST RUNG: NOTHING PAINTS OUTSIDE ITS ROOM (owner ruling, 2026-08-26) ──
// The ladder used to stop at the readability floor and simply REPORT a value it could not fit,
// which left the floored line running straight across whatever the designer drew beside it. So a
// floored block is squeezed into its budget as well: the same glyphs, narrower. It is deliberately
// ugly, it is still reported as too long, and it comes off the moment a shorter value arrives.
//
// Never a default. Filling the room, growing the panel, wrapping and shrinking all happen first;
// this only ever runs on a value no size and no line count could hold.
//
// ── …BUT IT STOPS BEING TYPE FIRST (owner ruling, 2026-09-05) ──
// That rung had no bottom. SVG's textLength compresses to whatever number it is given, so a value
// eight times its room came out as an eight-times-condensed smear - the same glyphs in name only,
// a grey texture nobody can read. The owner met one on an imported quiz board:
//
//   "the text should always be readable, and if it becomes too small, then that's the user's own
//    fault, but the text should never grow on top of each other or get so dense that it's
//    impossible to read, like in this screenshot."
//
// So the squeeze now has a floor of its own: 70% of the glyphs' natural advance, the point past
// which condensed type stops reading as words. Below that the compression simply stops, the value
// stays legible, and the graphic accepts that it is wider than the shape it was drawn in.
//
// The two rulings only ever collide on a value no legible rendering could contain, and the newer
// one wins there BECAUSE the older one's promise cannot be kept honestly: type that has stopped
// being readable is not "inside the panel" in any sense an audience would recognise. Every value
// that could be squeezed legibly is squeezed exactly as before, and both are still reported
// through noacgTextOverflow(), which is what puts the warning in front of the operator.
function svgUnsqueeze(el) {
  if (svgFitPlaced(el)) {
    el.style.transform = '';
    el.style.transformOrigin = '';
    return;
  }
  var kids = el.children.length ? el.children : [el];
  for (var i = 0; i < kids.length; i++) {
    kids[i].removeAttribute('textLength');
    kids[i].removeAttribute('lengthAdjust');
  }
}

function svgSqueeze(el, budget) {
  svgUnsqueeze(el);
  if (!(budget > 0)) return;
  // A PLACED line is HTML and has no textLength, so it takes a horizontal scale pinned to
  // whichever edge its own alignment reads from. Same caveat as a growth follower's transform:
  // a line the TIMELINE animates in its own right is transformed by GSAP too, and the tween
  // wins - so a floored value on a separately-animated placed line loses its squeeze. The
  // artwork's own layers are what the design presets move, so this does not bite by default.
  if (svgFitPlaced(el)) {
    var w = svgTextWidth(el);
    if (!(w > budget + 0.5)) return;
    var align = getComputedStyle(el).textAlign;
    el.style.transformOrigin =
      (align === 'right' ? 'right' : align === 'center' ? 'center' : 'left') + ' center';
    // Never past the legibility floor - see the ruling above the function.
    el.style.transform = 'scaleX(' + Math.max(budget / w, SVG_SQUEEZE_FLOOR).toFixed(4) + ')';
    return;
  }
  // A DRAWN layer takes SVG's own fit-to-width. Per painted line, because a wrapped block's
  // tspans each have their own length and only the ones actually over need squeezing.
  var kids = el.children.length ? el.children : [el];
  for (var j = 0; j < kids.length; j++) {
    var k = kids[j];
    if (!k.getComputedTextLength) continue;
    var natural = k.getComputedTextLength();
    if (!(natural > budget + 0.5)) continue;
    // The budget, or the legibility floor - whichever is WIDER. A line that fits inside its room
    // once condensed is condensed exactly as far as it needs to be; one that would have to go
    // past 70% of its own advance stops there and is left sticking out, legibly, and reported.
    k.setAttribute('textLength', Math.max(budget, natural * SVG_SQUEEZE_FLOOR).toFixed(2));
    k.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
}

// Runs as the page parses, with the artwork above it and update() not yet callable. Through
// svgFitValue, never textContent: a block the designer drew as three stacked lines is one value
// with two spaces in it, and taken raw those spaces are the ones that go missing. The LINES they
// drew are kept beside it, because the drawn state has to be reproducible after the first fit has
// repainted the node (svgShowDrawn).
(function () {
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (svgFitDrawn[el.id] != null) continue;
    svgFitDrawn[el.id] = svgFitValue(el);
    if (!svgWrappedBlock(el)) continue;
    var lines = [];
    var steps = [];
    var prevY = null;
    for (var k = 0; k < el.children.length; k++) {
      var kid = el.children[k];
      lines.push(kid.textContent);
      // THE LEADING IS THE DESIGNER'S, and it is written two ways: a baked-in y per line
      // (Illustrator, Inkscape) or a dy step off the one before it. Both are read, because a
      // block repainted at some constant instead is a design nobody drew - a 30px standfirst
      // set on 50px steps tightens to 36 the first time the ladder runs.
      var y = parseFloat(kid.getAttribute('y'));
      var dy = parseFloat(kid.getAttribute('dy'));
      if (isFinite(y) && prevY !== null && y > prevY) steps.push(y - prevY);
      else if (k > 0 && isFinite(dy) && dy > 0) steps.push(dy);
      if (isFinite(y)) prevY = y;
    }
    svgFitLines[el.id] = lines;
    // The FIRST step, not an average: a designer who set one leading set it for every line, and
    // a block whose steps differ is doing something this rule has no reading of.
    if (steps.length) svgFitStep[el.id] = steps[0];
  }
})();

/** THE STEP BETWEEN TWO LINES OF THIS BLOCK, in ems - the leading the designer drew where they
 *  drew one, and the house 1.2 where nothing says. Out-of-range values are not leadings: a
 *  block whose lines overlap, or sit a paragraph apart, is not a wrapping block's step and the
 *  constant is the safer answer. */
function svgLineHeight(el) {
  var step = svgFitStep[el.id];
  var drawn = svgFitSizes[el.id];
  if (!(step > 0) || !(drawn > 0)) return SVG_LINE_HEIGHT;
  var ems = step / drawn;
  return ems >= 0.8 && ems <= 3 ? ems : SVG_LINE_HEIGHT;
}

/** PUT THE DRAWN VALUE BACK ON A NODE, to measure the design rather than the operator's copy.
 *
 *  A BLOCK is repainted line for line. Writing its drawn value as textContent would leave ONE
 *  long line standing, and that width becomes the floor of the room below - a budget the block
 *  could never overflow, so a question that wrapped correctly at load stopped wrapping the moment
 *  anybody typed into it. The lines are the ones the designer drew, kept since parse, so this is
 *  the same measurement whenever it is taken and in whatever face has finished loading. */
function svgShowDrawn(el, drawn) {
  var lines = svgFitLines[el.id];
  if (!lines) { el.textContent = drawn; return; }
  svgPaintLines(el, lines, parseFloat(getComputedStyle(el).fontSize) || 0, svgLineHeight(el));
}

/** Is what this node is SHOWING no longer the drawn design - a different value, or the same one
 *  in a different shape? A block is repainted by every fit, so its form goes stale even while
 *  its value does not, and a measurement taken off the previous pass's answer is the previous
 *  pass's answer. */
function svgFitStale(el, showing) {
  return showing !== svgFitDrawn[el.id] || svgWrappedBlock(el) || !!svgFitLines[el.id];
}

function measureSvgBudgets() {
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var live = svgFitValue(el);
    // The DRAWN VALUE is textContent, not geometry, so it is remembered whether or not this
    // layer is on screen - and it has to be, because update() may arrive before the layer's
    // state ever fires and there would then be nothing left to measure the design from.
    if (svgFitDrawn[el.id] == null) svgFitDrawn[el.id] = live;
    var drawn = svgFitDrawn[el.id];
    if (!svgFitLaidOut(el)) { svgFitOwed[el.id] = true; continue; }   // no box to read (above)
    // Any previous fit has to come off first, or the measurement compounds.
    el.style.fontSize = '';
    svgUnsqueeze(el);
    // Measure the design, put the value back. A BLOCK is restored even when the value matches,
    // because the previous pass repainted its lines - see measureSvgRoom for what that cost.
    var stale = svgFitStale(el, live);
    if (stale) svgShowDrawn(el, drawn);
    // A BLOCK'S DRAWN WIDTH IS ITS WIDEST LINE, not the sum of its lines. getComputedTextLength()
    // adds up every tspan under the node, so a question drawn as three stacked lines reported a
    // width three lines long - and that number is the FLOOR of the room below, so the block could
    // never overflow anything and never wrapped.
    svgFitWidths[el.id] = svgBlockWidth(el);
    svgFitSizes[el.id] = parseFloat(getComputedStyle(el).fontSize) || 0;
    // PUT BACK WHAT WAS THERE, in the shape it was in. Writing textContent leaves one flat line,
    // which the ladder normally repaints straight afterwards - but not on the paths that skip a
    // node (no budget, no drawn size), and a block left flat there is a design nobody drew.
    // Where the value IS the drawn one, the drawn lines are the shape to put back.
    if (stale) { if (live === drawn) svgShowDrawn(el, drawn); else el.textContent = live; }
  }
}

// ── THE ROOM THE DESIGN GIVES A LINE ──────────────────────────────────────────
// The budget is NOT the width of the text the designer typed. A name drawn 402px wide inside a
// 1040px banner has 588px of empty banner beside it, and taking the drawn text as the budget
// spent none of it: the 403rd pixel shrank the type while more than half the panel stood
// empty. So the budget is the ROOM - the shape drawn behind the line, out to a right margin
// mirroring the left one the designer left. A line with no shape behind it keeps the drawn
// width as its budget, which is the honest answer when nothing says otherwise.
//
// The same measurement answers how many LINES the design can hold: the gap from this line down
// to the nearest thing drawn below it (a second text layer, or the panel's own bottom margin).
// A name in a three-line strap measures no room and stays one line, exactly as drawn; a
// question alone on a board measures several and may wrap. Nothing is asked of the designer
// and nothing about the artwork changes - which is the rule this ladder exists to keep.
// It returns the ELEMENT, not a rectangle. A rectangle is enough to bound a line sideways, and
// it is what this used to answer; it is not enough to say where the line sits INSIDE the shape,
// because a plate drawn on an angle has a screen rectangle bigger than the plate. The alignment
// work (svgLocalBox) needs the shape itself so it can ask the question in the shape's own frame.
function svgFitContainer(el) {
  var art = document.querySelector('.__PREFIX__-art');
  if (!art) return null;
  var box = el.getBoundingClientRect();
  var shapes = art.querySelectorAll('rect, path, polygon, ellipse, circle');
  var best = null;
  var bestArea = 0;
  for (var i = 0; i < shapes.length; i++) {
    var r = shapes[i].getBoundingClientRect();
    // Contains the line, and is genuinely bigger than it - a highlight rule under a word is
    // not the panel the word sits in.
    if (r.left > box.left + 1 || r.right < box.right - 1) continue;
    if (r.top > box.top + 1 || r.bottom < box.bottom - 1) continue;
    if (r.width * r.height <= box.width * box.height) continue;
    if (!best || r.width * r.height < bestArea) { best = shapes[i]; bestArea = r.width * r.height; }
  }
  return best;
}

/** THE PANEL, IN THE LINE'S OWN COORDINATE SYSTEM.
 *
 *  Screen rectangles are the wrong instrument for alignment. A plate turned three degrees has a
 *  screen rectangle wider and taller than the plate, so "the middle of the box" read off that
 *  rectangle is not the middle of the plate - and a board drawn on an angle is the normal case in
 *  hand-made artwork, not an edge one (owner, 2026-09-02: "my design here is wonky on purpose to
 *  see how we manage it when we import it").
 *
 *  So the panel's own corners are mapped THROUGH the line's coordinate system: panel local ->
 *  screen -> line local. Text and plate almost always carry the same rotation, because the
 *  designer turned them together, and then the mapped quad is axis-aligned in the line's frame
 *  and this is exact. Where they differ the axis-aligned extent of the quad is used, which is the
 *  same approximation the rest of the ladder makes and is never worse than the screen rectangle.
 *
 *  Returns null rather than guessing when either matrix is unavailable - an entrance mid-flight,
 *  a detached node - and every caller falls back to what it did before. */
function svgLocalBox(panelEl, textEl) {
  if (!panelEl || !panelEl.getBBox || !panelEl.getScreenCTM || !textEl.getScreenCTM) return null;
  var to = textEl.getScreenCTM();
  var from = panelEl.getScreenCTM();
  if (!to || !from) return null;
  var m = to.inverse().multiply(from);
  var bb = panelEl.getBBox();
  var xs = [];
  var ys = [];
  var corners = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x + bb.width, bb.y + bb.height], [bb.x, bb.y + bb.height]];
  for (var i = 0; i < corners.length; i++) {
    xs.push(m.a * corners[i][0] + m.c * corners[i][1] + m.e);
    ys.push(m.b * corners[i][0] + m.d * corners[i][1] + m.f);
  }
  var left = Math.min.apply(null, xs);
  var right = Math.max.apply(null, xs);
  var top = Math.min.apply(null, ys);
  var bottom = Math.max.apply(null, ys);
  return { left: left, right: right, top: top, bottom: bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

/** HOW THE DESIGNER ALIGNED THIS LINE IN ITS BOX, read off where they put it.
 *
 *  Nothing is asked and nothing new is stored: the file already says it. On each axis the two
 *  drawn insets are compared, and the line is CENTRED when the block's centre sits within
 *  SVG_ALIGN_TOL of the box's centre - otherwise it is aligned to whichever side it was drawn
 *  nearer. A designer who centred a question centred it; one who set answers against the left of
 *  their plates meant left.
 *
 *  The tolerance is a fraction of the BOX, not a constant, because "near enough to be centred"
 *  scales with the thing it is centred in - and it has to absorb the hand-placed wobble in a
 *  home-made file, where nothing is ever exactly on the middle.
 *
 *  AN EXPLICIT text-anchor IS THE EXPORTER STATING THE ANCHOR, WHICH IS INFORMATION - never a
 *  request to be left out. It used to skip the whole SIDEWAYS half of this - the anchor, the
 *  room measured from the box, and the growth from the middle that hangs off that room - because
 *  all three were gated on having DERIVED the alignment. The vertical half ran either way. Eight
 *  of the 43 corpus files state one, including every centre-aligned Figma export, which is how a
 *  title card and most scoreboards are built: an end-anchored team name in a 680-unit plate
 *  measured 123 units of room - the width of the word already standing there - and shrank at the
 *  first longer name.
 *
 *  So the anchor is believed, and WHERE THE LINE WAS DRAWN is still measured, because they are
 *  two facts and a file can state one while drawing the other. Where they agree the line is
 *  treated exactly as a derived one. Where they disagree - a centre-anchored line composed away
 *  from its box's middle, which is what negative space looks like in a file - the anchor stays
 *  WHERE IT WAS DRAWN and the room is measured about it, because moving it would invent a
 *  centring the designer did not draw, and this module never moves artwork.
 *
 *  Both answers matter to a different half of the fit. Horizontally the anchor decides which way
 *  a longer value fills and where wrapped lines start. Vertically it decides whether the room
 *  below the line is the whole of the room (a line drawn against the top of its box) or only half
 *  of it (a line drawn in the middle, with as much space above it as below). */
var SVG_ALIGN_TOL = __SVG_ALIGN_TOL__;

/** WHAT THE AUTHOR SAID about how a line sits in its box (NOACG_LAYOUT.lines, written by the
 *  Fields step's nine-dot grid), or null - which is every line of every design from before the
 *  grid existed, and every row nobody touched. Read at fit time rather than at load, because the
 *  table is emitted after this runtime in the file. */
function svgSaidAlign(id) {
  var said = typeof NOACG_LAYOUT === 'object' && NOACG_LAYOUT ? NOACG_LAYOUT.lines : null;
  if (!said) return null;
  for (var i = 0; i < said.length; i++) if (said[i].el === id) return said[i];
  return null;
}

/** The run a line gets when a margin of m is kept on both sides of its box: twice the shorter
 *  reach for a line that fills BOTH ways, the reach to the far margin for one that fills one
 *  way. Asked twice below, with two different margins. */
function svgReach(h, anchor, box, m) {
  if (h === 'middle') return 2 * Math.min(anchor - (box.left + m), (box.right - m) - anchor);
  return h === 'end' ? anchor - (box.left + m) : (box.right - m) - anchor;
}

/** THE BAND OF ITS BOX A LINE OWNS, top to bottom, in the line's own frame: the box trimmed to
 *  the nearest PLATE drawn inside it above the line and the nearest one below it.
 *
 *  A quiz draws its question inside the board and its answer rows inside the same board, under
 *  it. Read against the whole board the question is composed against the TOP, and the rows under
 *  it keep their whole drawn gap (svgFitCeiling), so it had no room of its own: a question twice
 *  the drawn length went straight to one line at the 55% floor on both docs example quizzes, with
 *  the band above the rows standing empty around it (row B's walk, 2026-09-21). The question was
 *  composed in the space ABOVE the rows, and that space is its box - so the vertical half of the
 *  alignment is read there, and the D3 room (centred: symmetric with half a line kept from each
 *  edge; bottom: upward) is measured there too.
 *
 *  ONLY A SHAPE TRIMS IT, never a text. Text under text is a STACK and the gap between them is
 *  the composition's leading - a name over its role keeps that gap whole and buys a second line
 *  by growing the panel (owner walk, 2026-08-29), exactly as before. A plate under a line is
 *  furniture, and the line was composed in the room above it. The one case this reads wrong is a
 *  caption drawn as live text under a question ("Question 3 of 10"): the question keeps zero room
 *  there, as it always did, and the Fields step's nine-dot grid is the override.
 *
 *  Trimming from ABOVE as well is what keeps a line that grows upward off whatever is drawn over
 *  it - the board's own accent rule on both docs examples - which the whole-box reading never
 *  looked at. With no plate above or below, the band IS the box and nothing changes. */
function svgOwnBand(el, panelEl, box, own, centred) {
  var band = { top: box.top, bottom: box.bottom, cy: box.cy, trimmed: false };
  var art = document.querySelector('.__PREFIX__-art');
  if (!art || !panelEl) return band;
  var panel = panelEl.getBoundingClientRect();
  var others = art.querySelectorAll('text, tspan, image, rect, path, polygon, ellipse, circle');
  var above = null;
  var below = null;
  for (var i = 0; i < others.length; i++) {
    var o = others[i];
    if (o === el || o === panelEl || o.contains(el) || el.contains(o)) continue;
    var r = o.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue;   // that IS the panel
    if (!svgInsidePanel(r, panel)) continue;                          // drawn outside this box
    var at = svgLocalBox(o, el);
    if (!at) continue;
    // OVER OR UNDER THE ROOM IT FILLS SIDEWAYS: a centred line may fill its whole box, so a
    // short question drawn over a gap between two columns of plates still has plates under it.
    var from = centred ? box.left : own.x;
    var to = centred ? box.right : own.x + own.width;
    if (at.right < from + 1 || at.left > to - 1) continue;
    var text = /^(text|tspan)$/i.test(o.tagName || '');
    if (at.top >= own.y + own.height - 1) {
      if (!below || at.top < below.edge) below = { edge: at.top, text: text };
    } else if (at.bottom <= own.y + 1) {
      if (!above || at.bottom > above.edge) above = { edge: at.bottom, text: text };
    }
  }
  if (below && !below.text && below.edge < band.bottom) { band.bottom = below.edge; band.trimmed = true; }
  if (above && !above.text && above.edge > band.top) band.top = above.edge;
  band.cy = (band.top + band.bottom) / 2;
  return band;
}

function svgAlignOf(el, panelEl) {
  if (svgFitAlign[el.id]) return svgFitAlign[el.id];
  var align = { h: 'start', v: 'top', derived: false };
  var box = svgLocalBox(panelEl, el);
  var own = el.getBBox ? el.getBBox() : null;
  if (box && own && own.width > 0 && own.height > 0) {
    // WHERE THEY DREW IT, measured whatever the file says - it is the artwork's own answer, and
    // the only one available for the thirty-five corpus files in forty-three that state nothing.
    var cx = own.x + own.width / 2;
    var placed = Math.abs(cx - box.cx) <= (box.right - box.left) * SVG_ALIGN_TOL
      ? 'middle'
      : (cx < box.cx ? 'start' : 'end');
    // The VERTICAL half is read in the band the line owns (svgOwnBand), and measureSvgRoom
    // measures the room in that same band; sideways the whole box is still the answer.
    var band = svgOwnBand(el, panelEl, box, own, placed === 'middle');
    align.band = band;
    var stated = el.getAttribute('text-anchor');
    if (stated !== 'middle' && stated !== 'end' && stated !== 'start') stated = null;
    // What the FILE says: its stated anchor, else where the line was drawn.
    var read = stated || placed;
    var cy = own.y + own.height / 2;
    var placedV = Math.abs(cy - band.cy) <= (band.bottom - band.top) * SVG_ALIGN_TOL
      ? 'middle'
      : (cy < band.cy ? 'top' : 'bottom');
    // WHAT THE AUTHOR SAID WINS OVER BOTH, where they said anything (NOACG_LAYOUT.lines). It is
    // an input to the one road below rather than a road of its own: the drawing is still
    // measured, because a declared answer is worked out FROM it - the margin a declared anchor
    // keeps is the gap the designer left, and the nudge the checkbox hands back is the distance
    // from where they drew the line to its anchor.
    var said = svgSaidAlign(el.id);
    var saidH = said ? said.h : null;
    var keepNudge = !!(said && said.nudge);
    align.h = saidH || read;
    align.v = (said && said.v) || placedV;
    // True only for an anchor read off the DRAWING - false for one the file states and one the
    // author declared - which is what tells a measurement apart from a statement when somebody
    // is reading the sweep's table (scripts/svg-import-sweep.mjs).
    align.derived = !stated && !saidH;
    // A declared anchor that DIFFERS from what the file says goes to the box's own landmark. One
    // that restates the file changes nothing, to the unit, because it takes the file's own road.
    var landmark = !!(saidH && saidH !== read);
    // Half the drawn type: the typographic margin this module keeps sideways where the
    // composition has no margin to read.
    var halfType = (svgFitSizes[el.id] || own.height || 0) * 0.5;
    // The margin the designer left on the tighter side. Negative for a line drawn past its box.
    var pad = Math.min(own.x - box.left, box.right - (own.x + own.width));
    // WHERE THE ANCHOR GOES, measured HERE because here is the one place the DRAWN value is
    // standing on the node (measureSvgRoom restores it before measuring). Asked later, with an
    // operator's value in place, "the middle of the text" would be the middle of whatever was
    // last typed.
    //
    // Centring SNAPS to the box's real centre (owner, 2026-09-02: "that just usually looks
    // better"), so a short value and a long one both sit where a designer would have put them.
    // What the file recorded is not thrown away: the nudge is the distance from that anchor to
    // where the text was actually drawn - the number a deliberately off-centre composition needs
    // back - and it is measured whether or not anything reads it yet.
    if (landmark) {
      // A DECLARED ANCHOR IS THE BOX'S OWN LANDMARK: its middle, or its inside edge less a
      // margin. The margin is the gap the designer left where the line was set against a side,
      // and half the drawn type where it was centred, because a centred line's gaps are half the
      // centring and not a margin - the same substitution the derived road makes below, and the
      // mapping step's overlay draws.
      var side = placed === 'middle' ? halfType : Math.max(0, pad);
      align.anchor = align.h === 'middle' ? box.cx : (align.h === 'end' ? box.right - side : box.left + side);
    } else if (align.h !== 'start') {
      // THE SNAP IS FOR A LINE THE DESIGNER PUT ON THE LANDMARK, and for no other. A derived
      // 'middle' is within SVG_ALIGN_TOL of the box's centre by construction, so the snap is
      // always a small correction. A STATED 'middle' carries no such promise: the exporter is
      // describing how the line's own words grow, and the designer may have composed that line
      // anywhere in the box. Where the statement and the drawing agree, snap; where they do not,
      // the anchor is where they drew it.
      //
      // AN 'end' LINE NEVER SNAPS, stated or derived. Its landmark would be the box's own right
      // edge, and moving text onto it would spend the margin the designer left rather than keep
      // it - the opposite of what the centring snap does.
      //
      // A line that fills rightwards has no anchor to write unless the author sent it somewhere
      // else (above): its x is the file's own, side bearing and all.
      align.anchor = align.h === 'end'
        ? own.x + own.width
        : (align.h === placed ? box.cx : cx);
    }
    if (align.anchor != null) {
      align.nudge = own.x + (align.h === 'middle' ? own.width / 2 : (align.h === 'end' ? own.width : 0)) - align.anchor;
      // KEEPING THE NUDGE puts the anchor where the block was drawn. It rides the anchor rather
      // than the value, which is what makes it survive wrapping, shrinking and growth: the room
      // below is spent from the nudged anchor, so a longer value still stops at the nearer
      // margin.
      if (keepNudge) align.anchor += align.nudge;
      // AND THE ROOM, from the box rather than from where the text happens to be standing.
      // Moving the anchor moves the text, so a budget measured off the text's own left edge
      // would answer differently on the second pass than the first - and an iterated answer
      // settles differently in the editor, in an export and under SPX, which is the one thing
      // this module refuses to do. Measured from the box, at rest, once: the margin the designer
      // left on the tighter side, kept on both.
      // SPENT FROM THE ANCHOR, which is what makes it an answer for a line drawn anywhere in its
      // box rather than only for one sitting on the box's own landmark. A middle-anchored line
      // fills both ways, so it may reach the nearer margin twice over; an end-anchored one fills
      // leftwards until it meets the other margin. For a line whose anchor IS the landmark this
      // is arithmetically the old mirror, to the unit - it just no longer needs that to be true.
      if (pad > 0) align.width = svgReach(align.h, align.anchor, box, pad);
      // A CENTRED LINE HAS NO SIDE MARGINS TO READ.
      //
      // Row P measured this on 2026-09-04 and put it to the owner rather than choosing
      // (docs/acceptance/owner-queue/2026-09-04-a-stated-anchor-is-not-an-opt-out.md, call 2):
      // "a centred line never FILLS - the first longer value goes straight to wrapping, and if it
      // cannot wrap, to shrinking", named as the likeliest thing still behind *"when I add a
      // longer text it gets smaller"*. He answered it the day before, walking his vote board:
      // *"it shrank it down, and it doesn't fill the whole shape. It could."*
      //
      // Everything above reads the gap the designer left beside the words as MARGIN. That is a
      // true reading for a line composed against one side of its box. It is empty for a line the
      // designer CENTRED: both gaps are then exactly half the leftover by construction, so the
      // mirror hands the line back its own drawn width and the box around it is invisible to the
      // ladder. His VOTE NOW badge - 260 units of pill, 142 units of word - measured 143 units of
      // room, so one extra word cost it a quarter of its size and anything longer floored at 55%
      // and was squeezed into the same 143 units, which reads on air as the badge having gone.
      //
      // This is the sideways half of the argument settled downwards on 2026-09-02 (the room a
      // centred block has vertically). Same rule, same shape: the margin kept is TYPOGRAPHIC
      // rather than read off the composition - half the drawn type, which is the same side
      // bearing measureSvgRoom already keeps between a line and a neighbour drawn beside it - and
      // it is symmetric about the anchor, because that is the point a longer value grows from.
      //
      // IT MAY ONLY EVER ADD ROOM, exactly as the vertical rule may: a composition the mirror
      // already served keeps precisely what it had, so no graphic gets tighter because of this.
      // A line DRAWN centred and sent to an edge keeps the same typographic margin, because its
      // drawn gaps are still not margins.
      if (align.h === 'middle' || (landmark && placed === 'middle')) {
        var open = svgReach(align.h, align.anchor, box, halfType);
        if (open > (align.width || 0)) align.width = open;
      }
    }
    // AND THE SAME SNAP ON THE OTHER AXIS (owner, 2026-09-02: "by default a centered text should
    // snap both vertically and horizontally"). What shipped first centred sideways and kept
    // whatever height the line was drawn at - 9 units above the true middle of his own plate,
    // held constant at every length, which is a composition nobody chose rather than one the
    // designer did. So a block the designer CENTRED in its box is moved onto the box's middle,
    // by the distance between the two, and the drawn offset is kept as the nudge for the same
    // reason the horizontal one is: an off-centre composition may be deliberate.
    //
    // Only for a MIDDLE line, unless the author sent it to an edge it was not drawn against:
    // text drawn against the top or the bottom of its box was composed against that edge, and
    // moving it would be inventing a centring the designer did not draw. Sent to the other edge,
    // it stands the drawn gap inside it - half a line where it was drawn centred, because that
    // gap was half the centring rather than a margin.
    // Where the block's centre goes; null where it stays where it was drawn.
    var target = null;
    if (align.v === 'middle') target = band.cy;
    else if (align.v !== placedV) {
      // Half a line where the line was drawn centred - the margin measureSvgRoom keeps on a
      // centred axis - else the gap the designer left on the tighter side.
      var gap = placedV === 'middle'
        ? (svgFitStep[el.id] || (svgFitSizes[el.id] || own.height || 0) * SVG_LINE_HEIGHT) / 2
        : Math.max(0, Math.min(own.y - band.top, band.bottom - (own.y + own.height)));
      target = align.v === 'top' ? band.top + gap + own.height / 2 : band.bottom - gap - own.height / 2;
    }
    if (target != null) {
      align.snapY = keepNudge ? 0 : target - cy;
      align.nudgeY = cy - target;
      // The middle itself is kept as well, because the snap alone only answers for the block as
      // DRAWN: a block the ladder shrank or wrapped is a different height, and svgRecentre needs
      // the line it is putting that block back onto - the drawn centre when the nudge is kept.
      if (align.v === 'middle') align.boxCy = keepNudge ? cy : band.cy;
    }
  }
  svgFitAlign[el.id] = align;
  return align;
}

/** HOW FAR THE PAINTED BLOCK DROPS to sit on its box's middle - zero for anything but a line the
 *  designer centred, and zero while the room could not be measured at all.
 *
 *  Rounded away below half a unit, and that floor is what keeps the promise above it: a snap
 *  nobody can see would still cost every single-line graphic a tspan it did not have before,
 *  because a dy is the only thing that can carry it. A designer who centred a line exactly is
 *  answered by leaving it exactly where they put it. */
function svgSnapY(room) {
  var align = room && room.align;
  var d = align && align.snapY ? align.snapY : 0;
  return Math.abs(d) < 0.5 ? 0 : d;
}

/** SCREEN PX PER USER UNIT in the space this element's own numbers are written in - the LENGTH of
 *  that space's x basis vector, never its x COMPONENT.
 *
 *  The matrix entry "a" is that length times the cosine of the frame's rotation, so the two agree
 *  exactly while nothing above the element is turned and disagree by any amount once something is.
 *  A plate drawn PORTRAIT and laid flat - the owner's own board, and the ordinary way anybody
 *  makes a horizontal band out of a tall box - is a rotation of very nearly 90 degrees, where the
 *  cosine is very nearly nothing. Illustrator writes that rotation on the rect, where "a" never
 *  sees it; Inkscape and Figma write it on the LAYER GROUP, where it lands in the parent's CTM.
 *
 *  Measured on inkscape-layer-rotated-quiz-plate (2026-09-04): 0.0087 against a true 1, so the
 *  fit handed one line 123,760 units of room inside a plate 1,240 units wide. A budget nothing
 *  can overflow means the ladder never wraps and never shrinks, and the words simply run out of
 *  the plate and off the frame - which is what the sweep saw.
 *
 *  Artwork carries a uniform scale plus a rotation, and for that hypot(a, b) is exact rather than
 *  approximate. A degenerate matrix falls back to 1, as it always did. */
function svgFrameScale(el) {
  var ctm = el.parentNode && el.parentNode.getScreenCTM ? el.parentNode.getScreenCTM() : null;
  var s = ctm ? Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b) : 0;
  return s || 1;
}

/** Is this drawn thing INSIDE the panel? The one question that separates the furniture sharing a
 *  line's box from the rest of the artwork, asked with a pixel of tolerance because a plate and
 *  the rule drawn along its edge are flush by intent. Anything hanging out of the panel is
 *  somebody else's furniture and bounds nothing here. */
function svgInsidePanel(r, panel) {
  return r.left >= panel.left - 1 && r.right <= panel.right + 1
    && r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1;
}

/** THE PANEL'S OWN TOP PADDING - the gap the designer left between the panel's top edge and the
 *  first line drawn inside it, MIRRORED onto the bottom to bound a wrapped block.
 *
 *  Sideways a line's room already stops one drawn left-inset short of the far edge; downwards
 *  there was no such rule at all, so a wrapped block could paint right onto the panel's bottom
 *  edge - a graphic with no safe space around its own text (owner walk, 2026-08-29). It is the
 *  same mirror, on the other axis, and it is MEASURED off the rest pose the designer drew rather
 *  than invented as a constant. Mirroring the TOP (rather than reading the drawn bottom gap) is
 *  what keeps a lone line drawn high in a tall panel free to wrap into the space below it: that
 *  space is room, while the space above the first line is the margin. A panel with no bound line
 *  drawn in it keeps its own edge, which is the honest fallback. */
function svgPanelTopPad(panel, nodes) {
  var first = null;
  for (var i = 0; i < nodes.length; i++) {
    var r = nodes[i].getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.left < panel.left - 1 || r.left >= panel.right) continue;
    if (r.top < panel.top - 1 || r.top >= panel.bottom) continue;
    if (first === null || r.top < first) first = r.top;
  }
  return first === null ? 0 : Math.max(0, first - panel.top);
}

/** How far down this line's block may run before it starts changing the design.
 *
 *  Two bounds, and the nearer wins. Anything drawn BELOW the line keeps THE WHOLE GAP THE
 *  DESIGNER DREW between them - a name with a role under it therefore has no room of its own at
 *  all, and a second line has to be bought by growing the panel. The leading between two lines
 *  is the composition, not spare room: filling it was how a wrapped name came to sit hard
 *  against the role beneath it (owner walk, 2026-08-29 - "the panel doesn't have a safe space").
 *  With nothing drawn below, the bound is the panel's own bottom edge less its top padding
 *  mirrored. Only things that overlap the line horizontally count; a crest off to one side does
 *  not.
 *
 *  AND ONLY WHAT IS DRAWN INSIDE THE PANEL COUNTS AT ALL (owner walk, 2026-09-02, on his own quiz
 *  board). This used to search the whole artwork, so on a board of separate plates the ANSWER
 *  plates - which sit below the question and overlap it horizontally, but are nowhere near its
 *  plate - left the question no room to wrap inside a plate drawn tall enough for three lines,
 *  and the ladder went straight to shrinking: "it immediately shrinks, which doesn't make any
 *  sense because we have room in the box". The inside of the box is the room, and nothing outside
 *  the box bounds it. Nothing can paint below the panel either way, because the panel's own
 *  bottom is where this starts. */
function svgFitCeiling(el, panel, pad) {
  var art = document.querySelector('.__PREFIX__-art');
  var box = el.getBoundingClientRect();
  var others = art.querySelectorAll('text, tspan, image, rect, path, polygon, ellipse, circle');
  var top = panel.bottom - (pad || 0);
  for (var i = 0; i < others.length; i++) {
    var o = others[i];
    if (o === el || o.contains(el) || el.contains(o)) continue;
    var r = o.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue;   // that IS the panel
    if (!svgInsidePanel(r, panel)) continue;                          // drawn outside this box
    if (r.right < box.left + 1 || r.left > box.right - 1) continue;   // no horizontal overlap
    if (r.top < box.bottom - 1) continue;                             // not below this line
    // The gap the designer drew between the two is kept WHOLE, so the bound is this line's own
    // drawn bottom rather than the neighbour's top.
    if (box.bottom < top) top = box.bottom;
  }
  return top;
}

/** A CAP: panel FURNITURE rather than a neighbour - a narrow shape drawn hugging the panel's
 *  far edge (a gradient end-cap, an accent bar). Text must stay off it (owner, 2026-08-28:
 *  "text stays between the caps, never on top of them"), so it bounds a line's room exactly
 *  like a neighbour does - but it TRAVELS when the panel grows, so it must not PEN the line:
 *  widening the panel moves the cap and genuinely buys the line room. Only a shape or an image
 *  can be one; a text beside a text is a real neighbour. */
function svgIsEndCap(o, r, panel, axis, dir) {
  var tag = (o.tagName || '').toLowerCase();
  if (tag === 'text' || tag === 'tspan') return false;
  // The cap hugs the edge that MOVES, which is not always the far one: a panel growing upward
  // (a lower third keeping its drawn bottom) carries the furniture on its TOP edge and leaves
  // anything closing its bottom exactly where the designer drew it.
  if (axis === 'y') {
    if (r.height > panel.height * 0.25) return false;
    return dir < 0
      ? r.top <= panel.top + Math.max(2, panel.height * 0.02) && r.bottom < panel.bottom - 1
      : r.bottom >= panel.bottom - Math.max(2, panel.height * 0.02) && r.top > panel.top + 1;
  }
  if (r.width > panel.width * 0.25) return false;
  return dir < 0
    ? r.left <= panel.left + Math.max(2, panel.width * 0.02) && r.right < panel.right - 1
    : r.right >= panel.right - Math.max(2, panel.width * 0.02) && r.left > panel.left + 1;
}

/** The nearest drawn thing BESIDE this line on its own rows - to its right (dir 1), or to its left
 *  (dir -1) for a line anchored at its end, which grows leftwards - what a longer value would run
 *  into (owner, 2026-08-26: "a line's room is bounded by what is drawn next to it"). Two labels
 *  placed apart on ONE baseline is how an exporter writes a strap's place and its time, and the
 *  panel behind them says nothing about where the first one has to stop: HELSINKI is bounded by
 *  19:30, not by the banner, and widening the banner moves neither. The panel's own edge is the
 *  backstop, so a line with nothing beside it is unchanged. The bound is returned WITH what it
 *  is - an end CAP bounds the room without penning the line (see svgIsEndCap).
 *
 *  Only what is drawn INSIDE the panel is a neighbour, for the same reason svgFitCeiling only
 *  looks inside it: a plate standing beside this one is not this line's furniture. The neighbour
 *  itself is returned too, so measureSvgRoom can tell when it is part of another bound line. */
function svgFitNeighbour(el, panel, dir) {
  var art = document.querySelector('.__PREFIX__-art');
  var box = el.getBoundingClientRect();
  var others = art.querySelectorAll('text, tspan, image, rect, path, polygon, ellipse, circle');
  var left = dir < 0;
  var edge = left ? panel.left : panel.right;
  var near = null;
  var cap = false;
  for (var i = 0; i < others.length; i++) {
    var o = others[i];
    if (o === el || o.contains(el) || el.contains(o)) continue;
    var r = o.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue;   // that IS the panel
    if (!svgInsidePanel(r, panel)) continue;                          // drawn outside this box
    if (r.bottom < box.top + 1 || r.top > box.bottom - 1) continue;   // not on this line's rows
    if (left ? r.right > box.left + 1 : r.left < box.right - 1) continue;   // not on that side
    if (left ? r.right > edge : r.left < edge) {
      edge = left ? r.right : r.left;
      near = o;
      cap = svgIsEndCap(o, r, panel, 'x', dir);
    }
  }
  return { edge: edge, cap: cap, near: cap ? null : near };
}

function measureSvgRoom() {
  var nodes = svgFitNodes();
  // THE WHOLE DESIGN AT REST BEFORE ANY OF IT IS MEASURED, never one line at a time. A
  // neighbour still holding a WRAPPED operator value is taller than the designer drew it, and
  // it is exactly what the line above measures its ceiling against - so a per-line swap reads
  // one line of the design against everybody else's screen. Restoring every value afterwards
  // costs one extra loop and makes the room a pure function of the artwork.
  //
  // A node holding exactly what the designer drew is NOT rewritten, only read: writing
  // textContent flattens whatever markup is underneath, and a kerned headline's own per-glyph
  // tspans are the artwork arriving verbatim.
  //
  // A BLOCK is the exception, and it is restored on every pass even when the VALUE has not
  // changed - because its FORM has. The first fit repaints it at whatever line count that pass
  // settled on, so the second pass (the one document.fonts.ready fires) would measure the room
  // against the previous pass's own answer: a question drawn on three lines and first fitted
  // onto two then reported two lines' worth of height as the room the design offers, and each
  // pass shrank it again. Same failure as an un-rested layout (refitSvgText), same fix - and
  // svgShowDrawn puts the drawn LINES back, so nothing is lost by restoring it.
  var live = [];
  var swapped = [];
  for (var a = 0; a < nodes.length; a++) {
    var was = svgFitValue(nodes[a]);
    var drawn = svgFitDrawn[nodes[a].id];
    live.push(was);
    swapped.push(drawn != null && svgFitStale(nodes[a], was));
    nodes[a].style.fontSize = '';
    if (swapped[a]) svgShowDrawn(nodes[a], drawn);
  }
  // What pens each line on its right, each line's own measures, and every end-anchored line with
  // something drawn on its left: the pairs that may share the gap between them (below).
  var penNear = {};
  var measured = {};
  var facing = [];
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    // No box to read, so nothing is recorded and the line stays owed (svgFitLaidOut). Asked
    // here, with the design's own values back in place, for the same reason measureSvgBudgets
    // asks it there: two passes disagreeing about which lines are measurable is a room measured
    // against a width nobody wrote.
    if (!svgFitLaidOut(el)) { svgFitOwed[el.id] = true; continue; }
    // A PLACED line's room is its slot, and a slot has no height - one line, filled and then
    // shrunk. Nothing else about it is measured, because nothing else about it was drawn.
    if (svgFitPlaced(el)) {
      svgFitRoom[el.id] = { width: svgFitSlot(el), height: 0, top: 0, penned: false };
      continue;
    }
    var box = el.getBoundingClientRect();
    // Screen px -> the artwork's own units, read off the element's CTM. This used to be derived
    // from the line's own two widths (advance length / ink box), which is CLOSE and not exact:
    // a glyph's side bearings are in one and not the other, so the ratio carried a per-typeface
    // error of a percent or two straight into the ROOM - and a grown banner then missed the
    // margin it was mirroring by a pixel or so (measured 2026-08-26: 51.4px against a drawn 50).
    var scale = 1 / svgFrameScale(el);
    var panelEl = svgFitContainer(el);
    var panel = panelEl ? panelEl.getBoundingClientRect() : null;
    var align = svgAlignOf(el, panelEl);
    // "height" is the room the BLOCK has, measured from this line's own top - not a line
    // count, because the count depends on the size and the size is what the ladder changes.
    // A 112px board panel holds one 44px line and three 24px ones, and only the height knows
    // that. Zero height (a line drawn hard against whatever is below it) means no wrapping.
    var room = { width: svgFitWidths[el.id], height: 0, top: 0, penned: false, align: align };
    if (panel && box.width > 0) {
      var inset = box.left - panel.left;
      // Where this line has to stop: its neighbour if it has one, else the panel's own right
      // edge less the margin the designer left on the left. A PENNED line (one bounded by a
      // neighbour rather than by the panel) is marked, because widening the panel gives it
      // nothing - so it must not drive the growth either. A bound that is an end CAP does not
      // pen: the cap is the panel's own furniture and travels with its growing edge, so
      // widening genuinely buys the line room - the text just stays off the cap meanwhile.
      var bound = svgFitNeighbour(el, panel, 1);
      var edge = bound.edge;
      room.penned = edge < panel.right - 0.5 && !bound.cap;
      // The gap to keep: half the drawn type beside a neighbour (a readable space between two
      // labels), the design's own left margin mirrored when the panel - or its cap - is the
      // bound.
      var gap = ((svgFitSizes[el.id] || 0) * 0.5) / scale;
      var pad = room.penned ? gap : inset;
      room.width = Math.max(svgFitWidths[el.id], (edge - pad - box.left) * scale);
      if (room.penned) penNear[el.id] = bound.near;
      measured[el.id] = { box: box, scale: scale, gap: gap };
      // A line anchored to the middle or the right of its box fills BOTH ways, so its room is
      // the box's own inside rather than the distance from where it was drawn to the far margin.
      // Not for a PENNED line: something else drawn beside it is the real bound, and the box
      // says nothing about where that is.
      if (align.width > 0 && !room.penned) room.width = Math.max(svgFitWidths[el.id], align.width);
      // An END-anchored line grows LEFTWARDS from its anchor, so what is drawn to its left bounds
      // it as well (#1148): a neighbour pens it, half the drawn type short, and a cap bounds it
      // by the margin the design keeps on the anchored side, without penning - exactly as the
      // two bound a line on its right.
      if (align.h === 'end') {
        var before = svgFitNeighbour(el, panel, -1);
        if (before.edge > panel.left + 0.5) {
          // Where the line is anchored, which an author's declared anchor moves off where it
          // was drawn (svgAlignOf).
          var own = el.getBBox();
          var shift = align.anchor != null ? (align.anchor - (own.x + own.width)) / scale : 0;
          var keep = before.cap ? Math.max(0, panel.right - box.right - shift) : gap;
          var reach = Math.max(svgFitWidths[el.id], (box.right + shift - keep - before.edge) * scale);
          if (!before.cap) facing.push({ near: before.near, right: el, shift: shift, reach: box.right + shift - room.width / scale });
          room.width = Math.min(room.width, reach);
          // Penned on its left ALONE, it still gains from a panel widening rightwards: its anchor
          // travels with the right edge and the neighbour stays (svgGrowDir grows a penned line's
          // panel rightwards), so it may still ask for that growth.
          if (!before.cap) { room.widens = !room.penned; room.penned = true; }
        }
      }
      // A LINE ALWAYS HAS ROOM FOR ITSELF, whatever the margins say - the floor is the block as
      // drawn, never zero. Zero would read as "this line overflows its room by its own height"
      // to everything downstream, and the lowest line of a stack (whose ceiling is the panel's
      // mirrored top padding, drawn tighter than that on most artwork) is exactly that case.
      room.height = Math.max(
        box.height * scale,
        (svgFitCeiling(el, panel, svgPanelTopPad(panel, nodes)) - box.top) * scale
      );
      // A LINE THE AUTHOR SENT TO THE TOP OR THE BOTTOM OF ITS BOX stands the snap away from
      // where it was drawn (svgAlignOf): what a top line gains above is room below, and what a
      // bottom line gives up above is room it no longer has. A middle line's room is measured
      // about its middle further down, and a derived top or bottom line carries no snap at all.
      var stand = align.v !== 'middle' && align.snapY ? align.snapY : 0;
      room.height = Math.max(box.height * scale, room.height - stand);
      // Where the line STANDS, in the artwork's own units - the datum the painted block's height
      // and its overflow (svgBlockExtras) are checked against. getBBox() answers in user units
      // and ignores transforms, so the check holds while an entrance is mid-flight. The datum
      // moves with the block, so the floor (top plus height) stays where the design drew it.
      room.top = (el.getBBox ? el.getBBox().y : 0) + stand;
      // A LINE DRAWN IN THE MIDDLE OF ITS BOX GROWS BOTH WAYS (owner walk, 2026-09-02).
      //
      // Everything above measures DOWNWARD from the drawn line, and bounds that with the panel's
      // own top padding mirrored. That is right for a line composed against the top of its box:
      // the space above it is margin, and mirroring it keeps the block off the bottom edge.
      //
      // It is wrong, and badly, for a line the designer CENTRED in a tall box. There the space
      // above is not margin at all - it is half the centring - so mirroring it hands back a
      // fraction of the box: his question, one line drawn in the middle of a plate 259 units
      // tall, measured 64 units of room and shrank to 62% of the size it was drawn at rather
      // than taking the second line the plate plainly had space for.
      //
      // So where the line is CENTRED, the room is symmetric about the drawn block's own centre,
      // and the margin kept from each edge is TYPOGRAPHIC rather than read off the composition:
      // half of the leading the designer set. A line may come within half a line of its box, and
      // that is the only quantity in the file that is a real answer when the drawn gaps are
      // centring rather than margin. Bottom-aligned text is the same argument upside down and
      // takes the room above it.
      //
      // Measured in the BAND the line owns (svgOwnBand): the box itself where nothing is drawn
      // over or under the line inside it, and the room between those plates where something is -
      // a quiz question over its answer rows is centred in the band above them, not in the board.
      var band = align.band;
      if (band && align.v !== 'top' && !svgFitPlaced(el)) {
        var half = (svgFitStep[el.id] || (svgFitSizes[el.id] || 0) * SVG_LINE_HEIGHT) / 2;
        // A BOTTOM line keeps the gap the designer drew UNDER it on the far side too, where that
        // gap is tighter than half a line. It is the composition's own margin (the mirror
        // svgPanelTopPad keeps for a top line, turned over), and half a line is only the
        // fallback where the drawing says nothing. Measured on the docs lower-third quiz: its
        // question sits 14 units over the answer plates in a band 90 tall, and half a line (24)
        // kept from the rule above left two lines no size above the floor, so a long question
        // went to one squeezed line instead. A centred line's gaps are centring, never margin.
        var drawnBox = el.getBBox ? el.getBBox() : null;
        var drawnGap = drawnBox ? band.bottom - (drawnBox.y + drawnBox.height) : half;
        // Only in a band a PLATE closes: a bottom line over its box's own edge keeps half a line.
        var farPad = align.v === 'bottom' && band.trimmed ? Math.min(half, Math.max(0, drawnGap)) : half;
        var inside = { top: band.top + farPad, bottom: band.bottom - half };
        // Symmetric about where the block will actually STAND, which for a centred one is the
        // box's middle rather than the height it happened to be drawn at (svgSnapY moves it
        // there). Measured about the drawn centre instead, a block drawn a few units off the
        // middle was granted only twice its SHORTER side - room the design has and the ladder
        // could not see, for no reason once the block no longer sits there.
        // A centred block keeps its middle where svgRecentre keeps it, which is the drawn
        // centre when the nudge is kept; a bottom block stands at room.top, wherever that is.
        var mid = align.v === 'middle'
          ? (align.boxCy != null ? align.boxCy : band.cy)
          : room.top + (el.getBBox ? el.getBBox().height : 0) / 2;
        var symmetric = align.v === 'middle'
          ? 2 * Math.min(mid - inside.top, inside.bottom - mid)
          : mid + (el.getBBox ? el.getBBox().height : 0) / 2 - inside.top;
        // Never LESS than the downward answer: this rule may only ever find room the old one
        // could not see, so a design the mirror already served keeps exactly what it had.
        if (symmetric > room.height) room.height = symmetric;
      }
    }
    svgFitRoom[el.id] = room;
  }
  // TWO LINES THAT GROW TOWARDS EACH OTHER SHARE THE GAP between them. A ticker's story fills
  // rightwards and its end-anchored source leftwards: bounded each by where the other was DRAWN,
  // both may fill the same gap, and with two long values they painted over each other,
  // unreported (#1148). The room is measured once, at rest, so it cannot depend on which value is
  // the long one: they meet at the middle of the gap, unless the right one could never reach that
  // far left anyway (a score figure penned on its other side), and then where it stops is the
  // left one's bound. Each keeps its half type short of where they meet.
  for (var f = 0; f < facing.length; f++) {
    var pair = facing[f];
    var left = null;
    for (var n = 0; n < nodes.length; n++) if (nodes[n].contains(pair.near)) { left = nodes[n]; break; }
    var leftRoom = left && svgFitRoom[left.id];
    var l = left && measured[left.id];
    var r = measured[pair.right.id];
    var penned = left && penNear[left.id];
    if (!l || !leftRoom.align || leftRoom.align.h === 'end' || !penned || !pair.right.contains(penned)) continue;
    var middle = (l.box.right + r.box.left + pair.shift) / 2;
    var meet = Math.max(middle, pair.reach);
    leftRoom.width = Math.max(svgFitWidths[left.id], Math.min(leftRoom.width, (meet - l.gap - l.box.left) * l.scale));
    if (pair.reach < middle) {
      var rightRoom = svgFitRoom[pair.right.id];
      rightRoom.width = Math.max(svgFitWidths[pair.right.id], Math.min(rightRoom.width, (r.box.right + pair.shift - r.gap - middle) * r.scale));
    }
  }
  // Put each value back in the shape it was in - the drawn LINES where the value is the drawn
  // one, so a block skipped by the ladder is not left flattened (measureSvgBudgets says why).
  for (var b = 0; b < nodes.length; b++) {
    if (!swapped[b]) continue;
    if (live[b] === svgFitDrawn[nodes[b].id]) svgShowDrawn(nodes[b], live[b]);
    else nodes[b].textContent = live[b];
  }
}

/** Break a value into at most "max" lines no wider than "budget", at the current size. A word
 *  longer than the budget stays whole and simply overflows - the shrink answers that. This greedy
 *  fill decides HOW MANY lines; where they break is evened out once the ladder has settled
 *  (svgEvenOut). */
function svgWrapLines(el, value, budget, max) {
  var words = value.split(/\s+/);
  var lines = [];
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var next = line ? line + ' ' + words[i] : words[i];
    el.textContent = next;
    if (line && el.getComputedTextLength() > budget && lines.length + 1 < max) {
      lines.push(line);
      line = words[i];
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** EVEN OUT A SETTLED BLOCK, once, after the ladder: the size, the line count and the overflow
 *  report are decided by then and the breaks cannot move any of them (svgBalanceLines). Run
 *  once rather than inside every trial of the size search, because it measures every word.
 *
 *  Not for the DRAWN value: evening it out would change the artwork at rest, before anybody typed
 *  anything (the corpus's multi-line quiz board, whose question the designer broke after its
 *  first clause). Compared word for word, since a repainted block reads back single-spaced.
 *  And not where a growth rule widened the panel for this line: the panel grew to hold the
 *  first line, and narrower lines would leave the width it was given standing empty. */
function svgEvenOut(el, value, budget, size, lineHeight, room) {
  var painted = el.querySelectorAll('tspan[data-noacg-line]');
  if (painted.length < 2 || svgFitOver[el.id] || (svgFitExtra[el.id] || 0) > 0) return;
  var words = function (s) { return String(s).split(/\s+/).filter(Boolean).join(' '); };
  if (words(value) === words(svgFitDrawn[el.id])) return;
  var lines = [];
  for (var i = 0; i < painted.length; i++) lines.push(painted[i].textContent);
  // Measuring writes over the block, so it is painted again whatever the answer.
  svgPaintLines(el, svgBalanceLines(el, lines, budget), size, lineHeight, room);
}

/** EVEN LINES, NOT A FULL ONE OVER A STRANDED WORD (issue #778). A greedy fill puts whatever is
 *  left on the last line, so a question just over one line long aired as a full line over "made
 *  of?", which reads as a layout mistake. This keeps the greedy LINE COUNT and moves the breaks
 *  so the lines come out as close to equal as the words allow - what CSS text-wrap: balance does
 *  for HTML, which SVG text cannot use because SVG lays out no lines of its own.
 *
 *  Nothing the ladder decides can move: only lines that already fit are balanced, the count is
 *  the same, and no line gets wider than the greedy fill's widest - so the size, the height and
 *  the overflow report are what the greedy fill would have given. Word widths are measured once,
 *  and the answer is measured again whole: a line that comes out over the budget (kerning across
 *  a space the sum missed) keeps the greedy lines instead. */
function svgBalanceLines(el, lines, budget) {
  var measure = function (s) { el.textContent = s; return el.getComputedTextLength(); };
  var greedyWidest = 0;
  for (var g = 0; g < lines.length; g++) {
    var gw = measure(lines[g]);
    if (gw > budget + 0.5) return lines;        // already over: the shrink owns this, not the breaks
    if (gw > greedyWidest) greedyWidest = gw;
  }
  var words = lines.join(' ').split(' ');
  var widths = [];
  for (var i = 0; i < words.length; i++) widths.push(measure(words[i]));
  var space = measure(words[0] + ' ' + words[1]) - widths[0] - widths[1];
  var n = words.length;
  var k = lines.length;
  var start = [0];
  for (var s = 0; s < n; s++) start.push(start[s] + widths[s]);
  // Words a..b-1 set as one line.
  var span = function (a, b) { return start[b] - start[a] + space * (b - a - 1); };
  // THE MOST EVEN k LINES: the split with the smallest sum of squared widths, which for a fixed
  // total is the one whose lines are closest to equal. No line may be wider than the greedy
  // fill's widest, so nothing the ladder measured can grow. cost[j][i]: the first i words on j
  // lines; from[j][i]: where that split's last line starts.
  var cost = [[0]];
  var from = [[0]];
  for (var j = 1; j <= k; j++) {
    cost.push([]);
    from.push([]);
    for (i = 0; i <= n; i++) {
      cost[j][i] = Infinity;
      // From a one-word last line backwards, only as far as one line can reach.
      for (var a = i - 1; a >= j - 1; a--) {
        var w = span(a, i);
        if (w > greedyWidest + 0.5) break;
        if (!(cost[j - 1][a] < Infinity)) continue;
        if (cost[j - 1][a] + w * w < cost[j][i]) { cost[j][i] = cost[j - 1][a] + w * w; from[j][i] = a; }
      }
    }
  }
  if (!(cost[k][n] < Infinity)) return lines;
  var even = [];
  for (var line = k, end = n; line > 0; line--) {
    var begin = from[line][end];
    var row = words.slice(begin, end).join(' ');
    if (measure(row) > budget + 0.5) return lines;
    even.unshift(row);
    end = begin;
  }
  return even;
}

/** IS THIS NODE A BLOCK OF LINES - one value spread over several tspans?
 *
 *  True for the lines this runtime paints, and true for the DESIGNER'S own stacked lines, which
 *  the import stamps with the same attribute the moment they read as one wrapping field
 *  (assets/svgImport.ts markWrappedBlock). One stamp, so a block measures and reads back the
 *  same way before its first update() and after it.
 *
 *  False for the tspans a kerned headline is written as: those are RUNS of one line, they carry
 *  no stamp, and every measurement of them is the line's own - the whole advance, read straight
 *  off the text node. */
function svgWrappedBlock(el) {
  var kids = el.children;
  return !!(kids.length && kids[0].hasAttribute && kids[0].hasAttribute('data-noacg-line'));
}

/** THE VALUE A BOUND NODE HOLDS RIGHT NOW.
 *
 *  A BLOCK holds it as one tspan per line, and textContent concatenates those with nothing
 *  between them - so re-reading it that way loses one space per break, and the next pass fits a
 *  different value than the one the operator typed ("Ada Lovelace" comes back as "AdaLovelace").
 *  The lines are stamped, so they are read back as the value they were made from. Anything else -
 *  a plain line, or a kerned line's runs - is its own textContent, untouched. */
function svgFitValue(el) {
  if (!svgWrappedBlock(el)) return el.textContent;
  var kids = el.children;
  var parts = [];
  for (var i = 0; i < kids.length; i++) parts.push(kids[i].textContent);
  return parts.join(' ');
}

/** Paint a wrapped value as tspans on the node's own x, stepping down by the line height - in
 *  ems, the designer's where they drew one (svgLineHeight). One line is written as plain text,
 *  so a graphic that neither wraps nor moves emits nothing new. */
function svgPaintLines(el, lines, size, lineHeight, room) {
  var lh = lineHeight > 0 ? lineHeight : SVG_LINE_HEIGHT;
  // A ONE-LINE VALUE STILL NEEDS A TSPAN WHEN IT HAS TO MOVE. The vertical snap rides the first
  // line's dy exactly as the rise does, and plain text has no dy to ride - so a single line that
  // is being centred in its box is painted as one marked tspan instead. Everything else is
  // written as text, which is what keeps a graphic that neither wraps nor snaps byte-identical
  // to the artwork the designer exported.
  if (lines.length < 2 && !svgSnapY(room)) { el.textContent = lines[0] || ''; return; }
  // EVERY LINE RESTARTS AT THE TEXT'S OWN X, and a layer with no x attribute starts at 0 -
  // which is SVG's own default and exactly where Illustrator puts it, since Illustrator writes
  // the position in the element's TRANSFORM instead. Left off, a tspan continues from wherever
  // the previous one ended and the wrap paints a staircase running out of the panel.
  var x = el.getAttribute('x');
  if (x === null) x = '0';
  el.textContent = '';
  for (var i = 0; i < lines.length; i++) {
    // The namespace comes from the node itself rather than a literal URL: an XML namespace is
    // not a network reference, but the export gate scans emitted code for URLs and cannot tell
    // the two apart - and it is right not to try (pillar 3: emitted code reaches no network).
    var t = document.createElementNS(el.namespaceURI, 'tspan');
    t.setAttribute('x', x);
    // THE FIRST LINE CARRIES THE BLOCK'S RISE. A wrapped block is painted downward from the
    // drawn baseline, so a block the designer centred in its box slides down as it gains lines
    // and stops being centred. Lifting the first line by the lines it gained puts the block back
    // where it was composed: half a step per gained line for centred text, a whole step for text
    // sitting on the bottom of its box. It rides the first line dy rather than a transform because the
    // editor's entrance reset clears inline styles, and because it is repainted every pass
    // anyway - nothing accumulates.
    // AND THE FIRST LINE ALSO CARRIES THE SNAP - how far the whole block drops to sit on its
    // box's middle (svgSnapY). The rise keeps a growing block where it was composed; the snap
    // says where "composed" is, and the two are one number by the time they reach the dy.
    var rise = i === 0 ? svgSnapY(room) - svgRise(room, lines.length) * size * lh : size * lh;
    t.setAttribute('dy', rise.toFixed(2));
    // MARKED AS OURS, so svgFitValue can read the value back with its spaces intact.
    t.setAttribute('data-noacg-line', '');
    t.textContent = lines[i];
    el.appendChild(t);
  }
}

/** HOW FAR A BLOCK OF n LINES HAS TO RISE to stay where it was composed. A block grows downward
 *  from its first baseline, so text drawn in the middle of its box slides down half a step per
 *  gained line and text sitting on the bottom slides a whole step. Top-aligned text was already
 *  composed downward and never moves. */
function svgRise(room, lines) {
  var v = room && room.align ? room.align.v : 'top';
  if (lines < 2 || v === 'top') return 0;
  return v === 'middle' ? (lines - 1) / 2 : lines - 1;
}

/** PUT A CENTRED BLOCK BACK ON ITS BOX'S MIDDLE, once, after the ladder has settled.
 *
 *  The snap svgAlignOf measured says where the DRAWN block had to move to sit on the middle, and
 *  a block the ladder has shrunk is not the drawn block: a smaller face has a shorter ink box
 *  above the same baseline, so the block ends up sitting low. On the owner's quiz board a value
 *  that reached the floor settled 1.5 units below the middle every time - small, and his ruling
 *  is that the text stays centred "so it looks like it's aligned with everything else".
 *
 *  MEASURED AFTER THE SIZE SEARCH, never predicted from it. The correction is a pure
 *  translation, so it cannot change the size or the line count it was measured against, and one
 *  pass is therefore exact rather than the start of an iteration.
 *
 *  Only a block that is already painted as marked lines can carry it, because the correction
 *  rides the first line's dy. A line drawn EXACTLY on its box's middle is painted as plain text
 *  (svgPaintLines, so a graphic that neither wraps nor snaps stays byte-identical to the artwork
 *  the designer exported) and keeps its drift when a value shrinks it - under two units on the
 *  boards measured, and the alternative is spending a text node on every single-line graphic in
 *  the catalog. */
function svgRecentre(el, room) {
  var align = room && room.align;
  if (!align || align.v !== 'middle' || align.boxCy == null || !el.getBBox) return;
  var first = el.querySelector('tspan[data-noacg-line]');
  if (!first) return;
  var bb = el.getBBox();
  var off = align.boxCy - (bb.y + bb.height / 2);
  if (Math.abs(off) < 0.5) return;
  first.setAttribute('dy', ((parseFloat(first.getAttribute('dy')) || 0) + off).toFixed(2));
}

/** Write the anchor svgAlignOf worked out, in the artwork's own coordinates so it survives
 *  whatever rotation the layer carries. Idempotent, and silent for a line that is already
 *  anchored where SVG's default puts it. */
function svgApplyAnchor(el, room) {
  var align = room && room.align;
  // A start-anchored line has an anchor only when the author DECLARED it (svgAlignOf), which is
  // the one time a line that fills rightwards has to be moved - onto the box's left inside edge
  // - or told so, over a stated middle the author overrode.
  if (!align || align.anchor == null) return;
  if (el.getAttribute('text-anchor') !== align.h) el.setAttribute('text-anchor', align.h);
  // The anchor is measured at rest, and a panel that grew ONE way has moved its box since - so
  // the anchor travels with it (svgFitShift). Still one measurement rather than an iteration:
  // the growth is applied once per pass, before the fit, so this is arithmetic on a settled
  // number rather than a budget read off wherever the text happens to be standing.
  var x = (align.anchor + (svgFitShift[el.id] || 0)).toFixed(2);
  if (el.getAttribute('x') !== x) el.setAttribute('x', x);
}

/** The widest of a block's lines, which is what has to fit the budget. Anything that is not a
 *  block - a placed line, a plain line, a kerned line's runs - measures as one line, because it
 *  IS one: summing a kerned headline's runs is the correct answer for it and taking the widest
 *  would report a fraction of the line as its width. */
function svgBlockWidth(el) {
  if (svgFitPlaced(el) || !svgWrappedBlock(el)) return svgTextWidth(el);
  var widest = 0;
  for (var i = 0; i < el.children.length; i++) {
    var w = el.children[i].getComputedTextLength();
    if (w > widest) widest = w;
  }
  return widest;
}

// THE LADDER (owner-ruled 2026-08-23): fill the panel, then wrap inside the height the design
// already has, then shrink to the readability floor, then say so. The artwork is never
// reshaped to make copy fit - a panel grows only where the author opted into it (stretchSvgPanel
// below), and past the floor the value is reported as too long rather than clipped.
function fitSvgText() {
  // A LINE THAT HAS FINALLY GOT A BOX IS MEASURED HERE, AT REST, BEFORE ANY PANEL GROWS. Both
  // passes run together because the room is measured against the budgets, and both run BEFORE
  // growSvgLayout for the reason refitSvgText gives: measured while a panel is still grown from
  // the last pass, the room already contains the grant that svgFitExtra is about to add to it,
  // and the same value would be fitted against its budget twice over. One re-measure for the
  // pass, never one per line, and only while a line that is owed one can actually take it -
  // otherwise a board with a state that is off in its default look (which is every quiz board)
  // would pay for a full re-measure on every single update() and settle nothing.
  if (svgFitDue()) svgRestAndMeasure();
  if (typeof growSvgLayout === 'function') growSvgLayout();
  var nodes = svgFitNodes();
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var room = svgFitRoom[el.id];
    // NOTHING IS FITTED AGAINST A MEASUREMENT NOBODY CAN TAKE. Two ways to be in that state and
    // they are the same rule: no room recorded yet, or a room recorded when this line was last
    // on screen and it is not on screen now - a drawn state that has been shown once keeps its
    // room, and running the ladder on it while it is hidden measures every width as zero, so the
    // value would be painted as one whole line at the drawn size and air that way on the next
    // reveal. Owed instead, and the reveal pays it.
    if (!room || !svgFitLaidOut(el)) { svgFitOwed[el.id] = true; continue; }
    svgFitOwed[el.id] = false;
    el.style.fontSize = '';                     // back to the drawn size before measuring
    svgUnsqueeze(el);                           // …and out of any previous pass's squeeze
    svgApplyAnchor(el, room);                   // before any line is painted: a tspan reads it
    var budget = room.width + (svgFitExtra[el.id] || 0);
    var drawnSize = svgFitSizes[el.id];
    var value = svgFitValue(el);
    svgFitOver[el.id] = false;
    if (!(budget > 0) || !(drawnSize > 0)) continue;

    var size = drawnSize;
    var floor = drawnSize * SVG_FIT_FLOOR;
    var hardFloor = drawnSize * SVG_FIT_HARD_FLOOR;
    var lineHeight = svgLineHeight(el);         // the designer's leading, or the house 1.2
    // WHERE A GROWING PANEL PUTS ITS CEILING. Sideways, growth is more BUDGET (above). Downwards
    // it is not a budget at all - it is somewhere to WRAP into, so it raises the ceiling this
    // block may fill and the panel is then grown to whatever the settled block actually needed
    // (growSvgHeights below). The ceiling is the MAXIMUM the rule could ever give, measured at
    // rest, so the wrap never chases a height that is itself still moving.
    var ceiling = room.height + (svgFitExtraH[el.id] || 0);
    // WRAP AND SHRINK TOGETHER. How many lines fit is a function of the SIZE - the quiz board's
    // 112px panel holds one line of 44px type and three of 24px - so every pass re-asks. While
    // more lines are still reachable the size comes down in small steps, because the next step
    // may buy a whole line rather than a few pixels of width; once the block can only ever be
    // one line, the exact ratio settles it in one move.
    // THE LAST THREE RUNGS, IN THE OWNER'S ORDER (2026-09-05, correcting the same day's first
    // attempt). Shrink to the REPORTING floor; condense a little, never past legibility; and only
    // if that still will not fit, shrink further. Two attempts, because the third rung must not
    // be reached by anything the second can hold - condensing to 70% fills the panel the designer
    // drew, where shrinking on past it leaves the growth unspent (measured: 16px of a lower
    // third's grown banner standing empty).
    for (var attempt = 0; attempt < 2; attempt++) {
      var stopAt = attempt === 0 ? floor : hardFloor;
      for (var pass = 0; pass < 8; pass++) {
      el.style.fontSize = size === drawnSize ? '' : size.toFixed(2) + 'px';
      // HOW MANY LINES THE ROOM COULD HOLD - an upper bound the measured check below prunes,
      // never the answer on its own. A block of n lines is (n-1) line STEPS plus one line's own
      // box, not n steps: counting it as n steps loses the last line of every block that fills
      // its room, which is exactly the block a designer drew to fill it. The question drawn on
      // three lines was offered two, so it shrank to fit a room it already fitted.
      var maxLines = Math.max(1, 1 + Math.floor((ceiling - size) / (size * lineHeight)));
      // HEIGHT IS CHECKED, NOT CALCULATED, and a block that does not fit loses a LINE rather
      // than keeping one that prints through the layer below it. A wrapped block starts at the
      // first line's baseline and grows down, so the line count is arithmetic with an ascender
      // and a descender in it; measuring the painted block is exact. Falling back through the
      // counts is what guarantees the last line stays inside the shape it was drawn in - at the
      // floor this settles on one long line, which overruns sideways where somebody can see it
      // rather than over somebody else's artwork.
      var width = 0;
      var tall = false;
      for (var n = maxLines; n >= 1; n--) {
        svgPaintLines(el, n > 1 ? svgWrapLines(el, value, budget, n) : [value], size, lineHeight, room);
        width = svgBlockWidth(el);
        // THE BLOCK'S OWN HEIGHT against the room, rather than where its bottom lands. The two
        // were the same answer while every block grew downward from its drawn line; a block that
        // rises to stay centred (svgRise) has a bottom that no longer moves with its height, and
        // the room it is being checked against is symmetric about the drawn line.
        tall = ceiling > 0 && !!el.getBBox && el.getBBox().height > ceiling + 0.5;
        if (!tall) break;
      }
      if (width <= budget + 0.5 && !tall) break;
      // TWO FLOORS, AND THEY ANSWER DIFFERENT QUESTIONS (owner ruling, 2026-09-05).
      //
      // 55% is where the value is REPORTED as too long - the operator's warning, unchanged, and
      // the moment the design stops being able to hold the copy at a size anyone would have
      // chosen. It used to be where shrinking STOPPED as well, and everything past it was spent
      // condensing the glyphs instead. That is the one thing the owner ruled out: "the text
      // should never grow on top of each other or get so dense that it's impossible to read".
      //
      // The same sentence says what IS acceptable - "if it becomes too small, then that's the
      // user's own fault" - so where condensing cannot hold a value legibly, the type SHRINKS on
      // past this floor instead (the second attempt, below the loop). Scaling leaves every
      // letterform the shape the designer chose; condensing is what turns words into a texture.
      //
      // Both of those keep the OLDER ruling (2026-08-26, nothing paints outside its panel) intact.
      // Measured while getting this wrong twice in one day: condensing without a floor smeared the
      // owner's question into grey texture, and flooring the condensing WITHOUT the second attempt
      // stood a corpus endboard's sign-off 354px outside its plate.
      if (size <= floor + 0.01) svgFitOver[el.id] = true;
      if (size <= stopAt + 0.01) break;
      // COULD A SMALLER SIZE STILL BUY A LINE? Counted the SAME WAY as maxLines above, or the
      // two disagree by one and the ladder takes the width-ratio jump past the very size at
      // which the extra line would have fitted.
      var atFloor = Math.max(1, 1 + Math.floor((ceiling - stopAt) / (stopAt * lineHeight)));
      var canGrowLines = atFloor > maxLines;
      var ratio = width > budget ? budget / width : 0.94;
      size = Math.max(stopAt, canGrowLines || tall ? size * 0.9 : size * ratio);
    }
    // Fitted without needing the last rungs at all - much the commonest case, and untouched.
    if (!svgFitOver[el.id]) break;
    // CONDENSE, bounded by legibility (svgSqueeze). Where that is enough the block fills the room
    // the design gave it, and the ladder is done.
    svgSqueeze(el, budget);
    if (svgBlockWidth(el) <= budget + 0.5) break;
    // Not enough, and the alternative to shrinking further is words standing outside the panel.
    // Take the condensing off and let the second attempt spend size instead.
    if (attempt === 0) svgUnsqueeze(el);
    }
    // The ladder has settled, so where the block actually STANDS can be measured rather than
    // predicted - and a block that is centred in its box goes back onto the middle.
    svgEvenOut(el, value, budget, size, lineHeight, room);
    svgRecentre(el, room);
    el.classList.toggle('__PREFIX__-overflow', !!svgFitOver[el.id]);
  }
  if (typeof growSvgHeights === 'function') growSvgHeights();
}

/**
 * WHICH VALUES ARE TOO LONG FOR THIS GRAPHIC - the field ids whose copy could not be made to
 * fit even at the floor, after filling the panel and using every line the design has room for.
 * The artwork is never reshaped and the copy is never cut to hide it (owner ruling 2026-08-23),
 * so this is how an operator surface can say so before the graphic goes to air.
 */
function noacgTextOverflow() {
  var out = [];
  for (var id in svgFitOver) if (svgFitOver[id]) out.push(id);
  return out;
}

// THE ALIGNMENT IS READ IN THE FACE ON SCREEN, AND READ AGAIN WHEN THE FACE CHANGES. The first
// pass runs before a bundled @font-face has loaded, so it measures the drawn line in a fallback
// of another width: the classroom show intro's centred title, start-anchored and 653 units wide
// in Oswald, measured far wider in Linux's default face, read as 'end' - and svgApplyAnchor then
// wrote that 'end' onto the node, so the title sat right of centre on air for good once Oswald
// arrived. So every re-measure reads the alignment again, off COPIES OF THE LINES AS DRAWN
// (kept from before any pass wrote over them) stood in the lines' places for the reading - a
// line's own node carries the last pass's anchor, and a kerned headline's per-glyph runs are
// flattened by the first fit, so neither could be put back by resetting an attribute or two.
// Every copy stands in at once, so each line is read against the whole design at rest, as the
// first pass reads it; a block is repainted on its drawn lines, as that pass has it. A line with
// no box keeps its answer, since nothing could be read in its place.
function svgRereadAlign() {
  var nodes = svgFitNodes();
  var swaps = [];
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (svgFitPlaced(el)) continue;
    var drawn = svgFitPose[el.id];
    if (!drawn) { svgFitPose[el.id] = el.cloneNode(true); continue; }   // the first pass reads el itself
    if (!svgFitLaidOut(el) || !el.parentNode) continue;
    var copy = drawn.cloneNode(true);
    el.parentNode.replaceChild(copy, el);
    if (svgFitLines[el.id] && svgFitDrawn[el.id] != null) svgShowDrawn(copy, svgFitDrawn[el.id]);
    swaps.push({ el: el, copy: copy });
  }
  for (var j = 0; j < swaps.length; j++) {
    var s = swaps[j];
    if (!svgFitLaidOut(s.copy)) continue;
    delete svgFitAlign[s.el.id];
    svgAlignOf(s.copy, svgFitContainer(s.copy));
  }
  for (var k = 0; k < swaps.length; k++) {
    var line = swaps[k].el;
    swaps[k].copy.parentNode.replaceChild(line, swaps[k].copy);
    // An answer with NO anchor writes nothing (svgApplyAnchor), so the one the last pass wrote
    // would stand: the line takes its drawn x and text-anchor back instead.
    if (svgFitAlign[line.id] && svgFitAlign[line.id].anchor == null) {
      var names = ['x', 'text-anchor'];
      for (var n = 0; n < names.length; n++) {
        var was = svgFitPose[line.id].getAttribute(names[n]);
        if (was == null) line.removeAttribute(names[n]);
        else line.setAttribute(names[n], was);
      }
    }
  }
}

// THE ROOM IS THE DESIGN'S, NEVER THE LAST PASS'S. A re-measure has to start from the artwork
// AT REST: measured while a panel is still grown from the previous pass, the room reads as
// bigger than the designer drew, the block looks like it already fits, and the growth is
// quietly dropped - the same fit answering the same value differently on its second run. That
// is the one thing this may not do (docs/SVG_IMPORT_PLAN.md §6c), so every re-measure rests
// first and the pass is a pure function of the value and the design.
function svgRestAndMeasure() {
  if (typeof svgLayoutRest === 'function') svgLayoutRest();
  measureSvgBudgets();
  svgRereadAlign();                             // after the budgets: it reads the drawn type size
  measureSvgRoom();
}
function refitSvgText() {
  svgRestAndMeasure();
  fitSvgText();
}
