// BUILDS THE NOACG SVG EXAMPLES IN ILLUSTRATOR, the way a person would draw them by hand.
//
// Seven graphics in one simple look (navy plates, yellow accents, Oswald): a title, a lower third,
// a quiz, a scoreboard, a countdown, a ticker and end credits. For each one it draws the artwork
// natively (rectangles and point type), puts it on the layers the NoaCG layer-naming system
// teaches (Text, Moments, Board; src/templates/behaviours/layer-names.json), saves the .ai into
// Illustrator/, writes the SVG into SVG/ with exportFile(ExportType.SVG), which is the same SVG
// export plug-in that "File > Save a Copy > SVG" runs, with the settings the NoaCG docs teach, and
// writes a PNG of every state into Previews/. The package is the one /downloads#svg-examples
// offers (src/downloads/links.ts).
//
// A graphic with no moments gets NO Moments layer: Illustrator's SVG save drops an empty layer
// anyway (measured 2026-09-24, the retired owner rulings), so the .ai and the SVG say the same thing.
//
// Run it from Illustrator (File > Scripts > Other Script...) or through COM on Windows:
//   $ai = New-Object -ComObject Illustrator.Application
//   $ai.DoJavaScriptFile("<repo>\scripts\illustrator\build-svg-examples.jsx")
// It writes into docs/tutorials/svg-examples/ and its log to noacg-svg-examples.log in the system
// temp folder. Then `node scripts/illustrator/pack-svg-examples.mjs` writes the README PDF and the
// zip. Needs the Oswald family installed (free from Google Fonts).
//
// ExtendScript is ES3: no let, no arrow functions, and non-ASCII text is written as \u escapes
// because Illustrator reads a script without a byte-order mark as the system code page.

#target illustrator
var REPO = new File($.fileName).parent.parent.parent;
var OUT = REPO.fsName + "/docs/tutorials/svg-examples";
var LOG = new File(Folder.temp.fsName + "/noacg-svg-examples.log");
LOG.encoding = "UTF-8"; LOG.open("w"); LOG.close();
// Appends and closes every line, so a run that stops half way still says where.
function log(s) { LOG.open("a"); LOG.writeln(s); LOG.close(); }
// No dialogs while the script draws, and the user's own setting back when it is done.
var INTERACTION = app.userInteractionLevel;
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
// The documents this script opened, so a failure closes these and never the user's own work.
var OURS = [];

var DIRS = ["Illustrator", "SVG", "Previews"];
for (var di = 0; di < DIRS.length; di++) new Folder(OUT + "/" + DIRS[di]).create();

// ---- the one look: palette and type -------------------------------------------------------------
var NAVY = "#1D2B53", NAVY_2 = "#2E4272", YELLOW = "#FFCC00", WHITE = "#FFFFFF",
    GREEN = "#2DA44E", RED = "#D7263D", PREVIEW_BG = "#7B8494";
var BOLD = "Oswald-Bold", MEDIUM = "Oswald-Medium", REGULAR = "Oswald-Regular";

function rgb(h) {
  var c = new RGBColor();
  c.red = parseInt(h.substr(1, 2), 16); c.green = parseInt(h.substr(3, 2), 16); c.blue = parseInt(h.substr(5, 2), 16);
  return c;
}

// The artboard runs from (0,0) at the top left to (1920,-1080), so a design y is -y here.
function rect(parent, name, x, y, w, h, fill) {
  var r = parent.pathItems.rectangle(-y, x, w, h);
  if (name) r.name = name;
  r.filled = true; r.fillColor = rgb(fill); r.stroked = false;
  return r;
}

// A rectangle drawn as an outline only, with the stroke kept inside x,y,w,h.
function frame(parent, name, x, y, w, h, colour, weight) {
  var r = parent.pathItems.rectangle(-(y + weight / 2), x + weight / 2, w - weight, h - weight);
  if (name) r.name = name;
  r.filled = false; r.stroked = true; r.strokeColor = rgb(colour); r.strokeWidth = weight;
  return r;
}

// Cap height of a font at a size, measured from Illustrator's own outline of "H".
var capCache = {};
function capHeight(font, size) {
  var key = font + "@" + size;
  if (capCache[key]) return capCache[key];
  var t = app.activeDocument.textFrames.pointText([0, 0]);
  t.contents = "H";
  t.textRange.characterAttributes.textFont = app.textFonts.getByName(font);
  t.textRange.characterAttributes.size = size;
  var g = t.createOutline();
  var b = g.geometricBounds; // left, top, right, bottom
  g.remove();
  capCache[key] = b[1] - b[3];
  return capCache[key];
}

