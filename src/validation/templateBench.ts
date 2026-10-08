// Publish-safety "bench" checks, born with the Era 5.5 community gallery and now run wherever a
// template leaves its author: a community pack, a hosted production, a production export. These run
// IN ADDITION to validateTemplate (which owns SPX-contract correctness) and catch the extra hazards
// specific to SHARING a template with strangers: assets that can't be serialized, a bloated payload,
// and JS that is suspicious to run inside an importer's preview/renderer. Pure and offline.
//
// Split of responsibility with publishGate.ts: this module reports raw errors/warnings;
// publishGate.ts merges them with validateTemplate and decides which warnings become
// publish-blocking errors.

import { inlineScripts, isAllowedExternal } from './validateTemplate';
import { SOUND_RUNTIME_JS } from '../assets/graphicSoundRuntime';
import { SOUND_RUNTIME_V1_JS } from '../assets/graphicSoundRuntimeV1';
import { isSoundAssetRef, AUDIO_REF_PREFIX } from '../assets/soundAssets';
import type { SpxTemplate } from '../model/types';
import type { ValidationIssue, ValidationResult } from './validateTemplate';

/** Combined html+css+js size cap (data-URL assets are measured separately, below). */
const MAX_CODE_BYTES = 512 * 1024;
/** A published template shouldn't drag along an unreasonable number of assets. */
const MAX_ASSET_COUNT = 24;
/** Total data-URL payload across all assets (chars ≈ 1.33× real bytes, so ~9 MB of real media). */
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

/**
 * JS constructs that BLOCK sharing. A published template is code a stranger runs in their own
 * browser, today inside a preview iframe that shares the app's origin — so a graphic that talks
 * to the network, reaches out of its frame, or builds code at runtime is not a graphic, it is a
 * program running on someone else's account.
 *
 * These were warnings while publishing went through a reviewer. It does not: `community_templates`
 * defaults to status 'approved' (supabase/migrations/0004), so this function IS the review. A
 * warning nobody reads is not a gate.
 *
 * **Be honest about what this is.** A regex screen refuses the obvious and can always be evaded by
 * a determined author (`window['fetc'+'h']`), so it is one layer, not containment — the containment
 * is denying the preview the app's origin. What it does buy: publishing hostile code has to be
 * deliberate and disguised rather than a copy-paste, and the four opt-in blocks below can't be
 * shared by accident.
 *
 * The network rules are also what stops an ordinary mistake: the LIVE DATA, SHOW CHAT, REMOTE
 * CONTROL and HOSTED CONTROL blocks all point at the AUTHOR's own sheet, show or project. Shared,
 * they make every importer's graphic phone the author's endpoint and paint the author's data.
 * Each one is marked "edit or delete this whole block", which is exactly what the message says.
 */
