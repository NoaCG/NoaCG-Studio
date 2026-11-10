// The audience category's design-owned runtime: the attribution fallbacks every form needs,
// and the queue's moving highlight.
//
// Emitted OUTSIDE the marked ANIMATION region — same doctrine as the countdown clock engine —
// so the timeline can never rewrite it, and it survives export untouched.

import { motionSpeedJs } from '../shared/base';
import QR_ENCODER_JS from '../shared/qrEncoder.min.js?raw';

/**
 * The attribution runtime, in every audience graphic.
 *
 * `audienceAttribution()` derives two presentation classes from the DATA: whether a name was
 * given, and whether a source was. It runs from `update()` and once on load, and it is
 * DELIBERATELY NOT a state: nothing about it is a transition, nobody presses a button for it,
 * and putting it in the machine would be the "data changes state" mistake the model forbids
 * (docs/STATE_MACHINE_SCHEMA.md §3). It is the graphic reading its own fields.
 */
export const AUDIENCE_ATTRIBUTION_JS = `// ---- Attribution (who sent this, and from where) ----

// audienceText(id): a field element's text, trimmed. Missing element reads as empty, which is
// what a form that has no such field wants anyway.
function audienceText(id) {
  var el = document.getElementById(id);
  return el ? el.textContent.trim() : '';
}

// audienceAttribution(): mark the root when the name or the source is missing, so the CSS can
// swap in the anonymous stand-in and drop the dangling separator.
//
// Anonymous questions are ordinary, not exceptional — every webinar and church submission tool
// offers them — so a card that renders "— · YOUTUBE" is a bug the viewer can see. The fallback
// WORD lives in the markup (.audience-anon), never here: hard-coding "Anonymous" in JavaScript
// would put one English string beyond the reach of every user who does not broadcast in English.
function audienceAttribution() {
  var root = document.querySelector('.audience');
  if (!root) return;
  // A form without an asker field simply has no #f2/#f3 to read; the classes then stay off and
  // the CSS has nothing to hide, which is exactly right.
  var asker = document.querySelector('.audience-asker');
  var source = document.querySelector('.audience-source');
  if (asker) root.classList.toggle('audience-no-asker', asker.textContent.trim() === '');
  if (source) root.classList.toggle('audience-no-source', source.textContent.trim() === '');
}`;

/**
 * The queue runtime — a moderator's list of pending questions with ONE of them live.
 *
 * WHICH question is live is an INDEX, held as ordinary runtime data. That is the model's
 * "parameterize with data, not states" rule at its most literal: a twelve-question queue has
 * exactly the same two states as a two-question one, and adding a question adds no states at
 * all. The machine's job is only to say that moving the highlight is a legal thing to do, and
 * in which direction.
 */