// Point type, never area type: one click with the Type tool, which is what a person makes.
// box = [x, y, w, h] the text sits in; align "left" (inset from the box's left edge) or
// "center". The capitals are centred vertically in the box unless a baseline is given.
function label(parent, name, contents, font, size, colour, box, align, inset, baseline) {
  var base = baseline !== undefined ? baseline : box[1] + (box[3] + capHeight(font, size)) / 2;
  var x = align === "center" ? box[0] + box[2] / 2 : box[0] + inset;
  var t = parent.textFrames.pointText([x, -base]);
  t.contents = contents;
  if (name) t.name = name;
  var a = t.textRange.characterAttributes;
  a.textFont = app.textFonts.getByName(font);
  a.size = size;
  a.fillColor = rgb(colour);
  // A centred point text grows both ways from its anchor.
  if (align === "center") t.textRange.paragraphAttributes.justification = Justification.CENTER;
  return t;
}

// A moment: a named group, hidden, holding whatever draw(group) puts in it.
function moment(layer, name, draw) {
  var g = layer.groupItems.add();
  g.name = name;
  draw(g);
  g.hidden = true;
  return g;
}

// ---- documents -----------------------------------------------------------------------------------

// ORDER. Inside a layer, the first thing drawn is the bottom row of the Layers panel, the back
// of the paint order and the FIRST element in the SVG. NoaCG lists the operator's fields in SVG
// order, so every build below draws its text in reading order (Question before Answer A) and
// the panel shows it upside down, as the docs' own trees do.
function newDoc(layerNames) {
  var doc = app.documents.add(DocumentColorSpace.RGB, 1920, 1080);
  OURS.push(doc);
  doc.artboards[0].artboardRect = [0, 0, 1920, -1080];
  doc.artboards[0].name = "Frame 1920x1080";
  var layers = {};
  // documents.add makes "Layer 1": rename it to the BOTTOM layer, then add the others above it.
  var bottom = layerNames[layerNames.length - 1];
  doc.layers[0].name = bottom;
  layers[bottom] = doc.layers[0];
  for (var i = layerNames.length - 2; i >= 0; i--) {
    var l = doc.layers.add();
    l.name = layerNames[i];
    layers[layerNames[i]] = l;
  }
  return { doc: doc, layers: layers };
}

// File > Save a Copy > SVG, with the SVG Options the NoaCG docs teach.
function svgOptions() {
  var o = new ExportOptionsSVG();
  o.DTD = SVGDTDVersion.SVG1_1;
  o.fontType = SVGFontType.SVGFONT;
  o.fontSubsetting = SVGFontSubsetting.None;
  o.embedRasterImages = true;
  o.cssProperties = SVGCSSPropertyLocation.STYLEELEMENTS;
  o.preserveEditability = false;
  o.coordinatePrecision = 2;
  o.documentEncoding = SVGDocumentEncoding.UTF8;
  o.saveMultipleArtboards = false;
  return o;
}

// Half-size previews: 960x540 is plenty for a learning-platform page.
function pngOptions() {
  var o = new ExportOptionsPNG24();
  o.artBoardClipping = true;
  o.transparency = false;
  o.antiAliasing = true;
  o.horizontalScale = 50; o.verticalScale = 50;
  return o;
}

// Save the .ai, write the SVG, then one preview per state.
// states: [{ file: "quiz-2-selected", show: ["Selected B"] }, ...]; `show` lists the moments
// switched on for that picture. A graphic that is not full frame gets a grey backdrop in its
// previews so its place on screen reads; the backdrop is never saved.
function finish(d, slug, states, fullFrame) {
  var doc = d.doc;
  var ai = new IllustratorSaveOptions();
  ai.pdfCompatible = true;
  ai.embedICCProfile = false;
  ai.compressed = true;
  doc.saveAs(new File(OUT + "/Illustrator/" + slug + ".ai"), ai);
  doc.exportFile(new File(OUT + "/SVG/" + slug + ".svg"), ExportType.SVG, svgOptions());

  var bg = doc.layers.add();
  bg.name = "Preview backdrop";
  bg.zOrder(ZOrderMethod.SENDTOBACK);
  if (!fullFrame) rect(bg, "", 0, 0, 1920, 1080, PREVIEW_BG);
  var m = d.layers["Moments"];
  for (var s = 0; s < states.length; s++) {
    var st = states[s];
    if (m) for (var i = 0; i < m.groupItems.length; i++) {
      var g = m.groupItems[i];
      var on = false;
      for (var k = 0; k < st.show.length; k++) if (st.show[k] === g.name) on = true;
      g.hidden = !on;
    }
    doc.exportFile(new File(OUT + "/Previews/" + st.file + ".png"), ExportType.PNG24, pngOptions());
  }
  doc.close(SaveOptions.DONOTSAVECHANGES);
  log("built " + slug);
}

