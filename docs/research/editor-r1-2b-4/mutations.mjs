// Run alone through npm run queue. Restore every source byte before the next mutation.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const geometry = 'src/blocks/pathGeometry.ts', writer = 'src/blocks/editorPaths.ts', hook = 'src/components/editorFoundation/usePenGesture.ts';
const runtime = 'src/components/editorFoundation/runtime.ts', canvas = 'src/components/editorFoundation/Canvas.tsx';
const controls = 'src/components/editorFoundation/PathControls.tsx';
const original = new Map([geometry, writer, hook, runtime, canvas, controls].map(file => [file, readFileSync(file)]));
const sleep = () => new Promise(resolve => setTimeout(resolve, 2000));
const change = (from, to) => source => { if (!source.includes(from)) throw new Error('Missing mutation: ' + from); return source.replace(from, to); };
const guard = prefix => source => {
  const line = source.split('\n').find(line => line.trimStart().startsWith(prefix));
  if (!line || !line.includes('throw new Error')) throw new Error('Missing guard: ' + prefix);
  return source.replace(line, line.replace(/if \(.*\) throw new Error/, 'if (false) throw new Error'));
};
const rows = [
  ['bounded points', geometry, guard('if (typeof path.closed'), null],
  ['finite vertices and tangents', geometry, guard('if (path.points.some'), null],
  ['token syntax', geometry, guard('if (!source.trim()'), null],
  ['coordinate pairs', geometry, guard('if (a === undefined'), null],
  ['supported commands', geometry, guard('if (!/^[mMlLcCzZ]'), null],
  ['terminal closure', geometry, guard('if (path.closed)'), null],
  ['single subpath', geometry, guard("if (upper === 'M' &&"), null],
  ['initial move', geometry, guard("if (upper !== 'M'"), null],
  ['point and handle target', geometry, guard('if (!Number.isInteger(index)'), null],
  ['finite matrix', geometry, guard('if (matrix.length'), null],
  ['nonsingular matrix', geometry, guard('if (inverse && Math.abs(determinant)'), null],
  ['singular display', geometry, change('if (inverse && Math.abs(determinant)', 'if (Math.abs(determinant)'), null],
  ['cubic closure', geometry, change('if (end.in) path.points[0].in = end.in;', ''), null],
  ['carried tangents', geometry, change("for (const side of ['in', 'out'] as const) if (from[side])", "for (const side of ['in', 'out'] as const) if (false && from[side])"), null],
  ['curve extrema', geometry, change('if (t > 0 && t < 1) values.push', 'if (false) values.push'), null],
  ['literal attributes', writer, guard("if (!['d', 'fill'"), null],
  ['duplicate attributes', writer, guard('if (matches.length'), null],
  ['HTML attribute case', writer, change("'gi');", "'g');"), null],
  ['placement time', writer, guard('if (!Number.isFinite(time)'), 'guards refuse'],
  ['exact timeline', writer, change('const data = losslessAnimData(template.js);', 'const data = JSON.parse(template.js.match(/var NOACG_ANIM = (\\{[\\s\\S]*?\\});/)[1]);'), 'guards refuse'],
  ['CSS and SVG geometry', writer, guard("if (cssOwns(template, node, 'd')"), 'guards refuse'],
  ['animated CSS ownership', writer, change('rule instanceof CSSKeyframesRule && names.has(rule.name)', 'false && rule instanceof CSSKeyframesRule && names.has(rule.name)'), 'guards refuse'],
  ['independent SVG transform', writer, guard("if (['scale', 'rotate', 'translate']"), 'guards refuse'],
  ['code-driven geometry', writer, guard('if (driven &&'), 'guards refuse'],
  ['path topology', writer, guard('if (geometry.closed'), 'guards refuse'],
  ['paint changes', writer, guard('if (!Object.values(paint)'), 'guards refuse'],
  ['solid paint', writer, change("if (value !== undefined && !/^(none|#[\\da-f]{6})$/i.test(value))", 'if (false)'), 'guards refuse'],
  ['stroke width', writer, guard('if (paint.width !== undefined'), 'guards refuse'],
  ['CSS paint priority', writer, guard('if (cssOwns(template, node, name))'), 'guards refuse'],
  ['draft revision', hook, guard('if (!sameRevision(value.expected'), 'stale draft'],
  ['draft playhead', hook, guard('if (view.time !== value.time'), 'draft playhead'],
  ['point gesture cancellation', hook, change('if (current.current) session.cancel(); current.current = null; setDraft(null);', 'if (current.current) session.cancel();'), 'open polyline'],
  ['edited path hit bounds', runtime, change("var hit = path && element.hasAttribute('data-pen-path') ? path.getBoundingClientRect() : rect;", 'var hit = rect;'), 'edited path remains'],
  ['thin stroke selection', canvas, change('const tolerance = p.pathMatrix ? 4 / scale : 0;', 'const tolerance = 0;'), 'horizontal open'],
  ['pixel width reading', controls, change('value={parseFloat(width)}', 'value={Number(width)}'), 'SVG stroke width'],
  ['relative width refusal', controls, change('supportedWidth ? <PaintField', 'true ? <PaintField'), 'SVG stroke width'],
];
const run = grep => spawnSync(process.execPath, grep ? ['node_modules/playwright/cli.js', 'test', 'e2e/editor-pen.spec.ts', '--workers=1', '--grep', grep] : ['--test', 'scripts/editor-pen.test.mjs'], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, DEV_PORT: '5299' } });
const selected = process.argv.slice(2);
const cases = selected.length ? rows.filter(([name]) => selected.includes(name.replaceAll(' ', '-'))) : rows;
if (!cases.length) throw new Error('No named mutations matched.');
for (const grep of [null, 'guards refuse|stale draft|draft playhead|open polyline|zero-scale|edited path remains|horizontal open|SVG stroke width']) {
  const control = run(grep); if (control.status !== 0) { process.stdout.write(control.stdout + control.stderr); throw new Error('Unmodified control failed.'); }
}
let survived = 0;
try {
  for (const [name, file, mutate, grep] of cases) {
    writeFileSync(file, mutate(original.get(file).toString())); await sleep();
    const result = run(grep), killed = result.status !== 0 && !result.error;
    console.log((killed ? 'KILLED' : 'SURVIVED') + ': ' + name);
    if (!killed) { survived++; process.stdout.write(result.stdout + result.stderr); }
    writeFileSync(file, original.get(file)); await sleep();
  }
} finally {
  for (const [file, bytes] of original) writeFileSync(file, bytes);
  if ([...original].some(([file, bytes]) => !readFileSync(file).equals(bytes))) throw new Error('Source restoration failed.');
  console.log('Every source restored byte-for-byte.');
}
console.log(`${cases.length - survived}/${cases.length} mutations killed.`);
if (survived) process.exitCode = 1;