export const AUDIENCE_QUEUE_JS = `// ---- The question queue (the animation data references these by name) ----
${motionSpeedJs}

// escapeHtml(): the rows are built with innerHTML — operator text is escaped first so a
// question like "Is 5 < 6?" reads as text and never runs as markup.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Which entry is live. Runtime DATA, never a state — see this file's header.
var audienceQueueIndex = 0;

// audienceQueueEntries(): the hidden source, parsed into { question, asker, source } records —
// one per line, written "Question | Name | Source". The name and the source are OPTIONAL, so a
// moderator can paste a bare list of questions and fill the rest in later; a missing part is an
// empty string, which the row markup renders as nothing rather than as the word "undefined".
function audienceQueueEntries() {
  var el = document.getElementById('f0');
  if (!el) return [];
  var out = [];
  var lines = el.textContent.split('\\n');
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i].trim();
    if (raw === '') continue;
    var parts = raw.split('|');
    out.push({
      question: (parts[0] || '').trim(),
      asker: (parts[1] || '').trim(),
      source: (parts[2] || '').trim()
    });
  }
  return out;
}

// audienceQueueRebuild(): re-render every row, then put the highlight back where it was. The
// index is CLAMPED to the new list, so deleting the entries below the live one cannot leave the
// highlight pointing past the end.
function audienceQueueRebuild() {
  var host = document.getElementById('audience-queue');
  if (!host) return;
  var entries = audienceQueueEntries();
  var html = '';
  for (var i = 0; i < entries.length; i++) html += renderQueueRow(entries[i], i);
  host.innerHTML = html;
  if (audienceQueueIndex > entries.length - 1) audienceQueueIndex = Math.max(0, entries.length - 1);
  audienceQueuePaint();
}

// audienceQueuePaint(): mark the live row and write the position readout ("3 of 12"). The
// readout's two numbers are set separately from the word between them, which stays in the
// markup — same reason as the anonymous fallback: it has to be translatable.
function audienceQueuePaint() {
  var rows = document.querySelectorAll('.audience-queue-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.toggle('audience-queue-live', i === audienceQueueIndex);
    // Everything ABOVE the live one is done; everything below is still waiting. Two classes
    // rather than one, because a moderator reads the list as a running order.
    rows[i].classList.toggle('audience-queue-done', i < audienceQueueIndex);
  }
  var at = document.querySelector('.audience-queue-at');
  var of = document.querySelector('.audience-queue-of');
  if (at) at.textContent = rows.length ? String(audienceQueueIndex + 1) : '0';
  if (of) of.textContent = String(rows.length);
}

// audienceQueueStep(by): move the highlight, clamped to the list. Clamped rather than wrapping:
// running off the end of a moderated queue and silently landing back at question one is how a
// host ends up re-reading a question they already answered.
function audienceQueueStep(by) {
  var rows = document.querySelectorAll('.audience-queue-row');
  if (!rows.length) return;
  var next = Math.max(0, Math.min(rows.length - 1, audienceQueueIndex + by));
  if (next === audienceQueueIndex) return;       // already at the end — nothing to animate
  audienceQueueIndex = next;
  audienceQueuePaint();
  var live = rows[audienceQueueIndex];
  if (live) gsap.fromTo(live, { x: -8 }, { x: 0, duration: 0.3 / motionSpeed(), ease: 'power3.out' });
}

// audienceQueueNext() / audienceQueuePrev(): the two calls the machine's states fire.
function audienceQueueNext() { audienceQueueStep(1); }
function audienceQueuePrev() { audienceQueueStep(-1); }`;

/**
 * The Join card runtime: the QR encoder the card carries, and the painter that draws the Join link
 * as a code (interaction spec, Graphics ▸ Join card). Data, never state: a new link redraws the
 * code on update() and changes nothing else (docs/STATE_MACHINE_SCHEMA.md §3).
 */
export const AUDIENCE_JOIN_JS = `// ---- The Join card's QR code ----

// The encoder: qrcode-generator (MIT), carried in this file so the card needs no network.
${QR_ENCODER_JS.trim()}

// audienceJoinPaint(): draw the Join link (the hidden #f2) as a QR code, error correction M, and
// show the link without its scheme. An empty link draws nothing.
function audienceJoinPaint() {
  var source = document.getElementById('f2');
  var host = document.getElementById('audience-join-qr');
  var shown = document.querySelector('.audience-join-url');
  var root = document.querySelector('.audience');
  if (!source || !host) return;
  var link = (source.textContent || '').trim();
  var drawn = host.querySelector('path');
  if (drawn) drawn.setAttribute('d', '');
  if (shown) shown.textContent = link.replace(/^https?:\\/\\//i, '').replace(/\\/$/, '');
  if (root) root.classList.toggle('audience-join-empty', !link);
  if (!link || typeof qrcode !== 'function') return;
  var qr;
  try {
    qr = qrcode(0, 'M');
    qr.addData(link, 'Byte');
    qr.make();
  } catch (e) {
    if (root) root.classList.add('audience-join-empty');   // too long for any code: draw nothing
    return;
  }
  var quiet = 4, n = qr.getModuleCount(), size = n + quiet * 2, d = '';
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    }
  }
  // The <svg> is in the markup and only its numbers change here, so this script names no URL
  // (an svg made in script needs its namespace, and the publish gate refuses any absolute URL).
  var svg = host.querySelector('svg');
  var modules = host.querySelector('path');
  if (!svg || !modules) return;
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  modules.setAttribute('d', d);
}`;