// ---- 1. Title: full frame, the show's name and one line under it --------------------------------
function buildTitle() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  var TB = [260, 400, 1400, 220], SB = [660, 640, 600, 80];
  rect(B, "Panel", 0, 0, 1920, 1080, NAVY);
  rect(B, "Title box", TB[0], TB[1], TB[2], TB[3], YELLOW);
  rect(B, "Subtitle box", SB[0], SB[1], SB[2], SB[3], NAVY_2);
  label(T, "Title", "THE WEEKLY SHOW", BOLD, 140, NAVY, TB, "center");
  label(T, "Subtitle", "EPISODE 1", MEDIUM, 44, WHITE, SB, "center");
  finish(d, "title", [{ file: "title", show: [] }], true);
}

// ---- 2. Lower third: ONE name tag, retyped for every person on screen ---------------------------
function buildLowerThird() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  var P = [140, 820, 820, 150];
  rect(B, "Panel", P[0], P[1], P[2], P[3], NAVY);
  rect(B, "Accent", P[0], P[1], 16, P[3], YELLOW);
  label(T, "Name", "Maija Meik\u00e4l\u00e4inen", BOLD, 60, WHITE, P, "left", 50, 895);
  label(T, "Role", "HOST", REGULAR, 34, YELLOW, P, "left", 50, 942);
  finish(d, "lower-third", [{ file: "lower-third", show: [] }], false);
}

// ---- 3. Quiz: a lower third, low in the frame so the contestants stay visible -------------------
function buildQuiz() {
  var d = newDoc(["Text", "Moments", "Board"]);
  var T = d.layers["Text"], M = d.layers["Moments"], B = d.layers["Board"];
  var Q = [160, 700, 1600, 100];
  // Each answer is a yellow letter box and a navy answer box beside it, two to a row.
  var at = { A: [160, 810], B: [970, 810], C: [160, 910], D: [970, 910] };
  var keys = ["A", "B", "C", "D"];
  function letterBox(k) { return [at[k][0], at[k][1], 90, 90]; }
  function answerBox(k) { return [at[k][0] + 90, at[k][1], 700, 90]; }
  var i, k, r;

  // Board, back to front: the plates, then the letters on them.
  rect(B, "Question box", Q[0], Q[1], Q[2], Q[3], NAVY);
  for (i = 0; i < 4; i++) { k = keys[i]; r = answerBox(k); rect(B, "Answer box " + k, r[0], r[1], r[2], r[3], NAVY); }
  for (i = 0; i < 4; i++) { k = keys[i]; r = letterBox(k); rect(B, "Letter box " + k, r[0], r[1], r[2], r[3], YELLOW); }
  for (i = 0; i < 4; i++) { k = keys[i]; label(B, "static:Letter " + k, k, BOLD, 50, NAVY, letterBox(k), "center"); }

  // Moments. Each covers only the answer box, so the letter stays readable.
  moment(M, "Locked in", function (g) {
    rect(g, "", 1540, 656, 220, 44, YELLOW);
    label(g, "", "LOCKED IN", BOLD, 26, NAVY, [1540, 656, 220, 44], "center");
  });
  for (i = 0; i < 4; i++) {
    (function (k) {
      var ab = answerBox(k);
      moment(M, "Selected " + k, function (g) { frame(g, "", ab[0], ab[1], ab[2], ab[3], YELLOW, 8); });
      moment(M, "Correct " + k, function (g) { rect(g, "", ab[0], ab[1], ab[2], ab[3], GREEN); });
      moment(M, "Wrong " + k, function (g) { rect(g, "", ab[0], ab[1], ab[2], ab[3], RED); });
    })(keys[i]);
  }

  var answers = { A: "Turku", B: "Helsinki", C: "Tampere", D: "Oulu" };
  label(T, "Question", "What is the capital of Finland?", MEDIUM, 48, WHITE, Q, "center");
  for (i = 0; i < 4; i++) { k = keys[i]; label(T, "Answer " + k, answers[k], MEDIUM, 40, WHITE, answerBox(k), "left", 30); }

  // The previews follow what NoaCG shows on air: the reveal paints every answer and takes the
  // LOCKED IN tab down.
  finish(d, "quiz", [
    { file: "quiz-1-question", show: [] },
    { file: "quiz-2-selected", show: ["Selected B"] },
    { file: "quiz-3-locked-in", show: ["Selected B", "Locked in"] },
    { file: "quiz-4-reveal", show: ["Correct B", "Wrong A", "Wrong C", "Wrong D"] }
  ], false);
}