const UNSAFE_JS: { re: RegExp; rule: string; note: string }[] = [
  { re: /\bfetch\s*\(/, rule: 'unsafe-js-network', note: 'calls fetch()' },
  { re: /\bXMLHttpRequest\b/, rule: 'unsafe-js-network', note: 'opens an XMLHttpRequest' },
  { re: /\bWebSocket\s*\(/, rule: 'unsafe-js-network', note: 'opens a WebSocket' },
  { re: /\bEventSource\s*\(/, rule: 'unsafe-js-network', note: 'opens an EventSource stream' },
  { re: /\bsendBeacon\s*\(/, rule: 'unsafe-js-network', note: 'calls navigator.sendBeacon()' },
  { re: /\bimport\s*\(/, rule: 'unsafe-js-network', note: 'imports a module at runtime' },
  { re: /\bnew\s+Worker\s*\(/, rule: 'unsafe-js-network', note: 'starts a Worker' },
  { re: /\bserviceWorker\b/, rule: 'unsafe-js-network', note: 'touches the service worker registry' },
  { re: /\beval\s*\(/, rule: 'unsafe-js-code', note: 'calls eval()' },
  { re: /new\s+Function\s*\(/, rule: 'unsafe-js-code', note: 'builds code at runtime with new Function()' },
  { re: /document\s*\.\s*cookie/, rule: 'unsafe-js-data', note: 'reads or writes document.cookie' },
  { re: /\b(?:local|session)Storage\b/, rule: 'unsafe-js-data', note: 'touches browser storage' },
  { re: /\bindexedDB\b/, rule: 'unsafe-js-data', note: 'touches IndexedDB' },
  // Cross-frame reach, written narrowly on purpose: a bare /\bparent\b/ would match `parentNode`
  // and `rect.top` is ordinary geometry, so match only the properties an escape actually uses.
  {
    re: /\b(?:window\s*\.\s*)?(?:parent|top|opener)\s*\.\s*(?:document|location|postMessage|localStorage|sessionStorage|frames|open|origin)\b/,
    rule: 'unsafe-js-frame',
    note: 'reaches outside its own frame (parent/top/opener)',
  },
];

/** Absolute URLs written into the JS — the exfiltration route the construct list above misses
 *  (`img.src = 'https://…/?' + data` calls nothing suspicious). Same allowlist as the HTML/CSS
 *  scan in validateTemplate, so an opt-in Supabase block reports as `external-dependency`
 *  (which publishGate.ts promotes for sharing) rather than as two different complaints. */
const JS_URL = /\bhttps?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s'"`)]*/gi;

function bytesOf(s: string): number {
  return typeof s === 'string' ? new TextEncoder().encode(s).byteLength : 0;
}

/**
 * Which unsafe constructs one JS pane contains — DETECTION only, no phrasing. Exported because
 * the AI harness screens generated code with the SAME list (src/ai/safety.ts): a template written
 * by a model that just read an uploaded reference image is no more trusted than one written by a
 * stranger, and two lists of what counts as unsafe would drift apart within a release. The two
 * callers word the finding differently because they are telling different people different things
 * ("delete that block before publishing" vs "the AI wrote this, don't apply it").
 */
export function unsafeJsConstructs(js: string): { rule: string; note: string }[] {
  // Only the exact shipped decoder is exempt: its URLs come from validated packaged sounds.
  // Modified helpers and any authored network code still meet the ordinary safety screen.
  js = js.replace(/\r\n/g, '\n').replace(SOUND_RUNTIME_JS, '').replace(SOUND_RUNTIME_V1_JS, '');
  return UNSAFE_JS.filter(({ re }) => re.test(js)).map(({ rule, note }) => ({ rule, note }));
}

/** Structural + safety checks beyond the SPX contract. Returns errors (block sharing) and warnings
 *  (informational; a human reviewer decides). */
export function runBench(template: SpxTemplate, production = false): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Every asset must be a data-URL string. A Blob (or any non-string) silently serializes to "{}"
  //    through JSON, losing the font/image — so it can never be published.
  let assetBytes = 0;
  for (const asset of template.assets) {
    if (asset.audio) {
      if (!production || !isSoundAssetRef(asset.audio) || asset.data !== AUDIO_REF_PREFIX + asset.audio.hash) errors.push({ rule: 'sound-asset-reference', message: 'Private production sound references cannot be shared as community media. Export the production pack to carry its sounds.' });
      continue;
    }
    if (typeof asset.data !== 'string') {
      errors.push({
        rule: 'asset-not-serializable',
        message: `Asset "${asset.path}" holds binary data that can't be shared. Re-upload it so it inlines as a data URL.`,
      });
      continue;
    }
    const data: string = asset.data;
    assetBytes += data.length;
    if (!data.startsWith('data:')) {
      warnings.push({
        rule: 'asset-unusual',
        message: `Asset "${asset.path}" is not an inline data URL; confirm it travels with the template.`,
      });
    }
  }

  // 2. Size caps — keep a shared row and its uploaded media reasonable.
  const codeBytes = bytesOf(template.html) + bytesOf(template.css) + bytesOf(template.js);
  if (codeBytes > MAX_CODE_BYTES) {
    errors.push({
      rule: 'too-large',
      message: `The template code is ${Math.round(codeBytes / 1024)} KB, over the ${Math.round(MAX_CODE_BYTES / 1024)} KB share limit.`,
    });
  }
  if (template.assets.filter(a=>!a.audio).length > MAX_ASSET_COUNT) {
    errors.push({
      rule: 'too-many-assets',
      message: `The template has ${template.assets.length} assets, over the limit of ${MAX_ASSET_COUNT}.`,
    });
  }
  if (assetBytes > MAX_ASSET_BYTES) {
    errors.push({
      rule: 'assets-too-large',
      message: `The bundled media is ~${Math.round(assetBytes / (1024 * 1024))} MB, over the ${Math.round(MAX_ASSET_BYTES / (1024 * 1024))} MB share limit.`,
    });
  }

  // 3. Unsafe JS — blocks sharing. See UNSAFE_JS for why these are errors and not warnings.
  const js = [...inlineScripts(template.html).map(script => script.code), template.js].join('\n');
  for (const { rule, note } of unsafeJsConstructs(js)) {
    errors.push({
      rule,
      message:
        `The template JavaScript ${note}, which a shared graphic may not do — it would run in ` +
        `the browser of everyone who imports it. If this is a Live data, Show chat, Remote ` +
        `control or Hosted control block, delete that marked block before publishing (it points ` +
        `at your own show or sheet, not theirs).`,
    });
  }

  // 4. Absolute URLs in the JS. Reported under the SAME rule as the HTML/CSS scan so the author
  //    reads one rule about one thing; publishGate.ts promotes it for sharing.
  for (const url of js.match(JS_URL) ?? []) {
    if (isAllowedExternal(url)) continue;
    warnings.push({
      rule: 'external-dependency',
      message: `The template JavaScript references "${url}". A shared graphic must be self-contained.`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}
