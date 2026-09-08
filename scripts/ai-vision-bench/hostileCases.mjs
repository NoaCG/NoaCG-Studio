// The AUTHORED half of the import-analysis vision dataset - the classes the plan names and
// the house catalog structurally cannot supply, because the catalog is exactly what a
// user's imported artwork is not (docs/AI_PLATFORM_PLAN.md §8).
//
// Each case is plain HTML rendered at its own size. Text regions carry `data-role`, so the
// role is DECLARED rather than inferred from a field title, and the geometry is still read
// from the rendered DOM - a measured box beats a hand-drawn one, and the difficulty lives
// in the DESIGN, not in the labelling.
//
// HOLDOUT DISCIPLINE. Cases marked split 'holdout' must never be used to tune a prompt or
// appear in a development report; they exist to catch a model (or a prompt) fitted to the
// visible half. They sit in this file because a benchmark nobody can read is not
// maintainable - the discipline is procedural, exactly as the Lite suite's holdout.mjs
// warns. The holdout is drawn from THESE, never from catalog renders, because a holdout
// made of the easy distribution measures nothing.

export const HOSTILE_SUITE_VERSION = 1;

const FONT = "'Inter', system-ui, sans-serif";

/** A photographic-ish backdrop built from gradients: an imported graphic is usually
 *  flattened over content, and a model that only ever sees flat panels never has to
 *  separate the graphic from what is behind it. No external asset - exports and benches
 *  stay offline (`root/keep-generated-template-self-contained-runtime`). */
const PHOTO = `
  background:
    radial-gradient(1200px 600px at 20% 25%, #4a6b8a 0%, transparent 60%),
    radial-gradient(900px 700px at 80% 70%, #8a5a3c 0%, transparent 55%),
    linear-gradient(160deg, #1b2430 0%, #2f3a44 45%, #12181f 100%);
`;

