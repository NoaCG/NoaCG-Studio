// The PRODUCTION CONTROLLER — the operator surface an exported local-control package opens
// (the launcher's landing page), driven through the local relay's ordered log
// (export/local-relay/, protocol v1).
//
// It renders THE PLAYOUT DASHBOARD: docs/PLAYOUT_DASHBOARD.md is the binding design, shared
// with the in-app production page and the hosted control page. The three used to be three
// different products - this one had the monitors and a blue accent, the hosted one had no
// monitors at all - and a student who learned one could not operate another. A change here
// that is not in that doc is a divergence.
//
// PREVIEW/PROGRAM: "→ Preview" takes the selected cue onto the PREVIEW stream - only this
// page's PVW monitor follows it, so the operator checks the graphic without airing anything.
// "⟳ TAKE" sends the same cue to the PROGRAM stream: the OBS/vMix sources (loaded with
// ?stream=program) and the PGM monitor follow that one. Same rows, one `stream` field apart.
//
// Self-contained vanilla JS (no dependencies - it ships in a zip), same voice as
// controlPanelHtml.ts, whose emitGraphic it reuses so the two generated surfaces cannot
// disagree about a graphic's controls.

import type { EmittedGraphic } from './controlPanelHtml';
import {
  OVERFLOW_FIELD_HINT,
  OVERFLOW_FIELD_MARK,
  OVERFLOW_NOTE_MANY,
  OVERFLOW_NOTE_ONE,
} from './controlModel';
import { MATCH_CLOCK_PAGE_JS } from './matchClockPageJs';

/** One cue as the controller ships it: prepared data for one graphic of the pool. */
export interface EmittedCue {
  id: string;
  label: string;
  graphic: string;
  values: Record<string, string>;
  note: string;
}

