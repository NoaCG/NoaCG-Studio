// Generate the standalone controlpanel.html bundled with an export: a self-contained
// operator page (inline CSS + JS, no dependencies) built from a graphic's fields and its
// state machine's control buttons. It drives the graphic over a BroadcastChannel — open the
// graphic's own .html and this page FROM THE SAME http(s) ORIGIN in the same browser and
// operate it live. BroadcastChannel is origin-scoped: two file:// pages never share one
// (each local file gets a private opaque origin), and a graphic inside OBS/vMix/CasparCG
// runs in a different browser engine entirely — the panel detects the silence (no state
// reply to its hello) and says so instead of pretending to be connected.
//
// Same engine as the in-app Control tab: the SAME field descriptors (model/fieldModel.ts)
// and the SAME event-button merge (blocks/animMachine.ts machineControls). It only renders
// them in vanilla JS instead of React, because the exported page ships with no dependencies
// — keep this renderer in step with components/fields/FieldControl.tsx and ControlPanel.tsx.
//
// The page is show-shaped (Phase 5): it renders ONE CARD PER GRAPHIC, each on its own
// channel with its own state chip, event buttons, fields and lifecycle row. A single
// graphic is just a show of one — renderControlPanelHtml wraps the same page builder.

import type { SpxField } from '../model/types';
import type { FieldDescriptor } from '../model/fieldModel';
import {
  controlChannelName,
  eventButtons,
  eventLegality,
  fieldDescriptors,
  machineStateNames,
  OVERFLOW_FIELD_HINT,
  OVERFLOW_FIELD_MARK,
  OVERFLOW_NOTE_MANY,
  OVERFLOW_NOTE_ONE,
  type ControlButton,
} from './controlModel';
import type { RemoteControlConfig } from './realtimeControl';
import { clockSpecFromHtml, type ClockSpec } from './matchClockWire';
import { MATCH_CLOCK_PAGE_JS } from './matchClockPageJs';
import { isImageAsset } from '../assets/assetUtils';

interface EmittedControl extends FieldDescriptor {
  value: string;
}

interface EmittedImage {
  value: string;
  label: string;
  src: string;
}

/** A saved data entry baked into the panel (model/library.ts ControlEntry, values only). */
interface EmittedEntry {
  id: string;
  label: string;
  values: Record<string, string>;
}

/** Everything the page needs to render and drive ONE graphic. Exported for the production
 *  CONTROLLER generator (productionControllerHtml.ts), which reuses the same emit so the
 *  two generated operator surfaces cannot disagree about a graphic's controls. */
export interface EmittedGraphic {
  name: string;
  channel: string;
  controls: EmittedControl[];
  events: ControlButton[];
  /** event -> group -> the states it fires from (the structural guard, precomputed). */
  legal: Record<string, Record<string, string[]>>;
  /** group -> state id -> the NAME the author gave it, so the chip never prints an id. */
  stateNames: Record<string, Record<string, string>>;
  images: EmittedImage[];
  /** Saved entries the operator switches between (docs/SAVED_CONTENT_MODEL.md §4). */
  entries: EmittedEntry[];
  /** {ref,key,topic} when this graphic has remote control enabled, else null. */
  remote: RemoteControlConfig | null;
  /** The MATCH CLOCK this graphic carries, read off its published markup at generation time
   *  (`matchClockWire.ts` clockSpecFromHtml), or null for the graphics that have none — which
   *  is most of them. The page needs it to stamp the clock's time origin itself; see the
   *  clock block in the emitted script. */
  clock: ClockSpec | null;
}

/** The template shape the panel needs (SpxTemplate satisfies it). */
export interface PanelTemplate {
  name: string;
  fields: SpxField[];
  js: string;
  /** Optional only so a hand-built fixture can omit it: a real template always has markup, and
   *  without it the panel simply finds no clock. */
  html?: string;
  assets: { path: string; data?: unknown }[];
}

/** The descriptors + their current values, serialized into the page's generic renderer. */
function emitControls(fields: SpxField[]): EmittedControl[] {
  const byId = new Map(fields.map((f) => [f.field, f]));
  return fieldDescriptors(fields).map((d) => ({ ...d, value: byId.get(d.key)?.value ?? '' }));
}

export function emitGraphic(
  template: PanelTemplate,
  remote: RemoteControlConfig | null,
  opts?: { inlineAssets?: boolean; entries?: EmittedEntry[] },
): EmittedGraphic {
  const images = template.assets
    .filter((a) => isImageAsset(a.path))
    .map((a) => {
      const dataUrl = typeof a.data === 'string' && a.data.startsWith('data:') ? a.data : null;
      return {
        value: opts?.inlineAssets && dataUrl ? dataUrl : a.path,
        label: a.path,
        // The thumbnail prefers the embedded bytes wherever we have them: it then renders in
        // the panel even when the panel is opened on its own, away from the package.
        src: dataUrl ?? a.path,
      };
    });
  return {
    name: template.name,
    channel: controlChannelName(template.name),
    controls: emitControls(template.fields),
    events: eventButtons(template.js),
    legal: eventLegality(template.js),
    // The state NAMES, baked in: this page ships without React and cannot call
    // `formatMachineState`, but it must not print raw ids either — a student operating an
    // exported package has never seen "sealed". Resolved here, at generation time.
    stateNames: machineStateNames(template.js),
    // The clock, read off the markup rather than declared: the same reader the hosted renderer
    // uses, run once here so the page ships with the answer instead of a DOM parse.
    clock: clockSpecFromHtml(template.html ?? ''),
    images,
    entries: (opts?.entries ?? []).map((e) => ({ id: e.id, label: e.label, values: e.values })),
    remote,
  };
}

