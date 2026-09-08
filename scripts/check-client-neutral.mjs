// gate: build
// guards: src/**, *.html
//
// THE PRODUCT IS CLIENT-AGNOSTIC, AND ITS OWN WORDS HAVE TO SHOW IT.
//
// NoaCG exports to many playout environments and is committed to none of them. SPX is the
// canonical INTERNAL format and the strictest validation target (root AGENTS.md) - that is an
// engineering decision and it stays. What must never happen is the product describing ITSELF in
// one client's words: "SPX live preview", "Make SPX-ready", "the SPX out setting", "the name the
// operator sees in SPX". A broadcaster reading those concludes NoaCG is an SPX tool, and the
// first customers this product is aimed at (EBU, YLE) come through OGraf, not SPX.
//
// So the rule this gate holds is narrow and checkable:
//
//   A CLIENT MAY BE NAMED AS ONE TARGET AMONG OTHERS. IT MAY NEVER BE THE WORD THE PRODUCT USES
//   FOR A GENERAL CONCEPT.
//
// "Export to SPX, CasparCG, OBS or OGraf" is fine - those are the targets, and naming them is the
// whole promise. "Passes SPX validation" is not, because the thing being described is OUR
// validator. The test is: would this sentence still be true, and still make sense, for a
// broadcaster who will never touch that client? If not, it is the product's own vocabulary and
// has to be neutral.
//
// The gate is an ALLOWLIST, not a heuristic: every permitted mention is written down with the
// reason it is permitted, and an edit to an allowlisted line makes the gate ask again - which is
// correct, because whoever rewrote it should re-justify it.
//
// Run: node scripts/check-client-neutral.mjs   (part of `npm run build`)

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The client names the product must not adopt as its own vocabulary. */
const CLIENTS = ['SPX'];

/**
 * Where a USER can read the words. Deliberately not "all of src": a code comment naming SPX is
 * engineering vocabulary about the internal format, which is correct and staying.
 */
const SCANNED = [
  // The DIRECTORY, not a glob. `src/components/**/*.tsx` matches the 84 nested files and ZERO of
  // the ~39 loose top-level ones - git's default pathspec lets `*` cross a `/`, and `**/` still
  // wants a directory to match. That hole hid three user-visible strings until timeline/ was
  // split out on 2026-08-26 and they moved into a subdirectory. Extensions are filtered below.
  'src/components',
  // The FIELD PLANS are user copy living in the template contract: `itemLabel`, `itemHint`, a fixed
  // plan's `reason` and a list's `formatNote` are all rendered verbatim on the wizard's Fields
  // step, and `StyleChoiceSpec` titles on its Style step. Same hole shape as the loose
  // components above - a sentence a reader sees, in a file nothing scanned.
  'src/templates/contract.ts',
  'index.html',
  'docs.html',
  'app.html',
  'ograf.html',
  'src/control/productionControllerHtml.ts',
  'src/export/showExport.ts',
  'src/validation/engineSupport.ts',
];

/**
 * Every permitted mention, with the reason. `line` is the exact trimmed source line: change the
 * line and the gate asks again, which is the point.
 *
 * The permitted shapes are only these two - a TARGET LIST (the client named beside its peers) and
 * a TARGET'S OWN SURFACE (the SPX export package's README, the SPX target's label, the note on the
 * SPX card in the export dialog). Anything else is the product's own vocabulary.
 */
