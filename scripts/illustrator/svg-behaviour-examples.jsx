// The remaining SVG import behaviours, drawn with build-svg-examples.jsx's native helpers.
// These are editable Illustrator artwork, not SVG source disguised as an Illustrator file.
function behaviourCard(title) {
  var d = newDoc(["Text", "Moments", "Board"]);
  rect(d.layers.Board, "Panel", 300, 150, 1320, 780, NAVY);
  rect(d.layers.Board, "Accent", 300, 150, 1320, 8, YELLOW);
  label(d.layers.Board, "static:Heading", title, BOLD, 64, YELLOW, [380, 200, 1160, 90], "left", 0);
  return d;
}
function rowLabel(layer, name, words, x, y, w, colour, align) {
  return label(layer, name, words, MEDIUM, 44, colour || WHITE, [x, y, w, 90], align || "left", 24);
}
function finishBehaviour(d, slug, shown) {
  // Empty layers disappear on SVG export. Remove the empty native counterpart as well.
  if (d.layers.Moments.pageItems.length === 0) {
    d.layers.Moments.remove();
    delete d.layers.Moments;
  }
  finish(d, slug, [{ file: slug, show: shown || [] }], false);
}
function buildStandings() {
  var d = behaviourCard("WEEKEND STANDINGS"), T = d.layers.Text, M = d.layers.Moments;
  var names = ["NORTH", "WEST", "SOUTH"], points = ["12", "9", "7"];
  for (var i = 0; i < names.length; i++) {
    var y = 350 + i * 140, k = i + 1;
    rect(M, "Row " + k, 380, y, 1160, 104, NAVY_2);
    rowLabel(T, "Position " + k, String(k), 400, y, 120, YELLOW, "center");
    rowLabel(T, "Name " + k, names[i], 560, y, 700);
    rowLabel(T, "Points " + k, points[i], 1300, y, 180, YELLOW, "center");
  }
  finishBehaviour(d, "standings");
}
function buildLiveVote() {
  var d = behaviourCard("YOUR CHOICE"), T = d.layers.Text, M = d.layers.Moments, B = d.layers.Board;
  rowLabel(T, "Question", "Where should we go next?", 380, 290, 1160);
  var names = ["Coast", "Forest", "City"];
  for (var i = 0; i < names.length; i++) {
    var y = 415 + i * 120, k = i + 1;
    rowLabel(T, "Option " + k, names[i], 380, y, 350);
    rowLabel(T, "Percent " + k, "0%", 1360, y, 160, YELLOW, "center");
    rect(B, "Track " + k, 770, y + 37, 540, 24, NAVY_2);
    rect(M, "Bar " + k, 770, y + 37, 540, 24, YELLOW);
    (function (yy, kk) { moment(M, "Winner " + kk, function (g) { frame(g, "", 370, yy, 1160, 92, YELLOW, 5); }); })(y, k);
  }
  rowLabel(T, "Total votes", "0 votes", 380, 790, 700);
  finishBehaviour(d, "live-vote");
}
function buildMeter() {
  var d = behaviourCard("COMMUNITY FUND"), T = d.layers.Text, M = d.layers.Moments, B = d.layers.Board;
  label(B, "static:Caption", "A SHARED GOAL", MEDIUM, 36, WHITE, [380, 380, 1160, 80], "center");
  rect(B, "Track", 440, 680, 1040, 34, NAVY_2);
  rect(M, "Progress bar", 440, 680, 1040, 34, YELLOW);
  label(T, "Percent", "0%", BOLD, 160, WHITE, [440, 450, 1040, 180], "center");
  finishBehaviour(d, "meter");
}
function buildAlert() {
  var d = newDoc(["Text", "Board"]), T = d.layers.Text, B = d.layers.Board;
  rect(B, "Panel", 400, 100, 1120, 220, NAVY);
  rect(B, "Accent", 400, 100, 12, 220, YELLOW);
  label(T, "Title", "THANK YOU, ALEX", BOLD, 64, YELLOW, [460, 130, 1000, 90], "left", 0);
  label(T, "Subtitle", "Your support makes this show possible", MEDIUM, 38, WHITE, [460, 225, 1000, 65], "left", 0);
  finish(d, "alert", [{ file: "alert", show: [] }], false);
}
function buildSurvey() {
  var d = behaviourCard("THE AUDIENCE SAID"), T = d.layers.Text, M = d.layers.Moments, B = d.layers.Board;
  rowLabel(T, "Question", "Name something you pack for a trip", 380, 290, 1160);
  var words = ["Clothes", "Toothbrush", "Camera"];
  for (var i = 0; i < words.length; i++) {
    var y = 410 + i * 120, k = i + 1;
    rect(B, "Answer plate " + k, 380, y, 1160, 92, NAVY_2);
    rowLabel(T, "Answer " + k, words[i], 400, y, 850);
    rowLabel(T, "Points " + k, String(40 - i * 10), 1320, y, 180, YELLOW, "center");
  }
  rowLabel(T, "Total", "0", 1250, 790, 250, YELLOW, "center");
  for (var j = 1; j <= 3; j++) (function (k) {
    moment(M, "Strike " + k, function (g) { label(g, "", "X", BOLD, 60, YELLOW, [380 + (k - 1) * 100, 790, 80, 80], "center"); });
  })(j);
  finishBehaviour(d, "survey");
}
function buildSteppedList() {
  var d = behaviourCard("THREE PLACES TO VISIT"), T = d.layers.Text, M = d.layers.Moments, B = d.layers.Board;
  var names = ["The coast", "The forest", "The city"];
  for (var i = 0; i < names.length; i++) {
    var y = 370 + i * 150, k = i + 1;
    rect(B, "Item box " + k, 440, y, 1040, 104, NAVY_2);
    rowLabel(T, "Item " + k, names[i], 480, y, 960);
    (function (yy, kk) { moment(M, "Mark " + kk, function (g) { rect(g, "", 440, yy, 12, 104, YELLOW); }); })(y, k);
  }
  finishBehaviour(d, "stepped-list");
}
function buildLineup() {
  var d = behaviourCard("TONIGHT'S GUESTS"), T = d.layers.Text, M = d.layers.Moments, B = d.layers.Board;
  var names = ["Alex Rivera", "Sam Chen", "Ina Berg"];
  for (var i = 0; i < names.length; i++) {
    var y = 370 + i * 150, k = i + 1;
    rect(B, "Guest box " + k, 440, y, 1040, 104, NAVY_2);
    rowLabel(T, "Guest " + k, names[i], 480, y, 960);
    (function (yy, kk) {
      moment(M, "Now " + kk, function (g) { frame(g, "", 440, yy, 1040, 104, YELLOW, 6); });
      moment(M, "Done " + kk, function (g) { label(g, "", "DONE", BOLD, 32, YELLOW, [1210, yy + 10, 220, 80], "center"); });
    })(y, k);
  }
  finishBehaviour(d, "lineup");
}
function buildPuzzle() {
  var d = behaviourCard("THE WORD ROUND"), T = d.layers.Text, B = d.layers.Board;
  rowLabel(T, "Category", "Behind the scenes", 380, 310, 1160);
  var phrase = "BROADCAST!";
  for (var i = 0; i < 10; i++) {
    var x = 390 + i * 116;
    rect(B, "Letter box " + (i + 1), x, 490, 104, 150, NAVY_2);
    label(T, "Letter " + (i + 1), phrase.charAt(i), BOLD, 72, WHITE, [x, 490, 104, 150], "center");
  }
  finishBehaviour(d, "puzzle");
}
function buildReveal() {
  var d = behaviourCard("THE FINAL FIGURE"), T = d.layers.Text, M = d.layers.Moments;
  label(T, "Price", "1250", BOLD, 180, WHITE, [440, 420, 1040, 240], "center");
  moment(M, "Cover", function (g) {
    rect(g, "", 440, 420, 1040, 240, NAVY_2);
    label(g, "", "?", BOLD, 150, YELLOW, [440, 420, 1040, 240], "center");
  });
  finish(d, "reveal", [{ file: "reveal", show: ["Cover"], hideTexts: ["Price"] }], false);
}
function buildBingo() {
  var d = behaviourCard("BINGO NIGHT"), T = d.layers.Text, M = d.layers.Moments, B = d.layers.Board;
  for (var i = 0; i < 15; i++) {
    var x = 380 + (i % 5) * 160, y = 355 + Math.floor(i / 5) * 150, k = i + 1;
    rect(B, "Number box " + k, x, y, 130, 120, NAVY_2);
    label(T, "Number " + k, String(k), BOLD, 60, WHITE, [x, y, 130, 120], "center");
    (function (xx, yy, kk) {
      moment(M, "Called " + kk, function (g) { frame(g, "", xx, yy, 130, 120, YELLOW, 8); });
      moment(M, "Last " + kk, function (g) { rect(g, "", xx + 8, yy + 104, 114, 8, YELLOW); });
    })(x, y, k);
  }
  label(T, "Last call", "1", BOLD, 160, YELLOW, [1240, 390, 280, 220], "center");
  label(T, "Count", "0", MEDIUM, 48, WHITE, [1240, 640, 280, 100], "center");
  finishBehaviour(d, "bingo");
}
function buildSwitch() {
  var d = behaviourCard("THE EVENING SHOW"), T = d.layers.Text, M = d.layers.Moments;
  label(T, "Title", "COMING UP", BOLD, 110, WHITE, [420, 380, 1080, 160], "center");
  label(T, "Subtitle", "Live music from the studio", MEDIUM, 48, WHITE, [420, 560, 1080, 100], "center");
  moment(M, "show:Sponsor", function (g) {
    rect(g, "", 660, 740, 600, 100, YELLOW);
    label(g, "", "SUPPORTED BY NORTH", BOLD, 38, NAVY, [660, 740, 600, 100], "center");
  });
  finishBehaviour(d, "switch", ["show:Sponsor"]);
}
function buildChoice() {
  var d = behaviourCard("FROM THE STUDIO"), T = d.layers.Text, M = d.layers.Moments;
  label(T, "Title", "THE EVENING SHOW", BOLD, 100, WHITE, [420, 390, 1080, 140], "center");
  label(T, "Subtitle", "News, music and conversation", MEDIUM, 48, WHITE, [420, 560, 1080, 100], "center");
  var names = ["Live", "Replay", "Standby"];
  for (var i = 0; i < names.length; i++) (function (name) {
    moment(M, "choice:Status/" + name, function (g) {
      rect(g, "", 760, 740, 400, 100, YELLOW);
      label(g, "", name.toUpperCase(), BOLD, 44, NAVY, [760, 740, 400, 100], "center");
    });
  })(names[i]);
  finishBehaviour(d, "choice", ["choice:Status/Live"]);
}