export interface ControllerPayload {
  show: string;
  /** Each with the PLAYOUT LAYER its production assigned (docs/PLAYOUT_DASHBOARD.md §5). */
  graphics: (EmittedGraphic & { file: string; layer: number })[];
  cues: EmittedCue[];
  /** The design canvas the monitors letterbox into (the first graphic's, typically 1920×1080). */
  width: number;
  height: number;
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderProductionControllerHtml(payload: ControllerPayload): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(payload.show)} — production controller</title>
<style>
  /* The dashboard's own tokens (docs/PLAYOUT_DASHBOARD.md). One accent: amber is preview and
     brand, RED means on air and nothing else may claim it. This page used to carry a blue
     accent and the system font, which made the downloaded package look like a different
     product from the app that generated it. */
  :root {
    --bg:#0b0c0f; --panel:#14161c; --panel-2:#1a1d25; --line:#272b35;
    --text:#e9ecf1; --dim:#8a91a0; --amber:#f6a623; --air:#ef4444; --ok:#4ade80;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  /* THE PAGE IS THE ONLY SCROLLER (docs/PLAYOUT_DASHBOARD.md 2). This page used to be locked
     to the viewport, so a graphic with many fields grew a scrollbar INSIDE the editor - the
     pane an operator changes scores and names in mid-show. Every block is content-sized; a
     long form makes a long page, and the monitors and the rundown stay put by being sticky. */
  html { height: 100%; }
  body { margin:0; min-height:100%; background:var(--bg); color:var(--text);
    font:14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; }
  /* NO SCROLLBAR CHROME, anywhere (§3). A horizontal scrollbar here is a layout bug. */
  .cues, .editor, .feed { scrollbar-width:none; }
  .cues::-webkit-scrollbar, .editor::-webkit-scrollbar, .feed::-webkit-scrollbar { width:0; height:0; }

  /* Sticky: the page scrolls under it, and All out has to stay one reach away. */
  header { display:flex; align-items:center; gap:10px; height:50px; padding:0 14px;
    border-bottom:1px solid var(--line); background:var(--panel);
    position:sticky; top:0; z-index:20; }
  header h1 { font-size:14px; margin:0; font-weight:600; white-space:nowrap; }
  header h1 span { color:var(--dim); font-weight:400; }
  .mode { font-size:11px; font-weight:700; letter-spacing:.1em; padding:3px 10px; border-radius:99px;
    color:var(--dim); border:1px solid var(--line); white-space:nowrap; }
  .mode.on { color:var(--ok); background:rgba(74,222,128,.1); border-color:rgba(74,222,128,.4); }
  .clock { font-size:12px; color:var(--dim); font-variant-numeric:tabular-nums; }
  header .spacer { flex:1; }
  header a { color:var(--dim); font-size:12px; text-decoration:none; border-bottom:1px solid var(--line); }
  header a:hover { color:var(--text); }
  /* All out sits apart from the verbs: it is the panic control, and a hand reaching for TAKE
     must never land on it. */
  .allout { font:inherit; font-size:13px; font-weight:600; color:var(--air); background:transparent;
    border:1px solid rgba(239,68,68,.55); border-radius:7px; padding:7px 13px; cursor:pointer; white-space:nowrap; }
  .allout:disabled { color:var(--dim); border-color:var(--line); cursor:default; }

  main { display:grid; grid-template-columns: minmax(0,1fr) 380px; min-height: calc(100vh - 50px); }
  /* The divider is drawn by the STAGE column, which runs the whole page - the rail is sticky
     and only ever a viewport tall, so a border on it would stop dead partway down. */
  .stage { min-width:0; display:flex; flex-direction:column; gap:10px; padding:12px 14px;
    border-right:1px solid var(--line); }
  /* THE ONE EXCEPTION to content-sizing: a forty-cue rundown has nowhere else to go, so the
     rail is a viewport-tall sticky column with its list scrolling inside. */
  .rail { display:flex; flex-direction:column; position:sticky; top:50px; align-self:start;
    height:calc(100vh - 50px); }

  /* THE STAGE HEAD: the monitors AND the verbs that act on them, as one STICKY block - what
     must never leave the screen is sticky, not small, and the verb bar carries TAKE and Out.
     It used to scroll away under the monitors, which the owner called out on 2026-08-21
     ("a bit scary that you scroll the monitors on top of the take buttons").
     At and above the minimum supported window (1366px) the bar moves into the empty column
     beside PROGRAM: it spends width that was doing nothing and hands the monitors back the
     height it was using, which is the same read's 1080p complaint. Below it, the bar returns
     underneath. docs/PLAYOUT_DASHBOARD.md §2; the parity contract is CONTROL_PANEL_PARITY.md. */
  .stagehead { display:flex; flex-direction:column; gap:10px; flex:none;
    position:sticky; top:50px; z-index:5; background:var(--bg);
    margin:-12px -14px -10px; padding:12px 14px 10px; }
  @media (min-width:1366px) {
    /* STRETCH, not \`end\`: the monitors set the row height and the verb column takes exactly it,
       so the buttons share that height instead of each claiming 44px and making the sticky head
       taller than the monitors it exists to keep on screen. */
    .stagehead { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:stretch; gap:14px; }
    /* TWO ACROSS, not a single stack: six verbs in one column are taller than the monitors at
       1536x814, and the stack would then set the sticky head's height instead of the picture. */
    .stagehead .verbs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
      align-content:stretch; gap:6px; max-width:300px; }
    /* TAKE spans the pair on the first row: the loudest control on the surface, and the only
       red one - auto-placement would drop it wherever its DOM position landed. */
    .stagehead .verbs .take { grid-area:1 / 1 / 2 / 3; }
    .stagehead .verbs button { min-height:40px; justify-content:center; gap:6px; }
    .stagehead .onair-line { grid-column:1 / -1; margin-left:0; margin-top:2px; white-space:normal;
      text-align:center; }
  }

  /* Monitors: PREVIEW beside PROGRAM, equal, CAPPED and STICKY (through the stage head above) -
     you see what is out all the time, and the options below get the rest of the page. The cap is
     a track WIDTH because each screen takes its height from its width through aspect-ratio; the
     number below is this production's own ratio, capped at 16/9 so neither screen exceeds the
     budget. The height is the same clamp the React surfaces use: a flat 26vh was tuned on a
     1536x814 window and left a 1080p one with the monitors too small under a page of nothing. */
  .monitors { display:grid; justify-content:start; gap:12px; flex:none;
    grid-template-columns: repeat(2, minmax(0, calc(clamp(170px, calc(26vh + (100vh - 768px) * 0.28), 38vh) * ${Math.min(payload.width / payload.height, 16 / 9).toFixed(4)}))); }
  .monitor { display:flex; flex-direction:column; min-width:0; }
  .monitor h2 { margin:0 0 5px; font-size:10.5px; letter-spacing:.16em; font-weight:700;
    display:flex; align-items:center; gap:7px; min-width:0; }
  .monitor .dot { width:7px; height:7px; border-radius:50%; flex:none; }
  .monitor .what { font-weight:400; letter-spacing:0; font-size:12px; color:var(--dim);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .monitor .lay { margin-left:auto; font-size:10px; color:var(--dim); font-family:var(--mono); flex:none; }
  .mon-pvw h2 { color:var(--amber); } .mon-pvw .dot { background:var(--amber); }
  .mon-pgm h2 { color:var(--air); } .mon-pgm .dot { background:var(--air); }
  .screen { position:relative; width:100%; aspect-ratio:${payload.width} / ${payload.height};
    overflow:hidden; border-radius:7px;
    background-color:#101318;
    background-image: linear-gradient(45deg,#171b21 25%,transparent 25%), linear-gradient(-45deg,#171b21 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#171b21 75%), linear-gradient(-45deg,transparent 75%,#171b21 75%);
    background-size:18px 18px; background-position:0 0,0 9px,9px -9px,-9px 0; }
  .mon-pvw .screen { box-shadow: inset 0 0 0 2px rgba(246,166,35,.7); }
  .mon-pgm .screen { box-shadow: inset 0 0 0 2px rgba(239,68,68,.8); }
  .screen iframe { position:absolute; top:0; left:0; width:${payload.width}px; height:${payload.height}px; border:0;
    transform-origin: top left; pointer-events:none; background:transparent; }

  /* The verbs, with the keys that fire them. */
  .verbs { display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex:none; }
  .verbs button { min-height:44px; padding:0 16px; font:inherit; font-size:14px; color:var(--text);
    background:var(--panel-2); border:1px solid var(--line); border-radius:7px; cursor:pointer;
    display:inline-flex; align-items:center; gap:8px; white-space:nowrap; }
  .verbs button:hover:not(:disabled) { border-color:var(--dim); }
  .verbs button:disabled { opacity:.4; cursor:default; }
  .verbs kbd { font-family:var(--mono); font-size:10px; letter-spacing:.06em; padding:2px 5px;
    border-radius:4px; background:rgba(255,255,255,.07); border:1px solid var(--line); color:var(--dim); }
  .verbs .pvw { border-color:rgba(246,166,35,.55); color:#f8c675; }
  .verbs .take { background:var(--air); border-color:var(--air); color:#fff; font-weight:700; padding:0 24px; }
  .verbs .take:hover:not(:disabled) { background:#f05a5a; }
  .verbs .take kbd { background:rgba(0,0,0,.22); border-color:rgba(255,255,255,.25); color:#fff; }
  /* The toggle's OFF half: not the take red, because red means "this puts something on air". */
  .verbs .take.live { background:#2a2a30; border-color:rgba(255,255,255,.32); color:#f4f4f5; }
  .verbs .take.live:hover:not(:disabled) { background:#35353d; }
  .onair-line { margin-left:auto; font-size:12px; color:var(--dim); white-space:nowrap; }
  .onair-line b { color:var(--air); font-weight:600; }

  /* The cue editor. */
  /* Content-sized, never a scroller: this is the pane the owner reported. */
  .editor { flex:none; background:var(--panel);
    border:1px solid var(--line); border-radius:9px; padding:10px 13px; }
  .editor.live { border-color:rgba(239,68,68,.75); box-shadow: inset 0 0 0 1px rgba(239,68,68,.4); }
  .editor.pvw { border-color:rgba(246,166,35,.6); }
  .ed-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:9px; }
  .ed-kicker { font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; color:var(--amber); white-space:nowrap; }
  .editor.live .ed-kicker { color:var(--air); }
  .ed-name { font-size:14px; font-weight:600; }
  .ed-fate { font-size:12px; color:var(--dim); }
  /* TOO LONG TO FIT. Red, not the amber beside it: an unsent change is a step still to take,
     this is the picture already being wrong. */
  .ed-over { font-size:12px; font-weight:700; color:#e06c75; }
  /* The box mark drops the label row's uppercase tracking on purpose: read in the same
     letterforms as the field NAME it sits beside, a warning looks like part of the name. */
  .field > label .over-mark { color:#e06c75; font-weight:700; font-size:11px; text-transform:none; letter-spacing:0; }
  .field-over input, .field-over textarea, .field-over select { border-color:#e06c75; }
  .fields { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px,1fr)); gap:8px 14px; }
  .field label { display:block; font-size:10px; letter-spacing:.1em; text-transform:uppercase;
    color:var(--dim); margin-bottom:3px; }
  input, textarea, select { width:100%; font:inherit; font-size:13px; color:var(--text); background:var(--bg);
    border:1px solid var(--line); border-radius:6px; padding:7px 9px; }
  textarea { min-height:70px; resize:vertical; }
  .numrow { display:flex; gap:4px; }
  .numrow input { flex:1 1 auto; min-width:0; }
  .numrow .step { font:inherit; font-size:14px; color:var(--text); background:var(--panel-2);
    border:1px solid var(--line); border-radius:6px; width:34px; flex:0 0 auto; cursor:pointer; }
  /* Greyed, never removed - the same rule the verbs follow: a control that appeared the
     moment a cue went live would shove the field beside it sideways at the worst possible
     time. */
  .numrow .step:disabled { opacity:.4; cursor:default; }
  /* What the pair DOES, said where the pair is (§7c's "act on air", as the production page's
     block kicker says it). Red, because that is the word for air on this page. */
  .field .airmark { color:var(--air); font-weight:700; letter-spacing:.06em; margin-left:6px; }
  .seg { display:inline-flex; }
  .seg button { font:inherit; font-size:12.5px; color:var(--text); background:var(--bg);
    border:1px solid var(--line); border-right-width:0; border-radius:0; min-width:36px;
    padding:6px 11px; cursor:pointer; }
  .seg button:first-child { border-radius:6px 0 0 6px; }
  .seg button:last-child { border-radius:0 6px 6px 0; border-right-width:1px; }
  .seg button.on { background:var(--amber); border-color:var(--amber); color:#14161a; font-weight:600; }
  .events { margin-top:10px; }
  .events h4 { margin:8px 0 4px; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;
    color:var(--dim); font-weight:700; }
  .events h4:first-child { margin-top:0; }
  .events-row { display:flex; flex-wrap:wrap; gap:6px; }
  .events button { font:inherit; font-size:12.5px; color:var(--text); background:var(--panel-2);
    border:1px solid var(--line); border-radius:6px; padding:6px 11px; cursor:pointer; }

  /* Activity: one collapsed line. */
  .feed { flex:none; font-size:12.5px; color:var(--dim); padding-bottom:12px; }
  .feed summary { cursor:pointer; padding:2px 0; }
  .feed div { padding:1px 0; }
  .feed .t { font-family:var(--mono); font-size:11px; color:#5c6371; margin-right:8px; }

  /* The cue rail. */
  .rail-head { display:flex; align-items:center; gap:8px; padding:11px 14px 7px; flex:none; }
  .rail-head h2 { font-size:13px; margin:0; }
  .rail-head .n { font-size:11px; color:var(--dim); }
  .cues { flex:1 1 0; min-height:0; overflow:auto; padding:0 12px 10px;
    display:flex; flex-direction:column; gap:5px; }
  .cue { display:flex; align-items:center; gap:8px; padding:8px 9px; border:1px solid var(--line);
    border-radius:8px; background:var(--panel); cursor:pointer; min-width:0; }
  .cue.selected { border-color:#3b4252; }
  .cue.on-air { border-color:rgba(239,68,68,.85); background:rgba(239,68,68,.09); }
  .cue.on-pvw { border-color:rgba(246,166,35,.7); background:rgba(246,166,35,.07); }
  .cue .no { flex:none; min-width:14px; text-align:right; font-size:11px; color:var(--dim);
    font-variant-numeric:tabular-nums; }
  .cue.on-air .no { color:var(--air); }
  .cue .body { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:1px; }
  .cue .nm { font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cue .sub { font-size:11.5px; color:var(--dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tag { font-size:9.5px; font-weight:700; letter-spacing:.08em; flex:none; padding:2px 6px; border-radius:4px; }
  .tag.air { color:#fff; background:var(--air); }
  .tag.pv { color:#1a1205; background:var(--amber); }

  /* A shared layer means two graphics replace each other on air, and the rundown row is the one
     place that is said — there is no layer list any more (docs/PLAYOUT_DASHBOARD.md §5). */
  .cue .lay.clash { color:var(--amber); font-weight:600; }

  .nolisten { display:none; margin:10px 14px 0; padding:10px 14px; border:1px solid #8a4a2a;
    border-radius:8px; background:#2d1c12; color:#f0c9a8; font-size:12px; }

  /* Phone (§3): one column, monitors still side by side, verbs pinned to the bottom. */
  @media (max-width: 900px) {
    main { display:flex; flex-direction:column; min-height:0; }
    .stage { border-right:none; }
    /* Not sticky at this width: the verbs are pinned to the bottom of the screen instead, and
       a monitor block stuck to the top would cover the cue list it sits above. The stage head
       is what carries the stickiness now, so it is the one that has to stand down. */
    .stagehead { position:static; margin:0; padding:0; display:contents; }
    .monitors { position:static; margin:0; padding:0; }
    .rail { position:static; height:auto; align-self:auto; border-top:1px solid var(--line); }
    .cues { max-height:46vh; flex:none; }
    header { height:46px; padding:0 10px; }
    .clock, header a { display:none; }
    .monitor h2 { font-size:9px; letter-spacing:.1em; }
    .monitor .what { display:none; }
    .verbs { position:sticky; bottom:0; z-index:5; background:var(--bg); border-top:1px solid var(--line);
      padding:8px 14px calc(8px + env(safe-area-inset-bottom,0px)); margin:0 -14px; flex-wrap:nowrap; }
    .verbs button { flex:1 1 0; justify-content:center; min-height:52px; padding:0 10px; }
    .verbs kbd, .verbs .pvw, .verbs #v-update, .onair-line { display:none; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(payload.show)} <span>· controller</span></h1>
  <span class="mode" id="mode">○ CONNECTING</span>
  <span class="clock mono" id="clock">00:00:00</span>
  <span class="spacer"></span>
  <a href="show_controlpanel.html" title="The per-graphic panel: every field and event button of every graphic">per-graphic panel →</a>
  <button class="allout" id="v-allout" disabled title="Play every live layer off — clear the frame">■ All out</button>
</header>
<div class="nolisten" id="nolisten">
  <strong>The relay is not answering.</strong> Start this page through the bundled launcher
  ("Start controller.cmd" / "start-controller.command") — it serves the package and relays
  commands to the graphics. Opened from disk or a plain web server, the verbs have no wire.
</div>
<main>
  <section class="stage">
    <div class="stagehead">
    <div class="monitors">
      <div class="monitor mon-pvw">
        <h2><span class="dot"></span>PREVIEW <span class="what" id="pvw-label"></span></h2>
        <div class="screen" id="stage-pvw"></div>
      </div>
      <div class="monitor mon-pgm">
        <h2><span class="dot"></span>PROGRAM — ON AIR <span class="what" id="pgm-label"></span>
          <span class="lay" id="pgm-layer"></span></h2>
        <div class="screen" id="stage-pgm"></div>
      </div>
    </div>

    <div class="verbs">
      <button class="pvw" id="v-preview" title="Show the selected cue on PREVIEW — nothing airs">→ Preview <kbd>P</kbd></button>
      <button class="take" id="v-take" title="Air the previewed cue">⟳ TAKE <kbd>SPACE</kbd></button>
      <button id="v-retake" disabled title="Re-take: play this cue's entrance again from the start">⟳ Re-take <kbd>R</kbd></button>
      <button id="v-update" title="Push the edited values to air without re-animating">✎ Update <kbd>U</kbd></button>
      <button id="v-next" title="Advance the on-air graphic one step">» Next <kbd>N</kbd></button>
      <button id="v-out" title="Play the selected cue's layer off air">■ Out <kbd>0</kbd></button>
      <span class="onair-line" id="live-line"></span>
    </div>
    </div>

    <div class="editor" id="editor" style="display:none">
      <div class="ed-head">
        <span class="ed-kicker" id="ed-kicker"></span>
        <span class="ed-name" id="ed-name"></span>
        <span class="ed-fate" id="ed-fate"></span>
        <span class="ed-over" id="ed-over" style="display:none"></span>
      </div>
      <div class="fields" id="editor-fields"></div>
      <div class="events" id="editor-events"></div>
    </div>

    <details class="feed">
      <summary>Activity <span id="feed-last"></span></summary>
      <div id="feed"></div>
    </details>
  </section>

  <aside class="rail">
    <div class="rail-head">
      <h2>Cue rundown</h2><span class="n">${payload.cues.length}</span>
    </div>
    <div class="cues" id="cues"></div>
  </aside>
</main>
<script>
var PAYLOAD = ${jsonForScript(payload)};
var W = ${payload.width}, H = ${payload.height};

// ── Relay wire (protocol v1). The controller is relay-only: no relay, no verbs. ──
var relayOk = false;
var cursor = 0;
function send(items) {
  if (!relayOk) return;
  fetch('/relay/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items }) }).catch(function () {});
}

${MATCH_CLOCK_PAGE_JS}

// clockEffectFor(): what one clock verb does to the graphic's clock field, and WHEN relative to
// the event row itself — this page's copy of matchClockWire.ts's clockRowEffect, against the
// cue's own resolved values. Same decision as the standalone panel makes, because the two ship
// in the same package and an operator switching surfaces must not switch behaviour.
//
// 'before' for a START: the origin has to be in the document by the time startMatchClock runs,
// or the runtime mints a local one instead. 'after' for a hold or a reset: the value banked is
// what the graphic has just settled on. Reset banks the spec's resetTo — what the RUNTIME
// returns to — never what the element happens to read, which by then is the running time.
function clockEffectFor(g, cue, event, at) {
  var clock = g && g.clock;
  if (!clock) return null;
  var values = cueValues(cue);
  var from = values[clock.field] !== undefined ? values[clock.field] : clock.seed;
  if (event === 'clockStart') return { field: clock.field, value: clockValueAt(from, clock.countsDown, at) + '@' + at, when: 'before' };
  if (event === 'clockStop') return { field: clock.field, value: clockValueAt(from, clock.countsDown, at), when: 'after' };
  if (event === 'clockReset') return { field: clock.field, value: clock.resetTo, when: 'after' };
  return null;
}

// ── Monitors: every pool graphic stacked by its LAYER number, per stream. The iframes are
// ordinary package graphics addressed with ?stream=, so what PREVIEW shows is the real
// runtime, not a simulation. ──
// Each stream's frames by graphic name, so the overflow poll below can ask the running graphic
// what did not fit. They are ordinary same-origin pages served by the relay beside this one.
var stageFrames = { preview: {}, program: {} };
function buildStage(hostId, stream) {
  var host = document.getElementById(hostId);
  PAYLOAD.graphics.forEach(function (g) {
    var f = document.createElement('iframe');
    f.src = g.file + '?stream=' + stream;
    f.title = g.name;
    f.style.zIndex = String(g.layer);
    host.appendChild(f);
    if (stageFrames[stream]) stageFrames[stream][g.name] = f;
  });
  function fit() {
    var scale = host.clientWidth / W;
    var frames = host.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) frames[i].style.transform = 'scale(' + scale + ')';
  }
  fit();
  window.addEventListener('resize', fit);
}
buildStage('stage-pvw', 'preview');
buildStage('stage-pgm', 'program');

// ── TOO LONG TO FIT (owner ruling 2026-08-23, docs/SVG_IMPORT_PLAN.md §3) ────────────────────
// A graphic whose fit ladder ran out of room — panel filled, wrapped into the height the design
// has, shrunk to the readability floor — names the fields it could not hold through
// noacgTextOverflow(). The copy is never cut and the artwork is never reshaped to hide it, so
// the only thing left is to SAY SO, on the surface where the value is typed
// (docs/CONTROL_PANEL_PARITY.md §4: this page, the in-app cockpit and the hosted page together).
//
// Asked of the monitors directly rather than reported over the relay: these frames are ordinary
// same-origin pages this page built, the relay log is a COMMAND log with no report direction,
// and a warning is worth exactly one function call a second. Opened over file://, where the
// frames are opaque and the relay is absent, the read throws and the page carries on with no
// warning — which is where it stood before.
var overflowBy = { preview: {}, program: {} };
function readOverflow() {
  var moved = false;
  for (var stream in stageFrames) {
    for (var name in stageFrames[stream]) {
      var next = [];
      try {
        var w = stageFrames[stream][name].contentWindow;
        if (w && typeof w.noacgTextOverflow === 'function') next = w.noacgTextOverflow() || [];
      } catch (e) { next = []; }
      var prev = overflowBy[stream][name] || [];
      if (prev.join(',') !== next.join(',')) { overflowBy[stream][name] = next; moved = true; }
    }
  }
  if (moved) paintOverflow();
}
setInterval(readOverflow, 1000);

// ── State: selection, drafts, and the per-stream tally (graphic -> cue id). ──
var selectedId = PAYLOAD.cues.length ? PAYLOAD.cues[0].id : null;
var drafts = {};   // cueId -> edited values overlay
var pvwLive = {};  // graphic -> cueId on the preview stream
var pgmLive = {};  // graphic -> cueId on the program stream
var started = Date.now();
function cueById(id) { for (var i = 0; i < PAYLOAD.cues.length; i++) if (PAYLOAD.cues[i].id === id) return PAYLOAD.cues[i]; return null; }
function graphicByName(name) { for (var i = 0; i < PAYLOAD.graphics.length; i++) if (PAYLOAD.graphics[i].name === name) return PAYLOAD.graphics[i]; return null; }
function cueValues(cue) {
  var out = {};
  var g = graphicByName(cue.graphic);
  if (g) g.controls.forEach(function (c) { out[c.key] = String(c.value || ''); });
  for (var k in cue.values) out[k] = String(cue.values[k]);
  var d = drafts[cue.id] || {};
  for (var k2 in d) out[k2] = String(d[k2]);
  return out;
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
// A value going into a quoted ATTRIBUTE inside innerHTML needs the quote escaped as well —
// esc() is for text nodes, and a graphic named 6" Rule would end the attribute early.
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function feed(text) {
  var el = document.getElementById('feed');
  var row = document.createElement('div');
  var t = new Date().toLocaleTimeString();
  row.innerHTML = '<span class="t">' + t + '</span>' + esc(text);
  el.insertBefore(row, el.firstChild);
  while (el.children.length > 80) el.removeChild(el.lastChild);
  document.getElementById('feed-last').textContent = ' · ' + t + '  ' + text;
}

// ── The verbs: each is ONE batch of protocol rows; the 'cue' meta row is what carries the
// tally to every follower (receivers ignore it — same shape as the hosted log). ──
function takeTo(stream) {
  var cue = cueById(selectedId);
  if (!cue) return;
  send([
    { graphic: cue.graphic, stream: stream, msg: { t: 'update', data: cueValues(cue) } },
    { graphic: cue.graphic, stream: stream, msg: { t: 'play' } },
    { graphic: cue.graphic, stream: stream, msg: { t: 'cue', cue: cue.id } },
  ]);
  feed((stream === 'preview' ? '→ Preview: ' : '⟳ Take: ') + cue.label + ' · ' + cue.graphic);
}
function updateLive() {
  var cue = cueById(selectedId);
  if (!cue || pgmLive[cue.graphic] !== cue.id) return;
  send([{ graphic: cue.graphic, stream: 'program', msg: { t: 'update', data: cueValues(cue) } }]);
  feed('✎ Update: ' + cue.label);
}
function nextLive() {
  var cue = cueById(selectedId);
  if (!cue) return;
  send([{ graphic: cue.graphic, stream: 'program', msg: { t: 'next' } }]);
  feed('» Next: ' + cue.graphic);
}
function outCue(stream) {
  var cue = cueById(selectedId);
  if (!cue) return;
  send([
    { graphic: cue.graphic, stream: stream, msg: { t: 'stop' } },
    { graphic: cue.graphic, stream: stream, msg: { t: 'cue', cue: null } },
  ]);
  feed('■ Out: ' + cue.graphic);
}
function allOut() {
  var items = [];
  for (var g in pgmLive) {
    items.push({ graphic: g, stream: 'program', msg: { t: 'stop' } });
    items.push({ graphic: g, stream: 'program', msg: { t: 'cue', cue: null } });
  }
  if (items.length) send(items);
  feed('■ All out');
}
// THE TOGGLE. One control puts the selected cue on air and takes it off again - the SPX
// gesture - and the button says which of the two it is about to do. Re-take (replaying a live
// cue's entrance) is a separate control with its own key, never this one wearing a second
// meaning while a cue happens to be live.
function toggleProgram() {
  var cue = cueById(selectedId);
  if (!cue) return;
  if (pgmLive[cue.graphic] === cue.id) outCue('program');
  else takeTo('program');
}
function retake() {
  var cue = cueById(selectedId);
  if (cue && pgmLive[cue.graphic] === cue.id) takeTo('program');
}
// Walk the rundown from the keyboard: selecting is the same act as clicking a row, so it goes
// to PREVIEW and nothing airs. With the toggle above, a whole production can be run from the
// keys alone - which is also what makes a Stream Deck (a keyboard emulator) work here.
function stepSelection(by) {
  if (!PAYLOAD.cues.length) return;
  var at = -1;
  for (var i = 0; i < PAYLOAD.cues.length; i++) if (PAYLOAD.cues[i].id === selectedId) at = i;
  var next = at < 0 ? (by > 0 ? 0 : PAYLOAD.cues.length - 1) : Math.min(PAYLOAD.cues.length - 1, Math.max(0, at + by));
  selectedId = PAYLOAD.cues[next].id;
  takeTo('preview');
  paint();
  var el = document.getElementById('cue-' + selectedId);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}
document.getElementById('v-preview').onclick = function () { takeTo('preview'); };
document.getElementById('v-take').onclick = toggleProgram;
document.getElementById('v-retake').onclick = retake;
document.getElementById('v-update').onclick = updateLive;
document.getElementById('v-next').onclick = nextLive;
document.getElementById('v-out').onclick = function () { outCue('program'); };
document.getElementById('v-allout').onclick = allOut;

// The verb KEYS (docs/PLAYOUT_DASHBOARD.md §2). Never while typing — the fields live on this
// same surface, and a space inside a name must stay a space.
document.addEventListener('keydown', function (e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  var el = e.target;
  var tag = el && el.tagName;
  if (el && (el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
  var key = String(e.key).toLowerCase();
  var run = { p: function () { takeTo('preview'); }, ' ': toggleProgram, r: retake,
    u: updateLive, n: nextLive, '0': function () { outCue('program'); },
    arrowup: function () { stepSelection(-1); }, arrowdown: function () { stepSelection(1); } }[key];
  if (!run) return;
  e.preventDefault();
  run();
});

// ── The log follow: the tally comes from the LOG (never assumed locally), so a second
// controller window agrees with this one. Boot at the head — recovery is a re-take. ──
function applyRow(row) {
  var m = row.msg || {};
  if (m.t !== 'cue') return;
  var map = row.stream === 'preview' ? pvwLive : pgmLive;
  if (m.cue) map[row.graphic] = m.cue;
  else delete map[row.graphic];
  paint();
}
function poll() {
  fetch('/relay/log?after=' + cursor)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.rows) return;
      for (var i = 0; i < data.rows.length; i++) { cursor = data.rows[i].id; applyRow(data.rows[i]); }
    })
    .catch(function () {});
}

// ── Painting: rundown, tallies, the editor for the selected cue. ──

// Which OTHER graphics sit on one graphic's layer. Two on the same number replace each other on
// air, so the row wears the warning where the operator is already looking.
function layerSharedWith(g) {
  if (!g) return [];
  return PAYLOAD.graphics.filter(function (o) { return o.name !== g.name && o.layer === g.layer; })
    .map(function (o) { return o.name; });
}

function paint() {
  var host = document.getElementById('cues');
  host.innerHTML = '';
  PAYLOAD.cues.forEach(function (cue, i) {
    var g = graphicByName(cue.graphic);
    var onAir = pgmLive[cue.graphic] === cue.id;
    var onPvw = pvwLive[cue.graphic] === cue.id;
    var sharing = layerSharedWith(g);
    var lay = g
      ? '<span class="lay' + (sharing.length ? ' clash' : '') + '" title="' +
        (sharing.length
          ? 'Shares layer ' + g.layer + ' with ' + escAttr(sharing.join(', ')) + ' — on air they replace each other'
          : escAttr(g.name) + ' airs on layer ' + g.layer) +
        '">L' + g.layer + '</span> · '
      : '';
    var el = document.createElement('div');
    // The id is what the arrow keys scroll into view — a rundown longer than its box would
    // otherwise move the selection somewhere the operator cannot see.
    el.id = 'cue-' + cue.id;
    el.className = 'cue' + (cue.id === selectedId ? ' selected' : '') + (onAir ? ' on-air' : onPvw ? ' on-pvw' : '');
    el.innerHTML =
      '<span class="no">' + (onAir ? '●' : (i + 1)) + '</span>' +
      '<span class="body"><span class="nm">' + esc(cue.label) + '</span>' +
      '<span class="sub">' + lay + esc(cue.note || cue.graphic) + '</span></span>' +
      (onAir ? '<span class="tag air">ON AIR</span>' : onPvw ? '<span class="tag pv">PVW</span>' : '');
    el.onclick = function () { selectedId = cue.id; takeTo('preview'); paint(); };
    host.appendChild(el);
  });

  var pvwNames = [], pgmNames = [], pgmLayer = null;
  for (var a in pvwLive) { var c1 = cueById(pvwLive[a]); pvwNames.push(c1 ? c1.label : a); }
  for (var b in pgmLive) {
    var c2 = cueById(pgmLive[b]); pgmNames.push(c2 ? c2.label : b);
    var gg = graphicByName(b); if (gg && (pgmLayer === null || gg.layer > pgmLayer)) pgmLayer = gg.layer;
  }
  var sel = cueById(selectedId);
  document.getElementById('pvw-label').textContent = pvwNames.length ? pvwNames.join(' · ') : (sel ? sel.label : '');
  document.getElementById('pgm-label').textContent = pgmNames.length ? pgmNames.join(' · ') : 'nothing on air';
  document.getElementById('pgm-layer').textContent = pgmLayer === null ? '' : 'L' + pgmLayer;
  document.getElementById('live-line').innerHTML = pgmNames.length
    ? 'on air: <b>● ' + esc(pgmNames.join(' · ')) + '</b>'
    : '○ nothing on air';
  document.getElementById('v-allout').disabled = pgmNames.length === 0;
  // The toggle's two faces, painted from the same fact the key reads.
  var selLive = !!(sel && pgmLive[sel.graphic] === sel.id);
  var take = document.getElementById('v-take');
  take.innerHTML = selLive ? '■ TAKE OFF <kbd>SPACE</kbd>' : '⟳ TAKE <kbd>SPACE</kbd>';
  take.className = selLive ? 'take live' : 'take';
  take.title = selLive ? 'Take this cue OFF air — the same thing SPACE does' : 'Air the previewed cue';
  take.disabled = !sel;
  // Greyed, never removed: a verb that appeared would shove the ones after it sideways at the
  // moment a cue goes live.
  document.getElementById('v-retake').disabled = !selLive;
  document.getElementById('v-update').disabled = !(sel && pgmLive[sel.graphic] === sel.id);
  document.getElementById('v-next').disabled = !(sel && pgmLive[sel.graphic]);
  document.getElementById('v-out').disabled = !(sel && pgmLive[sel.graphic]);

  paintEditor();
}

// Which cue the FIELDS were built for. paint() runs on every log poll (400 ms), and rebuilding
// the inputs each time replaces the element the operator is typing into: a poll landing between
// two keystrokes threw the half-typed value away and restored the cue's stored text. Only a
// change of SELECTED CUE needs new inputs; a tally change needs the header and nothing else.
var editorCueId = null;
// The −/+ pairs of the fields currently built, so the tally poll can grey them without
// rebuilding the inputs (which is what would eat a half-typed value).
var stepButtons = [];
// The clock field's box, for the same reason: a clock verb repaints the banked time into it
// rather than rebuilding the editor around it.
var clockBox = null;
// Every field's REPAINTER by key, for the same reason again: an ⚡ event that MOVES a field - a
// scoreboard's goal adjusting that side's score, a survey's reveal setting a row's switch, a
// puzzle's Reveal letter adding a line to the revealed list - repaints the new value into the
// box rather than rebuilding the editor around it.
var repaint = {};
// Every field's box and its hidden TOO LONG mark, for the same reason once more: the warning
// arrives from a poll, and rebuilding a box to show it would take the focus out of the input
// the operator is typing into at exactly the moment they need to shorten it.
var overBoxes = {};

/** WHICH VALUES DO NOT FIT, for the cue the editor is pointed at — the monitor showing it is
 *  the one that knows: PROGRAM while the cue is on air, PREVIEW while it is staged. */
function paintOverflow() {
  var note = document.getElementById('ed-over');
  if (!note) return;
  var cue = cueById(editorCueId);
  var g = cue ? graphicByName(cue.graphic) : null;
  var onAir = cue && pgmLive[cue.graphic] === cue.id;
  var reported = (cue ? (overflowBy[onAir ? 'program' : 'preview'][cue.graphic] || []) : []);
  var labels = {};
  (g ? g.controls : []).forEach(function (c) { labels[c.key] = c.label; });
  var shown = [];
  for (var i = 0; i < reported.length; i++) {
    if (labels[reported[i]] !== undefined && shown.indexOf(reported[i]) === -1) shown.push(reported[i]);
  }
  note.textContent = shown.length === 1
    ? '\\u26A0 ' + labels[shown[0]] + ' ' + ${jsonForScript(OVERFLOW_NOTE_ONE)}
    : '\\u26A0 ' + shown.length + ' ' + ${jsonForScript(OVERFLOW_NOTE_MANY)};
  note.style.display = shown.length ? 'inline' : 'none';
  for (var key in overBoxes) {
    var bad = shown.indexOf(key) !== -1;
    overBoxes[key].box.className = bad ? 'field field-over' : 'field';
    overBoxes[key].mark.style.display = bad ? 'inline' : 'none';
  }
}

// THE ± LIVE NUMBERS AFFORDANCE (docs/PLAYOUT_DASHBOARD.md §7c): the pair acts on air, so it
// enables only while the edited cue is the one on air.
function paintSteppers(onAir) {
  for (var i = 0; i < stepButtons.length; i++) {
    var sb = stepButtons[i];
    sb.el.disabled = !onAir;
    sb.el.title = onAir
      ? 'Changes "' + sb.label + '" on air immediately'
      : 'This cue is not on air — Take it first';
  }
}

function paintEditor() {
  var wrap = document.getElementById('editor');
  var cue = cueById(selectedId);
  if (!cue) { wrap.style.display = 'none'; editorCueId = null; return; }
  wrap.style.display = 'block';
  var g = graphicByName(cue.graphic);
  var onAir = pgmLive[cue.graphic] === cue.id;
  var onPvw = pvwLive[cue.graphic] === cue.id;
  // The number fields an ⚡ event carries as PAYLOAD (docs/PLAYOUT_DASHBOARD.md §7c): those get
  // no live bump. They are set by their own action, and a second road to them would air a value
  // without the state that gives it meaning — so their steppers stage like any other edit.
  var payloadKeys = {};
  (g ? g.events : []).forEach(function (e) {
    (e.payload || []).forEach(function (k) { payloadKeys[k] = true; });
  });
  var hasBump = (g ? g.controls : []).some(function (c) { return c.kind === 'number' && !payloadKeys[c.key]; });
  wrap.className = 'editor' + (onAir ? ' live' : onPvw ? ' pvw' : '');
  document.getElementById('ed-kicker').textContent = onAir ? 'EDITING ON-AIR CUE' : 'EDITING PREVIEW CUE';
  document.getElementById('ed-name').textContent = cue.label;
  // What the operator's next keystroke will DO — and the one exception to it, said out loud on
  // the graphics that have one: a −/+ press changes the figure on air by itself, which is also
  // why it has nothing to do until the cue is taken.
  document.getElementById('ed-fate').textContent = onAir
    ? (hasBump ? 'changes push live on ✎ Update · − / + act on air' : 'changes push live on ✎ Update')
    : (hasBump ? 'changes air on ⟳ TAKE · − / + act on air, so they wait for it' : 'changes air on ⟳ TAKE');

  // The pair GREYS off air, on the tally this page reads from the log — so a take made on
  // another device enables it here too. Called before the early return below, because a tally
  // change needs exactly this and nothing else.
  paintSteppers(onAir);

  // Same cue as last time: the header above is the whole update. Leave the inputs alone.
  if (editorCueId === cue.id) { paintOverflow(); return; }
  editorCueId = cue.id;

  var fields = document.getElementById('editor-fields');
  fields.innerHTML = '';
  stepButtons = [];
  clockBox = null;
  repaint = {};
  overBoxes = {};
  var values = cueValues(cue);
  (g ? g.controls : []).forEach(function (c) {
    var box = document.createElement('div');
    box.className = 'field';
    var label = document.createElement('label');
    // The field's ID rides with its name here too, so this page and FIELDS.md agree.
    label.textContent = c.key.toUpperCase() + ' · ' + c.label;
    // …plus the TOO LONG mark, hidden until the graphic reports this value as unfittable. One
    // line at the top of a long field list does not say which box to shorten.
    var overMark = document.createElement('b');
    overMark.className = 'over-mark';
    overMark.title = ${jsonForScript(OVERFLOW_FIELD_HINT)};
    overMark.textContent = ' \\u26A0 ' + ${jsonForScript(OVERFLOW_FIELD_MARK)};
    overMark.style.display = 'none';
    label.appendChild(overMark);
    overBoxes[c.key] = { box: box, mark: overMark };
    box.appendChild(label);
    // Editing a field STAGES it. Off air it airs on ⟳ TAKE, on air on ✎ Update — which is what
    // the header above has always promised, and what the other two operator surfaces do. This
    // page used to push the whole value set on every keystroke of a live cue, so a name being
    // typed reached air letter by letter.
    var stage = function (val) {
      if (!drafts[cue.id]) drafts[cue.id] = {};
      drafts[cue.id][c.key] = val;
      // Live-edit the PREVIEW: editing refreshes the PVW monitor without touching air. A cue
      // that is on both streams (the usual case after a Take) shows the staged version on PVW
      // and the aired one on PGM — which is what makes the pair worth having.
      if (pvwLive[cue.graphic] === cue.id) {
        send([{ graphic: cue.graphic, stream: 'preview', msg: { t: 'update', data: cueValues(cue) } }]);
      }
    };
    // THE ONE DATA WRITE THAT AIRS IMMEDIATELY (docs/PLAYOUT_DASHBOARD.md §7c): a −/+ press on
    // a number field of the ON-AIR cue. PARTIAL on purpose — only that key travels, because ✎
    // Update sends the cue's whole value set and riding it would publish every other staged
    // edit too: a score bump must never air a half-typed name. The staged value is mirrored in
    // the same breath, so the visible input and the aired figure cannot drift.
    var bumpLive = function (val) {
      if (!drafts[cue.id]) drafts[cue.id] = {};
      drafts[cue.id][c.key] = val;
      var data = {};
      data[c.key] = String(val);
      send([{ graphic: cue.graphic, stream: 'program', msg: { t: 'update', data: data } }]);
      feed('± ' + c.label + ': ' + val + ' · ' + cue.graphic);
    };
    var input;
    if (c.kind === 'lines') { input = document.createElement('textarea'); }
    else if (c.kind === 'select') {
      var opts = c.options || [];
      // The in-app control's rule, kept in step: a SHORT constrained choice (a quiz's A/B/C/D)
      // renders as segmented buttons; longer lists keep the dropdown.
      var segmented = opts.length > 0 && opts.length <= 5 && opts.every(function (o) {
        return String(o.label !== undefined ? o.label : o).length <= 4;
      });
      if (segmented) {
        var seg = document.createElement('div');
        seg.className = 'seg';
        var current = values[c.key] !== undefined ? values[c.key] : '';
        opts.forEach(function (o) {
          var val = o.value !== undefined ? o.value : o;
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = o.label !== undefined ? o.label : o;
          if (val === current) b.className = 'on';
          b.onclick = function () {
            for (var n = seg.firstChild; n; n = n.nextSibling) n.className = '';
            b.className = 'on';
            stage(val);
          };
          seg.appendChild(b);
        });
        // A set on this choice (a survey's Reveal 3 writing "on") lights the segment it named.
        repaint[c.key] = function (value) {
          var n = seg.firstChild;
          opts.forEach(function (o) { if (n) { n.className = (o.value !== undefined ? o.value : o) === value ? 'on' : ''; n = n.nextSibling; } });
        };
        box.appendChild(seg);
        fields.appendChild(box);
        return;
      }
      input = document.createElement('select');
      opts.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value !== undefined ? o.value : o;
        opt.textContent = o.label !== undefined ? o.label : o;
        input.appendChild(opt);
      });
    } else if (c.kind === 'number') {
      // The −/+ steppers the other two renderers carry (one-control doctrine): a score is
      // bumped far more often than typed. There is ONE pair per number field and it means ONE
      // thing — §7c's ± LIVE NUMBERS bump, a partial straight to program — so it enables only
      // while the edited cue is the one on air and greys otherwise, exactly as the two React
      // surfaces do. It used to stage silently off air instead, which is a second meaning with
      // no feedback at all: the figure moved on screen and nothing said it had not aired.
      // A field an ⚡ event carries as PAYLOAD is the exclusion (§7c): its pair never airs
      // anything, so it stages at all times and is never greyed — greying it would strand the
      // only stepper the field has.
      var bumpsAir = !payloadKeys[c.key];
      if (bumpsAir) {
        var mark = document.createElement('b');
        mark.className = 'airmark';
        mark.textContent = 'act on air';
        label.appendChild(mark);
      }
      input = document.createElement('input');
      input.type = 'number';
      input.value = values[c.key] !== undefined ? values[c.key] : '';
      input.oninput = function () { stage(input.value); };
      repaint[c.key] = function (value) { input.value = value; };
      var numRow = document.createElement('div');
      numRow.className = 'numrow';
      var makeStep = function (dir, label) {
        var sb = document.createElement('button');
        sb.type = 'button';
        sb.className = 'step';
        sb.textContent = label;
        sb.title = 'Stages this number: it is set on air by its own ⚡ action';
        sb.onclick = function () {
          var s = c.step != null ? c.step : 1;
          var next = String((parseFloat(input.value) || 0) + dir * s);
          // The greying above is the affordance; this is the same fact enforced, so a press
          // that beats the poll cannot air on a cue that is no longer live.
          if (bumpsAir) {
            if (pgmLive[cue.graphic] !== cue.id) return;
            input.value = next;
            bumpLive(next);
          } else {
            input.value = next;
            stage(next);
          }
        };
        // The bumping pair's enabled state and words are painted from the tally, every poll.
        if (bumpsAir) stepButtons.push({ el: sb, label: c.label });
        return sb;
      };
      numRow.appendChild(makeStep(-1, '−'));
      numRow.appendChild(input);
      numRow.appendChild(makeStep(1, '+'));
      box.appendChild(numRow);
      fields.appendChild(box);
      return;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    // THE CLOCK FIELD HOLDS THE WIRE VALUE, which while the clock runs carries its origin stamp
    // ("45:00@1755600000000"). An operator reads and types the time alone, so the box shows the
    // plain half; typing replaces the whole value, which is right — a typed time is a
    // correction, and a correction has no origin but the moment it lands.
    var raw = values[c.key] !== undefined ? values[c.key] : '';
    if (g && g.clock && c.key === g.clock.field) { clockBox = input; raw = clockPlain(raw); }
    input.value = raw;
    input.oninput = function () { stage(input.value); };
    // A text box, a line list or a dropdown an ⚡ event moves (a set, an add, a remove) is
    // repainted like a number; the clock box keeps its plain-time reading and its own verbs.
    if (clockBox !== input) repaint[c.key] = function (value) { input.value = value; };
    box.appendChild(input);
    fields.appendChild(box);
  });
  // The pairs just built have never seen the tally: paint them before they are looked at. The
  // boxes have never seen the overflow report either, for the same reason.
  paintSteppers(onAir);
  paintOverflow();

  // The graphic's OPERATOR EVENTS (its state machine's buttons) — the capability module the
  // machine declares; a graphic with none shows none. Interactive graphics (polls, Q&A, chat)
  // add their operator actions in this same region (docs/PLAYOUT_DASHBOARD.md §8).
  // GROUPED BY THE AUTHOR'S SECTION, as the two React surfaces do (controlModel
  // controlSections): a quiz declares "Round" and "Judging" and a flat row of eight buttons
  // throws that away. Same order, same "Actions" default, hand-rolled here only because this
  // page ships without React or any import. (No backticks in this file's emitted script - it
  // IS a template literal, and one would end the string mid-page.)
  var events = document.getElementById('editor-events');
  events.innerHTML = '';
  var sections = [];
  (g ? g.events : []).forEach(function (e) {
    var key = e.section || 'Actions';
    var bucket = null;
    sections.forEach(function (s) { if (s.name === key) bucket = s; });
    if (bucket) bucket.buttons.push(e);
    else sections.push({ name: key, buttons: [e] });
  });
  sections.forEach(function (section) {
    if (sections.length > 1 || section.name !== 'Actions') {
      var head = document.createElement('h4');
      head.textContent = section.name;
      events.appendChild(head);
    }
    var row = document.createElement('div');
    row.className = 'events-row';
    events.appendChild(row);
    section.buttons.forEach(function (e) { row.appendChild(eventButton(e)); });
  });

  function eventButton(e) {
    var btn = document.createElement('button');
    btn.textContent = '⚡ ' + e.label;
    btn.onclick = function () {
      // The SAME rule as controlModel.ts eventPayload (this page ships without it): payload
      // fields ride at the cue's current value; adjust fields (a goal's +1) ride moved by their
      // delta, counted from the cue's current value (anything that does not read as an integer
      // counts from 0); set fields (a score board's "New game") ride at the figure the control
      // declares; add fields (a puzzle's "Reveal letter") ride with the source field's value
      // appended as a line unless it is already one, and remove fields with the last such line
      // taken out - an empty source, or a line the list does not hold, leaves the list off the
      // wire. Every road is staged into the draft and repainted into the box in the same breath -
      // the press aired it, so it is what the next press counts from and what ⟳ TAKE re-sends.
      var payload = null;
      (e.payload || []).forEach(function (key) {
        var v = cueValues(cue)[key];
        if (v !== undefined) { payload = payload || {}; payload[key] = v; }
      });
      var stage = function (key, value) {
        payload = payload || {};
        payload[key] = value;
        if (!drafts[cue.id]) drafts[cue.id] = {};
        drafts[cue.id][key] = value;
        if (repaint[key]) repaint[key](value);
      };
      var adjust = e.adjust || {};
      for (var ak in adjust) {
        if (!Object.prototype.hasOwnProperty.call(adjust, ak)) continue;
        var cur = cueValues(cue)[ak];
        stage(ak, String((parseInt(String(cur == null ? '' : cur), 10) || 0) + adjust[ak]));
      }
      var setTo = e.set || {};
      for (var sk in setTo) {
        if (!Object.prototype.hasOwnProperty.call(setTo, sk)) continue;
        stage(sk, setTo[sk]);
      }
      // The list's non-empty lines, trimmed - controlModel.ts listLines, restated.
      var listLines = function (value) {
        var out = [];
        String(value == null ? '' : value).split('\\n').forEach(function (line) { var l = line.trim(); if (l) out.push(l); });
        return out;
      };
      var addTo = e.add || {};
      for (var lk in addTo) {
        if (!Object.prototype.hasOwnProperty.call(addTo, lk)) continue;
        var addSource = cueValues(cue)[addTo[lk]];
        var addLine = String(addSource == null ? '' : addSource).trim();
        if (!addLine) continue;
        var added = listLines(cueValues(cue)[lk]);
        if (added.indexOf(addLine) === -1) added.push(addLine);
        stage(lk, added.join('\\n'));
      }
      var removeFrom = e.remove || {};
      for (var rk in removeFrom) {
        if (!Object.prototype.hasOwnProperty.call(removeFrom, rk)) continue;
        var removeSource = cueValues(cue)[removeFrom[rk]];
        var removeLine = String(removeSource == null ? '' : removeSource).trim();
        var kept = listLines(cueValues(cue)[rk]);
        var at = removeLine ? kept.lastIndexOf(removeLine) : -1;
        if (at === -1) continue;
        kept.splice(at, 1);
        stage(rk, kept.join('\\n'));
      }
      var eventRow = { graphic: cue.graphic, stream: 'program', msg: payload ? { t: 'event', event: e.event, payload: payload } : { t: 'event', event: e.event } };
      // A CLOCK VERB writes the clock's own value around its event row, in one batch so the
      // relay's order is the order the renderer applies. The value is also STAGED into the cue's
      // draft, which is what puts it on every later ⟳ TAKE and ✎ Update: a stamped value is
      // idempotent, so re-sending it a minute later still resolves to the right second, where a
      // plain snapshot dragged a running clock back to it on every score bump.
      var effect = clockEffectFor(g, cue, e.event, Date.now());
      var items = [];
      if (effect) {
        if (!drafts[cue.id]) drafts[cue.id] = {};
        drafts[cue.id][effect.field] = effect.value;
        var cd = {};
        cd[effect.field] = effect.value;
        var clockRow = { graphic: cue.graphic, stream: 'program', msg: { t: 'update', data: cd } };
        if (effect.when === 'before') items.push(clockRow);
        items.push(eventRow);
        if (effect.when === 'after') items.push(clockRow);
        if (clockBox) clockBox.value = clockPlain(effect.value);
      } else {
        items.push(eventRow);
      }
      send(items);
      feed('⚡ ' + e.label + ': ' + cue.graphic);
    };
    return btn;
  }
}

function tick() {
  var s = Math.floor((Date.now() - started) / 1000);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  document.getElementById('clock').textContent =
    pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
}
setInterval(tick, 1000);

// ── Boot: relay first (the controller is nothing without it), then follow the log. ──
fetch('/relay/ping')
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (d) {
    if (!d || !d.ok) throw new Error('no relay');
    relayOk = true;
    cursor = d.head || 0;
    var mode = document.getElementById('mode');
    mode.textContent = '● SHOW';
    mode.className = 'mode on';
    setInterval(poll, 400);
  })
  .catch(function () {
    document.getElementById('mode').textContent = '○ NO RELAY';
    document.getElementById('nolisten').style.display = 'block';
  });
paint();
</script>
</body>
</html>`;
}