const ALLOWED = [
  // ── Target lists: the client named beside its peers, which IS the anything-goes promise. ──
  { file: 'index.html', line: '<span class="chip on">SPX Graphics</span>', why: 'export-target chip, listed beside OBS/vMix/CasparCG/OGraf/H2R/LiveOS' },
  { file: 'index.html', line: '<img src="/landing/shot-export.png" alt="The export dialog listing packages for SPX, OBS and vMix overlays, H2R, CasparCG, OGraf and LiveOS" loading="lazy" />', why: 'alt text describing a screenshot of the target list' },
  { file: 'app.html', line: 'content="The NoaCG Studio app: create on-air lower thirds, tickers, scoreboards and more without code, run them live from your browser, and export to OGraf, CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix."', why: 'target list in the page description' },
  { file: 'app.html', line: '<meta property="og:description" content="Create live graphics. Run the show. Premium on-air graphics, driven live from your browser or exported for OGraf, CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix." />', why: 'target list in the share description' },
  { file: 'index.html', line: 'content="Live graphics, made simple. NoaCG Studio is a free, open source browser tool for making broadcast graphics from a template, with AI, from your own artwork, or with a coding agent, then running them live from an online playout dashboard or exporting them as OGraf, CasparCG, SPX, OBS and vMix packages."', why: 'target list in the page description' },
  { file: 'index.html', line: 'vMix and SPX packages run from a local file on your own machine with no account and no', why: 'the single-file targets named beside each other in the no-lock-in section' },
  { file: 'ograf.html', line: '<li>Free and open source · also exports to SPX, CasparCG, OBS, vMix</li>', why: 'target list on the OGraf starters page' },
  { file: 'ograf.html', line: 'the same graphics exist for SPX, CasparCG, OBS and vMix.', why: 'target list on the OGraf starters page' },
  { file: 'src/components/wizard/steps/EntryStep.tsx', line: 'CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix.', why: 'target list in the entry hero' },
  { file: 'src/components/wizard/steps/FinishStep.tsx', line: 'Just the files — OGraf, CasparCG, SPX, LiveOS, an OBS/vMix overlay', why: 'target list on the export door' },
  { file: 'src/components/wizard/import/ImportDesignStep.tsx', line: "? 'Name it, then send it to a production or export it: OGraf, CasparCG, SPX, LiveOS or an OBS/vMix overlay. Your file is kept exactly as you wrote it.'", why: 'target list on the import finish line' },
  { file: 'src/components/home/sections/ProductionsSection.tsx', line: 'title="Export every graphic of this production — OGraf, CasparCG, SPX, OBS/vMix overlay, H2R, LiveOS"', why: 'target list on the export button' },
  { file: 'docs.html', line: 'The folder is at the same time a valid <strong>SPX</strong> package and an', why: 'names the two FORMATS one file satisfies at once - the fact is the point' },
  { file: 'docs.html', line: '<td>A playout system that loads a <strong>folder of templates</strong>, such as <strong>SPX</strong></td>', why: "the 'which package do I want' table's row for folder-loading playout, named beside OBS/vMix, CasparCG, OGraf, LiveOS and H2R - a reader running it has to find their own row" },
  { file: 'docs.html', line: '<td>SPX export</td>', why: "the same table's Take column: the literal label of the export button that row sends the reader to" },

  // ── A named target's own surface, or genuinely host-specific instruction. The reader has
  //    already chosen that host, so telling them where its templates folder is IS the help.
  { file: 'src/components/home/ProductionExportDialog.tsx', line: "spx: ' Controlled by your SPX rundown.',", why: "the per-target note, keyed by the target id the user picked" },
  { file: 'src/components/home/ProductionExportDialog.tsx', line: '<strong> live</strong> production into SPX instead - cued from here, from the control', why: 'contrasts the offline package with driving that same host live' },
  { file: 'src/components/home/ProductionPage.tsx', line: "setNote('✓ Template file downloaded. Drop it into SPX ASSETS/templates (or your CasparCG template folder) and add it to a rundown.');", why: 'where the downloaded file goes, in the two hosts that load template files' },
  { file: 'src/components/home/ProductionLinks.tsx', line: 'For playout that loads template <em>files</em> instead of URLs - SPX, or a CasparCG', why: 'names which hosts this download is for' },
  { file: 'src/components/home/ProductionLinks.tsx', line: 'template folder. Drop it into SPX&rsquo;s <code>ASSETS/templates</code> and add it to a', why: 'the actual path in that host' },
  { file: 'src/export/showExport.ts', line: "'In an SPX rundown the fields appear by name and you never type an id. A CasparCG ' +", why: 'the exported FIELDS.md explaining how each host addresses fields' },
  { file: 'src/export/showExport.ts', line: "`Serve this folder over http (SPX's template server, or any local web server), run each\\n` +", why: 'names one concrete way to serve the folder' },
  { file: 'src/export/showExport.ts', line: '`every local file its own private origin. In an SPX or CasparCG rundown you do not need the\\n` +', why: 'says which hosts make the bundled panel unnecessary' },
  { file: 'src/export/showExport.ts', line: '`\\nExtract this folder into your SPX/CasparCG templates directory as-is.\\n`,', why: 'where the exported folder goes in the template-file hosts' },
  { file: 'src/validation/engineSupport.ts', line: "{ id: 'browser', label: 'A current browser', chromium: null, note: 'SPX’s own renderer, and the studio preview' },", why: 'names which renderer an engine row IS' },
];

/**
 * Blank every comment, keeping every newline so line numbers still point at the source. A
 * comment naming SPX is engineering vocabulary about the internal format and is out of scope -
 * and a line-start test cannot tell one from code, because a JSX comment (`{/* … *\/}`) and the
 * middle lines of a block comment both sit wherever the formatter put them.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
}

function scan() {
  // git ls-files resolves the globs the same way the repo tracks them, so an untracked scratch
  // file can never fail somebody\'s build.
  const listed = execFileSync('git', ['ls-files', '--', ...SCANNED], { cwd: projectRoot, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    // A directory pathspec sweeps in CSS and the nested AGENTS.md contracts; only source and
    // markup carry strings a user reads, and a contract naming SPX is engineering prose.
    .filter((f) => /\.(tsx|ts|html)$/.test(f));

  const findings = [];
  for (const file of listed) {
    const source = readFileSync(path.join(projectRoot, file), 'utf8').split(/\r?\n/);
    stripComments(source.join('\n')).split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!CLIENTS.some((c) => line.includes(c))) return;
      // The format's own identifier is a literal, not a sentence about the product.
      if (line.includes('SPXGCTemplateDefinition') && !/SPX(?!GC)/.test(line)) return;
      const original = source[i].trim();
      if (ALLOWED.some((a) => a.file === file && a.line === original)) return;
      findings.push({ file, line: i + 1, text: original.slice(0, 150) });
    });
  }
  return findings;
}

const findings = scan();
const label = `Client-neutral copy - ${CLIENTS.join(', ')} may be named as a TARGET, never as the product's own vocabulary`;

if (findings.length === 0) {
  console.log(`${label}\n\nPASS - no client name is doing a general concept's job.`);
  process.exit(0);
}

console.error(`${label}\n`);
for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.text}`);
console.error(
  `\nFAIL - ${findings.length} user-visible mention(s).\n` +
    'Rewrite it in the product\'s own words ("playout", "your playout system", "the template\n' +
    'definition"), or - if the client is genuinely being named as one target among others -\n' +
    'add it to ALLOWED in this file with the reason.',
);
process.exit(1);
