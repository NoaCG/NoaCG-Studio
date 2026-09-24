// BUILDS THE TALK-SHOW EXAMPLE SET IN ILLUSTRATOR, the way a student would draw it by hand.
//
// For each of the five graphics it draws the artwork natively (rectangles and point type in
// Oswald), puts it on the three top-level layers the NoaCG docs teach (Text, Moments, Board),
// saves the .ai, writes the SVG through Illustrator's own "Save a Copy > SVG" exporter with the
// settings docs/SVG_AUTHORING.md section 6 lists, and exports a PNG preview of each state over a
// grey backdrop. So the files in import-ready/ are exactly what a student gets from the .ai files.
//
// Run it from Illustrator (File > Scripts > Other Script...) or through COM on Windows:
//   $ai = New-Object -ComObject Illustrator.Application
//   $ai.DoJavaScriptFile("<path>\build-talk-show-set.jsx")
// It writes into docs/tutorials/talk-show-set/ (illustrator/, import-ready/, preview/) and its
// log to noacg-talk-show-set.log in the system temp folder.
// Needs the Oswald family installed (Google Fonts or Adobe Fonts).
//
// ExtendScript is ES3: no let, no arrow functions, and non-ASCII text is written as \u escapes
// because Illustrator reads a script without a byte-order mark as the system code page.

#target illustrator
var REPO = new File($.fileName).parent.parent.parent;
var OUT = REPO.fsName + "/docs/tutorials/talk-show-set";
var LOG = new File(Folder.temp.fsName + "/noacg-talk-show-set.log");
LOG.encoding = "UTF-8"; LOG.open("w"); LOG.close();
// Appends and closes every line, so a run that stops half way still says where.
function log(s) { LOG.open("a"); LOG.writeln(s); LOG.close(); }
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

// ---- palette and type ----------------------------------------------------------------------
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

// Point type, never area type: one click with the Type tool, which is what a student makes.
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

// ---- documents -------------------------------------------------------------------------------

// ORDER. Inside a layer, the first thing drawn is the bottom row of the Layers panel, the back
// of the paint order and the FIRST element in the SVG. NoaCG lists the operator's fields in SVG
// order, so every build below draws its text in reading order (Question before Answer A) and
// the panel shows it upside down, as the docs' own trees do.
function newDoc(layerNames) {
  var doc = app.documents.add(DocumentColorSpace.RGB, 1920, 1080);
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

// Half-size previews: 960x540 is plenty for an LMS page.
function pngOptions() {
  var o = new ExportOptionsPNG24();
  o.artBoardClipping = true;
  o.transparency = false;
  o.antiAliasing = true;
  o.horizontalScale = 50; o.verticalScale = 50;
  return o;
}

// Save the .ai, write the import-ready SVG, then one preview per state.
// states: [{ file: "quiz-2-selected", show: ["Selected B"] }, ...]; `show` lists the moments
// switched on for that picture. A graphic that is not full frame gets a grey backdrop in its
// previews so its position on screen reads; the backdrop is never saved.
function finish(d, slug, states, fullFrame) {
  var doc = d.doc;
  var ai = new IllustratorSaveOptions();
  ai.pdfCompatible = true;
  ai.embedICCProfile = false;
  ai.compressed = true;
  doc.saveAs(new File(OUT + "/illustrator/" + slug + ".ai"), ai);
  doc.exportFile(new File(OUT + "/import-ready/" + slug + ".svg"), ExportType.SVG, svgOptions());

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
    doc.exportFile(new File(OUT + "/preview/" + st.file + ".png"), ExportType.PNG24, pngOptions());
  }
  doc.close(SaveOptions.DONOTSAVECHANGES);
  log("built " + slug);
}

// ---- 1. Title: full frame, show name and one line under it ----------------------------------
function buildTitle() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  rect(B, "Background", 0, 0, 1920, 1080, NAVY);
  rect(B, "Title box", 260, 380, 1400, 240, YELLOW);
  rect(B, "Subtitle box", 660, 640, 600, 80, NAVY_2);
  label(T, "Show name", "BRAIN BATTLE", BOLD, 150, NAVY, [260, 380, 1400, 240], "center");
  label(T, "Subtitle", "EPISODE 1", MEDIUM, 44, WHITE, [660, 640, 600, 80], "center");
  finish(d, "title", [{ file: "title", show: [] }], true);
}

