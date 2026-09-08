// The FIELD COVERAGE gate: every meaningful piece of visible text in a catalog graphic must be
// reachable through a data field, so an operator (or a rundown / automation system) can change
// it without editing the design.
//
// How it decides, and why this shape: it does not read the markup looking for `id="fN"`. Plenty
// of legitimate text never sits in an fN element — a standings row, a ticker item, a credits
// line are all BUILT by a runtime from one `lines` field, and an id-based check would either
// miss them or need a per-category special case. So the gate asks the question the operator
// actually cares about, empirically:
//
//   render → snapshot every visible string → drive EVERY data field to a sentinel through
//   update() → snapshot again → anything that did not move is not operator-reachable.
//
// That catches hardcoded row content, baked-in labels and stranded sample text in one pass, and
// it stays correct when a category invents a new rebuild runtime, because it never models one.
//
// Usage (dev server must be running for this checkout — scripts/dev-port.mjs):
//   node scripts/field-coverage.mjs                 # every category, exit 1 on any finding
//   node scripts/field-coverage.mjs lower-third     # one category
//   node scripts/field-coverage.mjs --only lt01,lt02  # just these designs (scripts/catalog-scope.mjs)
//   node scripts/field-coverage.mjs --json out.json
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import { applyOnly, parseOnly, scopeNote } from './catalog-scope.mjs';
import { measured } from './measured.mjs';

/**
 * Categories this gate cannot speak for. `imported-design` renders the USER'S artwork with
 * their own placed text — we did not author it, so "should this be a field?" is their call.
 */
const EXEMPT_CATEGORIES = new Set(['imported-design']);

/**
 * Text that is DESIGN, not data — the deliberate exceptions the contract allows. Matching is on
 * the trimmed string, case-insensitively. Keep this list short and argued: every entry is a
 * claim that no operator will ever want to change that word.
 *
 * Structural punctuation and separators are handled by MEANINGFUL below, not here.
 */
const STATIC_BY_DESIGN = new Map([
  ['vs', 'the versus mark IS the graphic — a versus board that says something else is a different design'],
  ['v', 'the short versus mark, same reason'],
]);

/**
 * Text excused by WHERE it is rather than by what it says, keyed on the element's own class.
 * These are all one of two things, and both are the honest answer:
 *
 *  - an EMPTY-SLOT PLACEHOLDER for an image field. The slot IS a data field (`filelist`); this
 *    text is what the design draws until a file is picked, and picking one replaces it. The
 *    probe cannot drive a filelist (there is no image to point at), so it sees the placeholder
 *    standing still and would report the slot as unreachable — the exact opposite of true.
 *  - a value the RUNTIME computes, not one anybody types (a wall clock). It does not move
 *    between two snapshots a second apart, which looks static and is not.
 */
const STATIC_BY_SELECTOR = new Map([
  ['.credits-logo-slot', 'the empty state of the credits logo slot (an image field) — a picked logo replaces it'],
  ['.corner-bug-mark', 'the empty state of a logo-only bug\'s image field — the whole graphic IS that slot'],
  ['.frame-sponsor-placeholder', 'the empty state of a sponsor rail\'s image field, one per slot'],
  ['.stream-notification-glyph', 'the monogram behind an empty avatar image field; aria-hidden, replaced by the picture'],
  ['#alert-stamp', 'a wall clock the runtime repaints every 30 s — computed, never typed'],
]);

/**
 * Is this string worth asking about at all? Pure punctuation, separators, single digits and
 * bare units are structure or computed output (a row index the runtime counts, a "|" between
 * cells, the "—" a short row renders for a missing value), never content someone would edit.
 */
const MEANINGFUL = (s) => {
  const t = s.trim();
  if (t.length < 2) return false; // single glyphs: row indices, bullets, carets
  if (!/[\p{L}]/u.test(t)) return false; // no letters at all — digits, punctuation, clock faces
  if (/^[\p{P}\p{S}\s]+$/u.test(t)) return false;
  return true;
};

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const { ids: onlyIds, raw: onlyRaw } = parseOnly(args);
const only = args.find((a) => !a.startsWith('--') && a !== jsonOut && a !== onlyRaw) || null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__wiz = await import('/src/model/wizard.ts');
  window.__types = await import('/src/model/types.ts');
});

