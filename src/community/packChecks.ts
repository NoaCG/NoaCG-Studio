// The community pack's AUTOMATIC CHECKS and its builder (docs/work-specs/community-packs/spec.md
// AC-7, D2, D9). One pure check runs in two browsers: the maker's, on the submit sheet, for
// feedback; and the admin's, on the pack the server actually stored, so a forged submission meets
// the same checks before a human looks at it. The server's own refusals (who may submit, size,
// format marker) live in migration 0079.

import { publishGate } from '../validation/publishGate';
import { packGraphicEntry, type GraphicsPack } from '../packs/graphicsPack';
import type { SpxTemplate } from '../model/types';
import { formatBytes } from '../model/storageHealth';
import { requestMessage } from '../validation/networkGuard';

/** The server refuses a pack file above this (migration 0079), so the sheet says it first. */
const PACK_LIMIT_BYTES = 8 * 1024 * 1024;
/** The server's graphic count limit (migration 0079). */
const PACK_MAX_GRAPHICS = 50;

const LICENSE_ID = 'CC-BY-4.0';

/** What a maker is about to submit, or what an admin is reviewing. */
export interface PackCandidate {
  name: string;
  description: string;
  /** The name the pack is shown under - the maker's free choice (spec D15). */
  author: string;
  graphics: Array<{ name: string; template: SpxTemplate; layer?: number }>;
}

/** One refusal. `graphic` names the graphic it is about; absent for the pack as a whole. */
export interface PackFinding {
  graphic?: string;
  message: string;
}

const PLACEHOLDER = /lorem ipsum/i;

/** Every reason this pack may not be sent (empty = it may). Pure and deterministic. */
export function checkPack(pack: PackCandidate): PackFinding[] {
  return [...checkPackMeta(pack), ...checkPackGraphics(pack.graphics)];
}

/** The pack's words: its name, description and the name it is shown under. */
export function checkPackMeta(meta: Pick<PackCandidate, 'name' | 'description' | 'author'>): PackFinding[] {
  const findings: PackFinding[] = [];
  if (!meta.name.trim()) findings.push({ message: 'Give the pack a name.' });
  if (!meta.description.trim()) findings.push({ message: 'Describe the pack in one line.' });
  if (!meta.author.trim()) findings.push({ message: 'Choose the name the pack is shown under.' });
  return findings;
}

/** The chosen graphics: at least one, distinct names, each through the publish gate, and no
 *  placeholder text. The costly half (the gate parses each graphic), so callers memoize it. */
export function checkPackGraphics(graphics: PackCandidate['graphics']): PackFinding[] {
  const findings: PackFinding[] = [];
  if (graphics.length === 0) findings.push({ message: 'Choose at least one graphic.' });
  if (graphics.length > PACK_MAX_GRAPHICS) {
    findings.push({ message: `A pack holds at most ${PACK_MAX_GRAPHICS} graphics; untick ${graphics.length - PACK_MAX_GRAPHICS}.` });
  }

  const seen = new Set<string>();
  for (const g of graphics) {
    const key = g.name.trim().toLowerCase();
    if (seen.has(key)) findings.push({ graphic: g.name, message: 'Two graphics share this name. Rename one first.' });
    seen.add(key);

    const gate = publishGate(g.template, true);
    for (const issue of gate.errors) findings.push({ graphic: g.name, message: issue.message });

    const t = g.template;
    const text = `${t.html}\n${t.css}\n${t.js}\n${JSON.stringify(t.fields ?? [])}`;
    if (PLACEHOLDER.test(text)) findings.push({ graphic: g.name, message: 'It still holds placeholder text (lorem ipsum).' });
  }
  return findings;
}

/** One request check at a time on this page: several review rows mounting together would
 *  otherwise play every pack's graphics at once and starve each other's frames. */
let benchTurn: Promise<unknown> = Promise.resolve();

/** The observed-request refusal (spec D5): each graphic played through the network bench, one at
 *  a time, and every request it made that leaves the pack named. Each plays as the pack carries it
 *  (`packGraphicEntry`: sounds and pictures inlined), so a library graphic's stored sound is not
 *  mistaken for a request. Asynchronous and slow (a few seconds a graphic), so it runs on Send and
 *  on the admin's review row, never as the sheet changes. `onProgress` hears which graphic is
 *  being checked. Browser-only. */
export function checkPackRequests(
  graphics: PackCandidate['graphics'],
  onProgress?: (index: number, total: number) => void,
): Promise<PackFinding[]> {
  const run = async (): Promise<PackFinding[]> => {
    const { observeRequests } = await import('../validation/networkBench');
    const findings: PackFinding[] = [];
    for (const [index, g] of graphics.entries()) {
      onProgress?.(index, graphics.length);
      try {
        const entry = await packGraphicEntry(g.template, { name: g.name });
        const carried = { ...g.template, html: entry.html, css: entry.css, js: entry.js, assets: entry.assets ?? [] };
        for (const r of await observeRequests(carried)) findings.push({ graphic: g.name, message: requestMessage(r) });
      } catch (error) {
        findings.push({ graphic: g.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return findings;
  };
  const turn = benchTurn.then(run, run);
  benchTurn = turn.catch(() => undefined);
  return turn;
}

/** The size refusal for a serialized pack, or null when it fits. */
export function checkPackSize(json: string): PackFinding | null {
  const bytes = new TextEncoder().encode(json).length;
  if (bytes <= PACK_LIMIT_BYTES) return null;
  return {
    message: `The pack is ${formatBytes(bytes)}; the limit is ${formatBytes(PACK_LIMIT_BYTES)}. Leave out a graphic with large pictures.`,
  };
}

/** The `noacg-pack` file for a set of graphics (spec D2): no rundown, so Install seeds one
 *  starter cue per graphic. The server writes `author` and `license` again from the submission. */
export async function buildCommunityPack(pack: PackCandidate): Promise<Record<string, unknown>> {
  const graphics = await Promise.all(pack.graphics.map((g) => packGraphicEntry(g.template, { name: g.name, layer: g.layer })));
  return {
    format: 'noacg-pack',
    version: 1,
    name: pack.name.trim(),
    description: pack.description.trim(),
    author: pack.author.trim(),
    license: LICENSE_ID,
    graphics,
  };
}

/** A parsed pack as a candidate, for the admin's re-check of what was stored. */
export function candidateOf(parsed: GraphicsPack, author: string): PackCandidate {
  return {
    name: parsed.name,
    description: parsed.description,
    author,
    graphics: parsed.graphics.map((g) => ({ name: g.template.name, template: g.template, layer: g.layer })),
  };
}
