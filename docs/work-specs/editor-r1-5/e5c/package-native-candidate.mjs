// Run only via the existing endurance Actions carrier; no performance campaign.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { smokeNativeKit } from './native-kit-smoke.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const started = Date.now(), deadline = started + 600_000, out = join(root, 'endurance-output/editor-native-kit');
mkdirSync(out, { recursive: true });
const receipt = { startedAt: new Date(started).toISOString(), status: 'failed', source: null, retries: 0, skips: 0, capMinutes: 10, cleanup: false };
const keep = () => writeFileSync(join(out, 'qualification.json'), JSON.stringify(receipt, null, 2) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const children = new Set();
const stop = child => { if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return; try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
const remaining = () => { const ms = deadline - Date.now(); if (ms <= 10_000) throw new Error('Native kit envelope exhausted before cleanup.'); return ms - 10_000; };
const timer = setTimeout(() => { receipt.error = 'Native kit ten-minute cap exceeded.'; for (const child of children) stop(child); keep(); process.exitCode = 1; }, 590_000);
keep();
try {
  if (process.argv.slice(2).join(' ') !== '--minutes 10' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Use the existing Actions carrier with --minutes 10.');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (source !== process.env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(source)) throw new Error('Actions source does not equal checked-out HEAD.');
  receipt.source = source; keep();
  const env = { ...process.env, VERCEL_GIT_COMMIT_SHA: source, VITE_PREVIEW_DEBOUNCE_MS: '350', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_RENDER_API: '1', VITE_AI_PROVIDER: '', VITE_AI_MODEL: '', VITE_AI_PROXY_URL: '', VITE_AI_FALLBACKS: '[]', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '', AI_PRO_ENABLED: '' };
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'HF_TOKEN', 'HUGGINGFACE_TOKEN', 'HUGGINGFACE_API_KEY', 'AI_KEY_ENCRYPTION_SECRET']) env[key] = '';
  receipt.buildStartedAt = new Date().toISOString(); keep();
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { cwd: root, env, stdio: 'inherit', detached: true }); children.add(child);
    const cap = setTimeout(() => { stop(child); reject(new Error('Full build exceeded the remaining native kit envelope.')); }, remaining() - 45_000);
    child.on('error', error => { clearTimeout(cap); children.delete(child); reject(error); }); child.on('exit', (code, signal) => { clearTimeout(cap); children.delete(child); if (code === 0) resolve(); else reject(new Error(`Full unchanged build failed: ${code}/${signal}.`)); });
  });
  receipt.buildCompletedAt = new Date().toISOString(); keep();
  if (JSON.parse(readFileSync(join(root, 'dist/version.json'), 'utf8')).commit !== source) throw new Error('Built version marker does not match candidate.');
  receipt.smoke = await smokeNativeKit({ root, out, source, env, remaining, children, stop });
  const captureExport = JSON.parse(readFileSync(join(root, 'docs/work-specs/editor-r1-5/e5c/capture-export.json'), 'utf8'));
  const fetched = spawnSync('git', ['fetch', '--no-write-fetch-head', '--depth=1', 'origin', captureExport.sourceCommit], { cwd: root, env, stdio: 'inherit', timeout: remaining() });
  if (fetched.status !== 0 || fetched.error) throw new Error('Exact retained capture source fetch failed.');
  receipt.renderedCaptures = [];
  for (const capture of captureExport.captures) {
    const path = capture.path;
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('Unsafe capture export path.');
    const bytes = execFileSync('git', ['cat-file', 'blob', capture.blob], { cwd: root, timeout: remaining(), maxBuffer: 8 * 1024 * 1024 });
    if (bytes.length !== capture.bytes || sha(bytes) !== capture.sha256) throw new Error('Retained capture identity mismatch.');
    const target = join(out, 'retained-e5c-captures', path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
    receipt.renderedCaptures.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== source) throw new Error('Capture export changed candidate source.');

  receipt.cleanup = receipt.smoke.cleanup === true;
  if (!receipt.cleanup) throw new Error('Owned native-kit resources were not cleaned.');
  const bundle = { source, offline: true, files: {} }, dist = join(root, 'dist'), zip = new JSZip();
  const walk = (dir, prefix = '') => { for (const name of readdirSync(dir)) { const path = join(dir, name), relative = prefix + name, stat = lstatSync(path); if (stat.isSymbolicLink()) throw new Error('Cannot package symlink.'); if (stat.isDirectory()) walk(path, relative + '/'); else if (stat.isFile()) { const bytes = readFileSync(path); zip.file('dist/' + relative, bytes); if (relative !== 'e5-qualification/bundle.json') bundle.files[relative] = sha(bytes); } } };
  walk(dist);
  const emitted = JSON.parse(readFileSync(join(dist, 'e5-qualification/bundle.json'), 'utf8'));
  if (emitted.source !== source || emitted.offline !== true || JSON.stringify(Object.keys(emitted.files).sort()) !== JSON.stringify(Object.keys(bundle.files).sort()) || Object.keys(bundle.files).some(path => emitted.files[path] !== bundle.files[path])) throw new Error('Bundle changed after its qualified preview.');
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }); remaining();
  writeFileSync(join(out, 'candidate.zip'), bytes); writeFileSync(join(out, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
  receipt.bundle = { file: 'candidate.zip', bytes: bytes.length, sha256: sha(bytes), receiptSha256: sha(readFileSync(join(out, 'bundle.json'))), versionCommit: source, fileCount: Object.keys(bundle.files).length };
  receipt.status = 'passed';
} catch (error) {
  receipt.error = String(error); process.exitCode = 1;
} finally {
  for (const child of children) stop(child);
  clearTimeout(timer); receipt.finishedAt = new Date().toISOString(); receipt.elapsedMs = Date.now() - started;
  if (receipt.elapsedMs > 600_000 || receipt.status !== 'passed' || !receipt.cleanup || !receipt.bundle) { receipt.status = 'failed'; process.exitCode = 1; }
  keep(); console.log(`${receipt.status.toUpperCase()} native candidate packaging/helper smoke; source ${receipt.source}; no performance verdict.`);
}