export const HOSTILE_CASES = [
  // ── The hallucination tripwire ────────────────────────────────────────────
  {
    id: 'hostile-no-text-corner-bug',
    split: 'dev',
    graphicType: 'other',
    width: 1920,
    height: 1080,
    hasEditableText: false,
    note: 'A decorative corner bug with NO editable text. Any region reported here is invented.',
    body: `<div style="position:absolute;right:80px;top:70px;width:120px;height:120px;
      border:6px solid #e8b53a;border-radius:50%;opacity:.9"></div>
      <div style="position:absolute;right:110px;top:100px;width:60px;height:60px;
      background:#e8b53a;transform:rotate(45deg)"></div>`,
    backdrop: PHOTO,
  },
  {
    id: 'hostile-no-text-lower-band',
    split: 'holdout',
    graphicType: 'other',
    width: 1920,
    height: 1080,
    hasEditableText: false,
    note: 'An empty branded band - strap-SHAPED but wordless. Tempts a lower-third answer with fields.',
    body: `<div style="position:absolute;left:120px;bottom:140px;width:900px;height:110px;
      background:linear-gradient(90deg,#0d2b45,#12405f);border-left:10px solid #e8b53a"></div>`,
    backdrop: PHOTO,
  },

  // ── Odd aspect ratios ─────────────────────────────────────────────────────
  {
    id: 'hostile-vertical-9x16-strap',
    split: 'dev',
    graphicType: 'lower-third',
    width: 1080,
    height: 1920,
    hasEditableText: true,
    note: 'Portrait 9:16 social cut. Normalized boxes are correct only if aspect is honoured.',
    body: `<div style="position:absolute;left:60px;bottom:420px;width:960px;padding:28px 32px;
      background:rgba(8,12,18,.88);border-left:8px solid #e8b53a">
      <div data-role="person-name" style="font:800 64px ${FONT};color:#fff">Ines Duarte</div>
      <div data-role="person-role" style="font:500 34px ${FONT};color:#c9d3dd;margin-top:8px">Climate Correspondent</div>
      </div>`,
    backdrop: PHOTO,
  },
  {
    id: 'hostile-square-1x1-quote',
    split: 'dev',
    graphicType: 'quote-card',
    width: 1080,
    height: 1080,
    hasEditableText: true,
    note: 'Square quote card - no lower-third geometry to fall back on.',
    body: `<div style="position:absolute;inset:120px;display:flex;flex-direction:column;justify-content:center">
      <div data-role="story-headline" style="font:700 58px ${FONT};color:#f4f6f8;line-height:1.25">
        &ldquo;The grid held, but only just.&rdquo;</div>
      <div data-role="person-name" style="font:600 30px ${FONT};color:#e8b53a;margin-top:28px">Dr Aila Rentola</div>
      <div data-role="organization" style="font:400 26px ${FONT};color:#9fb0c0;margin-top:6px">National Energy Board</div>
      </div>`,
    backdrop: 'background:#0b0f14',
  },
  {
    id: 'hostile-ultrawide-21x9-ticker',
    split: 'holdout',
    graphicType: 'name-strap',
    width: 2560,
    height: 1080,
    hasEditableText: true,
    note: 'Ultra-wide 21:9 - a tiny strap in a very large frame stresses normalized bbox precision.',
    body: `<div style="position:absolute;left:100px;bottom:90px;display:flex;align-items:stretch">
      <div style="background:#e8b53a;padding:14px 22px;font:800 30px ${FONT};color:#111">LIVE</div>
      <div style="background:rgba(10,14,20,.92);padding:14px 26px">
      <span data-role="location" style="font:600 30px ${FONT};color:#fff">Port of Gothenburg</span></div>
      </div>`,
    backdrop: PHOTO,
  },

  // ── Hostile typography ────────────────────────────────────────────────────
  {
    id: 'hostile-script-low-contrast',
    split: 'dev',
    graphicType: 'title-card',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    note: 'Script-like italic on a busy backdrop at low contrast - classification and colour both hard.',
    body: `<div style="position:absolute;left:180px;top:420px">
      <div data-role="event-name" style="font:italic 300 82px Georgia,serif;color:#b9a98f;letter-spacing:2px">
        an evening of chamber music</div>
      <div data-role="location" style="font:italic 300 36px Georgia,serif;color:#9c8f79;margin-top:14px">
        the old customs house</div>
      </div>`,
    backdrop: PHOTO,
  },
  {
    id: 'hostile-condensed-caps-tracking',
    split: 'dev',
    graphicType: 'lower-third',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    note: 'Ultra-condensed all-caps with wide tracking - letterform class and weight are easy to misread.',
    body: `<div style="position:absolute;left:140px;bottom:180px">
      <div data-role="person-name" style="font:900 76px 'Arial Narrow',Impact,sans-serif;
        color:#fff;letter-spacing:.22em;text-transform:uppercase">Kwame Osei</div>
      <div data-role="team-name" style="font:400 30px 'Arial Narrow',sans-serif;color:#e8b53a;
        letter-spacing:.42em;text-transform:uppercase;margin-top:10px">Northern Lions</div>
      </div>`,
    backdrop: 'background:#07090c',
  },
  {
    id: 'hostile-outlined-text-on-photo',
    split: 'holdout',
    graphicType: 'title-card',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    note: 'Outlined/hollow glyphs over photography - fill colour is nearly absent.',
    body: `<div style="position:absolute;left:0;right:0;top:380px;text-align:center">
      <div data-role="story-headline" style="font:900 132px ${FONT};color:transparent;
        -webkit-text-stroke:3px #ffffff;letter-spacing:.04em">BLACKOUT</div>
      <div data-role="supporting-context" style="font:500 34px ${FONT};color:#dfe6ec;margin-top:20px">
        Part two of three</div>
      </div>`,
    backdrop: PHOTO,
  },

  // ── Multi-region density ──────────────────────────────────────────────────
  {
    id: 'hostile-dense-infographic',
    split: 'dev',
    graphicType: 'info-graphic',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    note: 'Ten regions in a full-frame grid - past the 12-region cap only just, so recall is the test.',
    body: `<div style="position:absolute;inset:110px">
      <div data-role="story-headline" style="font:800 56px ${FONT};color:#fff">Regional turnout</div>
      <div data-role="supporting-context" style="font:400 28px ${FONT};color:#9fb0c0;margin-top:8px">
        Provisional, 84% of districts counted</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px;margin-top:52px">
        ${['North 62%', 'South 58%', 'East 71%', 'West 49%'].map((t) => `
          <div style="background:rgba(255,255,255,.06);padding:22px">
            <div data-role="location" style="font:700 34px ${FONT};color:#e8b53a">${t.split(' ')[0]}</div>
            <div data-role="score" style="font:800 52px ${FONT};color:#fff;margin-top:6px">${t.split(' ')[1]}</div>
          </div>`).join('')}
      </div></div>`,
    backdrop: 'background:#0a0e13',
  },

  // ── Flattened vs transparent ──────────────────────────────────────────────
  {
    id: 'hostile-transparent-png-strap',
    split: 'dev',
    graphicType: 'lower-third',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    transparent: true,
    note: 'Exported with real alpha - a checkerboard or black assumption misreads the colours.',
    body: `<div style="position:absolute;left:150px;bottom:200px;background:#12283d;padding:24px 34px">
      <div data-role="person-name" style="font:800 60px ${FONT};color:#ffffff">Yara Haddad</div>
      <div data-role="person-role" style="font:500 30px ${FONT};color:#8fd0ff;margin-top:8px">Data Editor</div>
      </div>`,
    backdrop: 'background:transparent',
  },
  {
    id: 'hostile-scoreboard-numeric',
    split: 'holdout',
    graphicType: 'scoreboard',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    note: 'Numerals dominate - scores and clock are easily labelled as generic supporting text.',
    body: `<div style="position:absolute;left:50%;top:70px;transform:translateX(-50%);
      display:flex;align-items:center;gap:26px;background:rgba(6,10,16,.94);padding:18px 30px">
      <span data-role="team-name" style="font:700 40px ${FONT};color:#fff">HELSINKI</span>
      <span data-role="score" style="font:900 52px ${FONT};color:#e8b53a">3</span>
      <span style="font:400 34px ${FONT};color:#5c6b7a">:</span>
      <span data-role="score" style="font:900 52px ${FONT};color:#e8b53a">2</span>
      <span data-role="team-name" style="font:700 40px ${FONT};color:#fff">BERGEN</span>
      <span data-role="time" style="font:600 34px ${FONT};color:#8fd0ff;margin-left:20px">58:12</span>
      </div>`,
    backdrop: PHOTO,
  },
  {
    id: 'hostile-tiny-strap-large-frame',
    split: 'holdout',
    graphicType: 'name-strap',
    width: 1920,
    height: 1080,
    hasEditableText: true,
    note: 'A deliberately small strap - normalized boxes are tiny, so loose bboxes fail IoU here.',
    body: `<div style="position:absolute;left:90px;bottom:80px;background:rgba(9,13,19,.9);padding:8px 14px">
      <div data-role="person-name" style="font:700 26px ${FONT};color:#fff">M. Sørensen</div>
      </div>`,
    backdrop: PHOTO,
  },
];
