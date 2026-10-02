// Assemble graphics packs (src/packs/graphicsPack.ts, format `noacg-pack` v1) from FILE-BASED
// pack source directories: <pack>/manifest.json + one directory per graphic holding
// template.html / style.css / logic.js and, optionally, a fonts/ folder whose files ride along
// as inlined assets.
//
// With no argument it builds every pack the repo ships:
//   packs/fight-night            -> public/packs/fight-night.noacgpack.json, the fixture
//                                   e2e/production-pack.spec.ts imports (listed nowhere in the
//                                   studio);
//   packs/community/<slug>       -> public/packs/community/<slug>.noacgpack.json plus its
//                                   preview image, and public/packs/community/index.json - the
//                                   seeded Community packs shelf the template wizard lists
//                                   (docs/work-specs/community-packs/spec.md).
// With a directory argument it builds that one pack into public/packs/.
//
// The app-side importer re-validates every graphic through the export gate at install time;
// this script guards what plain node can check: the format shape, the SPX contract's
// presence, the CasparCG-CEF ES5 rule, the inline-hidden-holder rule and the bundled-font
// url() convention (the same gates as build-news-pack.mjs, adapted to file sources). It runs
// in `npm run build`, so an emitted file can never go stale against its sources.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

// Template sources reach the working tree with platform line endings (core.autocrlf), but
// the emitted JSON is a committed artifact - normalize to LF so a build on any platform
// reproduces the same bytes.
const readSource = (path) => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');

const FONT_TYPES = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/** A graphic's fonts/ folder as pack assets (`{ path, data }` with data URLs). */
function fontAssets(dir) {
  const fonts = join(dir, 'fonts');
  if (!existsSync(fonts)) return [];
  return readdirSync(fonts)
    .filter((file) => FONT_TYPES[extname(file).toLowerCase()])
    .sort()
    .map((file) => ({
      path: `fonts/${file}`,
      data: `data:${FONT_TYPES[extname(file).toLowerCase()]};base64,${readFileSync(join(fonts, file)).toString('base64')}`,
    }));
}

/** Read and check one pack source directory. Returns the pack object, or the refusals. */
const readManifest = (packDir) => JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));