const allTargets = (
  await page.evaluate(
    (only) =>
      window.__wiz.CATEGORIES.filter((c) => !only || c.id === only).flatMap((c) =>
        (window.__cat.CATALOG[c.id] || []).map((v) => ({ id: v.id, cat: c.id, name: v.name })),
      ),
    only,
  )
).filter((t) => !EXEMPT_CATEGORIES.has(t.cat));
const targets = await applyOnly(allTargets, onlyIds, 'field-coverage', page, () => browser.close());
if (!targets.length) {
  console.error(only ? `No variants for category "${only}".` : 'No variants found.');
  await browser.close();
  process.exit(2);
}
measured(targets.length, 'catalog variants');

await page.evaluate(() => {
  // A sentinel per field, typed so the value is ACCEPTED rather than rejected or coerced:
  // a number field fed "ZQX" renders nothing and would look like a hardcoded miss.
  window.__sentinel = (f, i) => {
    const tag = 'ZQ' + i + 'X';
    switch (f.ftype) {
      case 'number':
        return String(900000 + i);
      case 'checkbox':
        return f.value === 'true' ? 'false' : 'true';
      case 'color':
        return '#ff00ff';
      case 'dropdown': {
        // A dropdown's value must stay legal, so pick a DIFFERENT declared option. With only
        // one option there is nothing to move to — the field is reported as unswitchable
        // rather than silently counted as covered.
        const items = f.items || [];
        const other = items.find((it) => it.value !== f.value);
        return other ? other.value : null;
      }
      case 'filelist':
        return null; // an asset path sentinel would 404, not render text
      case 'textarea':
      case 'hidden':
      case 'textfield':
      default:
        // Multi-line sources (a rows/lines field) keep their line COUNT so the rebuilt block
        // keeps its shape; every cell becomes a sentinel.
        if (String(f.value).includes('\n') || String(f.value).includes('|')) {
          return String(f.value)
            .split('\n')
            .map((line, li) =>
              line
                .split('|')
                .map((_, ci) => tag + li + '_' + ci)
                .join(' | '),
            )
            .join('\n');
        }
        return tag;
    }
  };

  // Every visible element that paints its OWN text, as `selector -> text`. Keyed by a stable
  // path so the before/after snapshots line up even when a rebuild replaces the nodes.
  window.__strings = (doc, win) => {
    const out = [];
    const walk = (el, path) => {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (!(parseFloat(cs.opacity) > 0.03)) return;
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3 && n.textContent.trim())
        .map((n) => n.textContent.trim())
        .join(' ');
      if (own) {
        const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '';
        out.push({ path, sel: el.id ? '#' + el.id : cls || el.tagName.toLowerCase(), text: own });
      }
      let i = 0;
      for (const c of el.children) walk(c, path + '/' + c.tagName + i++);
    };
    walk(doc.body, '');
    return out;
  };

  window.__scan = async (batch) => {
    document.body.innerHTML = '';
    const frames = batch.map(({ id }) => {
      const v = window.__cat.variantById(id);
      const f = document.createElement('iframe');
      f.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
      let tpl = null;
      try {
        tpl = v.create({});
        f.srcdoc = window.__comp.composeDocument(tpl);
      } catch (e) {
        f.dataset.err = String((e && e.message) || e);
      }
      document.body.appendChild(f);
      return { id, tpl, f };
    });
    await new Promise((r) => setTimeout(r, 900));
    for (const { f } of frames) {
      try {
        f.contentWindow.play && f.contentWindow.play();
      } catch { /* a template without play() is a different gate's problem */ }
    }
    await new Promise((r) => setTimeout(r, 2400));

    // Snapshot BEFORE.
    const before = frames.map(({ f }) => {
      try {
        return window.__strings(f.contentDocument, f.contentWindow);
      } catch {
        return null;
      }
    });

    // Drive every data field to its sentinel.
    const drives = frames.map(({ tpl, f }) => {
      const info = { sent: {}, skipped: [] };
      if (!tpl) return info;
      const data = {};
      (tpl.fields || []).forEach((fl, i) => {
        if (!window.__types.DATA_FTYPES.includes(fl.ftype)) return;
        const s = window.__sentinel(fl, i);
        if (s === null) {
          info.skipped.push({ field: fl.field, ftype: fl.ftype, title: fl.title });
          return;
        }
        data[fl.field] = s;
      });
      info.sent = data;
      try {
        f.contentWindow.update && f.contentWindow.update(JSON.stringify(data));
      } catch (e) {
        info.err = String((e && e.message) || e);
      }
      return info;
    });
    // A rebuild runtime may re-measure or re-fit on a frame; give it room.
    await new Promise((r) => setTimeout(r, 700));

    // Snapshot AFTER.
    return frames.map(({ id, f }, k) => {
      const out = { id, err: f.dataset.err || null, drive: drives[k], stuck: [] };
      try {
        const after = window.__strings(f.contentDocument, f.contentWindow);
        const wasByPath = new Map((before[k] || []).map((r) => [r.path, r.text]));
        for (const row of after) {
          const prev = wasByPath.get(row.path);
          // Present before AND after with the SAME text = nothing an operator can reach.
          // A string that only appeared after the drive is sentinel-derived by definition.
          if (prev === undefined || prev !== row.text) continue;
          out.stuck.push({ sel: row.sel, text: row.text.slice(0, 60) });
        }
      } catch (e) {
        out.err = (out.err || '') + ' READ:' + String((e && e.message) || e);
      }
      return out;
    });
  };
});

