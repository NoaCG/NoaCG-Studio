import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const FIXTURE_ROOT = fileURLToPath(new URL('./fixture/', import.meta.url));
export const SOURCE_FILES = ['badge.svg', 'graphic.css', 'graphic.html', 'graphic.js'];
export const SIZE = { width: 1920, height: 1080 };
const MIME = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' };
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const escapeEnd = (text, tag) => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
async function replaceAsync(text, expression, replacement) {
  const matches = [...text.matchAll(expression)];
  const values = [];
  let expandedLength = text.length;
  // Sequential traversal bounds the file budget and gives cycles a deterministic refusal.
  for (const match of matches) {
    const value = await replacement(...match);
    expandedLength += value.length - match[0].length;
    if (expandedLength > 24 * 1024 * 1024) throw new Error('Expanded package document exceeds the trial limit.');
    values.push(value);
  }
  let index = 0;
  return text.replace(expression, () => values[index++]);
}

// The configured directory is the only filesystem authority. Read the HTML dependency
// closure, never arbitrary files requested by graphic JS or a tool argument. No source is
// evaluated here. Keep sorted exact-byte hashing compatible with the phase-1 fixture.
export async function readSource(root = FIXTURE_ROOT, entry = 'graphic.html') {
  root = path.resolve(root);
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new Error('Package root must be a real directory.');
  const canonical = await realpath(root);
  const deferredScripts = [];
  const stylesheets = new Map();
  const files = new Map();
  let total = 0;
  const localPath = (reference, from) => {
    if (/^(?:data:|#)/i.test(reference)) return null;
    if (/^[a-z][a-z\d+.-]*:|^[/\\]|\\/i.test(reference)) throw new Error(`Only relative package resources are supported: ${reference}`);
    const decoded = decodeURIComponent(reference.split(/[?#]/)[0]);
    if (decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid package resource path.');
    const name = path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded));
    if (name.split('/').some((part) => part.startsWith('.')) || !MIME[name.split('.').pop()?.toLowerCase()]) throw new Error(`Refused package resource: ${reference}`);
    return name;
  };
  const read = async (name) => {
    if (files.has(name)) return files.get(name);
    if (files.size >= 128) throw new Error('Package dependency limit exceeded (128 files).');
    let filename = root;
    const parts = name.split('/');
    for (const [index, part] of parts.entries()) {
      filename = path.join(filename, part);
      const stat = await lstat(filename);
      if (stat.isSymbolicLink()) throw new Error(`Refused symbolic link: ${name}`);
      if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) throw new Error(`Refused resource type: ${name}`);
    }
    if (!(await realpath(filename)).startsWith(canonical + path.sep)) throw new Error(`Resource escapes package: ${name}`);
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024 || total + stat.size > 16 * 1024 * 1024) throw new Error(`Package resource too large: ${name}`);
      const bytes = await handle.readFile();
      if (bytes.length > 4 * 1024 * 1024 || total + bytes.length > 16 * 1024 * 1024) throw new Error(`Package resource too large: ${name}`);
      if (!(await realpath(filename)).startsWith(canonical + path.sep)) throw new Error(`Resource escapes package: ${name}`);
      files.set(name, bytes);
      total += bytes.length;
      return bytes;
    } finally { await handle.close(); }
  };
  const dataUrl = async (reference, from) => {
    const name = localPath(reference, from);
    if (!name) return reference;
    const bytes = await read(name);
    return `data:${MIME[name.split('.').pop().toLowerCase()]};base64,${bytes.toString('base64')}${reference.includes('#') ? '#' + reference.split('#')[1] : ''}`;
  };
  const css = async (text, from, ancestors = []) => {
    if (ancestors.includes(from)) throw new Error(`Circular stylesheet import: ${from}`);
    const chain = [...ancestors, from];
    text = await replaceAsync(text, /@import\s+(?:url\(\s*(["']?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)\s*([^;]*);/gi, async (_, quote, url, otherQuote, literal, media) => {
      const reference = (url ?? literal).trim();
      const name = localPath(reference, from);
      if (!name || !/\.css$/i.test(name)) throw new Error('Stylesheet imports must be local CSS files.');
      if (!stylesheets.has(name)) stylesheets.set(name, await css((await read(name)).toString('utf8'), name, chain));
      const imported = stylesheets.get(name);
      return media.trim() ? `@media ${media.trim()}{${imported}}` : imported;
    });
    return replaceAsync(text, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (_, quote, reference) => `url("${await dataUrl(reference.trim(), from)}")`);
  };
  entry = localPath(entry, 'root.html');
  if (!entry || !/\.html$/i.test(entry)) throw new Error('Choose a relative HTML entry point.');
  let document = (await read(entry)).toString('utf8');
  // A first policy applies even before an authored head/tag/script. An authored policy can
  // tighten this one but cannot widen it. No asset server or authenticated origin exists.
  document = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}">` + document.replace(/<!doctype[^>]*>/i, '');
  document = await replaceAsync(document, /<link\b[^>]*>/gi, async (tag) => {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return tag;
    const reference = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const name = reference && localPath(reference, entry);
    if (!name) throw new Error('Stylesheets must be relative package files.');
    return `<style>${escapeEnd(await css((await read(name)).toString('utf8'), name), 'style')}</style>`;
  });
  document = await replaceAsync(document, /<script\b([^>]*)>\s*<\/script>/gi, async (tag, attributes) => {
    const reference = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!reference) return tag;
    const name = localPath(reference, entry);
    if (!name || !/\.js$/i.test(name) || /\btype\s*=\s*["']module["']/i.test(attributes)) throw new Error('The trial supports local classic JavaScript entry scripts.');
    if (/\basync(?:\s|=|$)/i.test(attributes)) throw new Error('Async script entry points are not supported by this trial.');
    const script = `<script>${escapeEnd((await read(name)).toString('utf8'), 'script')}</script>`;
    if (/\bdefer(?:\s|=|$)/i.test(attributes)) { deferredScripts.push(script); return ''; }
    return script;
  });
  document = await replaceAsync(document, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (_, body) => `<style>${escapeEnd(await css(body, entry), 'style')}</style>`);
  document = await replaceAsync(document, /\b(src|poster)\s*=\s*(["'])([^"']+)\2/gi, async (_, attribute, quote, reference) => `${attribute}=${quote}${await dataUrl(reference, entry)}${quote}`);
  document = await replaceAsync(document, /\bstyle\s*=\s*(["'])([^"']*)\1/gi, async (_, quote, body) => `style=${quote}${(await css(body, entry)).replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')}${quote}`);
  document += deferredScripts.join('');
  // Literal image/font paths in classic JS (including definition defaults) use the same
  // package closure as markup. Dynamic paths and module imports need a later package adapter.
  document = await replaceAsync(document, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, async (_, attributes, body) => {
    const inlined = await replaceAsync(body, /(["'])([^"'\n]+\.(?:svg|png|jpe?g|gif|webp|avif|woff2?|ttf|otf))\1/gi, async (literal, quote, reference) => {
      if (/^(?:data:|https?:|#)/i.test(reference)) return literal;
      return quote + await dataUrl(reference, entry) + quote;
    });
    return `<script${attributes}>${inlined}</script>`;
  });
  const sourceFiles = [...files.keys()].sort();
  const hash = createHash('sha256');
  for (const name of sourceFiles) { const bytes = files.get(name); hash.update(`${name}\0${bytes.length}\0`).update(bytes); }
  return { packageId: root === path.resolve(FIXTURE_ROOT) || sourceFiles.join() === SOURCE_FILES.join() ? 'noacg-preview-lower-third' : path.basename(root), revision: `files-sha256:${hash.digest('hex')}`, sourceRoot: root, sourceFiles, entry, document, assetUrls: Object.fromEntries([...files].filter(([name]) => MIME[name.split('.').pop().toLowerCase()].startsWith('image/')).map(([name, bytes]) => [name, `data:${MIME[name.split('.').pop().toLowerCase()]};base64,${bytes.toString('base64')}`])) };
}