function assemble(packDir, manifest = readManifest(packDir)) {
  const failures = [];
  const fail = (msg) => failures.push(msg);

  if (!manifest.name || !Array.isArray(manifest.graphics) || manifest.graphics.length === 0) {
    return { failures: ['manifest.json needs a name and a non-empty graphics list'] };
  }

  const names = new Set();
  const graphics = manifest.graphics.map((entry) => {
    const where = `"${entry.name}"`;
    if (!entry.slug || !entry.name || !entry.type) fail(`${where}: needs slug + name + type`);
    if (names.has(entry.name)) fail(`${where}: duplicate graphic name`);
    names.add(entry.name);

    const dir = join(packDir, entry.slug);
    const html = readSource(join(dir, 'template.html'));
    const css = readSource(join(dir, 'style.css'));
    const js = readSource(join(dir, 'logic.js'));

    if (!html.includes('window.SPXGCTemplateDefinition')) {
      fail(`${where}: no SPXGCTemplateDefinition in the HTML`);
    }
    // The SPX entry points, as a global assignment (`window.play = function () {`) or as a
    // top-level declaration (`function play(`), the two shapes the SPX contract accepts.
    for (const fn of ['play', 'stop', 'update']) {
      if (!js.includes(`window.${fn} = function`) && !new RegExp(`^function ${fn}\\s*\\(`, 'm').test(js)) {
        fail(`${where}: missing the ${fn}() entry point`);
      }
    }
    // The CasparCG 2.3.x CEF (Chromium 71) rule: template JS stays ES5. Comments are
    // stripped first - the rule is about code, and several files NAME the rule in a comment.
    const stripped = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const [token, label] of [
      ['=>', 'an arrow function'],
      ['`', 'a template literal'],
      ['?.', 'optional chaining'],
      ['??', 'nullish coalescing'],
    ]) {
      if (stripped.includes(token)) fail(`${where}: template JS carries ${label} (${token})`);
    }
    // Data holders hide by CSS rule, never inline style (the editor's entrance reset clears
    // inline props - src/templates/AGENTS.md).
    if (/id="f\d+"[^>]*style="[^"]*display:\s*none/.test(html)) {
      fail(`${where}: a field holder hides with an inline style`);
    }
    // Font references must be the relative fonts/ path the exports collect, and must name a
    // file that exists: the graphic's own fonts/ folder, or a face the studio bundles.
    for (const m of css.matchAll(/url\(\s*["']?([^"')]*)/g)) {
      const ref = m[1];
      if (!/^fonts\/[^/]+$/.test(ref)) fail(`${where}: a url() reference outside the bundled fonts/ convention (${ref})`);
      else if (!existsSync(join(dir, ref)) && !existsSync(join(repo, 'public', ref))) {
        fail(`${where}: ${ref} is neither in the graphic's fonts/ folder nor a bundled face`);
      }
    }
    // Every declared field has its element (the fN contract).
    for (const m of html.matchAll(/"field":\s*"(f\d+)"/g)) {
      if (!html.includes(`id="${m[1]}"`)) fail(`${where}: field ${m[1]} has no element id="${m[1]}"`);
    }

    const assets = fontAssets(dir);
    return {
      name: entry.name,
      type: entry.type,
      layer: entry.layer,
      html,
      css,
      js,
      ...(assets.length ? { assets } : {}),
      resolution: entry.resolution ?? { width: 1920, height: 1080 },
      fps: entry.fps ?? 50,
    };
  });

  const cues = (manifest.cues ?? []).map((cue) => {
    if (!names.has(cue.graphic)) fail(`cue "${cue.label}" points at unknown graphic "${cue.graphic}"`);
    return cue;
  });

  const pack = {
    format: 'noacg-pack',
    version: 1,
    name: manifest.name,
    description: manifest.description ?? '',
    graphics,
    ...(cues.length ? { cues } : {}),
  };
  return { failures, pack };
}

/** Build one pack into outDir; exits the process on a refusal. */
function buildOne(packDir, outDir, manifest) {
  const slug = basename(packDir);
  const { failures, pack } = assemble(packDir, manifest);
  if (failures.length) {
    console.error(`build-production-pack: refusing to emit ${slug} -`);
    for (const f of failures) console.error(`  · ${f}`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${slug}.noacgpack.json`), JSON.stringify(pack, null, 2) + '\n');
  const bytes = JSON.stringify(pack).length;
  const cueCount = pack.cues?.length ?? 0;
  console.log(
    `build-production-pack: wrote ${pack.graphics.length} graphics, ${cueCount} cues (${(bytes / 1024).toFixed(0)} kB) -> ${join(outDir, `${slug}.noacgpack.json`).slice(repo.length + 1).replace(/\\/g, '/')}`,
  );
  return { slug, pack };
}

/**
 * The seeded Community packs shelf: every packs/community/<slug> is built, its preview image
 * copied beside it, and index.json lists them in name order - the one file the wizard reads.
 */
function buildCommunityShelf() {
  const sourceRoot = join(repo, 'packs', 'community');
  const outDir = join(repo, 'public', 'packs', 'community');
  if (!existsSync(sourceRoot)) return;
  const slugs = readdirSync(sourceRoot).filter((slug) => existsSync(join(sourceRoot, slug, 'manifest.json'))).sort();
  // The shelf's own rules (author, preview) are checked for every pack before anything is written.
  const shelf = new Map();
  for (const slug of slugs) {
    const packDir = join(sourceRoot, slug);
    const manifest = readManifest(packDir);
    const preview = readdirSync(packDir).find((f) => /^preview\.(webp|png|jpg)$/.test(f));
    if (!manifest.author || !preview) {
      console.error(`build-production-pack: refusing to list ${slug} - a community pack names its author and carries a preview.webp/.png/.jpg`);
      process.exit(1);
    }
    shelf.set(slug, { manifest, preview });
  }
  // The output folder is wholly generated: a pack removed or renamed at the source leaves no
  // file behind to be served.
  rmSync(outDir, { recursive: true, force: true });
  const entries = [];
  for (const slug of slugs) {
    const packDir = join(sourceRoot, slug);
    const { manifest, preview } = shelf.get(slug);
    const { pack } = buildOne(packDir, outDir, manifest);
    const previewFile = `${slug}${extname(preview)}`;
    copyFileSync(join(packDir, preview), join(outDir, previewFile));
    entries.push({
      id: slug,
      name: pack.name,
      description: pack.description,
      author: manifest.author,
      graphics: pack.graphics.length,
      cues: pack.cues?.length ?? 0,
      file: `${slug}.noacgpack.json`,
      preview: previewFile,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version: 1, packs: entries }, null, 2) + '\n');
  console.log(`build-production-pack: listed ${entries.length} community pack(s) -> public/packs/community/index.json`);
}

if (process.argv[2]) {
  buildOne(process.argv[2], join(repo, 'public', 'packs'));
} else {
  buildOne(join(repo, 'packs', 'fight-night'), join(repo, 'public', 'packs'));
  buildCommunityShelf();
}