/** Safe to drop inside a <script> as a JS string/JSON literal (guards `</script>`). */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Safe to drop into element text or a <title>. The panel's title is the graphic (or show) NAME,
 *  which for an imported community template is author-controlled — and this page carries the
 *  Supabase key and the hosted-control slug, so an unescaped name here is a real injection. Every
 *  other value on the page already rides through jsonForScript into the <script>; the title is the
 *  one thing written as markup, so it is the one thing that needs this. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * `inlineAssets` is the packaging shape, not a preference. Beside a FOLDER package the panel
 * and the graphic both sit next to a real images/ folder, so a relative path is the right
 * value to send — it is also what an SPX operator expects a filelist field to hold. Beside a
 * SINGLE-FILE export there is no folder: a relative path paints nothing in the panel and,
 * worse, blanks a correctly-inlined image on the graphic the moment it is sent. There the
 * data: URL is the only value that resolves at both ends.
 */
export function renderControlPanelHtml(
  template: PanelTemplate,
  remote?: RemoteControlConfig | null,
  opts?: { inlineAssets?: boolean; entries?: EmittedEntry[] },
): string {
  return renderPanelPage(template.name, [emitGraphic(template, remote ?? null, opts)]);
}

/** One graphic in a show's aggregated panel: its template plus the saved entries resolved for
 *  it (out of the library, at export time — export/showExport.ts). */
export interface ShowPanelGraphic {
  template: PanelTemplate;
  entries?: EmittedEntry[];
}

/**
 * A SHOW's aggregated control page: one card per graphic, rundown order, each driving its
 * own channel. In a show package every graphic sits in its own folder, so image fields send
 * folder-relative paths prefixed with the graphic's folder — handled by the caller passing
 * per-graphic asset paths as they are (the operator runs each graphic from its folder). Each
 * graphic carries its own saved entries, so the aggregated page has the same entry switcher
 * per card as the standalone panel does (docs/SAVED_CONTENT_MODEL.md §4).
 */
export function renderShowControlPanelHtml(
  showName: string,
  graphics: ShowPanelGraphic[],
  opts?: { inlineAssets?: boolean },
): string {
  return renderPanelPage(
    showName,
    graphics.map((g) => emitGraphic(g.template, null, { ...opts, entries: g.entries })),
  );
}

