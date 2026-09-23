// Deterministic stub AI provider. It produces safe, validated results by composing the same
// building blocks and presets the rest of the app uses — never fragile free-form code. A real
// Claude-backed provider implementing AIProvider can replace this later.

import { BUILDING_BLOCKS } from '../blocks/registry';
import { addFieldToDefinition, insertGraphicHtml, nextFieldId } from '../blocks/edit';
import { parseDefinition, replaceDefinitionInHtml } from '../model/spxDefinition';
import type { SpxTemplate, TemplateChange } from '../model/types';
import type { AIProvider, AiTemplateChange, GenerateContext, GenerateOptions } from './provider';
import {
  normalizeIntent,
  routeIntent,
  type GenerationMode,
  type RouteDecision,
  type StructuralIntent,
} from './structuralIntent';
import { blankTemplate } from './presets';
import { specToTemplate, type DesignSpec } from './designSpec';
import { shortlistFor } from './retrieval';
import type { AssemblerId } from '../model/wizard';
import type { StyleTag } from '../model/fonts';
import { variantsFor } from '../templates/catalog';
import { aiCategoryById } from './spec/categories';
import { applySpecLocks, applySpecOutPreset } from './spec/specDesign';
import { ensureSpecFonts } from './spec/specValidate';

// A rule names a block by id, and a renamed or deleted block must not crash the one AI mode that
// exists for people with no key: a missing block is skipped, and the prompt falls through to the
// "no deterministic change matched" answer.
const block = (id: string) => BUILDING_BLOCKS.find((b) => b.id === id) ?? null;

function comingUpTemplate(): SpxTemplate {
  let t = blankTemplate('Coming up', 'Coming up');
  const idH = nextFieldId(t.fields);
  t = addFieldToDefinition(t, { field: idH, ftype: 'textfield', title: 'Heading', value: 'Coming up' });
  const id1 = nextFieldId(t.fields);
  t = addFieldToDefinition(t, { field: id1, ftype: 'textfield', title: 'Item 1', value: 'First item' });
  const id2 = nextFieldId(t.fields);
  t = addFieldToDefinition(t, { field: id2, ftype: 'textfield', title: 'Item 2', value: 'Second item' });
  const html = `  <!-- Coming up (SPX writes each field into the matching id) -->
  <div class="coming-up" id="cu">
    <div class="cu-heading" id="${idH}">Coming up</div>
    <ul class="cu-list">
      <li id="${id1}">First item</li>
      <li id="${id2}">Second item</li>
    </ul>
  </div>`;
  t = {
    ...t,
    html: insertGraphicHtml(t.html, html),
    css:
      t.css +
      `\n/* Coming up */\n.coming-up { position: absolute; left: 140px; bottom: 160px; }
.cu-heading { color: #ffd32a; font-size: 30px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.cu-list { list-style: none; margin-top: 10px; }
.cu-list li { color: #fff; font-size: 40px; font-weight: 600; padding: 6px 0; }\n`,
  };
  return t;
}

/** Convert absolute (/...) asset paths to relative, and report whether anything changed. */
function relativizePaths(html: string): { html: string; changed: boolean } {
  let changed = false;
  const out = html.replace(/\b(src|href)=["']\/(?!\/)([^"']*)["']/gi, (_m, attr, path) => {
    changed = true;
    return `${attr}="${path}"`;
  });
  return { html: out, changed };
}

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

// Offline "grounded" generation: keyword → category → a real catalog assembly through the
// same specToTemplate the AI harness uses, so the stub returns catalog-grade, panel- and
// timeline-editable templates instead of bare building blocks.
const CATEGORY_KEYWORDS: { test: RegExp; category: AssemblerId; label: string }[] = [
  { test: /lower ?third|name ?strap|\bstrap\b|presenter|speaker|guest/, category: 'lower-third', label: 'lower third' },
  { test: /ticker|crawl|scroll|news ?bar/, category: 'ticker', label: 'ticker' },
  { test: /score|\bvs\b|versus|match ?up/, category: 'scoreboard', label: 'scoreboard' },
  { test: /starting ?soon|be right back|pre-?show|stream starts/, category: 'starting-soon', label: 'starting-soon loop' },
  { test: /game ?timer|count ?down|shot ?clock/, category: 'game-timer', label: 'game timer' },
  { test: /credits/, category: 'end-credits', label: 'end credits' },
  { test: /info ?card|quote|statement|announcement card/, category: 'info-card', label: 'info card' },
  { test: /\bbug\b|corner|watermark|\blogo\b/, category: 'corner-bug', label: 'corner bug' },
  { test: /stat|poll|chart|graph|leaderboard|infographic|percent|results?\b/, category: 'infographic', label: 'infographic' },
  { test: /quiz|question|trivia/, category: 'quiz', label: 'quiz graphic' },
];

