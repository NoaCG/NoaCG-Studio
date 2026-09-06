// Static prerender for the marketing surface (docs/PRERENDER.md), run after `vite build`.
//
// The app is a Vite SPA: every crawler that asks for a template gets the same empty shell.
// This emits REAL HTML into dist/ - one page per catalog design, plus a sitemap and a
// robots.txt - so the catalog is indexable and a shared link shows something before any
// JavaScript runs.
//
// Metadata comes from the app's own catalog through Vite's SSR loader, NOT from a hand-kept
// list beside it. That is the whole point: a design added to the catalog gets its page on
// the next build, and a page can never describe a design that no longer exists.
//
// It reads the VARIANT DESCRIPTORS (`variantsFor`) rather than the richer `templateMeta()`,
// and that is deliberate: templateMeta derives a field schema by actually BUILDING each
// template, which runs `DOMParser` and therefore needs a browser. Everything a marketing
// page needs - name, description, category, style, line capacity, logo support, motion - is
// declared on the variant already. The alternative was a DOM dependency (against root
// AGENTS.md non-negotiable 3) or a headless browser in the build; a page does not need
// either to be true.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDir, '..');
const distDir = path.join(projectRoot, 'dist');

/** Canonical origin for absolute URLs. Vercel sets the same value explicitly so preview and
 *  production builds cannot drift from the public address. */
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? 'https://noacg.studio').replace(/\/+$/, '');

const escape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** URL-shaped slug: hyphens, not the underscores model/slug.ts wants for folder names. */
function pageSlug(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'template'
  );
}

/** Slugs must be unique AND stable: a name collision appends the variant id rather than a
 *  counter, so adding a design can never renumber - and therefore never break - the URL of
 *  one that already shipped. */