const rows = [];
for (let i = 0; i < targets.length; i += 8) {
  const slice = targets.slice(i, i + 8);
  const res = await page.evaluate((b) => window.__scan(b), slice.map((t) => ({ id: t.id })));
  res.forEach((r, k) => rows.push({ ...slice[k], ...r }));
}
await browser.close();

// Classify: the deliberate exceptions vs the real findings.
const excused = [];
for (const r of rows) {
  r.stuck = r.stuck.filter((h) => {
    if (!MEANINGFUL(h.text)) return false;
    const why = STATIC_BY_DESIGN.get(h.text.trim().toLowerCase()) ?? STATIC_BY_SELECTOR.get(h.sel);
    if (why) {
      excused.push({ id: r.id, text: h.text, sel: h.sel, why });
      return false;
    }
    return true;
  });
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));

const bad = rows.filter((r) => r.stuck.length);
const errored = rows.filter((r) => r.err);
const skipped = rows.filter((r) => r.drive && r.drive.skipped && r.drive.skipped.length);

// Group by the offending string: one baked-in label shared by a whole pack is ONE fix.
const byText = new Map();
for (const r of bad) {
  for (const h of r.stuck) {
    const k = `${h.sel}  «${h.text}»`;
    const e = byText.get(k) || { n: 0, ids: [], cats: new Set() };
    e.n++;
    e.cats.add(r.cat);
    if (e.ids.length < 6) e.ids.push(r.id);
    byText.set(k, e);
  }
}

console.log(
  `\nField coverage — ${rows.length} variants checked${scopeNote(onlyIds, targets.length, allTargets.length)}${only ? ` (${only})` : ''}`,
);
console.log(`  exempt categories: ${[...EXEMPT_CATEGORIES].join(', ') || 'none'}\n`);
if (excused.length) {
  const uniq = new Map(excused.map((e) => [e.sel + '|' + e.text.toLowerCase(), e]));
  console.log(`STATIC BY DESIGN (${excused.length} hits, ${uniq.size} strings) — allowed:`);
  for (const e of uniq.values()) console.log(`  ${e.sel} «${e.text}» — ${e.why}`);
  console.log('');
}
if (skipped.length) {
  console.log(`NOT DRIVEN (${skipped.length} variants) — fields this probe cannot move, so their text is UNVERIFIED:`);
  for (const r of skipped.slice(0, 20)) {
    console.log(`  ${r.id.padEnd(9)} ${r.drive.skipped.map((s) => `${s.field}:${s.ftype}`).join(', ')}`);
  }
  if (skipped.length > 20) console.log(`  … and ${skipped.length - 20} more`);
  console.log('');
}
if (errored.length) {
  console.log(`RENDER ERRORS (${errored.length}):`);
  for (const e of errored) console.log(`  ${e.id}  ${e.err}`);
  console.log('');
}
if (!bad.length) {
  console.log('PASS — every meaningful visible string moved when its fields were driven.\n');
  process.exit(errored.length ? 1 : 0);
}

console.log(`FAIL — ${bad.length}/${rows.length} variants paint text no data field can reach.\n`);
console.log('  By string (fix these once, many variants clear):');
for (const [k, v] of [...byText].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) {
  console.log(`  ${String(v.n).padStart(4)}  ${k}`);
  console.log(`        ${[...v.cats].join(', ')} — e.g. ${v.ids.join(', ')}`);
}
console.log('\n  By variant:');
for (const r of bad) {
  console.log(`  ${r.id.padEnd(9)} ${r.cat.padEnd(16)} ${r.stuck.length} string(s): ${r.stuck.map((h) => JSON.stringify(h.text)).slice(0, 4).join(' ')}`);
}
process.exit(1);