// ---- 4. Scoreboard: top of the frame, two teams ---------------------------------------------------
function buildScoreboard() {
  var d = newDoc(["Text", "Moments", "Board"]);
  var T = d.layers["Text"], M = d.layers["Moments"], B = d.layers["Board"];
  var TB1 = [560, 50, 300, 90], SB1 = [860, 50, 96, 90], SB2 = [964, 50, 96, 90], TB2 = [1060, 50, 300, 90];
  rect(B, "Team box 1", TB1[0], TB1[1], TB1[2], TB1[3], NAVY);
  rect(B, "Team box 2", TB2[0], TB2[1], TB2[2], TB2[3], NAVY);
  rect(B, "Middle", 956, 50, 8, 90, NAVY);
  rect(B, "Score box 1", SB1[0], SB1[1], SB1[2], SB1[3], YELLOW);
  rect(B, "Score box 2", SB2[0], SB2[1], SB2[2], SB2[3], YELLOW);
  // NoaCG flashes a team's tab for a moment when that team gets +1.
  moment(M, "Flash 1", function (g) {
    rect(g, "", 560, 148, 300, 44, YELLOW);
    label(g, "", "+1 POINT", BOLD, 26, NAVY, [560, 148, 300, 44], "center");
  });
  moment(M, "Flash 2", function (g) {
    rect(g, "", 1060, 148, 300, 44, YELLOW);
    label(g, "", "+1 POINT", BOLD, 26, NAVY, [1060, 148, 300, 44], "center");
  });
  label(T, "Team 1", "HOME", MEDIUM, 40, WHITE, TB1, "center");
  label(T, "Score 1", "0", BOLD, 60, NAVY, SB1, "center");
  label(T, "Team 2", "AWAY", MEDIUM, 40, WHITE, TB2, "center");
  label(T, "Score 2", "0", BOLD, 60, NAVY, SB2, "center");
  finish(d, "scoreboard", [
    { file: "scoreboard-1-scores", show: [] },
    { file: "scoreboard-2-point-for-1", show: ["Flash 1"] },
    { file: "scoreboard-3-point-for-2", show: ["Flash 2"] }
  ], false);
}

// ---- 5. Countdown: a card in the middle of the frame, before the show starts ---------------------
// The clock is the one text drawn as a time (05:00), whatever it is called; its sample is the
// length of the count. The Timer bar is drawn at full length and left visible: NoaCG drains it as
// the clock runs. Warning, Paused and Time up are hidden groups NoaCG shows at those moments.
function buildCountdown() {
  var d = newDoc(["Text", "Moments", "Board"]);
  var T = d.layers["Text"], M = d.layers["Moments"], B = d.layers["Board"];
  var P = [560, 300, 800, 480], BAR = [660, 680, 600, 12];
  rect(B, "Panel", P[0], P[1], P[2], P[3], NAVY);
  rect(B, "Accent", P[0], P[1], P[2], 8, YELLOW);
  rect(B, "Track", BAR[0], BAR[1], BAR[2], BAR[3], NAVY_2);
  label(B, "static:Status", "STARTING IN", MEDIUM, 30, WHITE, P, "center", 0, 470);

  rect(M, "Timer bar", BAR[0], BAR[1], BAR[2], BAR[3], YELLOW);
  moment(M, "Warning", function (g) { frame(g, "", P[0], P[1], P[2], P[3], RED, 8); });
  moment(M, "Paused", function (g) {
    rect(g, "", 860, 712, 200, 44, NAVY_2);
    label(g, "", "PAUSED", BOLD, 26, WHITE, [860, 712, 200, 44], "center");
  });
  moment(M, "Time up", function (g) {
    rect(g, "", 800, 712, 320, 44, YELLOW);
    label(g, "", "STARTING NOW", BOLD, 26, NAVY, [800, 712, 320, 44], "center");
  });

  label(T, "Title", "THE WEEKLY SHOW", BOLD, 56, YELLOW, P, "center", 0, 410);
  label(T, "Clock", "05:00", BOLD, 150, WHITE, P, "center", 0, 640);
  finish(d, "countdown", [
    { file: "countdown-1-running", show: [] },
    { file: "countdown-2-warning", show: ["Warning"] },
    { file: "countdown-3-paused", show: ["Paused"] },
    { file: "countdown-4-time-up", show: ["Time up"] }
  ], false);
}