function assignSlugs(variants) {
  const bySlug = new Map();
  for (const variant of variants) {
    const base = pageSlug(variant.name);
    const list = bySlug.get(base) ?? [];
    list.push(variant);
    bySlug.set(base, list);
  }
  const out = [];
  for (const [base, list] of bySlug) {
    for (const variant of list) {
      out.push({ variant, slug: list.length === 1 ? base : `${base}-${pageSlug(variant.id)}` });
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The app's own display labels, loaded at run time - a public page must never print a
 *  stored id like `noacg`. Populated in main(); the fallback only matters if a family is
 *  added to the catalog without a label, which the humanised id at least reads sanely. */
let styleLabels = {};

/** Injected by main() from the app, and by the tests - so the label path is exercised
 *  rather than only its fallback. */
export function setStyleLabels(labels) {
  styleLabels = labels ?? {};
}

const LABEL = (id) => String(id).replace(/-/g, ' ');
const styleLabel = (tag) => styleLabels[tag] ?? LABEL(tag);

/** Declared line capacity, not a built schema - see the header note on why. */
function fieldSummary(variant) {
  const lines = variant.maxLines ?? 0;
  const parts = [];
  if (lines > 0) parts.push(`up to ${lines} text line${lines === 1 ? '' : 's'}`);
  const suggested = variant.suggestedLines?.length ?? 0;
  if (suggested > 0) parts.push(`${suggested} filled in by default`);
  if (variant.logo && variant.logo !== 'none') parts.push(`logo slot (${LABEL(variant.logo)})`);
  return parts.length ? `${parts.join(', ')}.` : 'Data-driven - no free text lines.';
}

/** The wizard deep link (docs/PRERENDER.md, src/app/router.ts): `#/new/<variantId>` opens the
 *  creation wizard with this design preselected, dropped straight on Fields — never creating a
 *  project until the user finishes the wizard. Encoded like every other router segment. */
function appLink(variant) {
  return `/app#/new/${encodeURIComponent(variant.id)}`;
}

function templatePage(entry) {
  const { variant, slug } = entry;
  const cta = appLink(variant);
  const meta = {
    name: variant.name,
    description: variant.description,
    category: variant.category,
    styleFamily: variant.styleTag,
    motion: variant.animationPresets?.[0] ?? null,
    steps: variant.defaultSteps ? 'multi-step reveal' : 'single reveal',
  };
  const title = `${meta.name} - ${LABEL(meta.category)} template | NoaCG Studio`;
  const description = `${meta.description} Free broadcast graphics template - export to SPX, CasparCG, OGraf, H2R, LiveOS or a plain HTML overlay for OBS and vMix.`;
  const canonical = `${SITE_ORIGIN}/templates/${slug}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<link rel="canonical" href="${escape(canonical)}" />
<meta name="theme-color" content="#0a0c10" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<meta property="og:title" content="${escape(meta.name)} - NoaCG Studio" />
<meta property="og:description" content="${escape(meta.description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${escape(canonical)}" />
<meta property="og:image" content="${escape(SITE_ORIGIN)}/landing/shot-title.png" />
<style>
  :root { color-scheme: dark; --bg:#0a0c10; --panel:#12161d; --line:#242a34; --text:#e8ecf2; --dim:#9aa4b2; --amber:#f5a524; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:52rem; margin:0 auto; padding:3rem 1.25rem 4rem; }
  a { color:var(--amber); }
  .kicker { text-transform:uppercase; letter-spacing:.12em; font-size:.75rem; color:var(--dim); }
  h1 { font-size:clamp(1.75rem,4vw,2.5rem); line-height:1.15; margin:.4rem 0 .75rem; }
  .lede { font-size:1.125rem; color:var(--dim); margin:0 0 2rem; }
  .cta { display:inline-block; background:var(--amber); color:#1a1206; font-weight:600; text-decoration:none; padding:.7rem 1.15rem; border-radius:.5rem; }
  .facts { border:1px solid var(--line); background:var(--panel); border-radius:.75rem; padding:1.25rem; margin:2rem 0; }
  .facts dl { display:grid; grid-template-columns:minmax(8rem,auto) 1fr; gap:.5rem 1rem; margin:0; }
  dt { color:var(--dim); } dd { margin:0; }
  ul.targets { list-style:none; padding:0; display:flex; flex-wrap:wrap; gap:.5rem; }
  ul.targets li { border:1px solid var(--line); border-radius:999px; padding:.25rem .75rem; font-size:.875rem; color:var(--dim); }
  footer { border-top:1px solid var(--line); margin-top:3rem; padding-top:1.5rem; color:var(--dim); font-size:.9rem; }
</style>
</head>
<body>
<main>
  <p class="kicker">${escape(LABEL(meta.category))}</p>
  <h1>${escape(meta.name)}</h1>
  <p class="lede">${escape(meta.description)}</p>
  <p><a class="cta" href="${escape(cta)}">Open in NoaCG Studio</a></p>

  <div class="facts">
    <dl>
      <dt>Category</dt><dd>${escape(LABEL(meta.category))}</dd>
      <dt>Content</dt><dd>${escape(fieldSummary(variant))}</dd>
      <dt>Style</dt><dd>${escape(meta.styleFamily ? styleLabel(meta.styleFamily) : 'n/a')}</dd>
      ${meta.motion ? `<dt>Default motion</dt><dd>${escape(LABEL(meta.motion))}</dd>` : ''}
      <dt>Reveal</dt><dd>${escape(meta.steps)}</dd>
    </dl>
  </div>

  <h2>Export it anywhere</h2>
  <ul class="targets">
    <li>SPX Graphics</li><li>CasparCG</li><li>OGraf (EBU v1)</li>
    <li>H2R Graphics</li><li>LiveOS</li><li>HTML overlay (OBS / vMix)</li>
  </ul>
  <p>Or render it straight to MP4, transparent WebM, ProRes or a PNG sequence.</p>

  <footer>
    <p><strong>NoaCG Studio</strong> - premium broadcast graphics, built by choosing.
    Free, open source (AGPL-3.0), no account needed to create, preview or export.</p>
    <p><a href="/">Home</a> &middot; <a href="${escape(cta)}">Open the editor</a> &middot;
       <a href="https://github.com/NoaCG/NoaCG-Studio">Source</a></p>
  </footer>
</main>
</body>
</html>
`;
}

function sitemap(entries) {
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0' },
    { loc: `${SITE_ORIGIN}/app`, priority: '0.8' },
    // The public docs home (docs.html) — guides for SVG import, playout and the agent door.
    { loc: `${SITE_ORIGIN}/docs`, priority: '0.8' },
    // The free OGraf starters page (ograf.html) — a public, indexable landing of its own.
    { loc: `${SITE_ORIGIN}/ograf`, priority: '0.8' },
    ...entries.map((entry) => ({ loc: `${SITE_ORIGIN}/templates/${entry.slug}`, priority: '0.6' })),
  ];
  // sitemapS.org, plural - the sitemaps.org protocol namespace. A crawler that does not
  // recognise the namespace discards the whole file, so this string is load-bearing.
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escape(url.loc)}</loc><priority>${url.priority}</priority></url>`).join('\n')}
</urlset>
`;
}

const robots = () => `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;

/**
 * The catalog, slugged and ready to write - through Vite's SSR loader, which is the fixed cost
 * of this step and the reason it is separated from the page loop below.
 *
 * Exported so `scripts/catalog-cost.mjs` measures THIS loader and THIS loop rather than a copy
 * of them: the number it reports is what a build actually pays per design, and a copy would
 * quietly stop being that.
 */
export async function loadCatalogEntries() {
  // Middleware mode: we only want the module graph, never a listening port - so this is
  // safe to run in CI beside the real build.
  const server = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });
  try {
    const taxonomy = await server.ssrLoadModule('/src/model/taxonomy.ts');
    setStyleLabels(taxonomy.STYLE_FAMILY_LABELS);
    const catalog = await server.ssrLoadModule('/src/templates/catalog.ts');
    const wizard = await server.ssrLoadModule('/src/model/wizard.ts');
    const variants = wizard.CATEGORIES.filter((category) => category.group !== 'imported').flatMap(
      (category) => catalog.variantsFor(category.id),
    );
    const entries = assignSlugs(variants);
    if (entries.length === 0) throw new Error('the catalog resolved to zero templates');
    return entries;
  } finally {
    await server.close();
  }
}

/** Write one directory + index.html per design. This loop is the whole per-design cost. */
export async function writeTemplatePages(entries, outDir) {
  await rm(outDir, { recursive: true, force: true });
  for (const entry of entries) {
    const dir = path.join(outDir, entry.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), templatePage(entry), 'utf8');
  }
}

async function main() {
  const entries = await loadCatalogEntries();
  await writeTemplatePages(entries, path.join(distDir, 'templates'));
  await writeFile(path.join(distDir, 'sitemap.xml'), sitemap(entries), 'utf8');
  await writeFile(path.join(distDir, 'robots.txt'), robots(), 'utf8');
  console.log(`Prerendered ${entries.length} template pages + sitemap.xml + robots.txt`);
}

export { appLink, assignSlugs, pageSlug, sitemap, templatePage };

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