// ---- 2. Lower third: one graphic for the host and both guests -------------------------------
function buildLowerThird() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  rect(B, "Panel", 140, 820, 820, 150, NAVY);
  rect(B, "Accent", 140, 820, 16, 150, YELLOW);
  label(T, "Name", "Aino Virtanen", BOLD, 60, WHITE, [140, 820, 820, 150], "left", 50, 895);
  label(T, "Role", "HOST", REGULAR, 34, YELLOW, [140, 820, 820, 150], "left", 50, 942);
  finish(d, "lower-third", [{ file: "lower-third", show: [] }], false);
}

// ---- 3. Scoreboard: top of the screen, two contestants --------------------------------------
function buildScoreboard() {
  var d = newDoc(["Text", "Moments", "Board"]);
  var T = d.layers["Text"], M = d.layers["Moments"], B = d.layers["Board"];
  var TB1 = [560, 50, 300, 90], SB1 = [860, 50, 96, 90], SB2 = [964, 50, 96, 90], TB2 = [1060, 50, 300, 90];
  rect(B, "Team box 1", TB1[0], TB1[1], TB1[2], TB1[3], NAVY);
  rect(B, "Team box 2", TB2[0], TB2[1], TB2[2], TB2[3], NAVY);
  rect(B, "Middle", 956, 50, 8, 90, NAVY);
  rect(B, "Score box 1", SB1[0], SB1[1], SB1[2], SB1[3], YELLOW);
  rect(B, "Score box 2", SB2[0], SB2[1], SB2[2], SB2[3], YELLOW);
  moment(M, "Flash 1", function (g) {
    rect(g, "", 560, 148, 300, 44, YELLOW);
    label(g, "", "+1 POINT", BOLD, 26, NAVY, [560, 148, 300, 44], "center");
  });
  moment(M, "Flash 2", function (g) {
    rect(g, "", 1060, 148, 300, 44, YELLOW);
    label(g, "", "+1 POINT", BOLD, 26, NAVY, [1060, 148, 300, 44], "center");
  });
  moment(M, "Full time", function (g) {
    rect(g, "", 860, 148, 200, 44, WHITE);
    label(g, "", "FINAL", BOLD, 26, NAVY, [860, 148, 200, 44], "center");
  });
  label(T, "Team 1", "EMMA", MEDIUM, 40, WHITE, TB1, "center");
  label(T, "Score 1", "3", BOLD, 60, NAVY, SB1, "center");
  label(T, "Team 2", "LEO", MEDIUM, 40, WHITE, TB2, "center");
  label(T, "Score 2", "2", BOLD, 60, NAVY, SB2, "center");
  finish(d, "scoreboard", [
    { file: "scoreboard-1-scores", show: [] },
    { file: "scoreboard-2-point-for-1", show: ["Flash 1"] },
    { file: "scoreboard-3-final", show: ["Full time"] }
  ], false);
}