const STYLE_KEYWORDS: { test: RegExp; tag: StyleTag }[] = [
  { test: /glass|translucent|frosted|blur/, tag: 'glass' },
  { test: /sport|esport|athletic|dynamic|energetic/, tag: 'sport' },
  { test: /cinematic|documentary|film|movie|title card|letterbox/, tag: 'cinematic' },
  { test: /editorial|magazine|newsroom|newspaper|masthead|byline/, tag: 'editorial' },
  { test: /minimal|clean|quiet|restrained|elegant/, tag: 'minimal' },
];

/** Keyword-match a grounded design spec, or null when nothing fits. A structured setup's
 *  pinned category wins over keywords, and the user's decisions overlay the result — so the
 *  offline provider honors the "More control" panel exactly like the live harness. */
function keywordSpec(
  prompt: string,
  ctx?: GenerateContext,
): { spec: DesignSpec; label: string; shortlist: string[] } | null {
  const p = prompt.toLowerCase();
  const pinned = ctx?.spec && ctx.spec.category !== 'auto' ? aiCategoryById(ctx.spec.category) : undefined;
  const hit = CATEGORY_KEYWORDS.find((k) => k.test.test(p));
  const category = pinned?.templateCategory ?? hit?.category;
  if (!category) return null;
  const label = pinned ? pinned.name.toLowerCase() : hit!.label;
  const pool = variantsFor(category);
  if (!pool.length) return null;
  const style = STYLE_KEYWORDS.find((s) => s.test.test(p))?.tag;
  // Retrieval, offline: the same shortlist the live harness hands the design stage, picked
  // from deterministically instead of by a model. That is what makes the adapt-first path
  // demonstrable end to end without tokens - and it is a better answer than `pool[0]`, which
  // gave every worship brief the house strap while Scripture Reading sat in the catalog.
  const shortlist = shortlistFor(prompt, stubIntent(prompt), { anchor: `category:${category}` });
  const candidates = shortlist.full || !shortlist.variants.length ? pool : shortlist.variants;
  const variant = (style && candidates.find((v) => v.styleTag === style)) ?? candidates[0];
  const spec: DesignSpec = {
    fit: 'catalog',
    reason: pinned ? `User-selected category: ${pinned.name}.` : `Keyword match: ${label}.`,
    name: variant.name,
    summary: `A ${label} assembled from the catalog design system (offline mode).`,
    category,
    variantId: variant.id,
    lines: [],
    useLogoSlot: Boolean(ctx?.images?.length),
  };
  return {
    label,
    spec: applySpecLocks(spec, ctx?.spec),
    // What the pick was made FROM - shown to the user exactly as on the live path.
    shortlist: shortlist.full ? [] : shortlist.variants.map((v) => v.id),
  };
}

/** The spec's deterministic post-passes, shared with the live harness. */
function groundSpecPasses(template: SpxTemplate, ctx?: GenerateContext): SpxTemplate {
  return applySpecOutPreset(ensureSpecFonts(template, ctx?.spec), ctx?.spec);
}

// ── Phase-A routing, offline (docs/CREATIVE_MODE_PLAN.md §2) ─────────────────
// The stub mirrors the live provider's mode + intent routing DETERMINISTICALLY (keywords in,
// decision out), which is what keeps the whole routing contract e2e-testable without tokens.
// The stub cannot free-form code, so a CREATE decision still returns a deterministic catalog
// assembly - the ROUTING RECORD is the honest part the specs assert on.

/** The brief's own words asking for originality - the offline stand-in for what the live
 *  intent stage reads from the brief. */
const ORIGINALITY = /original|unlike anything|nothing like|never seen|our own look|from scratch|completely new|unique look/;

/** A deterministic StructuralIntent from keywords: a matched catalog category classifies as
 *  a known structure; anything else is honestly novel. */
function stubIntent(prompt: string): StructuralIntent {
  const p = prompt.toLowerCase();
  const hit = CATEGORY_KEYWORDS.find((k) => k.test.test(p));
  return normalizeIntent({
    kind: hit ? 'type' : 'novel',
    ...(hit ? { typeId: hit.category } : { novelDescription: prompt.slice(0, 120) }),
    confidence: hit ? 'high' : 'low',
    summary: hit ? `A ${hit.label}.` : 'An unclassified structure.',
    parts: [{ id: 'content', role: 'content' }],
    fields: [],
    originalityRequested: ORIGINALITY.test(p),
    ...(ORIGINALITY.test(p) ? { originalityEvidence: p.match(ORIGINALITY)?.[0] } : {}),
  });
}

