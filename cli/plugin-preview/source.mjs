import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const FIXTURE_ROOT = fileURLToPath(new URL('./fixture/', import.meta.url));
export const SOURCE_FILES = ['badge.svg', 'graphic.css', 'graphic.html', 'graphic.js'];
export const SIZE = { width: 1920, height: 1080 };

// This is an exact file-byte revision, intentionally distinct from the CLI's normalized
// template digest. Only these four fixture files are readable by this local trial.
export async function readSource(root = FIXTURE_ROOT) {
  const files = {};
  const hash = createHash('sha256');
  for (const name of SOURCE_FILES) {
    const filename = path.join(root, name);
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error(`Refused fixture file: ${name}`);
    const bytes = await readFile(filename);
    hash.update(`${name}\0${bytes.length}\0`).update(bytes);
    files[name] = bytes.toString('utf8');
  }
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  let document = files['graphic.html']
    .replace(/<link\s+rel="stylesheet"\s+href="graphic\.css"\s*\/?\s*>/i, () => `<style>${files['graphic.css'].replace(/<\/style/gi, '<\\/style')}</style>`)
    .replace(/<script\s+src="graphic\.js"\s*>\s*<\/script>/i, () => `<script>${files['graphic.js'].replace(/<\/script/gi, '<\\/script')}</script>`)
    .replaceAll('src="badge.svg"', `src="data:image/svg+xml;base64,${Buffer.from(files['badge.svg']).toString('base64')}"`);
  document = document.replace(/<head\s*>/i, (head) => `${head}<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  document = document.replace(/<\/body>/i, '<script>window.play?.();</script></body>');
  return { packageId: 'noacg-preview-lower-third', revision: `files-sha256:${hash.digest('hex')}`, sourceRoot: root, sourceFiles: SOURCE_FILES, size: SIZE, document };
}