/**
 * The word cloud runtime: draws the Words field (one `word | count` line each, most first) as words
 * sized by their count, the biggest in the middle (interaction spec, AC-14). Data, never state: new
 * words redraw on update() and change nothing else (docs/STATE_MACHINE_SCHEMA.md §3).
 *
 * It keeps every word inside the cloud's box without going under the type floor: a word too wide
 * for the box is drawn smaller, down to the smallest size, and when the words do not all fit the
 * least-sent go first. What the cloud shows is always the most-sent words.
 */
export const AUDIENCE_WORDS_JS = `// ---- The word cloud ----

// The smallest and the largest word, in px at 1080p (scaled like every other size here).
var AUDIENCE_WORD_MIN = 34;
var AUDIENCE_WORD_MAX = 92;
var AUDIENCE_WORDS_MOST = 30;

// audienceWordsRead(): the words in the hidden #f2, most first, at most AUDIENCE_WORDS_MOST.
function audienceWordsRead() {
  var source = document.getElementById('f2');
  var lines = source ? (source.textContent || '').split('\\n') : [];
  var words = [];
  for (var i = 0; i < lines.length && words.length < AUDIENCE_WORDS_MOST; i++) {
    var line = lines[i];
    var at = line.lastIndexOf('|');
    var word = (at >= 0 ? line.slice(0, at) : line).trim();
    var count = at >= 0 ? parseFloat(line.slice(at + 1)) : 1;
    if (!word) continue;
    words.push({ word: word, count: count > 0 ? count : 1, order: words.length });
  }
  words.sort(function (a, b) { return b.count - a.count || a.order - b.order; });
  return words;
}

// audienceWordsPaint(): draw the words, the most-sent biggest and in the middle of the cloud.
function audienceWordsPaint() {
  var host = document.querySelector('.audience-words');
  var root = document.querySelector('.audience');
  if (!host) return;
  var words = audienceWordsRead();
  host.textContent = '';
  if (root) root.classList.toggle('audience-words-empty', words.length === 0);
  if (!words.length) return;
  var most = words[0].count, least = words[words.length - 1].count;
  // Middle out: the first word in the centre, the next either side of it, and so on.
  var placed = [];
  for (var i = 0; i < words.length; i++) {
    if (i % 2) placed.push(words[i]); else placed.unshift(words[i]);
  }
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  var typeScale = parseFloat(getComputedStyle(host).getPropertyValue('--type-scale')) || 1;
  var smallest = AUDIENCE_WORD_MIN * scale * typeScale;
  var spans = [];
  for (var j = 0; j < placed.length; j++) {
    var w = placed[j];
    var share = most === least ? 1 : Math.sqrt((w.count - least) / (most - least));
    var span = document.createElement('span');
    span.className = 'audience-word' + (w === words[0] ? ' audience-word-top' : share < 0.34 ? ' audience-word-quiet' : '');
    span.textContent = w.word;
    span.style.fontSize = (smallest + (AUDIENCE_WORD_MAX - AUDIENCE_WORD_MIN) * scale * typeScale * share) + 'px';
    host.appendChild(span);
    spans.push({ el: span, count: w.count, rank: words.indexOf(w) });
  }
  // A word wider than the box is drawn smaller, never below the smallest size.
  var room = host.clientWidth;
  for (var k = 0; k < spans.length; k++) {
    var wide = spans[k].el.offsetWidth;
    if (room > 0 && wide > room) {
      var size = parseFloat(spans[k].el.style.fontSize);
      spans[k].el.style.fontSize = Math.max(smallest, size * (room / wide) * 0.98) + 'px';
    }
  }
  // When they do not all fit, the least-sent go first.
  spans.sort(function (a, b) { return b.rank - a.rank; });
  while (spans.length > 1 && host.scrollHeight > host.clientHeight + 1) {
    var gone = spans.shift();
    host.removeChild(gone.el);
  }
}

// A face that arrives after the first paint changes every word's width: draw again once it has.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () { audienceWordsPaint(); });
}`;