/** Mode + intent -> the same deterministic routeIntent decision the live provider makes. */
function stubRouting(prompt: string, options?: GenerateOptions): { intent: StructuralIntent; route: RouteDecision } {
  const mode: GenerationMode = options?.mode ?? 'auto';
  const intent = stubIntent(prompt);
  return { intent, route: routeIntent(intent, mode) };
}

export class StubAIProvider implements AIProvider {
  async generate(prompt: string, context?: GenerateContext, options?: GenerateOptions): Promise<AiTemplateChange> {
    await wait();
    const p = prompt.toLowerCase();
    const { intent, route } = stubRouting(prompt, options);

    const grounded = keywordSpec(prompt, context);
    if (grounded) {
      const { template } = specToTemplate(grounded.spec, context);
      return {
        summary:
          `Assembled a ${grounded.label} from the catalog design system. ` +
          '(Offline mode matches keywords — connect an AI key for free-form briefs.)',
        template: groundSpecPasses(template, context),
        path: 'stub',
        spec: grounded.spec,
        intent,
        routing: route,
        ...(grounded.shortlist.length ? { shortlist: grounded.shortlist } : {}),
      };
    }
    const fullscreen = block('fullscreen');
    if (fullscreen && /full ?screen|title card|headline/.test(p)) {
      const t = fullscreen.apply(blankTemplate('Fullscreen title', 'Fullscreen title'));
      return { summary: 'Generated a fullscreen title template.', template: t, path: 'stub', intent, routing: route };
    }
    if (/coming ?up|line ?up|next up|schedule/.test(p)) {
      return {
        summary: 'Generated a "coming up" template with a heading and two items.',
        template: comingUpTemplate(),
        path: 'stub',
        intent,
        routing: route,
      };
    }
    // Default: a lower third from the catalog (the most-wanted graphic).
    const fallback = variantsFor('lower-third')[0];
    return {
      summary:
        'No keyword matched, so here is a catalog lower third. Try words like "ticker", "scoreboard", ' +
        '"countdown", "credits", or "infographic" — or connect an AI key for free-form briefs.',
      template: specToTemplate(
        {
          fit: 'catalog',
          reason: 'Offline fallback.',
          name: fallback.name,
          summary: 'A catalog lower third.',
          category: 'lower-third',
          variantId: fallback.id,
          lines: [],
        },
        context,
      ).template,
      path: 'stub',
      intent,
      routing: route,
    };
  }

  async generateRaw(prompt: string, context?: GenerateContext): Promise<AiTemplateChange> {
    // Offline has no "raw model" — the deterministic path IS the default.
    return this.generate(prompt, context);
  }

  async generateAlternatives(prompt: string, context?: GenerateContext, options?: GenerateOptions): Promise<AiTemplateChange[]> {
    await wait();
    const { intent, route } = stubRouting(prompt, options);
    const grounded = keywordSpec(prompt, context);
    if (grounded) {
      // Up to three DIFFERENT chassis from the matched category — real alternatives.
      const pool = variantsFor(grounded.spec.category).slice(0, 3);
      return pool.map((variant) => {
        const spec: DesignSpec = { ...grounded.spec, variantId: variant.id, name: variant.name };
        const { template } = specToTemplate(spec, context);
        return {
          summary: `Option: ${variant.name} — a ${grounded.label} from the catalog design system (offline mode).`,
          template: groundSpecPasses(template, context),
          path: 'stub' as const,
          spec,
          intent,
          routing: route,
        };
      });
    }
    return [await this.generate(prompt, context, options)];
  }

  async modify(prompt: string, template: SpxTemplate): Promise<TemplateChange> {
    await wait();
    const p = prompt.toLowerCase();
    const rules: { test: RegExp; blockId: string; summary: string }[] = [
      { test: /fade/, blockId: 'css-fade', summary: 'Added a reusable CSS fade-in class.' },
      { test: /slide/, blockId: 'css-slide', summary: 'Added a reusable CSS slide-in class.' },
      { test: /pulse/, blockId: 'gsap-pulse', summary: 'Added a GSAP pulse() helper.' },
      { test: /field|text data|new text/, blockId: 'text-field', summary: 'Added a new text data field.' },
      { test: /lower ?third/, blockId: 'lt-name-title', summary: 'Added a lower third with a name and a title.' },
      { test: /full ?screen/, blockId: 'fullscreen', summary: 'Added a fullscreen layout block.' },
      { test: /\bbug\b|corner|watermark/, blockId: 'bug', summary: 'Added a corner bug.' },
      { test: /\blogo\b/, blockId: 'logo', summary: 'Added a logo image.' },
    ];
    for (const r of rules) {
      const found = r.test.test(p) ? block(r.blockId) : null;
      if (found) return { summary: r.summary, template: found.apply(template) };
    }
    return {
      summary:
        'No deterministic change matched this prompt. Try keywords like "fade", "slide", "add field", "logo", "bug", or "fullscreen". (A real AI provider will handle free-form requests.)',
      template,
    };
  }

