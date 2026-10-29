#!/usr/bin/env node
// Build the stinger review rig: one standalone page per corpus stinger, each able to swap
// between the five brand marks live, plus a contact sheet with one shared scrubber.
//
// WHY THIS EXISTS: the corpus stingers (src/ai/video/corpus/stingers) are the anchor arm of
// every later blind gallery, and being able to scrub one back and forth is the only cheap way
// to judge whether its timing works before anything is rendered.
//
// WHY ONE PAGE PER STINGER AND NOT ONE PER MARK: the first version of this rig wrote 3 x 5
// pages, and the owner's verdict was that four of every five added nothing - the marks were
// all used the same way, so the extra pages showed the same animation with a different
// picture in it. A mark PICKER on one page answers the brand-swap question in one place, and
// the reviewer's attention stays on the motion.
//
// Zero tokens, no dev server, no browser automation - it writes files and stops. Open
// stinger-review-out/index.html in a browser.
//
// WHAT IT CANNOT TELL YOU: whether the head and tail frames are PIXEL empty and whether the
// cut window is PIXEL opaque. Those are machine gates measured on rendered frames and they
// are a separate work item (plan §4.2). Per the plan's own rule, a MOTION verdict comes from
// a rendered MP4, never from a scrubbed browser pane.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'src/ai/video/corpus/stingers');
const OUT = path.join(ROOT, 'stinger-review-out');

/**
 * The five brand marks of the swap set (benchmarks/video/v1/marks/MARKS.md). Four are reused
 * from the Pro spike rather than duplicated.
 *
 * Each brings its own field colour, and that is the whole tone answer now that no stinger
 * puts a mark on a plate (plan §2.4): a mark with dark ink asks for a light field, one with
 * light ink asks for a dark field, and the brand supplies both together. Framing the mark in
 * a box instead would make every field work and every mark look like a sticker.
 */
const MARKS = [
  {
    id: 'aldervale-institute',
    name: 'The Aldervale Institute',
    shape: 'compact monogram, 1:1, dark navy ink',
    file: 'benchmarks/pro/v1/spike/marks/aldervale-institute.svg',
    deep: '#EDEAE3', accent: '#B08D57', ink: '#16233F',
  },
  {
    id: 'kestrel-athletic',
    name: 'Kestrel Athletic',
    shape: 'wide wordmark, 4.17:1, volt ink',
    file: 'benchmarks/pro/v1/spike/marks/kestrel-athletic.svg',
    deep: '#12161A', accent: '#C8F531', ink: '#F5F7F2',
  },
  {
    id: 'sunbeam',
    name: 'Sunbeam',
    shape: 'square emblem with fine spokes, 1:1',
    file: 'benchmarks/pro/v1/spike/marks/sunbeam.svg',
    deep: '#241004', accent: '#FF7A1A', ink: '#FFF6EA',
  },
  {
    id: 'the-ledger',
    name: 'The Ledger',
    shape: 'tall, brings its own opaque field, 0.8:1',
    file: 'benchmarks/pro/v1/spike/marks/the-ledger.svg',
    deep: '#EDE9E1', accent: '#C4462F', ink: '#1A1A1A',
  },
  {
    id: 'northbridge-community-broadcasting',
    name: 'Northbridge Community Broadcasting',
    shape: 'long-name lockup, 7.5:1, light ink',
    file: 'benchmarks/video/v1/marks/northbridge-community-broadcasting.svg',
    deep: '#0C2233', accent: '#4FA3D1', ink: '#F2F5F8',
  },
];

/** The bundled video faces, from the ONE source that declares them (both files of each face). */
async function videoFontFaceCss() {
  const { videoFontFaceCss: faces } = await import(pathToFileURL(path.join(ROOT, 'src/video/videoFonts.ts')).href);
  return faces((file) => `data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'public/fonts', file)).toString('base64')}`);
}

const markPayload = () =>
  MARKS.map((m) => ({
    id: m.id,
    name: m.name,
    shape: m.shape,
    deep: m.deep,
    accent: m.accent,
    ink: m.ink,
    src: `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, m.file)).toString('base64')}`,
  }));

/**
 * The review chrome injected into each composed page. The fonts and GSAP are INLINED rather
 * than linked: a review page has to survive being opened straight off disk or handed to a
 * viewer that snapshots it, and both a relative <script src> and a file:// font request die
 * there - which reads as "the composition is broken" rather than "the rig is". Same reason
 * hyperframes/compose.ts inlines them for the real preview.
 */
