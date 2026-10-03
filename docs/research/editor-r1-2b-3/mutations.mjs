// Run through npm run queue, alone on this worktree. Every mutation is restored in finally.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const images = 'src/blocks/editorImages.ts', reader = 'src/assets/fileImport.ts', hook = 'src/components/editorFoundation/useImageImport.ts', assetOps = 'src/blocks/assetOps.ts';
const originals = new Map([images, reader, hook, assetOps].map(file => [file, readFileSync(resolve(root, file), 'utf8')]));
const pause = () => new Promise(resolve => setTimeout(resolve, 2000));
const run = (grep) => spawnSync(process.execPath, grep ? ['node_modules/playwright/cli.js', 'test', 'e2e/editor-images.spec.ts', '--workers=1', '--grep', grep] : ['--test', 'scripts/editor-images.test.mjs'], { cwd: root, env: { ...process.env, DEV_PORT: '5299' }, encoding: 'utf8', timeout: 120000, maxBuffer: 20 * 1024 * 1024 });
const guard = (prefix) => (source) => {
  const line = source.split('\n').find(line => line.trimStart().startsWith(prefix));
  if (!line || !line.includes('throw new Error')) throw new Error('Missing guard: ' + prefix);
  return source.replace(line, line.replace(/if \(.*\) throw new Error/, 'if (false) throw new Error'));
};
const replace = (from, to) => source => { if (!source.includes(from)) throw new Error('Missing mutation: ' + from); return source.replace(from, to); };
const rows = [
  ['safe paths', images, guard('if (typeof path'), null],
  ['asset batch bounds', images, guard('if (!incoming.length'), null],
  ['embedded bytes', images, guard('if (!isDataUrl'), null],
  ['byte deduplication', images, replace('if (identical)', 'if (false && identical)'), null],
  ['used asset removal', images, guard('if (referenceCount'), null],
  ['missing asset removal', images, guard('if (!template.assets.some'), null],
  ['missing rename source', images, guard('if (!template.assets.some(a => a.path === from)'), null],
  ['renamed field defaults', assetOps, replace("fields: template.fields.map(field => typeof field.value === 'string' ? { ...field, value: rewrite(field.value) } : field),", 'fields: template.fields,'), null],
  ['finite image dimensions', images, guard('if (![natural.width'), null],
  ['finite drawing coordinates', images, guard('if (space.length'), null],
  ['uniform nonsingular parent', images, guard('if (Math.abs(determinant)'), null],
  ['natural size cap', images, replace('Math.min(1, template.resolution.width / 4 / natural.width, template.resolution.height / 4 / natural.height)', '1'), null],
  ['image asset membership', images, guard('if (!asset ||'), 'guards refuse'],
  ['replaceable element', images, guard("if (!['img'"), 'guards refuse'],
  ['image field type', images, guard("if (field &&"), 'guards refuse'],
  ['responsive image sources', images, guard('if (node.hasAttribute'), 'guards refuse'],
  ['code-driven image', images, guard('if (!field &&'), 'guards refuse'],
  ['replacement box', images, guard('if (![box.width'), 'guards refuse'],
  ['finite source placement', images, guard('if (![geometry.x'), 'guards refuse'],
  ['lossless motion', images, source => replace('import { losslessAnimData,', 'import { losslessAnimData, parseAnimData,')(replace('const data = losslessAnimData(next.js);', 'const data = parseAnimData(next.js);')(source)), 'guards refuse'],
  ['file batch bounds', reader, guard('if (!files.length'), 'file validation guards'],
  ['image-only chooser', reader, guard('if (imagesOnly'), 'file validation guards'],
  ['supported resource format', reader, guard('if (!isImageAsset(file.name)'), 'file validation guards'],
  ['video budget', reader, guard('if (isVideoAsset(file.name) &&'), 'file validation guards'],
  ['Lottie signature', reader, guard('if (/\\.json$'), 'file validation guards'],
  ['import decode gate', reader, replace('if (isImageAsset(file.name)) await imageSize(imported.data);', ''), 'file validation guards'],
  ['font decode gate', reader, replace('await face.load();', ''), 'file validation guards'],
  ['image decoder rejection', reader, replace('await image.decode();', ''), 'file validation guards'],
  ['positive decoded pixels', reader, guard('if (!image.naturalWidth'), 'file validation guards'],
  ['file cancellation', hook, replace("if (id !== run.run) return '';\n      execute", 'if (false) return \x27\x27;\n      execute'), 'Escape, failed reads'],
  ['asset placement cancellation', hook, replace('if (id === run.run) execute([operation], expected);', 'execute([operation], expected);'), 'Escape also cancels'],
  ['asset replacement cancellation', hook, replace("if (id === run.run) execute([{ kind: 'image.replace'", "execute([{ kind: 'image.replace'"), 'Escape also cancels'],
  ['pending surface wait', hook, replace('while (!space.current &&', 'while (false &&'), 'a canvas drop waits'],
];
const selected = process.argv.slice(2);
const cases = selected.length ? rows.filter(row => selected.includes(row[0].replaceAll(' ', '-'))) : rows;
if (!cases.length) throw new Error('No named guard mutations matched.');
let survived = 0;
try {
  for (const grep of [null, [...new Set(cases.map(row => row[3]).filter(Boolean))].join('|')]) {
    const control = run(grep); if (control.status !== 0) { process.stdout.write(control.stdout + control.stderr); throw new Error('Unmodified control failed'); }
  }
  for (const [name, file, edit, grep] of cases) {
    try {
      writeFileSync(resolve(root, file), edit(originals.get(file).replace(/\r\n/g, '\n'))); await pause();
      const result = run(grep);
      if (result.error || !(grep ? /\d+ (?:failed|passed)/ : /tests \d+/).test(result.stdout)) throw result.error ?? new Error('No test verdict: ' + result.stdout + result.stderr);
      const killed = result.status !== 0;
      console.log(`${killed ? 'KILLED' : 'SURVIVED'}: ${name}`);
      if (!killed) survived++;
    } finally { writeFileSync(resolve(root, file), originals.get(file)); await pause(); }
  }
} finally {
  for (const [file, source] of originals) {
    writeFileSync(resolve(root, file), source);
    if (readFileSync(resolve(root, file), 'utf8') !== source) throw new Error('Restoration failed: ' + file);
  }
  console.log('All mutated sources restored byte-for-byte.');
}
if (survived) throw new Error(`${survived} guard mutation(s) survived`);
console.log(`${cases.length}/${cases.length} guard mutations killed.`);
