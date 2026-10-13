// ── Growing a PATH panel ──────────────────────────────────────────────────────
// A rounded rectangle exported as a <path> grows the way a 9-slice does: every point on the
// GROWING side of the shape's middle moves by the grant, so the two straight runs get longer
// and the drawn corner curves ride along unchanged. "dir" says which side that is - the far
// half for a panel growing right or down, the near half (moved the other way) for one growing
// up. The path data is parsed to absolute segments once per apply, shifted, and re-emitted;
// resting restores the drawn data verbatim.
function svgShiftPathD(d, axis, split, dir, delta) {
  var tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi);
  if (!tokens) return d;
  var ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  var x = 0, y = 0, sx = 0, sy = 0;
  var out = '';
  var i = 0, cmd = '';
  var moves = function (v) { return dir < 0 ? v < split : v > split; };
  var shift = function (vx, vy) {
    // Everything is emitted ABSOLUTE, the shifted coordinate included, so a relative source
    // command cannot smear the shift across the points that follow it.
    if (axis === 'y') return vx.toFixed(3) + ',' + (moves(vy) ? vy + dir * delta : vy).toFixed(3);
    return (moves(vx) ? vx + dir * delta : vx).toFixed(3) + ',' + vy.toFixed(3);
  };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    var upper = cmd.toUpperCase();
    var n = ARITY[upper];
    if (n === undefined) return d;                 // unknown command: hand the data back untouched
    if (upper === 'Z') { out += 'z'; x = sx; y = sy; continue; }
    var nums = [];
    for (var k = 0; k < n; k++) nums.push(parseFloat(tokens[i + k]));
    i += n;
    var rel = cmd !== upper;
    if (upper === 'H') { x = rel ? x + nums[0] : nums[0]; out += 'L' + shift(x, y); }
    else if (upper === 'V') { y = rel ? y + nums[0] : nums[0]; out += 'L' + shift(x, y); }
    else if (upper === 'A') {
      x = rel ? x + nums[5] : nums[5];
      y = rel ? y + nums[6] : nums[6];
      out += 'A' + nums[0] + ',' + nums[1] + ',' + nums[2] + ',' + nums[3] + ',' + nums[4] + ',' + shift(x, y);
    } else {
      var abs = [];
      for (var p = 0; p + 1 < n; p += 2) {
        abs.push(shift(rel ? x + nums[p] : nums[p], rel ? y + nums[p + 1] : nums[p + 1]));
      }
      x = rel ? x + nums[n - 2] : nums[n - 2];
      y = rel ? y + nums[n - 1] : nums[n - 1];
      out += upper + abs.join(',');
      if (upper === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
    }
  }
  return out;
}

// ── Growing a POLYGON panel ───────────────────────────────────────────────────
// Illustrator writes any straight-edged shape that is not a rectangle as a <polygon>: the
// slanted plates of a sports lower third are the common case. It grows exactly like a panel
// path - every corner on the growing side of the middle moves by the grant, so a slanted edge
// keeps its slant - with the points list rewritten instead of path data.
function svgShiftPoints(points, axis, split, dir, delta) {
  var nums = String(points).match(/-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length % 2) return points;
  var out = [];
  for (var i = 0; i + 1 < nums.length; i += 2) {
    var x = parseFloat(nums[i]);
    var y = parseFloat(nums[i + 1]);
    var v = axis === 'y' ? y : x;
    var moved = (dir < 0 ? v < split : v > split) ? v + dir * delta : v;
    out.push(axis === 'y' ? x + ',' + moved.toFixed(3) : moved.toFixed(3) + ',' + y);
  }
  return out.join(' ');
}