function reviewHead(assets) {
  return `
<style>${assets.fontCss}</style>
<script>${assets.gsap}</script>
<style>
  /* The backdrop is on <html>, so <body> stays transparent and the composition's own alpha
     is what you are looking at. */
  html { height: 100%; }
  html.bg-checker { background: repeating-conic-gradient(#333a44 0 25%, #21262e 0 50%) 0 0 / 64px 64px; }
  html.bg-picture {
    background:
      radial-gradient(60% 80% at 22% 26%, #4d7fa8 0%, rgba(77,127,168,0) 60%),
      radial-gradient(70% 90% at 82% 72%, #a8703f 0%, rgba(168,112,63,0) 62%),
      linear-gradient(168deg, #6f8aa0 0%, #2c3a46 52%, #10161c 100%);
  }
  html.bg-white { background: #ffffff; }
  body { background: transparent; transform-origin: top left; }
  #rig { position: fixed; right: 14px; top: 14px; z-index: 99; width: 340px;
    font: 12px/1.45 "Segoe UI", system-ui, sans-serif; color: #e6edf3;
    background: rgba(13,17,23,0.94); border: 1px solid #30363d; border-radius: 8px; padding: 12px 14px; }
  #rig h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa7b4; }
  #rig button, #rig select { background: #21262d; color: #e6edf3; border: 1px solid #30363d;
    border-radius: 6px; padding: 5px 9px; cursor: pointer; }
  #rig .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  #mark-shape { color: #7d8794; margin-bottom: 8px; }
  #geo-out { margin-top: 8px; white-space: pre-wrap; font-family: Consolas, monospace; font-size: 11px; }
  #geo-out .ok { color: #56d364; }
  #geo-out .bad { color: #ff7b72; }
  #rig.hidden { display: none; }
</style>`;
}

const RIG_MARKUP = `
<div id="rig">
  <h3>Review</h3>
  <div class="row"><select id="mark-pick"></select></div>
  <div id="mark-shape"></div>
  <div class="row">
    <button id="geo-run">geometry check</button>
    <select id="geo-fps"><option>25</option><option>30</option><option selected>50</option><option>60</option></select>
    <button id="rig-hide">hide</button>
  </div>
  <div id="geo-out">Sampled hit-test over the declared cut window, not the pixel gate.</div>
</div>`;

