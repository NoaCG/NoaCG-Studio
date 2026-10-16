// The digest of a graphic's sources: one sha256 that says WHICH version of a package something
// describes. `validate --json`, `coverage` and `record` all print it, so a host that collects a
// handed-in record can prove it is the version whose frames were last looked at, not an earlier
// or a later one (docs/work-specs/noacg-harness/spec.md D3).
//
// It is taken over the NORMALIZED template (what the bridge's normalize returns), never over the
// files on disk: validate regenerates the generated half of a package in place, a Windows checkout
// rewrites line endings, and a zip and a folder of the same graphic must agree. Everything the
// template carries counts, its name included, so a rename is a new version too. Keys are sorted
// and line endings are LF before hashing, so the digest is the same on every machine.

import { createHash } from 'node:crypto';
import type { SpxTemplate } from './bridgeClient.js';

/** `sha256:<hex>` - prefixed so a reader never mistakes it for some other hash of the package. */
export type SourceDigest = `sha256:${string}`;

const lf = (s: string) => s.replace(/\r\n?/g, '\n');

/** The JSON of `value` with every object's keys sorted, so the order a bridge emits never counts. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** The frame `validate --screenshots` writes into a package. It is an output of a validate, never
 *  a source: a folder is read without it (workspace.ts `zipDirectory`), and the importer leaves it
 *  out of a zip whose manifest names it (src/model/importTemplate.ts). The digest still skips it
 *  because the bridge it reads through can be a deployment from before that, where a zip carried
 *  it as an asset and a handed-in `record.zip` read as another version than its folder. */
export const THUMBNAIL_ASSET = 'thumbnail.png';

export function sourceDigest(template: SpxTemplate): SourceDigest {
  const assets = (template.assets ?? []).filter((a) => a.path !== THUMBNAIL_ASSET).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const subject = { ...template, html: lf(template.html ?? ''), css: lf(template.css ?? ''), js: lf(template.js ?? ''), assets };
  return `sha256:${createHash('sha256').update(canonicalJson(subject)).digest('hex')}`;
}
