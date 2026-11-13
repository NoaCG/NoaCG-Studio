// Local E5 setup only. No browser or benchmark is launched by this helper.
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const wanted = process.argv[2];
const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(wanted ?? '') || actual !== wanted) throw new Error('Pass the exact final qualification candidate SHA; it must equal this owned checkout HEAD.');
const env = { ...process.env, VITE_PREVIEW_DEBOUNCE_MS: '350', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_RENDER_API: '1', VITE_AI_PROVIDER: '', VITE_AI_MODEL: '', VITE_AI_PROXY_URL: '', AI_PRO_ENABLED: '' };
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'HF_TOKEN', 'HUGGINGFACE_TOKEN', 'HUGGINGFACE_API_KEY', 'AI_KEY_ENCRYPTION_SECRET']) env[key] = '';
console.log(`Local offline qualification candidate ${actual}; preview debounce 350ms. Use the owned URL printed below, then /app?editor=foundation#/editor-foundation. This is not a hosted/auth/WAN trial.`);
const child = spawn(process.execPath, ['scripts/dev-worktree.mjs'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