function rigScript(marks) {
  return `
<script>
  window.__MARKS = ${JSON.stringify(marks)};
  // The rig drives the composition's own paused timeline, exactly as the driver and the
  // renderer do: seek, never run. Same t always gives the same pixels.
  (function () {
    var tl = (window.__timelines || {}).main;
    var de = document.documentElement;
    var root = document.getElementById('root');
    var dur = root ? Number(root.getAttribute('data-duration')) || 2 : 2;
    var cutStart = root ? Number(root.getAttribute('data-cut-start')) : NaN;
    var cutEnd = root ? Number(root.getAttribute('data-cut-end')) : NaN;

    function scale(s) { document.body.style.transform = 'scale(' + s + ')'; }
    function seek(t) { if (tl) tl.time(Math.max(0, Math.min(dur, t)), true); }
    function background(name) { de.className = 'bg-' + name; }

    // Swapping a mark is exactly what the platform does: set the image variable's bound
    // elements, and set the colour variables on the composition root.
    function setMark(id) {
      var m = null;
      for (var i = 0; i < window.__MARKS.length; i++) if (window.__MARKS[i].id === id) m = window.__MARKS[i];
      if (!m) return;
      var imgs = document.querySelectorAll('[data-var-src="logo"]');
      for (var j = 0; j < imgs.length; j++) imgs[j].setAttribute('src', m.src);
      root.style.setProperty('--brandDeep', m.deep);
      root.style.setProperty('--brandAccent', m.accent);
      root.style.setProperty('--brandInk', m.ink);
      var pick = document.getElementById('mark-pick');
      if (pick) { pick.value = id; document.getElementById('mark-shape').textContent = m.shape; }
    }

    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.kind === 'scrub') seek(d.t);
      else if (d.kind === 'bg') background(d.name);
      else if (d.kind === 'mark') setMark(d.id);
      else if (d.kind === 'scale') scale(d.scale);
    });

    var pick = document.getElementById('mark-pick');
    for (var k = 0; k < window.__MARKS.length; k++) {
      var o = document.createElement('option');
      o.value = window.__MARKS[k].id; o.textContent = window.__MARKS[k].name;
      pick.appendChild(o);
    }
    pick.addEventListener('change', function () { setMark(pick.value); });
    setMark(window.__MARKS[0].id);

    var params = new URLSearchParams(location.search);
    var wantMark = params.get('mark');
    if (wantMark) setMark(wantMark);
    // BARE mode is what a capture loads: no backdrop, no chrome, nothing but the composition
    // on a transparent page, so a screenshot taken with omitBackground carries the
    // composition's REAL alpha. A checkerboard would be measured as part of the graphic.
    var bare = params.get('bare');
    if (bare) {
      de.className = '';
      de.style.background = 'transparent';
      document.body.style.background = 'transparent';
      document.getElementById('rig').remove();
    } else {
      background('checker');
    }
    var embedScale = params.get('scale');
    scale(Number(embedScale) || 1);
    seek(0);
    // A capture drives the timeline through this, so it never has to know how the composition
    // registers itself, and it seeks exactly the way the renderer does.
    window.__stingerSeek = seek;
    window.__stingerMark = setMark;
    // The contact sheet embeds this page at a third of size; the panel belongs to the
    // full-size view, where the viewport is big enough for the check to mean anything.
    var rigEl = document.getElementById('rig');
    if (embedScale && rigEl) rigEl.classList.add('hidden');
    // Bare mode has no panel to wire, and the in-page check is the weaker instrument anyway -
    // a capture measures real pixels rather than hit-testing boxes.
    if (bare) return;

    // ── The geometry check ──────────────────────────────────────────────────────
    // It answers two of the three §2.2 questions with the strongest instrument a plain
    // browser page has, and it is HONEST about which:
    //   - EMPTY HEAD/TAIL is proved exactly: an axis-aligned bounding box is a SUPERSET of
    //     the painted area, so "no box touches the frame" leaves nothing to argue with.
    //   - CUT-WINDOW COVERAGE is SAMPLED: elementsFromPoint honours every transform and clip
    //     exactly, but it is asked on a 16 px grid, so it cannot see a hairline seam. That is
    //     what the per-pixel gate on rendered frames is for (plan §4.2). This check is what
    //     catches the coarse failures - a window declared where the design is not covering.
    function eff(el) {
      var o = 1, n = el;
      while (n && n !== de) {
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        o *= Number(cs.opacity); n = n.parentElement;
      }
      return o;
    }
    function opaqueBg(el) {
      var m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(el).backgroundColor);
      if (!m) return false;
      var p = m[1].split(',').map(Number);
      return (p.length < 4 || p[3] === 1) && eff(el) === 1;
    }
    function paints(el) {
      var cs = getComputedStyle(el);
      if (el.tagName === 'IMG') return true;
      if (cs.backgroundImage !== 'none') return true;
      var m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor);
      if (m) { var p = m[1].split(',').map(Number); if (p.length < 4 || p[3] > 0) return true; }
      if (cs.boxShadow && cs.boxShadow !== 'none') return true;
      if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') return true;
      for (var i = 0; i < el.childNodes.length; i++) {
        var ch = el.childNodes[i];
        if (ch.nodeType === 3 && ch.textContent.trim()) return true;
      }
      return false;
    }
    function run(fps) {
      // A pane with no layout reports a zero-sized viewport, and every loop below then
      // completes without testing anything - a false pass that looks exactly like a real one.
      if (de.clientWidth < 400 || de.clientHeight < 260) {
        return { error: 'viewport ' + de.clientWidth + 'x' + de.clientHeight +
          ' - open this page at a normal window size; a zero-layout pane would report a false pass' };
      }
      var prevO = de.style.overflow, prevT = document.body.style.transform;
      de.style.overflow = 'hidden';
      var S = Math.min(de.clientWidth / 1920, de.clientHeight / 1080) * 0.995;
      document.body.style.transform = 'scale(' + S + ')';
      var W = 1920 * S, H = 1080 * S, step = 16 * S;
      var frames = Math.round(dur * fps);
      var res = { fps: fps, frames: frames, points: 0, head: null, tail: null, worst: null };

      function paintedAt(t) {
        seek(t);
        var hits = [], all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (!paints(el) || eff(el) < 0.004) continue;
          var r = el.getBoundingClientRect();
          if (r.width < 0.01 || r.height < 0.01) continue;
          if (r.right > 0.5 && r.left < W - 0.5 && r.bottom > 0.5 && r.top < H - 0.5) {
            var name = el.id || el.className || el.tagName;
            if (hits.indexOf(name) < 0) hits.push(name);
          }
        }
        return hits;
      }
      function gapsAt(t) {
        seek(t);
        var gaps = 0, first = null, pts = 0;
        for (var y = 0.6; y < H; y += step) for (var x = 0.6; x < W; x += step) {
          pts++;
          var ok = false, stack = document.elementsFromPoint(x, y);
          for (var i = 0; i < stack.length; i++) {
            if (stack[i].id === 'root') break;
            if (opaqueBg(stack[i])) { ok = true; break; }
          }
          if (!ok) { gaps++; if (!first) first = [Math.round(x / S), Math.round(y / S)]; }
        }
        res.points = pts;
        return { gaps: gaps, first: first };
      }

      res.head = paintedAt(0);
      res.tail = paintedAt((frames - 1) / fps);
      var f0 = Math.ceil(cutStart * fps), f1 = Math.floor(cutEnd * fps);
      for (var f = f0; f <= f1; f++) {
        var g = gapsAt(f / fps);
        if (!res.worst || g.gaps > res.worst.gaps) res.worst = { frame: f, gaps: g.gaps, first: g.first };
      }
      res.window = [f0, f1];
      seek(0);
      document.body.style.transform = prevT; de.style.overflow = prevO;
      return res;
    }

    var out = document.getElementById('geo-out');
    document.getElementById('rig-hide').addEventListener('click', function () {
      document.getElementById('rig').classList.add('hidden');
    });
    document.getElementById('geo-run').addEventListener('click', function () {
      out.textContent = 'running...';
      setTimeout(function () {
        var fps = Number(document.getElementById('geo-fps').value);
        var r = run(fps);
        if (r.error) { out.innerHTML = '<span class="bad">' + r.error + '</span>'; return; }
        var line = function (ok, text) { return '<span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'PASS' : 'FAIL') + '</span>  ' + text; };
        out.innerHTML = [
          fps + ' fps, ' + r.frames + ' frames, ' + r.points + ' samples per frame',
          line(r.head.length === 0, 'frame 0 empty' + (r.head.length ? ' - painting: ' + r.head.join(', ') : '')),
          line(r.tail.length === 0, 'frame ' + (r.frames - 1) + ' empty' + (r.tail.length ? ' - painting: ' + r.tail.join(', ') : '')),
          line(r.worst && r.worst.gaps === 0,
            'cut window frames ' + r.window[0] + '-' + r.window[1] + ' fully covered' +
            (r.worst && r.worst.gaps ? ' - worst frame ' + r.worst.frame + ', ' + r.worst.gaps + ' uncovered samples, first at ' + r.worst.first : '')),
          line(tl.duration() <= (r.frames - 1) / fps, 'timeline ends at ' + tl.duration().toFixed(3) + ' s, last frame at ' + ((r.frames - 1) / fps).toFixed(3) + ' s'),
        ].join('\\n');
      }, 30);
    });
  })();
</script>`;
}