  async explain(code: string): Promise<string> {
    await wait();
    const lines: string[] = [];
    if (/function\s+update\s*\(/.test(code))
      lines.push('• update(data): receives field values as JSON and writes them into the matching DOM elements.');
    if (/function\s+play\s*\(/.test(code)) lines.push('• play(): reveals and animates the graphic in.');
    if (/function\s+stop\s*\(/.test(code)) lines.push('• stop(): animates the graphic out.');
    if (/function\s+next\s*\(/.test(code)) lines.push('• next(): advances multi-step templates.');
    if (/runTemplateUpdate/.test(code)) lines.push('• runTemplateUpdate(): copies hidden data holders into separate display elements (older split style).');
    if (/gsap\./.test(code)) lines.push('• Uses GSAP for animation (gsap.to / gsap.fromTo timelines).');
    if (/SPXGCTemplateDefinition/.test(code))
      lines.push('• SPXGCTemplateDefinition: declares the data fields SPX shows the operator and the playout settings.');
    if (/@keyframes/.test(code)) lines.push('• Defines CSS @keyframes animations.');
    if (lines.length === 0) lines.push('This looks like markup/styling without SPX runtime functions or a template definition.');
    return 'Explanation:\n' + lines.join('\n');
  }

  async fix(template: SpxTemplate): Promise<TemplateChange> {
    await wait();
    const notes: string[] = [];
    let next = template;

    // Ensure a definition exists.
    if (!parseDefinition(next.html)) {
      next = { ...next, html: replaceDefinitionInHtml(next.html, next.settings, next.fields) };
      notes.push('inserted a missing SPXGCTemplateDefinition');
    }
    // Relativize absolute asset paths.
    const rel = relativizePaths(next.html);
    if (rel.changed) {
      next = { ...next, html: rel.html };
      notes.push('converted absolute asset paths to relative');
    }
    // Ensure runtime functions exist (append minimal stubs only if entirely missing).
    if (!/function\s+(play|stop|update)\s*\(/.test(next.js)) {
      next = {
        ...next,
        js:
          next.js +
          `\n\n// Added by fix(): minimal SPX runtime functions.\nfunction update(data){try{var f=JSON.parse(data);for(var k in f){var h=document.getElementById(k);if(h)h.innerHTML=f[k];}}catch(e){}}\nfunction play(){}\nfunction stop(){}\nfunction next(){}\n`,
      };
      notes.push('added minimal play/stop/update/next functions');
    }

    return {
      summary: notes.length ? 'Applied fixes: ' + notes.join('; ') + '.' : 'No automatic fixes were needed.',
      template: next,
    };
  }

  async makeSpxReady(template: SpxTemplate): Promise<TemplateChange> {
    await wait();
    const notes: string[] = [];
    let next = template;

    if (!parseDefinition(next.html)) {
      next = { ...next, html: replaceDefinitionInHtml(next.html, next.settings, next.fields) };
      notes.push('added the SPXGCTemplateDefinition');
    } else {
      // Re-serialize to normalize the definition block.
      next = { ...next, html: replaceDefinitionInHtml(next.html, next.settings, next.fields) };
      notes.push('normalized the template definition');
    }

    const rel = relativizePaths(next.html);
    if (rel.changed) {
      next = { ...next, html: rel.html };
      notes.push('made asset paths relative');
    }

    if (next.settings.dataformat !== 'json') {
      const settings = { ...next.settings, dataformat: 'json' };
      next = { ...next, settings, html: replaceDefinitionInHtml(next.html, settings, next.fields) };
      notes.push('set dataformat to json');
    }

    return { summary: 'Made the template more SPX-ready: ' + notes.join('; ') + '.', template: next };
  }

  async convertImport(prompt: string, imported: SpxTemplate): Promise<TemplateChange> {
    // Offline conversion = the deterministic SPX-readiness fixes; free-form restyling per
    // the prompt needs the real provider.
    const ready = await this.makeSpxReady(imported);
    return {
      summary:
        ready.summary +
        (prompt.trim() ? ' (Free-form conversion requests need an AI key — the offline stub applies the deterministic fixes only.)' : ''),
      template: ready.template,
    };
  }
}

export const aiProvider: AIProvider = new StubAIProvider();