// ---- 4. Quiz: lower half of the screen, a question and four answers -------------------------
function buildQuiz() {
  var d = newDoc(["Text", "Moments", "Board"]);
  var T = d.layers["Text"], M = d.layers["Moments"], B = d.layers["Board"];
  var Q = [160, 560, 1600, 140];
  // Each answer is a yellow letter box and a navy answer row beside it.
  var at = { A: [160, 720], B: [970, 720], C: [160, 840], D: [970, 840] };
  var keys = ["A", "B", "C", "D"];
  function letterBox(k) { return [at[k][0], at[k][1], 100, 100]; }
  function answerRow(k) { return [at[k][0] + 100, at[k][1], 690, 100]; }
  var i, k, r;

  // Board, back to front: the plates, then the letters on them.
  rect(B, "Question box", Q[0], Q[1], Q[2], Q[3], NAVY);
  for (i = 0; i < 4; i++) { k = keys[i]; r = answerRow(k); rect(B, "Row " + k, r[0], r[1], r[2], r[3], NAVY); }
  for (i = 0; i < 4; i++) { k = keys[i]; r = letterBox(k); rect(B, "Letter box " + k, r[0], r[1], r[2], r[3], YELLOW); }
  for (i = 0; i < 4; i++) { k = keys[i]; label(B, "static:Letter " + k, k, BOLD, 56, NAVY, letterBox(k), "center"); }

  // Moments. Each covers only the answer row, so the letter stays readable.
  moment(M, "Locked in", function (g) {
    rect(g, "", 1540, 516, 220, 44, YELLOW);
    label(g, "", "LOCKED IN", BOLD, 26, NAVY, [1540, 516, 220, 44], "center");
  });
  for (i = 0; i < 4; i++) {
    (function (k) {
      var ar = answerRow(k);
      moment(M, "Selected " + k, function (g) { frame(g, "", ar[0], ar[1], ar[2], ar[3], YELLOW, 8); });
      moment(M, "Correct " + k, function (g) { rect(g, "", ar[0], ar[1], ar[2], ar[3], GREEN); });
      moment(M, "Wrong " + k, function (g) { rect(g, "", ar[0], ar[1], ar[2], ar[3], RED); });
    })(keys[i]);
  }

  var answers = { A: "Turku", B: "Helsinki", C: "Tampere", D: "Oulu" };
  label(T, "Question", "What is the capital of Finland?", MEDIUM, 52, WHITE, Q, "center");
  for (i = 0; i < 4; i++) { k = keys[i]; label(T, "Answer " + k, answers[k], MEDIUM, 44, WHITE, answerRow(k), "left", 36); }

  // The previews follow what NoaCG shows on air: the reveal paints every row and takes the
  // LOCKED IN badge down.
  finish(d, "quiz", [
    { file: "quiz-1-question", show: [] },
    { file: "quiz-2-selected", show: ["Selected B"] },
    { file: "quiz-3-locked-in", show: ["Selected B", "Locked in"] },
    { file: "quiz-4-reveal", show: ["Correct B", "Wrong A", "Wrong C", "Wrong D"] }
  ], false);
}

// ---- 5. End credits: twelve role and name pairs -----------------------------------------------
function buildCredits() {
  var d = newDoc(["Text", "Board"]);
  var T = d.layers["Text"], B = d.layers["Board"];
  var crew = [
    ["DIRECTOR", "Ella Nieminen"], ["PRODUCER", "Oskari Lahtinen"], ["VISION MIXER", "Sara Koskinen"],
    ["CAMERA 1", "Mikael Heikkinen"], ["CAMERA 2", "Venla M\u00e4kinen"], ["CAMERA 3", "Leo H\u00e4m\u00e4l\u00e4inen"],
    ["SOUND", "Aada J\u00e4rvinen"], ["LIGHTING", "Eetu Laine"], ["GRAPHICS", "Iida Korhonen"],
    ["FLOOR MANAGER", "Joonas Salminen"], ["SCRIPT", "Helmi Virtanen"], ["TEACHER", "Anna Lehtonen"]
  ];
  // Boxes 1-6 run down the left column, 7-12 down the right.
  function box(n) {
    var col = n <= 6 ? 0 : 1, row = (n - 1) % 6;
    return [260 + col * 720, 250 + row * 116, 680, 100];
  }
  var n, b;
  rect(B, "Background", 0, 0, 1920, 1080, NAVY);
  for (n = 1; n <= 12; n++) { b = box(n); rect(B, "Credit box " + n, b[0], b[1], b[2], b[3], NAVY_2); }
  label(T, "Heading", "PRODUCTION TEAM", BOLD, 72, YELLOW, [0, 110, 1920, 100], "center");
  for (n = 1; n <= 12; n++) {
    b = box(n);
    label(T, "Role " + n, crew[n - 1][0], REGULAR, 26, YELLOW, b, "left", 30, b[1] + 36);
    label(T, "Person " + n, crew[n - 1][1], MEDIUM, 40, WHITE, b, "left", 30, b[1] + 82);
  }
  finish(d, "end-credits", [{ file: "end-credits", show: [] }], true);
}

try {
  buildTitle();
  buildLowerThird();
  buildScoreboard();
  buildQuiz();
  buildCredits();
  log("ok");
} catch (e) {
  log("ERROR " + e + " line " + e.line);
  while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
}