function composePage(source, assets, marks) {
  let html = source.replace(/<head[^>]*>/i, (m) => `${m}\n${reviewHead(assets)}`);
  html = html.replace(/<\/body>/i, `${RIG_MARKUP}\n${rigScript(marks)}\n</body>`);
  return html;
}

function indexPage(stingers, marks) {
  const cells = stingers
    .map(
      (s) => `
    <figure class="cell">
      <iframe src="${s.id}.html?scale=0.3333" width="640" height="360" title="${s.id}" scrolling="no"></iframe>
      <figcaption><a href="${s.id}.html" target="_blank">${s.id}</a><span>cut window ${s.cutStart}s to ${s.cutEnd}s</span></figcaption>
    </figure>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Stinger corpus review</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 26px 30px 60px; background: #0d1117; color: #e6edf3;
         font: 14px/1.5 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p.lead { margin: 0 0 20px; color: #9aa7b4; max-width: 82ch; }
  .controls { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 16px;
              flex-wrap: wrap; padding: 13px 16px; margin-bottom: 24px; background: #161b22;
              border: 1px solid #262d36; border-radius: 8px; }
  .controls label { display: flex; align-items: center; gap: 8px; color: #9aa7b4; }
  #time { width: 460px; }
  output { font-variant-numeric: tabular-nums; color: #f6a623; min-width: 150px; }
  button, select { background: #21262d; color: #e6edf3; border: 1px solid #30363d;
                   border-radius: 6px; padding: 6px 11px; cursor: pointer; }
  button:hover { border-color: #f6a623; }
  .grid { display: flex; gap: 16px; flex-wrap: wrap; }
  .cell { margin: 0; }
  iframe { border: 1px solid #262d36; border-radius: 4px; display: block; background: #0d1117; }
  figcaption { display: flex; flex-direction: column; margin-top: 6px; font-size: 12px; width: 640px; }
  figcaption a { color: #e6edf3; }
  figcaption span { color: #7d8794; }
</style>
</head>
<body>
<h1>Stinger corpus review</h1>
<p class="lead">Scrub all three at once. The slider seeks each composition's own paused
timeline, so what you see at a given time is what the renderer would produce at that frame.
The mark picker swaps the logo and the brand palette everywhere. Open a single stinger to get
its geometry check. <strong>Motion verdicts still come from a rendered MP4</strong> - a
scrubbed pane is for structure, timing and brand fit; pixel-level head/tail alpha and
cut-window coverage are machine gates and are not measured here.</p>

<div class="controls">
  <label>t <input id="time" type="range" min="0" max="2" step="0.001" value="0" /></label>
  <output id="readout">0.000 s - frame 0/100</output>
  <label>fps <select id="fps"><option>25</option><option>30</option><option selected>50</option><option>60</option></select></label>
  <button data-step="-1">&#8592; frame</button>
  <button data-step="1">frame &#8594;</button>
  <button data-jump="0">head</button>
  <button data-jump="0.46">cut in</button>
  <button data-jump="1.12">cut out</button>
  <button data-jump="1.92">tail</button>
  <label>mark <select id="mark">${marks.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select></label>
  <label>backdrop <select id="bg">
    <option value="checker">checkerboard</option>
    <option value="picture">live picture</option>
    <option value="white">white</option>
  </select></label>
</div>
<div class="grid">${cells}</div>
<script>
  var time = document.getElementById('time');
  var readout = document.getElementById('readout');
  var fpsSel = document.getElementById('fps');
  var bgSel = document.getElementById('bg');
  var markSel = document.getElementById('mark');

  function post(msg) {
    document.querySelectorAll('iframe').forEach(function (f) {
      if (f.contentWindow) f.contentWindow.postMessage(msg, '*');
    });
  }
  function render() {
    var t = Number(time.value), fps = Number(fpsSel.value);
    readout.textContent = t.toFixed(3) + ' s - frame ' + Math.round(t * fps) + '/' + Math.round(2 * fps);
    post({ kind: 'scrub', t: t });
  }
  time.addEventListener('input', render);
  fpsSel.addEventListener('change', render);
  bgSel.addEventListener('change', function () { post({ kind: 'bg', name: bgSel.value }); });
  markSel.addEventListener('change', function () { post({ kind: 'mark', id: markSel.value }); });
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      time.value = String(Number(time.value) + Number(b.dataset.step) / Number(fpsSel.value));
      render();
    });
  });
  document.querySelectorAll('[data-jump]').forEach(function (b) {
    b.addEventListener('click', function () { time.value = b.dataset.jump; render(); });
  });
  // Iframes finish loading after this script runs; re-post once they are all up.
  window.addEventListener('load', function () {
    render();
    post({ kind: 'bg', name: bgSel.value });
    post({ kind: 'mark', id: markSel.value });
  });
</script>
</body>
</html>
`;
}

async function main() {
  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.html')).sort();
  if (files.length === 0) throw new Error(`no compositions in ${CORPUS}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const assets = {
    fontCss: await videoFontFaceCss(),
    gsap: fs.readFileSync(path.join(ROOT, 'src/assets/gsap.min.js'), 'utf8'),
  };
  const marks = markPayload();

  const stingers = [];
  for (const file of files) {
    const id = file.replace(/\.html$/, '');
    const source = fs.readFileSync(path.join(CORPUS, file), 'utf8');
    const cut = /data-cut-start="([\d.]+)"[\s\S]*?data-cut-end="([\d.]+)"/.exec(source);
    if (!cut) throw new Error(`${file} declares no data-cut-start/data-cut-end (plan §2.2)`);
    if (/brandPlate/.test(source)) throw new Error(`${file} still declares a logo plate - the mark goes on the field (plan §2.4)`);
    stingers.push({ id, cutStart: cut[1], cutEnd: cut[2] });
    fs.writeFileSync(path.join(OUT, `${id}.html`), composePage(source, assets, marks));
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(stingers, marks));
  console.log(`${stingers.length} stingers, ${marks.length} marks switchable in each`);
  console.log(`open ${path.join(OUT, 'index.html')}`);
}

await main();
