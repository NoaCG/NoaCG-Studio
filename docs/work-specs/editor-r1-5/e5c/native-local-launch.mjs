// Local E5 setup only. DEV prepares fixtures; --preview is the production timing route.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const wanted = process.argv[2], preview = process.argv[3] === '--preview';
const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(wanted ?? '') || actual !== wanted) throw new Error('Candidate HEAD mismatch.');
if (process.argv.length !== 4 || !['--preview', '--prepare'].includes(process.argv[3])) throw new Error('Choose --preview for production or --prepare for DEV fixture setup.');
if (preview) {
  const dist = join(root, 'dist'), receiptPath = 'e5-qualification/bundle.json';
  const version = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'));
  const receipt = JSON.parse(readFileSync(join(dist, receiptPath), 'utf8'));
  if (version.commit !== wanted || receipt.source !== wanted || receipt.offline !== true) throw new Error('Candidate bundle identity mismatch.');
  const files = [];
  const walk = (dir, prefix = '') => { for (const name of readdirSync(dir)) { const path = join(dir, name), relative = prefix + name, stat = lstatSync(path); if (stat.isSymbolicLink()) throw new Error('Candidate bundle contains symlink.'); if (stat.isDirectory()) walk(path, relative + '/'); else if (stat.isFile() && relative !== receiptPath) files.push(relative); else if (!stat.isFile()) throw new Error('Candidate bundle contains unsupported entry.'); } };
  walk(dist);
  if (JSON.stringify(files.sort()) !== JSON.stringify(Object.keys(receipt.files ?? {}).sort())) throw new Error('Candidate bundle inventory mismatch.');
  for (const path of files) if (createHash('sha256').update(readFileSync(join(dist, path))).digest('hex') !== receipt.files[path]) throw new Error('Candidate bundle file hash mismatch.');
}
const env = { ...process.env, VITE_PREVIEW_DEBOUNCE_MS: '350', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_RENDER_API: '1', VITE_AI_PROVIDER: '', VITE_AI_MODEL: '', VITE_AI_PROXY_URL: '', VITE_AI_FALLBACKS: '[]', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '', AI_PRO_ENABLED: '' };
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'HF_TOKEN', 'HUGGINGFACE_TOKEN', 'HUGGINGFACE_API_KEY', 'AI_KEY_ENCRYPTION_SECRET']) env[key] = '';
console.log(`Local offline candidate ${actual}; ${preview ? 'PRODUCTION bundle verified; no /api' : 'DEV functional setup ONLY; unqualified for production latency'}; preview debounce 350ms.`);
const child = spawn(process.execPath, ['scripts/dev-worktree.mjs', ...(preview ? ['--preview'] : [])], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