// ---- 6. Ticker: a strip along the bottom edge, a kicker and one line of news ----------------------
function buildTicker() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  var P = [0, 960, 1920, 80], KB = [0, 960, 220, 80];
  rect(B, "Panel", P[0], P[1], P[2], P[3], NAVY);
  rect(B, "Kicker box", KB[0], KB[1], KB[2], KB[3], YELLOW);
  label(T, "Kicker", "NEWS", BOLD, 40, NAVY, KB, "center");
  label(T, "Story", "Doors open at 18:00 in the main hall", MEDIUM, 38, WHITE, [220, 960, 1700, 80], "left", 40);
  finish(d, "ticker", [{ file: "ticker", show: [] }], false);
}

// ---- 7. End credits: a Heading and ONE Credits text that rolls -----------------------------------

// The default list: the people in the studio first, then the crew, the director and the producer
// last, then the production's name and the year. A line ending in ":" is a title and the names go
// under it. The names are made up. README.md shows the same list, so what the reader sees there
// is what the graphic rolls.
var CREDITS = [
  ["Host:", "Maija Meik\u00e4l\u00e4inen"],
  ["Guests:", "Ville Virtanen", "Aino Aalto"],
  ["Camera:", "Eero Eskola", "Liisa Lahti", "Pekka Peltola"],
  ["Floor manager:", "Olli Ojala"],
  ["Vision mixer:", "Sanna Salo"],
  ["Production assistant:", "Riikka Rinne"],
  ["Sound:", "Timo Toivonen"],
  ["Lighting:", "Kaisa Koski"],
  ["Vision engineer:", "Heikki Honkanen"],
  ["Graphics:", "Jussi J\u00e4rvi"],
  ["Set design:", "Noora Nurmi"],
  ["Make-up:", "Mira M\u00e4ki"],
  ["Director:", "Anna Anttila"],
  ["Producer:", "Mika M\u00e4kel\u00e4"],
  ["The Weekly Show 2026"]
];

function buildEndCredits() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  var BOX = [560, 200, 800, 800];
  var LEADING = 50, GAP = 16, CLOSING_GAP = 50;
  rect(B, "Panel", 0, 0, 1920, 1080, NAVY);
  // The roll runs inside this plate, so the list appears at its bottom edge and leaves at its top.
  rect(B, "Credits box", BOX[0], BOX[1], BOX[2], BOX[3], NAVY_2);
  label(T, "Heading", "CREDITS", BOLD, 64, YELLOW, [0, 90, 1920, 90], "center");

  // ONE point text, one paragraph per line. The text itself carries the name look, and every
  // title line gets the title look, so the first title and the name under it show NoaCG both.
  var lines = [], isTitle = [], i, j;
  for (i = 0; i < CREDITS.length; i++) {
    for (j = 0; j < CREDITS[i].length; j++) {
      lines.push(CREDITS[i][j]);
      isTitle.push(j === 0 && CREDITS[i].length > 1);
    }
  }
  var t = T.textFrames.pointText([BOX[0] + 60, -(BOX[1] + 70)]);
  t.contents = lines.join("\r");
  t.name = "Credits";
  var a = t.textRange.characterAttributes;
  a.textFont = app.textFonts.getByName(REGULAR);
  a.size = 40;
  a.fillColor = rgb(WHITE);
  a.autoLeading = false;
  a.leading = LEADING;
  for (i = 0; i < t.paragraphs.length; i++) {
    var p = t.paragraphs[i];
    // A little air before every title but the first, and a clear gap before the production's
    // name: NoaCG reads a gap of more than one and a half lines as a blank line in the list,
    // so the name and year arrive as a section of their own rather than under the producer.
    if (isTitle[i] && i > 0) p.paragraphAttributes.spaceBefore = GAP;
    if (i === lines.length - 1) p.paragraphAttributes.spaceBefore = CLOSING_GAP;
    if (isTitle[i]) {
      p.characterAttributes.textFont = app.textFonts.getByName(BOLD);
      p.characterAttributes.size = 30;
      p.characterAttributes.fillColor = rgb(YELLOW);
    }
  }
  finish(d, "end-credits", [{ file: "end-credits", show: [] }], true);
}

try {
  buildTitle();
  buildLowerThird();
  buildQuiz();
  buildScoreboard();
  buildCountdown();
  buildTicker();
  buildEndCredits();
  log("ok");
} catch (e) {
  log("ERROR " + e + " line " + e.line);
  // A document finish() already closed throws on close; the others are still open.
  for (var o = 0; o < OURS.length; o++) {
    try { OURS[o].close(SaveOptions.DONOTSAVECHANGES); } catch (ignored) {}
  }
}
app.userInteractionLevel = INTERACTION;