function renderPanelPage(title: string, graphics: EmittedGraphic[]): string {
  const anyRemote = graphics.some((g) => g.remote);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — control panel</title>
<style>
  :root { --bg:#10141b; --panel:#171d26; --line:#2a3444; --text:#e8ecf2; --dim:#8b95a5; --accent:#3aa0ff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, sans-serif; }
  header { padding:14px 18px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; position:sticky; top:0; background:var(--bg); z-index:2; }
  header h1 { font-size:16px; margin:0; }
  header .live { margin-left:auto; }
  header .status { font-size:12px; color:var(--dim); }
  main { max-width:680px; margin:0 auto; padding:18px; display:flex; flex-direction:column; gap:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  /* The red on-air tally (broadcast convention): the WHOLE card marks a graphic that is up. */
  .card.on-air { border-color:#ef4444; box-shadow: inset 0 0 0 1px #ef4444; }
  .card > h2 { font-size:14px; margin:0 0 4px; display:flex; align-items:center; gap:10px; }
  .state-chip { font-size:12px; font-weight:400; color:var(--accent); border:1px solid var(--line); border-radius:999px; padding:1px 10px; display:none; }
  .card.on-air .state-chip { color:#fff; background:#ef4444; border-color:#ef4444; font-weight:700; }
  .staged-chip { font-size:12px; font-weight:400; color:#e8b34a; display:none; }
  .row { display:flex; gap:8px; align-items:center; }
  .field { padding:10px 0; border-bottom:1px solid var(--line); }
  .field:last-child { border-bottom:none; }
  .field > label { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:var(--dim); margin-bottom:6px; }
  /* TOO LONG TO FIT: the value cannot be shown whole, so the box says so and the panel repeats
     it once at the top. Red — this is the picture being wrong, not a step left to take. */
  .over-note { margin:6px 0 0; font-size:12px; font-weight:700; color:#e06c75; }
  /* The box mark drops the label row's uppercase tracking on purpose: read in the same
     letterforms as the field NAME it sits beside, a warning looks like part of the name. */
  .field > label .over-mark { color:#e06c75; font-weight:700; font-size:11px; text-transform:none; letter-spacing:0; }
  .field-over input, .field-over textarea, .field-over select { border-color:#e06c75; }
  input, textarea, select, button { font:inherit; color:var(--text); background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:8px 10px; }
  input, textarea, select { width:100%; }
  textarea { min-height:96px; resize:vertical; }
  button { cursor:pointer; background:#243044; }
  button:hover { border-color:var(--accent); }
  .seg { display:inline-flex; }
  .seg button { border-radius:0; border-right-width:0; min-width:36px; }
  .seg button:first-child { border-radius:6px 0 0 6px; }
  .seg button:last-child { border-radius:0 6px 6px 0; border-right-width:1px; }
  .seg button.on { background:var(--accent); border-color:var(--accent); color:#0d1117; font-weight:600; }
  .step { width:44px; flex:0 0 auto; font-weight:700; }
  .num-input { text-align:center; }
  /* The bump size, captioned - uncaptioned it reads as a second value box beside the score. */
  .stepsize { display:flex; align-items:center; gap:5px; flex:0 0 auto; }
  .stepsize span { font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#8b93a1; }
  .stepsize input { width:48px; text-align:center; }
  .events h3 { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--dim); margin:10px 0 6px; font-weight:600; }
  .events .btns { display:flex; flex-wrap:wrap; gap:8px; }
  .events button { min-width:96px; }
  .events button:disabled { opacity:.4; cursor:default; }
  .events button:disabled:hover { border-color:var(--line); }
  .events button.destructive { border-color:#8a4a2a; background:#2d1c12; }
  .events button.destructive:hover { border-color:#e0763a; }
  /* The cue row is pressed live, in a hurry, sometimes on a tablet beside the vision desk:
     every button is a comfortable target (44px, the standard touch minimum). */
  .actions { display:flex; gap:8px; padding-top:12px; }
  .actions button { min-height:44px; padding:10px 16px; }
  .actions .primary { background:var(--accent); color:#06131f; border-color:var(--accent); font-weight:700; flex:1; }
  .live { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--dim); }
  .thumb { width:40px; height:40px; object-fit:contain; background:var(--bg); border:1px solid var(--line); border-radius:6px; }
  .nolisten { display:none; max-width:680px; margin:14px auto 0; padding:12px 16px; border:1px solid #8a4a2a; border-radius:10px; background:#2d1c12; color:#f0c9a8; font-size:13px; line-height:1.5; }
  .nolisten strong { color:#f5d8bd; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <span class="status" id="status">connecting…</span>
  <label class="live"><input type="checkbox" id="live" checked style="width:auto" /> live</label>
</header>
<div class="nolisten" id="nolisten">
  <strong>No graphic is answering.</strong> This panel reaches a graphic over a same-origin
  browser channel: open the graphic's .html and this page from the <strong>same web address</strong>
  (http:// or https://) in the <strong>same browser</strong> — e.g. SPX's template server or any
  local web server. Files opened straight from disk (file://) cannot connect, and a graphic
  loaded inside OBS/vMix/CasparCG runs its own browser — use that host's controls there
  (or an OBS Custom Browser Dock). See GETTING-ON-AIR.md in this package.
</div>
<main id="cards"></main>
<script>
var GRAPHICS = ${jsonForScript(graphics)};  // one card per graphic: fields, event buttons, legality, channel
// Honesty about connectivity: a BroadcastChannel EXISTING proves nothing — over file:// the
// pages sit in private origins and every post lands nowhere. The only proof of a listener is
// a state reply to our hello, so until one arrives the footer says "waiting" and after a
// grace period the banner above explains what is wrong (unless a remote transport is
// configured, whose sends are legitimately blind).
var answeredAny = false;
function noteAnswer() {
  answeredAny = true;
  document.getElementById('nolisten').style.display = 'none';
  paintStatus();
}
// Transport 3: the LOCAL RELAY — the bundled localhost service (see GETTING-ON-AIR.md).
// When this panel is served by it, every command ALSO posts into the relay's ordered log,
// which is the only route into a graphic loaded by OBS/vMix's separate browser engine.
// Send-only and best-effort: the BroadcastChannel replies still carry the state feedback
// for same-origin tabs; a relay-driven OBS source cannot answer, so relay presence also
// stands the no-listener banner down.
var relayOk = false;
if (location.protocol === 'http:' || location.protocol === 'https:') {
  fetch('/relay/ping')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.ok) { relayOk = true; document.getElementById('nolisten').style.display = 'none'; paintStatus(); }
    })
    .catch(function () { /* not relay-hosted */ });
}
function sendRelay(graphic, msg) {
  if (!relayOk) return;
  fetch('/relay/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graphic: graphic, msg: msg }),
  }).catch(function () { /* the BroadcastChannel path still works */ });
}

${MATCH_CLOCK_PAGE_JS}

function el(tag, attrs, kids) {
  var e = document.createElement(tag);
  for (var k in (attrs || {})) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
  (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}

function live() { return document.getElementById('live').checked; }

function clamp(c, n) {
  if (c.min != null) n = Math.max(c.min, n);
  if (c.max != null) n = Math.min(c.max, n);
  return n;
}

// One card per graphic, each with its OWN channel, state and controls — a show drives its
// graphics independently (the bug stays up while the lower third changes hands).
var connected = 0;
GRAPHICS.forEach(function (g) {
  // ── The EVENT LOG (Phase 5): every command this panel sends, timestamped, in
  // localStorage per channel. It is what makes refresh survivable in both directions:
  // a reloaded PANEL seeds its fields and state chip from the log instead of the
  // definition defaults, and a reloaded GRAPHIC announces itself ('graphic-online') and
  // is rebuilt from it — the latest data first, then a snap to the last known state
  // (reset is two operations, and recovery is both). The log keeps a capped history of
  // sent commands (transition history; later undo) plus the merged latest data and the
  // last state the graphic reported.
  var logKey = 'noacg-log-' + g.channel;
  var log = null;
  try { log = JSON.parse(localStorage.getItem(logKey) || 'null'); } catch (e) { /* fresh */ }
  if (!log || log.v !== 1) log = { v: 1, seq: 0, sent: [], data: null, state: null };
  function persistLog() { try { localStorage.setItem(logKey, JSON.stringify(log)); } catch (e) { /* full — the show goes on un-logged */ } }
  function record(msg) {
    log.seq++;
    log.sent.push({ seq: log.seq, at: new Date().toISOString(), msg: msg });
    if (log.sent.length > 200) log.sent.splice(0, log.sent.length - 200);
    if (msg.t === 'update') log.data = Object.assign({}, log.data || {}, msg.data);
    // An accepted event applies its payload through the same field path as an update, so
    // the log's "latest data" must carry it or recovery would rebuild pre-event values.
    // (If the guard dropped the event the merge is slightly ahead of the graphic — the
    // greyed buttons make that the rare case, and recovery stays self-consistent.)
    if (msg.t === 'event' && msg.payload) log.data = Object.assign({}, log.data || {}, msg.payload);
    persistLog();
  }

  // State: current value per field — the definition defaults, overlaid with the log's
  // latest sent data so a reloaded panel resumes where the operator left off.
  var state = {};
  g.controls.forEach(function (c) { state[c.key] = c.value; });
  if (log.data) { for (var k in log.data) { if (state[k] !== undefined) state[k] = log.data[k]; } }

  // Transport 1: BroadcastChannel to a graphic on the SAME machine.
  var ch = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(g.channel) : null;
  if (ch) connected++;

  // Transport 2 (optional): Supabase Realtime — drive a graphic on ANY device. Send-only,
  // via the stateless REST broadcast endpoint (no socket/join needed for a sender). Public
  // channel + publishable key; the TOPIC is a shared secret.
  function sendRemote(msg) {
    if (!g.remote) return;
    fetch('https://' + g.remote.ref + '.supabase.co/realtime/v1/api/broadcast', {
      method: 'POST',
      headers: { apikey: g.remote.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: g.remote.topic, event: 'control', payload: msg, private: false }] })
    }).catch(function () { /* offline / blocked — the local BroadcastChannel path still works */ });
  }

  function post(msg) { if (ch) ch.postMessage(msg); sendRemote(msg); if (msg.t !== 'hello') { sendRelay(g.name, msg); record(msg); } }
  // PREPARED vs PUBLISHED: with Live off, edits stay in this panel (staged — the badge
  // says so) and go on air only on an explicit ⟳ Take / ▶ Play. Nothing airs merely
  // because it was typed.
  var lastSent = {};
  for (var sk in state) lastSent[sk] = state[sk];
  var stagedChip = null;
  function paintStaged() {
    if (!stagedChip) return;
    var dirty = false;
    for (var dk in state) { if (state[dk] !== lastSent[dk]) { dirty = true; break; } }
    stagedChip.style.display = dirty && !live() ? 'inline' : 'none';
  }
  function sendUpdate() {
    // A COPY, not the live state object. log.sent keeps the message it was handed, so sending
    // the state object itself put a live reference into the transition history: a later edit rewrote
    // what the log said had already been sent, and persistLog wrote the rewrite to disk.
    var snapshot = {};
    for (var k in state) snapshot[k] = state[k];
    post({ t: 'update', data: snapshot });
    for (var uk in state) lastSent[uk] = state[uk];
    paintStaged();
  }
  function onChange(field, value) { state[field] = value; if (live()) sendUpdate(); else paintStaged(); }
  // Per-field repainters for a value the PANEL moved itself (an event's adjust) - registered by
  // the controls that can show one; a field with none simply keeps its box.
  var repaint = {};

  // ── The clock verbs. CLOCK is this graphic's clock spec, or null for the graphics that carry
  // no clock — which is most of them. The arithmetic is the shared block above
  // (control/matchClockPageJs.ts); what follows is this page's own copy of the DECISION.
  var CLOCK = g.clock || null;
  var clockInput = null;               // the operator's correction box, so a banked time repaints
  // What one clock verb does to the field, and WHEN relative to the event itself — the panel's
  // copy of matchClockWire.ts's clockRowEffect, and it must stay the same decision.
  //
  // 'before' for a START: the origin has to be in the document by the time startMatchClock runs,
  // or the runtime mints a local one and this panel's log has no origin to replay.
  // 'after' for a hold or a reset: the value banked is what the graphic has just settled on.
  // Reset banks the spec's resetTo — what the RUNTIME returns to — rather than what the element
  // happens to read, or a reboot after a reset would recover a different time from the one aired.
  function clockEffect(event, at) {
    if (!CLOCK) return null;
    var from = state[CLOCK.field] !== undefined ? state[CLOCK.field] : CLOCK.seed;
    if (event === 'clockStart') return { value: clockValueAt(from, CLOCK.countsDown, at) + '@' + at, when: 'before' };
    if (event === 'clockStop') return { value: clockValueAt(from, CLOCK.countsDown, at), when: 'after' };
    if (event === 'clockReset') return { value: CLOCK.resetTo, when: 'after' };
    return null;
  }
  // Bank the clock's new value: into the field state, so every later ⟳ Take re-sends it (a
  // STAMPED value is idempotent — re-sending it a minute later still resolves to the right
  // second, where a raw counter snapshot pulled the clock backwards on every score bump), and
  // onto the wire, which is what puts it in the log this panel replays when a rebooted graphic
  // announces itself. That replay IS the recovery.
  function applyClock(value) {
    var data = {};
    data[CLOCK.field] = value;
    state[CLOCK.field] = value;
    post({ t: 'update', data: data });
    lastSent[CLOCK.field] = value;     // it just aired: not staged
    if (clockInput) clockInput.value = clockPlain(value);
    paintStaged();
  }

  function buildControl(c) {
    // The box carries its key and a hidden TOO LONG mark, painted by paintOverflow() below —
    // rebuilding a control to show a warning would take the focus out of the box being typed
    // into, which is the one place an operator is looking when it appears.
    var overMark = el('b', { class: 'over-mark', title: ${jsonForScript(OVERFLOW_FIELD_HINT)} }, [
      ' \\u26A0 ' + ${jsonForScript(OVERFLOW_FIELD_MARK)},
    ]);
    overMark.style.display = 'none';
    var wrap = el('div', { class: 'field', 'data-key': c.key }, [el('label', {}, [c.label, overMark])]);
    var v = state[c.key];
    if (c.kind === 'number') {
      var input = el('input', { type: 'number', class: 'num-input' });
      input.value = v || '0';
      input.oninput = function () { onChange(c.key, input.value); };
      // An ⚡ event that ADJUSTS this figure (a goal's +1) writes the state and asks the box to
      // repaint - the box is the operator's only view of the number the press just aired.
      repaint[c.key] = function () { input.value = state[c.key] || '0'; };
      var minus = el('button', { class: 'step' }, ['−']);
      var plus = el('button', { class: 'step' }, ['+']);
      // A declared step fixes the increment; a field that declares none (every SPX number
      // field) lets the operator pick the bump size — the same rule the in-app control uses.
      var stepBox = el('input', { type: 'number', title: 'How much + and - change the value' });
      stepBox.value = String(c.step != null ? c.step : 1);
      var stepWrap = el('label', { class: 'stepsize' }, [el('span', {}, ['step']), stepBox]);
      function bump(dir) {
        var s = c.step != null ? c.step : (parseFloat(stepBox.value) || 1);
        input.value = String(clamp(c, (parseFloat(input.value) || 0) + dir * s));
        onChange(c.key, input.value);
      }
      minus.onclick = function () { bump(-1); };
      plus.onclick = function () { bump(1); };
      var kids = [minus, input, plus];
      if (c.step == null) kids.push(stepWrap);
      wrap.appendChild(el('div', { class: 'row' }, kids));
    } else if (c.kind === 'lines') {
      var ta = el('textarea', { placeholder: 'one entry per line' });
      ta.value = v || '';
      ta.oninput = function () { onChange(c.key, ta.value); };
      // An ⚡ event that ADDS a line to this list (a puzzle's Reveal letter) or takes one back
      // writes the state and asks the box to repaint, exactly as a number's adjust does.
      repaint[c.key] = function () { ta.value = state[c.key] || ''; };
      wrap.appendChild(ta);
    } else if (c.kind === 'select') {
      var opts = c.options || [];
      // The in-app control's rule, kept in step: a SHORT constrained choice (a quiz's A/B/C/D)
      // renders as segmented buttons; longer lists keep the dropdown.
      var segmented = opts.length > 0 && opts.length <= 5 && opts.every(function (o) { return String(o.label).length <= 4; });
      if (segmented) {
        var seg = el('div', { class: 'seg' });
        opts.forEach(function (o) {
          var b = el('button', { type: 'button' }, [o.label]);
          if (o.value === v) b.className = 'on';
          b.onclick = function () {
            for (var n = seg.firstChild; n; n = n.nextSibling) n.className = '';
            b.className = 'on';
            onChange(c.key, o.value);
          };
          seg.appendChild(b);
        });
        // A set on a select (a survey's Reveal 3 writing "on") lands in the state; the lit
        // segment has to follow, or the panel shows a row still hidden while air shows it.
        repaint[c.key] = function () {
          for (var n = seg.firstChild, i = 0; n; n = n.nextSibling, i++) n.className = opts[i] && opts[i].value === state[c.key] ? 'on' : '';
        };
        wrap.appendChild(seg);
      } else {
        var sel = el('select');
        opts.forEach(function (o) { var opt = el('option', { value: o.value }, [o.label]); if (o.value === v) opt.selected = true; sel.appendChild(opt); });
        sel.onchange = function () { onChange(c.key, sel.value); };
        repaint[c.key] = function () { sel.value = state[c.key] || ''; };
        wrap.appendChild(sel);
      }
    } else if (c.kind === 'toggle') {
      var cb = el('input', { type: 'checkbox', style: 'width:auto' });
      cb.checked = (v === '1' || v === 'true');
      cb.onchange = function () { onChange(c.key, cb.checked ? '1' : '0'); };
      wrap.appendChild(el('label', { class: 'row' }, [cb, 'enabled']));
    } else if (c.kind === 'color') {
      var col = el('input', { type: 'color', style: 'width:44px;flex:0 0 auto' });
      col.value = /^#/.test(v) ? v : '#000000';
      var txt = el('input', { type: 'text' }); txt.value = v || '';
      col.oninput = function () { txt.value = col.value; onChange(c.key, col.value); };
      txt.oninput = function () { onChange(c.key, txt.value); };
      wrap.appendChild(el('div', { class: 'row' }, [col, txt]));
    } else if (c.kind === 'image') {
      // Each entry is { value, label, src }: the LABEL is always the readable asset path, the
      // SRC is what this panel paints its thumbnail with, and the VALUE is what gets sent to
      // the graphic. They differ beside a single-file export, which has no images/ folder for
      // a relative path to resolve against — there the value and the src are the data: URL.
      var isel = el('select', { class: 'grow' });
      isel.appendChild(el('option', { value: '' }, ['None']));
      var byValue = {};
      g.images.forEach(function (a) {
        byValue[a.value] = a.src;
        var opt = el('option', { value: a.value }, [a.label]);
        if (a.value === v || a.label === v) opt.selected = true;
        isel.appendChild(opt);
      });
      var img = el('img', { class: 'thumb', alt: '' });
      function paint(val) { if (val) img.setAttribute('src', byValue[val] || val); else img.removeAttribute('src'); }
      paint(isel.value || v);
      isel.onchange = function () { paint(isel.value); onChange(c.key, isel.value); };
      wrap.appendChild(el('div', { class: 'row' }, [isel, img]));
    } else {
      var t = el('input', { type: 'text' });
      // THE CLOCK FIELD HOLDS THE WIRE VALUE, which while the clock runs carries its origin
      // stamp ("45:00@1755600000000"). An operator reads and types the time alone, so the box
      // shows the plain half; typing into it replaces the whole value, which is exactly right —
      // a typed time is a correction, and a correction has no origin but the moment it lands.
      var isClock = !!CLOCK && c.key === CLOCK.field;
      t.value = isClock ? clockPlain(v) : (v || '');
      if (isClock) clockInput = t;
      t.oninput = function () { onChange(c.key, t.value); };
      // A set that clears a text box (a puzzle's New puzzle emptying the guess) repaints it
      // too; the clock box is repainted by its own verbs and keeps its plain-time reading.
      if (!isClock) repaint[c.key] = function () { t.value = state[c.key] || ''; };
      wrap.appendChild(t);
    }
    return wrap;
  }

  // ── The card ──
  var chip = el('span', { class: 'state-chip', title: "The graphic's current machine state" });
  stagedChip = el('span', { class: 'staged-chip', title: 'Edits staged in this panel — not on air until you Take' }, ['● staged']);
  var card = el('div', { class: 'card' }, [el('h2', {}, [g.name, chip, stagedChip])]);

  // Machine event buttons, grouped by section. A button carries its payload fields' CURRENT
  // values, applied only if the machine accepts the event (the atomic multi-part change).
  // While we know the graphic's state (it answers on the channel), a button the machine
  // would drop is greyed; before the first answer everything is enabled and the structural
  // guard decides.
  var machineState = log.state; // last known — honest until the live graphic answers hello
  var eventBtns = [];
  // A state without .groups is a template's own hand-written noacgMachineState() - treat it
  // as "not answered yet" everywhere below rather than crashing the whole panel on it.
  function legalNow(ev) {
    if (!machineState || !machineState.groups) return true;
    var perGroup = g.legal[ev];
    if (!perGroup) return false;
    for (var gid in perGroup) {
      if (perGroup[gid].indexOf(machineState.groups[gid]) !== -1) return true;
    }
    return false;
  }
  function paintState() {
    if (machineState && machineState.groups) {
      // The author's NAMES, not the runtime's ids — the same line the app's chip shows.
      // g.stateNames is baked in at export (controlModel.ts machineStateNames); an id it does
      // not know falls back to itself, which is what a hand-edited machine gets.
      var parts = [];
      var many = Object.keys(machineState.groups).length > 1;
      for (var gid in machineState.groups) {
        var sid = machineState.groups[gid];
        var named = (g.stateNames && g.stateNames[gid] && g.stateNames[gid][sid]) || sid;
        parts.push((many ? gid + ': ' : '') + named);
      }
      chip.textContent = parts.join(' · ');
      chip.style.display = 'inline-block';
      // The red tally: 'main' is the lifecycle group on every template (a parallel group's
      // own state — an alert level, a language — says nothing about being on air).
      var onAir;
      if (machineState.groups.main !== undefined) onAir = machineState.groups.main !== 'off';
      else { onAir = false; for (var og in machineState.groups) { if (machineState.groups[og] !== 'off') { onAir = true; break; } } }
      card.className = onAir ? 'card on-air' : 'card';
    }
    eventBtns.forEach(function (entry) { entry.btn.disabled = !legalNow(entry.event); });
  }
  function sendEvent(e) {
    // The SAME rule as controlModel.ts eventPayload (this page ships without it): payload
    // fields ride at their current value; adjust fields (a goal's +1) ride moved by their
    // delta, counted from the current value (anything that does not read as an integer counts
    // from 0); set fields (a score board's "New game") ride at the figure the control declares;
    // add fields (a puzzle's "Reveal letter") ride with the source box's value appended as a line
    // unless it is already one, and remove fields with the last such line taken out - an empty
    // source, or a line the list does not hold, leaves the list off the wire. The new value is
    // written into the panel's own state + box - the press aired it, so it is what the next
    // press counts from and what every later ⟳ Take re-sends.
    var payload = null;
    (e.payload || []).forEach(function (key) {
      if (state[key] !== undefined) { payload = payload || {}; payload[key] = state[key]; }
    });
    // One writer for every road, so a new member of the family cannot arrive and forget to
    // repaint the box - which is the only half an operator can see.
    function stage(key, value) {
      payload = payload || {};
      payload[key] = value;
      state[key] = value;
      if (repaint[key]) repaint[key]();
    }
    var adjust = e.adjust || {};
    for (var ak in adjust) {
      if (!Object.prototype.hasOwnProperty.call(adjust, ak)) continue;
      stage(ak, String((parseInt(String(state[ak] == null ? '' : state[ak]), 10) || 0) + adjust[ak]));
    }
    var setTo = e.set || {};
    for (var sk in setTo) {
      if (!Object.prototype.hasOwnProperty.call(setTo, sk)) continue;
      stage(sk, setTo[sk]);
    }
    // The list's non-empty lines, trimmed - controlModel.ts listLines, restated.
    function listLines(value) {
      var out = [];
      String(value == null ? '' : value).split('\\n').forEach(function (line) { var l = line.trim(); if (l) out.push(l); });
      return out;
    }
    var addTo = e.add || {};
    for (var lk in addTo) {
      if (!Object.prototype.hasOwnProperty.call(addTo, lk)) continue;
      var addLine = String(state[addTo[lk]] == null ? '' : state[addTo[lk]]).trim();
      if (!addLine) continue;
      var added = listLines(state[lk]);
      if (added.indexOf(addLine) === -1) added.push(addLine);
      stage(lk, added.join('\\n'));
    }
    var removeFrom = e.remove || {};
    for (var rk in removeFrom) {
      if (!Object.prototype.hasOwnProperty.call(removeFrom, rk)) continue;
      var removeLine = String(state[removeFrom[rk]] == null ? '' : state[removeFrom[rk]]).trim();
      var kept = listLines(state[rk]);
      var at = removeLine ? kept.lastIndexOf(removeLine) : -1;
      if (at === -1) continue;
      kept.splice(at, 1);
      stage(rk, kept.join('\\n'));
    }
    // A clock verb writes the clock's own value around the event, in the order the wire module
    // fixes: the origin BEFORE a start, the banked time AFTER a hold or a reset.
    var effect = clockEffect(e.event, Date.now());
    if (effect && effect.when === 'before') applyClock(effect.value);
    post(payload ? { t: 'event', event: e.event, payload: payload } : { t: 'event', event: e.event });
    if (effect && effect.when === 'after') applyClock(effect.value);
    // The payload just aired those fields — they are no longer merely staged.
    if (payload) { for (var pk in payload) lastSent[pk] = payload[pk]; paintStaged(); }
  }
  if (g.events.length > 0) {
    var evHost = el('div', { class: 'events' });
    var sections = {};
    g.events.forEach(function (e) {
      // "Actions" is the undeclared-section name on EVERY other surface (controlModel
      // controlSections); this page said "Events", so the same graphic's same buttons sat under
      // two different headings depending on which panel an operator had open.
      var name = e.section || 'Actions';
      if (!sections[name]) {
        var wrap = el('div', {}, [el('h3', {}, [name])]);
        sections[name] = el('div', { class: 'btns' });
        wrap.appendChild(sections[name]);
        evHost.appendChild(wrap);
      }
      var btn = el('button', e.destructive ? { class: 'destructive' } : {}, ['⚡ ' + e.label]);
      btn.onclick = function () { sendEvent(e); };
      sections[name].appendChild(btn);
      eventBtns.push({ event: e.event, btn: btn });
    });
    card.appendChild(evHost);
  }

  // ── Saved ENTRIES: named data rows baked into the panel. Selecting one loads its values
  // into the fields (staged under the same Live rule as typing); ▶ plays the graphic with
  // it — the lower-third rundown flow: pick "Anna · Presenter", play, pick the next, play.
  var fieldHost = el('div', {});
  function rebuildFields() {
    while (fieldHost.firstChild) fieldHost.removeChild(fieldHost.firstChild);
    g.controls.forEach(function (c) { fieldHost.appendChild(buildControl(c)); });
    if (g.controls.length === 0) fieldHost.appendChild(el('p', {}, ['This graphic has no editable fields.']));
    // Loading an entry rebuilds every box, so the marks have to be put back — otherwise a
    // too-long entry loads looking clean until the graphic answers again a second later.
    paintOverflow();
  }
  if (g.entries.length > 0) {
    var entrySel = el('select', {});
    g.entries.forEach(function (en, i) { entrySel.appendChild(el('option', { value: String(i) }, [en.label])); });
    function applyEntry(send) {
      var en = g.entries[parseInt(entrySel.value, 10)];
      if (!en) return;
      for (var ek in en.values) { if (state[ek] !== undefined) state[ek] = en.values[ek]; }
      rebuildFields();
      if (send || live()) sendUpdate(); else paintStaged();
    }
    var entryPlay = el('button', { class: 'primary', title: 'Play the graphic with this entry' }, ['▶ Play entry']);
    entryPlay.onclick = function () { applyEntry(true); post({ t: 'play' }); };
    var entryLoad = el('button', { title: 'Load this entry into the fields (airs on Take unless live)' }, ['Load']);
    entryLoad.onclick = function () { applyEntry(false); };
    entrySel.onchange = function () { applyEntry(false); };
    var entriesWrap = el('div', { class: 'events' }, [el('h3', {}, ['Entries'])]);
    entriesWrap.appendChild(el('div', { class: 'row' }, [entrySel, entryLoad, entryPlay]));
    card.appendChild(entriesWrap);
  }
  // ── TOO LONG TO FIT (owner ruling 2026-08-23, docs/SVG_IMPORT_PLAN.md §3) ──────────────────
  // The graphic reports which values it could not make fit even at its readability floor
  // (noacgTextOverflow(), riding the same answer as the machine state). It is said here, on the
  // panel where the value is typed, because the alternative is finding out on air: the copy is
  // never cut and the artwork is never reshaped to hide it. Same warning, same words, as every
  // other operator surface (docs/CONTROL_PANEL_PARITY.md §4).
  var overflow = [];
  var overNote = el('p', { class: 'over-note' });
  overNote.style.display = 'none';
  card.appendChild(overNote);
  function paintOverflow() {
    var labels = {};
    g.controls.forEach(function (c) { labels[c.key] = c.label; });
    // A field this panel draws no box for cannot be shortened here, so warning about it would
    // only puzzle the operator.
    var shown = [];
    for (var i = 0; i < overflow.length; i++) {
      if (labels[overflow[i]] !== undefined && shown.indexOf(overflow[i]) === -1) shown.push(overflow[i]);
    }
    overNote.textContent = shown.length === 1
      ? '\\u26A0 ' + labels[shown[0]] + ' ' + ${jsonForScript(OVERFLOW_NOTE_ONE)}
      : '\\u26A0 ' + shown.length + ' ' + ${jsonForScript(OVERFLOW_NOTE_MANY)};
    overNote.style.display = shown.length ? 'block' : 'none';
    var boxes = fieldHost.children;
    for (var b = 0; b < boxes.length; b++) {
      var key = boxes[b].getAttribute('data-key');
      var bad = !!key && shown.indexOf(key) !== -1;
      boxes[b].className = bad ? 'field field-over' : 'field';
      var mark = boxes[b].querySelector('.over-mark');
      if (mark) mark.style.display = bad ? 'inline' : 'none';
    }
  }
  rebuildFields();
  card.appendChild(fieldHost);

  var play = el('button', { class: 'primary' }, ['▶ Play']);
  var stop = el('button', {}, ['■ Stop']);
  var upd = el('button', { title: 'Take the staged values on air' }, ['⟳ Take']);
  var next = el('button', {}, ['» Next']);
  play.onclick = function () { sendUpdate(); post({ t: 'play' }); };
  stop.onclick = function () { post({ t: 'stop' }); };
  upd.onclick = sendUpdate;
  next.onclick = function () { post({ t: 'next' }); };
  card.appendChild(el('div', { class: 'actions' }, [play, stop, upd, next]));

  document.getElementById('cards').appendChild(card);
  paintState();
  paintStaged();

  if (ch) ch.onmessage = function (ev) {
    var m = ev.data || {};
    // The graphic answers every message (and 'hello') with its machine state — and, in the same
    // row, the values it could not make fit. A graphic that answers only one of the two still
    // answers: "over" rides alongside "state", never inside it.
    if (m.t === 'state') {
      if (m.over !== undefined) { overflow = m.over || []; paintOverflow(); }
      if (m.state) { machineState = m.state; log.state = m.state; persistLog(); paintState(); }
      if (m.state || m.over !== undefined) noteAnswer();
    }
    // A rebooted graphic (browser-source refresh, crash) announces itself: rebuild it from
    // the log — the latest data first (the data half of reset), then snap to the last known
    // state (the visual half; timers arm, recovery semantics). First boot has nothing
    // logged and replays nothing.
    else if (m.t === 'graphic-online') {
      if (log.data) post({ t: 'update', data: log.data });
      if (log.state && log.state.groups) post({ t: 'snap', snap: log.state.groups });
      // Snap resets the graphic before composing the pose, clearing every inline style —
      // including the data layer's own (an image field with no picture hides itself inline).
      if (log.state && log.data) post({ t: 'update', data: log.data });
    }
  };
  if (ch) post({ t: 'hello' });
});

function paintStatus() {
  var elStatus = document.getElementById('status');
  if (relayOk) { elStatus.textContent = answeredAny ? 'local relay + graphic' : 'local relay connected'; return; }
  if (${jsonForScript(anyRemote)}) { elStatus.textContent = 'remote + local'; return; }
  if (connected === 0) { elStatus.textContent = 'BroadcastChannel unsupported'; return; }
  if (!answeredAny) { elStatus.textContent = 'waiting for a graphic…'; return; }
  elStatus.textContent = GRAPHICS.length === 1 ? 'connected: ' + GRAPHICS[0].channel : 'graphic connected';
}
paintStatus();
// Give a same-origin graphic a moment to answer the hello; silence after that means the
// pairing cannot work from where these files were opened — say so. (Relay hosting stands
// the banner down: its sends are legitimately one-way into OBS/vMix.)
setTimeout(function () {
  if (!answeredAny && !relayOk && !${jsonForScript(anyRemote)}) document.getElementById('nolisten').style.display = 'block';
}, 2500);
</script>
</body>
</html>`;
}
