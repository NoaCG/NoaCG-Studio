/**
 * News Package - Live Poll Lower-Third Graphic (graphics/news/live-poll)
 * Broadcast lower-third used to gauge live poll/stat results with a 15-degree skewed
 * header bar on top and stacked 15-degree skewed stat rows below. Displays option text
 * and numbers as horizontal bars filled from left to right, with 2px skeuomorphic
 * beveled borders, idle accent pulse & border glow, and SVG mask + SMIL swipe animations.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const SKEW_DEG = 15;
const TAN_15 = Math.tan((SKEW_DEG * Math.PI) / 180); // ~0.267949192
const COS_15 = Math.cos((SKEW_DEG * Math.PI) / 180); // ~0.965925826

// Live-Poll lower-third geometry in 1920x1080 SVG coordinate space
const H_HEADER = 58;
const DX_HEADER = H_HEADER * TAN_15; // ~15.54
const W_ACCENT = 18;
const GAP_X = 6;
const GAP_Y = 5;

const H_ROW = 48;
const DX_ROW = H_ROW * TAN_15; // ~12.86
const H_BAR = 26;
const BAR_TRACK_W = 440;
const VALUE_COL_W = 118;

const PAD_HEADER_X = 28;
const PAD_ROW_LEFT = 26;
const PAD_ROW_RIGHT = 24;
const MIN_LABEL_COL_W = 280;

const EASE_OUT_SPLINE = "0.08 0.82 0.17 1";

const DEFAULT_STATE = {
  title: "LIVE VIEWER POLL • ECONOMIC OUTLOOK",
  items: [
    { text: "STRONGLY APPROVE", number: 54 },
    { text: "SOMEWHAT APPROVE", number: 29 },
    { text: "UNDECIDED / NEUTRAL", number: 17 },
  ],
  unit: "%",
  position: "bottom-left",
  primaryColor: "#0f2b5b",
  secondaryColor: "#162032",
  accentColor: "#d32f2f",
};

const STYLE_TEXT = `
:host {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
  font-family: "Barlow Condensed", "Oswald", "Roboto Condensed", "Arial Narrow", "Impact", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  visibility: hidden;
}

.scene.visible {
  opacity: 1;
  visibility: visible;
}

svg.canvas {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.header-text {
  font-family: "Barlow Condensed", "Oswald", "Roboto Condensed", "Arial Narrow", "Segoe UI", sans-serif;
  font-size: 34px;
  font-weight: 800;
  fill: #ffffff;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  dominant-baseline: central;
  filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.72));
}

.row-label-text {
  font-family: "Barlow Condensed", "Oswald", "Roboto Condensed", "Arial Narrow", "Segoe UI", sans-serif;
  font-size: 24px;
  font-weight: 700;
  fill: #f2f6fc;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  dominant-baseline: central;
  filter: drop-shadow(0px 1.5px 3px rgba(0, 0, 0, 0.75));
}

.row-value-text {
  font-family: "Barlow Condensed", "Oswald", "Roboto Condensed", "Arial Narrow", "Segoe UI", sans-serif;
  font-size: 27px;
  font-weight: 800;
  fill: #ffffff;
  letter-spacing: 1px;
  dominant-baseline: central;
  text-anchor: end;
  filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.78));
}
`;

function adjustHexColor(hex, percent) {
  const cleaned = String(hex || "#0f2b5b").replace(/^#/, "");
  const num = parseInt(
    cleaned.length === 3
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned,
    16
  );
  if (Number.isNaN(num)) return "#0f2b5b";

  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  if (percent > 0) {
    r = Math.round(r + (255 - r) * (percent / 100));
    g = Math.round(g + (255 - g) * (percent / 100));
    b = Math.round(b + (255 - b) * (percent / 100));
  } else {
    const factor = 1 + percent / 100;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
  }

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function computeSkewedBox(x, y, w, h) {
  const safeW = Math.max(0, w);
  const dx = h * TAN_15;

  const tl = [x + dx, y];
  const tr = [x + dx + safeW, y];
  const br = [x + safeW, y + h];
  const bl = [x, y + h];

  const points = `${tl[0].toFixed(2)},${tl[1].toFixed(2)} ${tr[0].toFixed(2)},${tr[1].toFixed(2)} ${br[0].toFixed(2)},${br[1].toFixed(2)} ${bl[0].toFixed(2)},${bl[1].toFixed(2)}`;

  const sheenH = h * 0.46;
  const sheenDx = (h - sheenH) * TAN_15;
  const stl = tl;
  const str = tr;
  const sbr = [x + sheenDx + safeW, y + sheenH];
  const sbl = [x + sheenDx, y + sheenH];
  const sheenPoints = `${stl[0].toFixed(2)},${stl[1].toFixed(2)} ${str[0].toFixed(2)},${str[1].toFixed(2)} ${sbr[0].toFixed(2)},${sbr[1].toFixed(2)} ${sbl[0].toFixed(2)},${sbl[1].toFixed(2)}`;

  const insetPerp = 1 / COS_15;
  const insetSlope = TAN_15;

  const itl = [tl[0] - insetSlope + insetPerp, y + 1];
  const itr = [tr[0] - insetSlope - insetPerp, y + 1];
  const ibr = [br[0] + insetSlope - insetPerp, y + h - 1];
  const ibl = [bl[0] + insetSlope + insetPerp, y + h - 1];

  const lightBevel = `${ibl[0].toFixed(2)},${ibl[1].toFixed(2)} ${itl[0].toFixed(2)},${itl[1].toFixed(2)} ${itr[0].toFixed(2)},${itr[1].toFixed(2)}`;
  const shadowBevel = `${itr[0].toFixed(2)},${itr[1].toFixed(2)} ${ibr[0].toFixed(2)},${ibr[1].toFixed(2)} ${ibl[0].toFixed(2)},${ibl[1].toFixed(2)}`;
  const insetPoints = `${itl[0].toFixed(2)},${itl[1].toFixed(2)} ${itr[0].toFixed(2)},${itr[1].toFixed(2)} ${ibr[0].toFixed(2)},${ibr[1].toFixed(2)} ${ibl[0].toFixed(2)},${ibl[1].toFixed(2)}`;

  return { points, sheenPoints, lightBevel, shadowBevel, insetPoints };
}

class NewsLivePollGraphic extends HTMLElement {
  constructor() {
    super();
    this._state = { ...DEFAULT_STATE };
    this._currentStep = undefined;
    this._isVisible = false;
    this._timers = [];
    this._rowRefs = [];
    this._layout = {
      headerX: W_ACCENT + GAP_X,
      headerY: 0,
      headerW: 720,
      rowW: 860,
      rows: [],
    };

    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE_TEXT;

    const scene = document.createElement("div");
    scene.className = "scene";

    const svg = this._buildSvg();
    scene.appendChild(svg);
    root.append(style, scene);

    this._scene = scene;
    this._svg = svg;
  }

  connectedCallback() {}

  _buildSvg() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "canvas");
    svg.setAttribute("viewBox", "0 0 1920 1080");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    svg.innerHTML = `
      <defs id="poll-defs">
        <filter id="box-drop-shadow" x="-10%" y="-20%" width="130%" height="160%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#000000" flood-opacity="0.55" />
        </filter>

        <linearGradient id="header-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop id="header-stop-0" offset="0%" stop-color="#1b4388" />
          <stop id="header-stop-1" offset="50%" stop-color="#0f2b5b" />
          <stop id="header-stop-2" offset="100%" stop-color="#081938" />
        </linearGradient>

        <linearGradient id="row-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop id="row-stop-0" offset="0%" stop-color="#24344f" />
          <stop id="row-stop-1" offset="52%" stop-color="#162032" />
          <stop id="row-stop-2" offset="100%" stop-color="#0c121d" />
        </linearGradient>

        <linearGradient id="track-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#070c14" stop-opacity="0.72" />
          <stop offset="100%" stop-color="#0c1524" stop-opacity="0.86" />
        </linearGradient>

        <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop id="accent-stop-0" offset="0%" stop-color="#ef5350" />
          <stop id="accent-stop-1" offset="50%" stop-color="#d32f2f" />
          <stop id="accent-stop-2" offset="100%" stop-color="#9a1b1b" />
        </linearGradient>

        <linearGradient id="accent-pulse-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop id="accent-pulse-stop-0" offset="0%" stop-color="#ff8a80" />
          <stop id="accent-pulse-stop-1" offset="50%" stop-color="#ff5252" />
          <stop id="accent-pulse-stop-2" offset="100%" stop-color="#e53935" />
        </linearGradient>

        <filter id="accent-idle-glow" x="-60%" y="-40%" width="220%" height="180%">
          <feGaussianBlur stdDeviation="8" result="blur" />
        </filter>

        <filter id="border-idle-glow" x="-15%" y="-35%" width="130%" height="170%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id="border-shimmer-grad" gradientUnits="userSpaceOnUse" x1="-300" y1="0" x2="100" y2="120">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.04" />
          <stop id="border-glow-tint" offset="50%" stop-color="#b3d4ff" stop-opacity="0.46" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
          <animateTransform
            id="border-shimmer-anim"
            attributeName="gradientTransform"
            type="translate"
            from="-300 0"
            to="1150 0"
            dur="3.6s"
            repeatCount="indefinite"
            begin="indefinite"
          />
        </linearGradient>

        <linearGradient id="plate-sheen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
        </linearGradient>

        <linearGradient id="bevel-light" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.62">
            <animate
              id="bevel-pulse-stop-0"
              attributeName="stop-opacity"
              values="0.58;0.78;0.58"
              keyTimes="0;0.5;1"
              dur="2.8s"
              repeatCount="indefinite"
              begin="indefinite"
            />
          </stop>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.28">
            <animate
              id="bevel-pulse-stop-1"
              attributeName="stop-opacity"
              values="0.24;0.42;0.24"
              keyTimes="0;0.5;1"
              dur="2.8s"
              repeatCount="indefinite"
              begin="indefinite"
            />
          </stop>
        </linearGradient>

        <linearGradient id="bevel-shadow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.48" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.78" />
        </linearGradient>

        <mask id="header-reveal-mask" maskUnits="userSpaceOnUse" x="-200" y="-200" width="2400" height="800">
          <polygon id="header-mask-poly" fill="#ffffff" points="0,0 0,0 0,0 0,0">
            <animate id="header-mask-anim" attributeName="points" dur="0.46s" fill="freeze" begin="indefinite" />
          </polygon>
        </mask>

        <g id="dynamic-row-masks"></g>
      </defs>

      <!-- Hidden measurement helper -->
      <text id="measure-row-label" class="row-label-text" x="-9999" y="-9999" opacity="0"></text>

      <g id="poll-root" transform="translate(110, 740)">
        <!-- STACKED POLL ROWS -->
        <g id="rows-container"></g>

        <!-- TOP HEADER BAR -->
        <g id="header-layer">
          <g id="header-masked-group" mask="url(#header-reveal-mask)" filter="url(#box-drop-shadow)">
            <polygon id="header-bg" fill="url(#header-grad)" />
            <polygon id="header-sheen" fill="url(#plate-sheen)" />
            <polyline id="header-bevel-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" />
            <polyline id="header-bevel-light" fill="none" stroke="url(#bevel-light)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" />
            <polygon id="header-border-glow" fill="none" stroke="url(#border-shimmer-grad)" stroke-width="2" stroke-linejoin="miter" filter="url(#border-idle-glow)" opacity="0">
              <animate
                id="header-border-glow-anim"
                attributeName="opacity"
                values="0.18;0.44;0.18"
                keyTimes="0;0.5;1"
                dur="2.8s"
                repeatCount="indefinite"
                begin="indefinite"
              />
            </polygon>

            <g id="header-text-group">
              <animateTransform id="header-text-slide" attributeName="transform" type="translate" dur="0.46s" fill="freeze" begin="indefinite" />
              <text id="header-text" class="header-text" x="56" y="29">LIVE VIEWER POLL</text>
            </g>
          </g>

          <!-- Out-animation accent wiper -->
          <g id="out-wiper-group" opacity="0" filter="url(#box-drop-shadow)">
            <animate id="out-wiper-opacity" attributeName="opacity" dur="0.44s" fill="freeze" begin="indefinite" />
            <polygon id="out-wiper-bg" fill="url(#accent-grad)">
              <animate id="out-wiper-bg-anim" attributeName="points" dur="0.44s" fill="freeze" begin="indefinite" />
            </polygon>
            <polygon id="out-wiper-sheen" fill="url(#plate-sheen)">
              <animate id="out-wiper-sheen-anim" attributeName="points" dur="0.44s" fill="freeze" begin="indefinite" />
            </polygon>
            <polyline id="out-wiper-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <animate id="out-wiper-shadow-anim" attributeName="points" dur="0.44s" fill="freeze" begin="indefinite" />
            </polyline>
            <polyline id="out-wiper-light" fill="none" stroke="url(#bevel-light)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <animate id="out-wiper-light-anim" attributeName="points" dur="0.44s" fill="freeze" begin="indefinite" />
            </polyline>
          </g>

          <!-- Persistent Left Accent Bar -->
          <g id="accent-group" opacity="0" filter="url(#box-drop-shadow)">
            <animate id="accent-opacity" attributeName="opacity" dur="0.46s" fill="freeze" begin="indefinite" />
            <polygon id="accent-glow-poly" fill="url(#accent-pulse-grad)" filter="url(#accent-idle-glow)" opacity="0">
              <animate
                id="accent-glow-pulse"
                attributeName="opacity"
                values="0.1;0.6;0.1"
                keyTimes="0;0.5;1"
                dur="1.6s"
                repeatCount="indefinite"
                begin="indefinite"
              />
            </polygon>
            <polygon id="accent-bg" fill="url(#accent-grad)">
              <animate id="accent-bg-anim" attributeName="points" dur="0.46s" fill="freeze" begin="indefinite" />
            </polygon>
            <polygon id="accent-pulse-overlay" fill="url(#accent-pulse-grad)" opacity="0">
              <animate
                id="accent-overlay-pulse"
                attributeName="opacity"
                values="0;0.5;0"
                keyTimes="0;0.5;1"
                dur="1.6s"
                repeatCount="indefinite"
                begin="indefinite"
              />
            </polygon>
            <polygon id="accent-sheen" fill="url(#plate-sheen)">
              <animate id="accent-sheen-anim" attributeName="points" dur="0.46s" fill="freeze" begin="indefinite" />
            </polygon>
            <polyline id="accent-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <animate id="accent-shadow-anim" attributeName="points" dur="0.46s" fill="freeze" begin="indefinite" />
            </polyline>
            <polyline id="accent-light" fill="none" stroke="url(#bevel-light)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <animate id="accent-light-anim" attributeName="points" dur="0.46s" fill="freeze" begin="indefinite" />
            </polyline>
          </g>
        </g>
      </g>
    `;

    this._els = {
      rootGroup: svg.querySelector("#poll-root"),
      dynamicRowMasks: svg.querySelector("#dynamic-row-masks"),
      rowsContainer: svg.querySelector("#rows-container"),
      measureRowLabel: svg.querySelector("#measure-row-label"),

      headerStop0: svg.querySelector("#header-stop-0"),
      headerStop1: svg.querySelector("#header-stop-1"),
      headerStop2: svg.querySelector("#header-stop-2"),
      rowStop0: svg.querySelector("#row-stop-0"),
      rowStop1: svg.querySelector("#row-stop-1"),
      rowStop2: svg.querySelector("#row-stop-2"),
      accentStop0: svg.querySelector("#accent-stop-0"),
      accentStop1: svg.querySelector("#accent-stop-1"),
      accentStop2: svg.querySelector("#accent-stop-2"),
      accentPulseStop0: svg.querySelector("#accent-pulse-stop-0"),
      accentPulseStop1: svg.querySelector("#accent-pulse-stop-1"),
      accentPulseStop2: svg.querySelector("#accent-pulse-stop-2"),

      headerMaskPoly: svg.querySelector("#header-mask-poly"),
      headerMaskAnim: svg.querySelector("#header-mask-anim"),
      headerBg: svg.querySelector("#header-bg"),
      headerSheen: svg.querySelector("#header-sheen"),
      headerBevelShadow: svg.querySelector("#header-bevel-shadow"),
      headerBevelLight: svg.querySelector("#header-bevel-light"),
      headerBorderGlow: svg.querySelector("#header-border-glow"),
      headerBorderGlowAnim: svg.querySelector("#header-border-glow-anim"),
      headerTextGroup: svg.querySelector("#header-text-group"),
      headerTextSlide: svg.querySelector("#header-text-slide"),
      headerText: svg.querySelector("#header-text"),

      outWiperGroup: svg.querySelector("#out-wiper-group"),
      outWiperOpacity: svg.querySelector("#out-wiper-opacity"),
      outWiperBg: svg.querySelector("#out-wiper-bg"),
      outWiperBgAnim: svg.querySelector("#out-wiper-bg-anim"),
      outWiperSheen: svg.querySelector("#out-wiper-sheen"),
      outWiperSheenAnim: svg.querySelector("#out-wiper-sheen-anim"),
      outWiperShadow: svg.querySelector("#out-wiper-shadow"),
      outWiperShadowAnim: svg.querySelector("#out-wiper-shadow-anim"),
      outWiperLight: svg.querySelector("#out-wiper-light"),
      outWiperLightAnim: svg.querySelector("#out-wiper-light-anim"),

      accentGroup: svg.querySelector("#accent-group"),
      accentOpacity: svg.querySelector("#accent-opacity"),
      accentGlowPoly: svg.querySelector("#accent-glow-poly"),
      accentGlowPulse: svg.querySelector("#accent-glow-pulse"),
      accentBg: svg.querySelector("#accent-bg"),
      accentBgAnim: svg.querySelector("#accent-bg-anim"),
      accentPulseOverlay: svg.querySelector("#accent-pulse-overlay"),
      accentOverlayPulse: svg.querySelector("#accent-overlay-pulse"),
      accentSheen: svg.querySelector("#accent-sheen"),
      accentSheenAnim: svg.querySelector("#accent-sheen-anim"),
      accentShadow: svg.querySelector("#accent-shadow"),
      accentShadowAnim: svg.querySelector("#accent-shadow-anim"),
      accentLight: svg.querySelector("#accent-light"),
      accentLightAnim: svg.querySelector("#accent-light-anim"),

      borderGlowTint: svg.querySelector("#border-glow-tint"),
      borderShimmerAnim: svg.querySelector("#border-shimmer-anim"),
      bevelPulseStop0: svg.querySelector("#bevel-pulse-stop-0"),
      bevelPulseStop1: svg.querySelector("#bevel-pulse-stop-1"),
    };

    return svg;
  }

  async load(params) {
    if (params?.data) {
      this._state = { ...this._state, ...params.data };
    }
    this._applyStateAndMeasure(false);
    this._resetToHidden();
    return { statusCode: 200 };
  }

  async dispose() {
    this._clearTimers();
    this._scene.remove();
    return { statusCode: 200 };
  }

  async playAction(params) {
    const targetStep = this._resolveTargetStep(params);
    const skipAnimation = params?.skipAnimation === true;

    if (params?.data) {
      this._state = { ...this._state, ...params.data };
    }

    this._applyStateAndMeasure(false);

    if (!this._isVisible) {
      this._animateIn(skipAnimation);
    } else {
      this._settleVisibleState();
    }

    this._currentStep = targetStep;
    return {
      statusCode: 200,
      currentStep: this._currentStep,
    };
  }

  async stopAction(params) {
    const skipAnimation = params?.skipAnimation === true;
    if (this._isVisible) {
      await this._animateOut(skipAnimation);
    } else {
      this._resetToHidden();
    }
    this._currentStep = undefined;
    return { statusCode: 200 };
  }

  async updateAction(params) {
    if (params?.data) {
      this._state = { ...this._state, ...params.data };
    }
    this._applyStateAndMeasure(this._isVisible);
    return { statusCode: 200 };
  }

  async customAction() {
    return { statusCode: 200 };
  }

  async goToTime(params) {
    const t = Number(params?.time || 0);
    if (this._svg && typeof this._svg.setCurrentTime === "function") {
      this._svg.setCurrentTime(t / 1000);
    }
    return { statusCode: 200 };
  }

  async setActionsSchedule() {
    return { statusCode: 200 };
  }

  _resolveTargetStep(params) {
    const stepCount = 1;
    const goto = params?.goto;
    const delta = typeof params?.delta === "number" ? params.delta : 1;

    if (typeof goto === "number") {
      return goto >= stepCount ? undefined : Math.max(0, goto);
    }
    const current = typeof this._currentStep === "number" ? this._currentStep : -1;
    const next = current + delta;
    return next >= stepCount ? undefined : Math.max(0, next);
  }

  _clearTimers() {
    for (const timer of this._timers) {
      clearTimeout(timer);
    }
    this._timers = [];
  }

  _normalizeItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return DEFAULT_STATE.items;
    }
    return rawItems.slice(0, 8).map((item, idx) => {
      const text = String(item?.text ?? item?.label ?? `OPTION ${idx + 1}`).trim() || `OPTION ${idx + 1}`;
      const numVal = Number(item?.number ?? item?.value ?? 0);
      const number = Number.isFinite(numVal) ? Math.max(0, numVal) : 0;
      return { text, number };
    });
  }

  _ensureRowDomCount(count) {
    if (this._rowRefs.length === count) return;

    this._els.dynamicRowMasks.innerHTML = "";
    this._els.rowsContainer.innerHTML = "";
    this._rowRefs = [];

    for (let i = 0; i < count; i++) {
      const maskEl = document.createElementNS(SVG_NS, "mask");
      maskEl.setAttribute("id", `row-reveal-mask-${i}`);
      maskEl.setAttribute("maskUnits", "userSpaceOnUse");
      maskEl.setAttribute("x", "-200");
      maskEl.setAttribute("y", "-200");
      maskEl.setAttribute("width", "2400");
      maskEl.setAttribute("height", "900");

      const maskPoly = document.createElementNS(SVG_NS, "polygon");
      maskPoly.setAttribute("fill", "#ffffff");
      maskPoly.setAttribute("points", "0,0 0,0 0,0 0,0");

      const maskAnim = document.createElementNS(SVG_NS, "animate");
      maskAnim.setAttribute("attributeName", "points");
      maskAnim.setAttribute("dur", "0.42s");
      maskAnim.setAttribute("fill", "freeze");
      maskAnim.setAttribute("begin", "indefinite");
      maskPoly.appendChild(maskAnim);
      maskEl.appendChild(maskPoly);
      this._els.dynamicRowMasks.appendChild(maskEl);

      const rowGroup = document.createElementNS(SVG_NS, "g");
      rowGroup.innerHTML = `
        <g class="row-masked" mask="url(#row-reveal-mask-${i})" filter="url(#box-drop-shadow)">
          <polygon class="row-bg" fill="url(#row-grad)" />
          <polygon class="row-sheen" fill="url(#plate-sheen)" />
          <polyline class="row-bevel-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" />
          <polyline class="row-bevel-light" fill="none" stroke="url(#bevel-light)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" />
          <polygon class="row-border-glow" fill="none" stroke="url(#border-shimmer-grad)" stroke-width="2" stroke-linejoin="miter" filter="url(#border-idle-glow)" opacity="0">
            <animate
              class="row-border-glow-anim"
              attributeName="opacity"
              values="0.18;0.44;0.18"
              keyTimes="0;0.5;1"
              dur="2.8s"
              repeatCount="indefinite"
              begin="indefinite"
            />
          </polygon>

          <g class="row-content-group">
            <animateTransform class="row-content-slide" attributeName="transform" type="translate" dur="0.42s" fill="freeze" begin="indefinite" />
            <text class="row-label-text"></text>

            <!-- Bar Track -->
            <polygon class="bar-track-bg" fill="url(#track-grad)" />
            <polyline class="bar-track-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="1.5" stroke-linecap="square" />
            <polyline class="bar-track-light" fill="none" stroke="url(#bevel-light)" stroke-width="1.5" stroke-linecap="square" />

            <!-- Left-to-Right Animated Stat Bar -->
            <polygon class="bar-fill-bg" fill="url(#accent-grad)">
              <animate class="bar-fill-bg-anim" attributeName="points" dur="0.52s" fill="freeze" begin="indefinite" />
            </polygon>
            <polygon class="bar-fill-sheen" fill="url(#plate-sheen)">
              <animate class="bar-fill-sheen-anim" attributeName="points" dur="0.52s" fill="freeze" begin="indefinite" />
            </polygon>
            <polyline class="bar-fill-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <animate class="bar-fill-shadow-anim" attributeName="points" dur="0.52s" fill="freeze" begin="indefinite" />
            </polyline>
            <polyline class="bar-fill-light" fill="none" stroke="url(#bevel-light)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <animate class="bar-fill-light-anim" attributeName="points" dur="0.52s" fill="freeze" begin="indefinite" />
            </polyline>

            <text class="row-value-text"></text>
          </g>
        </g>

        <g class="row-wiper-group" opacity="0" filter="url(#box-drop-shadow)">
          <animate class="row-wiper-opacity" attributeName="opacity" dur="0.42s" fill="freeze" begin="indefinite" />
          <polygon class="row-wiper-bg" fill="url(#accent-grad)">
            <animate class="row-wiper-bg-anim" attributeName="points" dur="0.42s" fill="freeze" begin="indefinite" />
          </polygon>
          <polygon class="row-wiper-sheen" fill="url(#plate-sheen)">
            <animate class="row-wiper-sheen-anim" attributeName="points" dur="0.42s" fill="freeze" begin="indefinite" />
          </polygon>
          <polyline class="row-wiper-shadow" fill="none" stroke="url(#bevel-shadow)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
            <animate class="row-wiper-shadow-anim" attributeName="points" dur="0.42s" fill="freeze" begin="indefinite" />
          </polyline>
          <polyline class="row-wiper-light" fill="none" stroke="url(#bevel-light)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
            <animate class="row-wiper-light-anim" attributeName="points" dur="0.42s" fill="freeze" begin="indefinite" />
          </polyline>
        </g>
      `;

      this._els.rowsContainer.appendChild(rowGroup);

      this._rowRefs.push({
        maskPoly,
        maskAnim,
        rowBg: rowGroup.querySelector(".row-bg"),
        rowSheen: rowGroup.querySelector(".row-sheen"),
        rowBevelShadow: rowGroup.querySelector(".row-bevel-shadow"),
        rowBevelLight: rowGroup.querySelector(".row-bevel-light"),
        rowBorderGlow: rowGroup.querySelector(".row-border-glow"),
        rowBorderGlowAnim: rowGroup.querySelector(".row-border-glow-anim"),
        contentGroup: rowGroup.querySelector(".row-content-group"),
        contentSlide: rowGroup.querySelector(".row-content-slide"),
        labelText: rowGroup.querySelector(".row-label-text"),
        valueText: rowGroup.querySelector(".row-value-text"),
        trackBg: rowGroup.querySelector(".bar-track-bg"),
        trackShadow: rowGroup.querySelector(".bar-track-shadow"),
        trackLight: rowGroup.querySelector(".bar-track-light"),
        barBg: rowGroup.querySelector(".bar-fill-bg"),
        barBgAnim: rowGroup.querySelector(".bar-fill-bg-anim"),
        barSheen: rowGroup.querySelector(".bar-fill-sheen"),
        barSheenAnim: rowGroup.querySelector(".bar-fill-sheen-anim"),
        barShadow: rowGroup.querySelector(".bar-fill-shadow"),
        barShadowAnim: rowGroup.querySelector(".bar-fill-shadow-anim"),
        barLight: rowGroup.querySelector(".bar-fill-light"),
        barLightAnim: rowGroup.querySelector(".bar-fill-light-anim"),
        wiperGroup: rowGroup.querySelector(".row-wiper-group"),
        wiperOpacity: rowGroup.querySelector(".row-wiper-opacity"),
        wiperBg: rowGroup.querySelector(".row-wiper-bg"),
        wiperBgAnim: rowGroup.querySelector(".row-wiper-bg-anim"),
        wiperSheen: rowGroup.querySelector(".row-wiper-sheen"),
        wiperSheenAnim: rowGroup.querySelector(".row-wiper-sheen-anim"),
        wiperShadow: rowGroup.querySelector(".row-wiper-shadow"),
        wiperShadowAnim: rowGroup.querySelector(".row-wiper-shadow-anim"),
        wiperLight: rowGroup.querySelector(".row-wiper-light"),
        wiperLightAnim: rowGroup.querySelector(".row-wiper-light-anim"),
        currentBarW: 0,
      });
    }
  }

  _measureLabelWidth(str) {
    const el = this._els.measureRowLabel;
    el.textContent = str;
    try {
      const len = el.getComputedTextLength();
      if (len && len > 0) return len;
    } catch {
      // Fallback below
    }
    return str.length * 13.5;
  }

  _applyStateAndMeasure(animateBarUpdate) {
    const { title, items, unit, primaryColor, secondaryColor, accentColor, position } = this._state;
    const els = this._els;

    // Update gradients
    els.headerStop0.setAttribute("stop-color", adjustHexColor(primaryColor, 20));
    els.headerStop1.setAttribute("stop-color", adjustHexColor(primaryColor, 0));
    els.headerStop2.setAttribute("stop-color", adjustHexColor(primaryColor, -34));

    els.rowStop0.setAttribute("stop-color", adjustHexColor(secondaryColor, 18));
    els.rowStop1.setAttribute("stop-color", adjustHexColor(secondaryColor, 0));
    els.rowStop2.setAttribute("stop-color", adjustHexColor(secondaryColor, -38));

    els.accentStop0.setAttribute("stop-color", adjustHexColor(accentColor, 22));
    els.accentStop1.setAttribute("stop-color", adjustHexColor(accentColor, 0));
    els.accentStop2.setAttribute("stop-color", adjustHexColor(accentColor, -28));

    els.accentPulseStop0.setAttribute("stop-color", adjustHexColor(accentColor, 58));
    els.accentPulseStop1.setAttribute("stop-color", adjustHexColor(accentColor, 36));
    els.accentPulseStop2.setAttribute("stop-color", adjustHexColor(accentColor, 14));
    els.borderGlowTint.setAttribute("stop-color", adjustHexColor(primaryColor, 65));

    const cleanTitle = String(title ?? "").trim() || "LIVE VIEWER POLL";
    els.headerText.textContent = cleanTitle;

    const normalizedItems = this._normalizeItems(items);
    const prevCount = this._rowRefs.length;
    this._ensureRowDomCount(normalizedItems.length);
    const countChanged = prevCount !== normalizedItems.length;

    // Measure header text width
    let measuredHeaderW = 0;
    try {
      measuredHeaderW = els.headerText.getComputedTextLength();
    } catch {
      measuredHeaderW = cleanTitle.length * 19;
    }
    if (!measuredHeaderW || measuredHeaderW < 10) {
      measuredHeaderW = cleanTitle.length * 19;
    }

    // Measure max label width across all poll items
    let maxLabelW = MIN_LABEL_COL_W;
    for (const item of normalizedItems) {
      const w = Math.ceil(this._measureLabelWidth(item.text) + 28);
      if (w > maxLabelW) maxLabelW = w;
    }
    const labelColW = Math.min(460, maxLabelW);

    const rowW = PAD_ROW_LEFT + labelColW + BAR_TRACK_W + VALUE_COL_W + PAD_ROW_RIGHT;
    const headerX = W_ACCENT + GAP_X;
    const headerY = 0;
    const headerW = Math.max(
      rowW - W_ACCENT - GAP_X,
      Math.ceil(measuredHeaderW + PAD_HEADER_X * 2)
    );

    els.headerText.setAttribute("x", (headerX + DX_HEADER * 0.5 + PAD_HEADER_X).toFixed(1));
    els.headerText.setAttribute("y", (headerY + H_HEADER / 2).toFixed(1));

    const headerGeom = computeSkewedBox(headerX, headerY, headerW, H_HEADER);
    this._applyBoxGeometry(
      els.headerBg,
      els.headerSheen,
      els.headerBevelShadow,
      els.headerBevelLight,
      headerGeom,
      els.headerBorderGlow
    );

    const parkedAccentGeom = computeSkewedBox(0, headerY, W_ACCENT, H_HEADER);
    els.accentGlowPoly.setAttribute("points", parkedAccentGeom.points);
    els.accentPulseOverlay.setAttribute("points", parkedAccentGeom.points);

    // Determine max scale for horizontal bars (at least 100, or max item number if > 100)
    const maxItemNum = Math.max(...normalizedItems.map((it) => it.number), 1);
    const maxScale = maxItemNum > 100 ? maxItemNum : 100;
    const cleanUnit = String(unit ?? "%");

    const rowsLayout = [];

    for (let i = 0; i < normalizedItems.length; i++) {
      const item = normalizedItems[i];
      const ref = this._rowRefs[i];

      const rowY = H_HEADER + GAP_Y + i * (H_ROW + GAP_Y);
      // Skew-align each stacked row along the 15-degree left slant line
      const rowX = Math.round(-(rowY - H_HEADER) * TAN_15);

      const rowGeom = computeSkewedBox(rowX, rowY, rowW, H_ROW);
      this._applyBoxGeometry(
        ref.rowBg,
        ref.rowSheen,
        ref.rowBevelShadow,
        ref.rowBevelLight,
        rowGeom,
        ref.rowBorderGlow
      );

      // Position option label text
      const labelX = rowX + DX_ROW * 0.5 + PAD_ROW_LEFT;
      const centerY = rowY + H_ROW / 2;
      ref.labelText.textContent = item.text;
      ref.labelText.setAttribute("x", labelX.toFixed(1));
      ref.labelText.setAttribute("y", centerY.toFixed(1));

      // Position horizontal bar track (15-degree skewed inset slot)
      const barX = rowX + PAD_ROW_LEFT + labelColW;
      const barY = rowY + (H_ROW - H_BAR) / 2;
      const trackGeom = computeSkewedBox(barX, barY, BAR_TRACK_W, H_BAR);
      ref.trackBg.setAttribute("points", trackGeom.points);
      ref.trackShadow.setAttribute("points", trackGeom.lightBevel); // Recessed inner top/left shadow
      ref.trackLight.setAttribute("points", trackGeom.shadowBevel); // Recessed inner bottom/right highlight

      // Compute target bar fill width (left to right)
      const ratio = Math.max(0, Math.min(1, item.number / maxScale));
      const targetBarW = ratio > 0 ? Math.max(10, Math.round(BAR_TRACK_W * ratio)) : 0;

      // Format number display
      const formattedNum = Number.isInteger(item.number)
        ? `${item.number}${cleanUnit}`
        : `${item.number.toFixed(1)}${cleanUnit}`;
      const valueRightX = rowX + DX_ROW * 0.5 + rowW - PAD_ROW_RIGHT;
      ref.valueText.textContent = formattedNum;
      ref.valueText.setAttribute("x", valueRightX.toFixed(1));
      ref.valueText.setAttribute("y", centerY.toFixed(1));

      if (animateBarUpdate && !countChanged && this._isVisible) {
        const prevW = typeof ref.currentBarW === "number" ? ref.currentBarW : targetBarW;
        const fromGeom = computeSkewedBox(barX, barY, prevW, H_BAR);
        const toGeom = computeSkewedBox(barX, barY, targetBarW, H_BAR);
        this._animateSkewedBox(
          {
            bg: ref.barBgAnim,
            sheen: ref.barSheenAnim,
            shadow: ref.barShadowAnim,
            light: ref.barLightAnim,
          },
          [fromGeom, toGeom],
          "0;1",
          "0.45s",
          EASE_OUT_SPLINE
        );
      } else {
        const barGeom = computeSkewedBox(barX, barY, targetBarW, H_BAR);
        this._setStaticSkewedBox(
          {
            bg: ref.barBg,
            bgAnim: ref.barBgAnim,
            sheen: ref.barSheen,
            sheenAnim: ref.barSheenAnim,
            shadow: ref.barShadow,
            shadowAnim: ref.barShadowAnim,
            light: ref.barLight,
            lightAnim: ref.barLightAnim,
          },
          barGeom
        );
      }

      ref.currentBarW = targetBarW;
      rowsLayout.push({
        rowX,
        rowY,
        rowW,
        barX,
        barY,
        targetBarW,
      });
    }

    this._layout = {
      headerX,
      headerY,
      headerW,
      rowW,
      rows: rowsLayout,
    };

    // Position the lower-third in the broadcast safe area near the bottom of 1920x1080
    const totalH = H_HEADER + normalizedItems.length * (H_ROW + GAP_Y);
    const minX = rowsLayout.length > 0 ? rowsLayout[rowsLayout.length - 1].rowX : 0;
    const maxX = Math.max(headerX + headerW + DX_HEADER, rowW + DX_ROW);
    const visualW = maxX - minX;

    const baseY = Math.max(580, 1080 - 78 - totalH);
    let baseX = Math.round(108 - minX);
    if (position === "bottom-center") {
      baseX = Math.round((1920 - visualW) / 2 - minX);
    }

    els.rootGroup.setAttribute("transform", `translate(${baseX}, ${baseY})`);

    if (countChanged && this._isVisible) {
      this._settleVisibleState();
    }
  }

  _applyBoxGeometry(bgEl, sheenEl, shadowEl, lightEl, geom, borderGlowEl) {
    bgEl.setAttribute("points", geom.points);
    sheenEl.setAttribute("points", geom.sheenPoints);
    shadowEl.setAttribute("points", geom.shadowBevel);
    lightEl.setAttribute("points", geom.lightBevel);
    if (borderGlowEl && geom.insetPoints) {
      borderGlowEl.setAttribute("points", geom.insetPoints);
    }
  }

  _resetToHidden() {
    this._clearTimers();
    this._stopIdlePulse();
    this._isVisible = false;
    this._scene.classList.remove("visible");

    const { headerX, headerY, headerW, rows } = this._layout;
    const els = this._els;

    const emptyHeaderMask = computeSkewedBox(headerX + headerW, headerY, 0, H_HEADER).points;
    this._setStaticSvgAttr(els.headerMaskPoly, els.headerMaskAnim, "points", emptyHeaderMask);

    this._setStaticSvgAttr(els.accentGroup, els.accentOpacity, "opacity", "0");
    this._setStaticSvgAttr(els.outWiperGroup, els.outWiperOpacity, "opacity", "0");

    for (let i = 0; i < this._rowRefs.length; i++) {
      const ref = this._rowRefs[i];
      const rl = rows[i];
      if (!rl) continue;
      const emptyRowMask = computeSkewedBox(rl.rowX + rl.rowW, rl.rowY, 0, H_ROW).points;
      this._setStaticSvgAttr(ref.maskPoly, ref.maskAnim, "points", emptyRowMask);
      this._setStaticSvgAttr(ref.wiperGroup, ref.wiperOpacity, "opacity", "0");
    }
  }

  _settleVisibleState() {
    this._clearTimers();
    this._isVisible = true;
    this._scene.classList.add("visible");

    const { headerX, headerY, headerW, rows } = this._layout;
    const els = this._els;

    const fullHeaderMask = computeSkewedBox(headerX - 4, headerY - 4, headerW + 12, H_HEADER + 8).points;
    this._setStaticSvgAttr(els.headerMaskPoly, els.headerMaskAnim, "points", fullHeaderMask);

    const accentGeom = computeSkewedBox(0, headerY, W_ACCENT, H_HEADER);
    this._setStaticSkewedBox(
      {
        bg: els.accentBg,
        bgAnim: els.accentBgAnim,
        sheen: els.accentSheen,
        sheenAnim: els.accentSheenAnim,
        shadow: els.accentShadow,
        shadowAnim: els.accentShadowAnim,
        light: els.accentLight,
        lightAnim: els.accentLightAnim,
      },
      accentGeom
    );
    this._setStaticSvgAttr(els.accentGroup, els.accentOpacity, "opacity", "1");
    this._setStaticSvgAttr(els.outWiperGroup, els.outWiperOpacity, "opacity", "0");

    els.headerTextSlide.removeAttribute("values");
    els.headerTextGroup.setAttribute("transform", "translate(0 0)");

    for (let i = 0; i < this._rowRefs.length; i++) {
      const ref = this._rowRefs[i];
      const rl = rows[i];
      if (!rl) continue;
      const fullRowMask = computeSkewedBox(rl.rowX - 4, rl.rowY - 4, rl.rowW + 12, H_ROW + 8).points;
      this._setStaticSvgAttr(ref.maskPoly, ref.maskAnim, "points", fullRowMask);
      this._setStaticSvgAttr(ref.wiperGroup, ref.wiperOpacity, "opacity", "0");

      ref.contentSlide.removeAttribute("values");
      ref.contentGroup.setAttribute("transform", "translate(0 0)");

      const barGeom = computeSkewedBox(rl.barX, rl.barY, rl.targetBarW, H_BAR);
      this._setStaticSkewedBox(
        {
          bg: ref.barBg,
          bgAnim: ref.barBgAnim,
          sheen: ref.barSheen,
          sheenAnim: ref.barSheenAnim,
          shadow: ref.barShadow,
          shadowAnim: ref.barShadowAnim,
          light: ref.barLight,
          lightAnim: ref.barLightAnim,
        },
        barGeom
      );
    }

    this._startIdlePulse();
  }

  _startIdlePulse() {
    const els = this._els;
    try {
      els.accentGlowPulse.beginElement();
      els.accentOverlayPulse.beginElement();
      els.headerBorderGlowAnim.beginElement();
      els.borderShimmerAnim.beginElement();
      els.bevelPulseStop0.beginElement();
      els.bevelPulseStop1.beginElement();
      for (const ref of this._rowRefs) {
        ref.rowBorderGlowAnim.beginElement();
      }
    } catch {
      els.accentGlowPoly.setAttribute("opacity", "0.35");
      els.accentPulseOverlay.setAttribute("opacity", "0.25");
      els.headerBorderGlow.setAttribute("opacity", "0.32");
      for (const ref of this._rowRefs) {
        ref.rowBorderGlow.setAttribute("opacity", "0.32");
      }
    }
  }

  _stopIdlePulse() {
    const els = this._els;
    try {
      els.accentGlowPulse.endElement();
      els.accentOverlayPulse.endElement();
      els.headerBorderGlowAnim.endElement();
      els.borderShimmerAnim.endElement();
      els.bevelPulseStop0.endElement();
      els.bevelPulseStop1.endElement();
      for (const ref of this._rowRefs) {
        ref.rowBorderGlowAnim.endElement();
      }
    } catch {
      // Ignore if SMIL not active
    }
    els.accentGlowPoly.setAttribute("opacity", "0");
    els.accentPulseOverlay.setAttribute("opacity", "0");
    els.headerBorderGlow.setAttribute("opacity", "0");
    for (const ref of this._rowRefs) {
      ref.rowBorderGlow.setAttribute("opacity", "0");
    }
  }

  _animateIn(skipAnimation) {
    this._clearTimers();
    this._stopIdlePulse();

    if (skipAnimation) {
      this._settleVisibleState();
      return;
    }

    this._isVisible = true;
    this._scene.classList.add("visible");

    const { headerX, headerY, headerW, rows } = this._layout;
    const els = this._els;

    this._setStaticSvgAttr(els.outWiperGroup, els.outWiperOpacity, "opacity", "0");

    // Initially hide all rows on the right
    for (let i = 0; i < this._rowRefs.length; i++) {
      const ref = this._rowRefs[i];
      const rl = rows[i];
      if (!rl) continue;
      const emptyRowMask = computeSkewedBox(rl.rowX + rl.rowW, rl.rowY, 0, H_ROW).points;
      this._setStaticSvgAttr(ref.maskPoly, ref.maskAnim, "points", emptyRowMask);
      this._setStaticSvgAttr(ref.wiperGroup, ref.wiperOpacity, "opacity", "0");

      const zeroBarGeom = computeSkewedBox(rl.barX, rl.barY, 0, H_BAR);
      this._setStaticSkewedBox(
        {
          bg: ref.barBg,
          bgAnim: ref.barBgAnim,
          sheen: ref.barSheen,
          sheenAnim: ref.barSheenAnim,
          shadow: ref.barShadow,
          shadowAnim: ref.barShadowAnim,
          light: ref.barLight,
          lightAnim: ref.barLightAnim,
        },
        zeroBarGeom
      );
    }

    // 1. Header Bar + Left Accent Bar Swipe (right -> left)
    const accentStartR = computeSkewedBox(headerX + headerW, headerY, 0, H_HEADER);
    const accentFinalL = computeSkewedBox(0, headerY, W_ACCENT, H_HEADER);

    this._triggerSmil(els.accentOpacity, {
      values: "0;1;1",
      keyTimes: "0;0.1;1",
      dur: "0.46s",
      calcMode: "linear",
    });

    this._animateSkewedBox(
      {
        bg: els.accentBgAnim,
        sheen: els.accentSheenAnim,
        shadow: els.accentShadowAnim,
        light: els.accentLightAnim,
      },
      [accentStartR, accentFinalL],
      "0;1",
      "0.46s",
      EASE_OUT_SPLINE
    );

    const headerMask0 = computeSkewedBox(headerX + headerW, headerY - 3, 0, H_HEADER + 6).points;
    const headerMask1 = computeSkewedBox(headerX - 4, headerY - 3, headerW + 10, H_HEADER + 6).points;

    this._triggerSmil(els.headerMaskAnim, {
      values: `${headerMask0}; ${headerMask1}`,
      keyTimes: "0;1",
      dur: "0.46s",
      calcMode: "spline",
      keySplines: EASE_OUT_SPLINE,
    });

    this._triggerSmil(els.headerTextSlide, {
      values: "34 0; 0 0",
      keyTimes: "0;1",
      dur: "0.46s",
      calcMode: "spline",
      keySplines: EASE_OUT_SPLINE,
    });

    // 2. Staggered Poll Row Swipes (right -> left) + Left-to-Right Bar Fill
    for (let i = 0; i < this._rowRefs.length; i++) {
      const ref = this._rowRefs[i];
      const rl = rows[i];
      if (!rl) continue;

      const rowDelay = 75 + i * 65;
      const rowTimer = setTimeout(() => {
        const wRowWiper = 16;
        const rw0 = computeSkewedBox(rl.rowX + rl.rowW, rl.rowY, wRowWiper, H_ROW);
        const rw1 = computeSkewedBox(rl.rowX - wRowWiper, rl.rowY, 0, H_ROW);

        this._triggerSmil(ref.wiperOpacity, {
          values: "0;1;1;0",
          keyTimes: "0;0.08;0.88;1",
          dur: "0.42s",
          calcMode: "linear",
        });

        this._animateSkewedBox(
          {
            bg: ref.wiperBgAnim,
            sheen: ref.wiperSheenAnim,
            shadow: ref.wiperShadowAnim,
            light: ref.wiperLightAnim,
          },
          [rw0, rw1],
          "0;1",
          "0.42s",
          EASE_OUT_SPLINE
        );

        const rowMask0 = computeSkewedBox(rl.rowX + rl.rowW, rl.rowY - 3, 0, H_ROW + 6).points;
        const rowMask1 = computeSkewedBox(rl.rowX - 4, rl.rowY - 3, rl.rowW + 10, H_ROW + 6).points;

        this._triggerSmil(ref.maskAnim, {
          values: `${rowMask0}; ${rowMask1}`,
          keyTimes: "0;1",
          dur: "0.42s",
          calcMode: "spline",
          keySplines: EASE_OUT_SPLINE,
        });

        this._triggerSmil(ref.contentSlide, {
          values: "28 0; 0 0",
          keyTimes: "0;1",
          dur: "0.42s",
          calcMode: "spline",
          keySplines: EASE_OUT_SPLINE,
        });

        // Animate horizontal stat bar filling from left to right
        const bar0 = computeSkewedBox(rl.barX, rl.barY, 0, H_BAR);
        const bar1 = computeSkewedBox(rl.barX, rl.barY, rl.targetBarW, H_BAR);

        this._animateSkewedBox(
          {
            bg: ref.barBgAnim,
            sheen: ref.barSheenAnim,
            shadow: ref.barShadowAnim,
            light: ref.barLightAnim,
          },
          [bar0, bar1],
          "0;1",
          "0.56s",
          EASE_OUT_SPLINE
        );
      }, rowDelay);

      this._timers.push(rowTimer);
    }

    const totalInMs = 75 + this._rowRefs.length * 65 + 430;
    const pulseTimer = setTimeout(() => {
      if (this._isVisible) {
        this._startIdlePulse();
      }
    }, totalInMs);
    this._timers.push(pulseTimer);
  }

  _animateOut(skipAnimation) {
    this._clearTimers();
    this._stopIdlePulse();

    if (skipAnimation) {
      this._resetToHidden();
      return Promise.resolve();
    }

    const { headerX, headerY, headerW, rows } = this._layout;
    const els = this._els;

    return new Promise((resolve) => {
      const count = this._rowRefs.length;

      // 1. Swipe out poll rows from bottom to top (right -> left)
      for (let i = 0; i < count; i++) {
        const revIdx = count - 1 - i;
        const ref = this._rowRefs[revIdx];
        const rl = rows[revIdx];
        if (!rl) continue;

        const delay = i * 45;
        const t = setTimeout(() => {
          const wRowWiper = 16;
          const rw0 = computeSkewedBox(rl.rowX + rl.rowW, rl.rowY, wRowWiper, H_ROW);
          const rw1 = computeSkewedBox(rl.rowX - wRowWiper, rl.rowY, 0, H_ROW);

          this._triggerSmil(ref.wiperOpacity, {
            values: "0;1;1;0",
            keyTimes: "0;0.08;0.88;1",
            dur: "0.38s",
            calcMode: "linear",
          });

          this._animateSkewedBox(
            {
              bg: ref.wiperBgAnim,
              sheen: ref.wiperSheenAnim,
              shadow: ref.wiperShadowAnim,
              light: ref.wiperLightAnim,
            },
            [rw0, rw1],
            "0;1",
            "0.38s",
            EASE_OUT_SPLINE
          );

          const rowMaskFull = computeSkewedBox(rl.rowX - 4, rl.rowY - 3, rl.rowW + 10, H_ROW + 6).points;
          const rowMaskEmptyL = computeSkewedBox(rl.rowX, rl.rowY - 3, 0, H_ROW + 6).points;

          this._triggerSmil(ref.maskAnim, {
            values: `${rowMaskFull}; ${rowMaskEmptyL}`,
            keyTimes: "0;1",
            dur: "0.38s",
            calcMode: "spline",
            keySplines: EASE_OUT_SPLINE,
          });

          this._triggerSmil(ref.contentSlide, {
            values: "0 0; -22 0",
            keyTimes: "0;1",
            dur: "0.38s",
            calcMode: "spline",
            keySplines: EASE_OUT_SPLINE,
          });
        }, delay);

        this._timers.push(t);
      }

      // 2. Swipe Header Bar Out
      const headerOutDelay = Math.max(0, (count - 1) * 45 + 55);
      const headerTimer = setTimeout(() => {
        const outW0 = computeSkewedBox(headerX + headerW, headerY, W_ACCENT, H_HEADER);
        const outW1 = computeSkewedBox(0, headerY, 0, H_HEADER);

        this._triggerSmil(els.outWiperOpacity, {
          values: "0;1;1;0",
          keyTimes: "0;0.08;0.9;1",
          dur: "0.44s",
          calcMode: "linear",
        });

        this._animateSkewedBox(
          {
            bg: els.outWiperBgAnim,
            sheen: els.outWiperSheenAnim,
            shadow: els.outWiperShadowAnim,
            light: els.outWiperLightAnim,
          },
          [outW0, outW1],
          "0;1",
          "0.44s",
          EASE_OUT_SPLINE
        );

        const parkedAccent = computeSkewedBox(0, headerY, W_ACCENT, H_HEADER);
        const collapsedAccent = computeSkewedBox(0, headerY, 0, H_HEADER);

        this._triggerSmil(els.accentOpacity, {
          values: "1;1;0",
          keyTimes: "0;0.76;1",
          dur: "0.44s",
          calcMode: "linear",
        });

        this._animateSkewedBox(
          {
            bg: els.accentBgAnim,
            sheen: els.accentSheenAnim,
            shadow: els.accentShadowAnim,
            light: els.accentLightAnim,
          },
          [parkedAccent, parkedAccent, collapsedAccent],
          "0;0.74;1",
          "0.44s",
          `0 0 1 1; ${EASE_OUT_SPLINE}`
        );

        const headerMaskFull = computeSkewedBox(headerX - 4, headerY - 3, headerW + 10, H_HEADER + 6).points;
        const headerMaskEmptyL = computeSkewedBox(headerX, headerY - 3, 0, H_HEADER + 6).points;

        this._triggerSmil(els.headerMaskAnim, {
          values: `${headerMaskFull}; ${headerMaskEmptyL}`,
          keyTimes: "0;1",
          dur: "0.44s",
          calcMode: "spline",
          keySplines: EASE_OUT_SPLINE,
        });

        this._triggerSmil(els.headerTextSlide, {
          values: "0 0; -26 0",
          keyTimes: "0;1",
          dur: "0.44s",
          calcMode: "spline",
          keySplines: EASE_OUT_SPLINE,
        });
      }, headerOutDelay);

      const doneTimer = setTimeout(() => {
        this._resetToHidden();
        resolve();
      }, headerOutDelay + 450);

      this._timers.push(headerTimer, doneTimer);
    });
  }

  _setStaticSvgAttr(targetEl, animEl, attrName, value) {
    if (animEl) {
      animEl.removeAttribute("values");
      animEl.removeAttribute("from");
      animEl.removeAttribute("to");
    }
    targetEl.setAttribute(attrName, value);
  }

  _setStaticSkewedBox(refs, geom) {
    this._setStaticSvgAttr(refs.bg, refs.bgAnim, "points", geom.points);
    this._setStaticSvgAttr(refs.sheen, refs.sheenAnim, "points", geom.sheenPoints);
    this._setStaticSvgAttr(refs.shadow, refs.shadowAnim, "points", geom.shadowBevel);
    this._setStaticSvgAttr(refs.light, refs.lightAnim, "points", geom.lightBevel);
  }

  _animateSkewedBox(animRefs, geomFrames, keyTimes, dur, keySplines) {
    const pointsValues = geomFrames.map((g) => g.points).join("; ");
    const sheenValues = geomFrames.map((g) => g.sheenPoints).join("; ");
    const shadowValues = geomFrames.map((g) => g.shadowBevel).join("; ");
    const lightValues = geomFrames.map((g) => g.lightBevel).join("; ");

    const common = {
      keyTimes,
      dur,
      calcMode: "spline",
      keySplines,
    };

    this._triggerSmil(animRefs.bg, { ...common, values: pointsValues });
    this._triggerSmil(animRefs.sheen, { ...common, values: sheenValues });
    this._triggerSmil(animRefs.shadow, { ...common, values: shadowValues });
    this._triggerSmil(animRefs.light, { ...common, values: lightValues });
  }

  _triggerSmil(animEl, attrs) {
    if (!animEl) return;
    for (const [k, v] of Object.entries(attrs)) {
      animEl.setAttribute(k, v);
    }
    try {
      animEl.beginElement();
    } catch {
      // Fallback if beginElement is unavailable
    }
  }
}

export default NewsLivePollGraphic;
