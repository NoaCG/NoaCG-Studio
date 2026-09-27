// covers: src/ai/**
//
// The pilot brief bank is read by the anchor re-verification (the decay rule) - a bank edit
// needs that spec and nothing else.
// covers: benchmarks/creative/**
//
// ROUTING and SATISFACTION resolve live against the catalog and the type registry
// (src/templates/structuralAnchor.ts): a structure the catalog gains or loses moves a route, which
// is the decay rule this spec enforces.
// covers: src/templates/**
//
// Creative Mode phase A (docs/CREATIVE_MODE_PLAN.md §8, §16): the mode + intent routing
// contract and the structural-satisfaction check, all free - pure functions and the stub
// provider through browser imports, no tokens. Every positive assertion has its mutation
// twin (the same input minus the triggering property must NOT fire), so a check that stops
// checking fails here rather than passing vacuously.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
};

/** A minimal well-formed intent the routing tests mutate one property at a time. */
const baseIntent = {
  kind: 'type',
  typeId: 'bracket',
  confidence: 'high',
  summary: 'A playoff bracket.',
  parts: [{ id: 'tree', role: 'bracket' }],
  fields: [],
  originalityRequested: false,
};

test.describe('creative routing (phase A)', () => {
  test('explicit modes are never overridden by the intent', async ({ page }) => {
    await open(page);
    const routes = await page.evaluate(async (intent) => {
      const { normalizeIntent, routeIntent } = await import('/src/ai/structuralIntent.ts');
      const fit = normalizeIntent(intent);
      const original = normalizeIntent({ ...intent, originalityRequested: true });
      return {
        createOnFit: routeIntent(fit, 'create').route,
        adaptOnOriginal: routeIntent(original, 'adapt').route,
      };
    }, baseIntent);
    expect(routes.createOnFit).toBe('create');
    expect(routes.adaptOnOriginal).toBe('adapt');
  });

  test('auto routes on fit, originality, and confidence - each branch proven non-vacuous', async ({ page }) => {
    await open(page);
    const routes = await page.evaluate(async (intent) => {
      const { normalizeIntent, routeIntent } = await import('/src/ai/structuralIntent.ts');
      const route = (raw: unknown) => routeIntent(normalizeIntent(raw), 'auto').route;
      return {
        fitHigh: route(intent),
        // The mutation twins: ONE property flips each decision.
        fitButOriginal: route({ ...intent, originalityRequested: true }),
        fitButLowConfidence: route({ ...intent, confidence: 'low' }),
        fitButBeyondScope: route({ ...intent, beyondScope: true, scopeEvidence: 'double elimination' }),
        novel: route({ ...intent, kind: 'novel', typeId: undefined, novelDescription: 'a timing tower' }),
        hybrid: route({ ...intent, kind: 'hybrid', typeId: undefined, families: ['board', 'ring-meter'] }),
        unknownType: route({ ...intent, typeId: 'no-such-structure' }),
        // Slot drift, measured on the open-model runs: a declared match whose id landed in
        // the wrong slot still fits. The unknownType twin above stays create - tolerance is
        // for slots, never for names nothing resolves.
        typeIdInFamilies: route({ ...intent, typeId: undefined, families: ['bracket'] }),
        familyWordInTypeId: route({ ...intent, typeId: 'strap', families: [] }),
      };
    }, baseIntent);
    expect(routes.fitHigh).toBe('adapt'); // also the scope twin: same intent WITHOUT beyondScope adapts
    expect(routes.fitButOriginal).toBe('create');
    expect(routes.fitButLowConfidence).toBe('create');
    expect(routes.fitButBeyondScope).toBe('create');
    expect(routes.novel).toBe('create');
    expect(routes.hybrid).toBe('create');
    expect(routes.unknownType).toBe('create');
    expect(routes.typeIdInFamilies).toBe('adapt');
    expect(routes.familyWordInTypeId).toBe('adapt');
  });

  test('the scope guard is honoured end to end: registry note -> prompt, decision stays explicit-mode safe', async ({ page }) => {
    await open(page);
    const scope = await page.evaluate(async (intent) => {
      const { intentSystemPrompt, normalizeIntent, routeIntent } = await import('/src/ai/structuralIntent.ts');
      const { typeById } = await import('/src/templates/types/registry.ts');
      const beyond = normalizeIntent({ ...(intent as object), beyondScope: true, scopeEvidence: 'a losers bracket' });
      return {
        bracketNote: typeById('bracket')?.structuralScope ?? null,
        promptCarriesNote: intentSystemPrompt().includes('double elimination'),
        // Explicit adapt still wins over the scope signal - the mode is never overridden.
        explicitAdapt: routeIntent(beyond, 'adapt').route,
        autoReason: routeIntent(beyond, 'auto').reason,
      };
    }, baseIntent);
    // The registry declares the scope and the prompt teaches it; losing either half would
    // leave the tool field emitting blind.
    expect(scope.bracketNote).toContain('single-elimination');
    expect(scope.promptCarriesNote).toBe(true);
    expect(scope.explicitAdapt).toBe('adapt');
    expect(scope.autoReason).toContain('losers bracket');
  });

  test('every adapt expectation in the pilot bank still has its catalog anchor', async ({ page }) => {
    await open(page);
    // The brief-bank decay rule (plan §1.3): an expected-route table is only trusted after
    // its anchors are re-verified against the CURRENT catalog. This is that verification.
    const report = await page.evaluate(async () => {
      const bank = (await import('/benchmarks/creative/v1/briefs.json')).default as {
        briefs: { id: string; expectedRoute: string; catalogAnchor?: string }[];
      };
      const { typeById } = await import('/src/templates/types/registry.ts');
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const missing: string[] = [];
      let checked = 0;
      for (const brief of bank.briefs) {
        if (brief.expectedRoute !== 'adapt') continue;
        if (!brief.catalogAnchor) {
          missing.push(`${brief.id}: adapt expectation with NO anchor`);
          continue;
        }
        checked += 1;
        const [kind, id] = brief.catalogAnchor.split(':');
        const resolves =
          kind === 'type' ? Boolean(typeById(id)) : kind === 'category' ? variantsFor(id as never).length > 0 : false;
        if (!resolves) missing.push(`${brief.id}: ${brief.catalogAnchor} no longer resolves`);
      }
      return { checked, missing };
    });
    expect(report.checked).toBeGreaterThan(5);
    expect(report.missing).toEqual([]);
  });

  test('the stub provider honors the mode end to end', async ({ page }) => {
    await open(page);
    const runs = await page.evaluate(async () => {
      const { StubAIProvider } = await import('/src/ai/stubProvider.ts');
      const stub = new StubAIProvider();
      const ctx = { images: [], palette: null, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25 };
      const pick = (c: { routing?: { route: string; mode: string }; intent?: { originalityRequested: boolean } }) => ({
        route: c.routing?.route ?? null,
        mode: c.routing?.mode ?? null,
        hasIntent: Boolean(c.intent),
        originality: c.intent?.originalityRequested ?? null,
      });
      return {
        plainAuto: pick(await stub.generate('A lower third with a name and title', ctx)),
        originalAuto: pick(await stub.generate('A lower third unlike anything you have', ctx)),
        explicitCreate: pick(await stub.generate('A lower third with a name and title', ctx, { mode: 'create' })),
        explicitAdapt: pick(await stub.generate('A lower third unlike anything you have', ctx, { mode: 'adapt' })),
        alternatives: pick((await stub.generateAlternatives('A scoreboard for handball', ctx, { mode: 'create' }))[0]),
      };
    });
    // Auto: catalog-shaped stays adapt; originality words flip it - the pair proves the
    // routing is live, not a constant.
    expect(runs.plainAuto).toEqual({ route: 'adapt', mode: 'auto', hasIntent: true, originality: false });
    expect(runs.originalAuto.route).toBe('create');
    expect(runs.originalAuto.originality).toBe(true);
    // Explicit modes win in both directions.
    expect(runs.explicitCreate.route).toBe('create');
    expect(runs.explicitAdapt.route).toBe('adapt');
    // The alternatives path carries the same contract.
    expect(runs.alternatives).toMatchObject({ route: 'create', mode: 'create', hasIntent: true });
  });

  test('the intent stage runs on the provider fast model; every later stage keeps the session route', async ({ page }) => {
    await open(page);
    // Per-stage model binding (plan §4). The gateway request body is the seam, so this
    // costs nothing: every /api/ai/generate call is intercepted and answered locally.
    // The mutation twin is built in - the SAME run's design and coder calls must go out
    // on the session model, so a binding applied to every stage fails here too.
    const calls: { tool: string; model: string }[] = [];
    await page.route('**/api/ai/generate', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        request?: { structuredOutput?: { name?: string } };
        route?: { model?: string };
      };
      const tool = body.request?.structuredOutput?.name ?? '(text)';
      const model = body.route?.model ?? '';
      calls.push({ tool, model });
      if (tool !== 'emit_structural_intent') {
        // Every stage after the intent call is answered with a failure: the routing under
        // test has already been recorded, and the generation unwinds without a second run.
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'x', message: 'bench stop' } }) });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          output: {
            kind: 'type', typeId: 'bracket', confidence: 'high', summary: 'A playoff bracket.',
            parts: [{ id: 'tree', role: 'bracket' }], fields: [], originalityRequested: false, beyondScope: false,
          },
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          provider: 'vercel', model, attempts: [],
        }),
      });
    });
    const session = await page.evaluate(async () => {
      const { saveAiSettings, defaultModelForProvider } = await import('/src/ai/settings.ts');
      const sessionModel = 'qwen/qwen3-coder-next';
      saveAiSettings({ provider: 'vercel', model: sessionModel, fallbacks: [] });
      const { claudeProvider } = await import('/src/ai/claudeProvider.ts');
      const ctx = { images: [], palette: null, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25 };
      // The run unwinds on the stopped design/coder calls; only the routing matters here.
      await claudeProvider.generate('A four-team playoff bracket.', ctx as never).catch(() => null);
      return { sessionModel, fastModel: defaultModelForProvider('vercel', 'fast') };
    });
    expect(session.fastModel).not.toBe(session.sessionModel); // the two roles are really distinct
    const intentCalls = calls.filter((c) => c.tool === 'emit_structural_intent');
    expect(intentCalls.map((c) => c.model)).toEqual([session.fastModel]);
    // …and the rest of the pipeline is untouched by the binding.
    const laterCalls = calls.filter((c) => c.tool !== 'emit_structural_intent');
    expect(laterCalls.length).toBeGreaterThan(0);
    expect(laterCalls.every((c) => c.model === session.sessionModel)).toBe(true);
  });

  test('structural check: list data, field capacity, and states - with mutation twins', async ({ page }) => {
    await open(page);
    const results = await page.evaluate(async () => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { structuralIntentStaticFindings } = await import('/src/validation/structuralIntentCheck.ts');
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const lowerThird = variantsFor('lower-third')[0].create();
      const matchup = variantsFor('matchup')[0].create();
      const intent = (over: Record<string, unknown>) =>
        normalizeIntent({
          kind: 'novel',
          novelDescription: 'test',
          confidence: 'high',
          summary: 't',
          parts: [{ id: 'content', role: 'content' }],
          fields: [],
          originalityRequested: false,
          ...over,
        });
      const count = (t: unknown, i: unknown) => structuralIntentStaticFindings(t as never, i as never).length;
      return {
        listMissing: count(lowerThird, intent({ fields: [{ key: 'rows', role: 'list', label: 'Rows' }] })),
        listNotRequired: count(lowerThird, intent({ fields: [{ key: 'name', role: 'line', label: 'Name' }] })),
        tooManyFields: count(lowerThird, intent({
          fields: Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, role: 'line', label: `L${i}` })),
        })),
        statesMissing: count(lowerThird, intent({ states: [{ id: 'reveal', trigger: 'operator' }] })),
        statesCarried: count(matchup, intent({ states: [{ id: 'select', trigger: 'operator' }] })),
      };
    });
    expect(results.listMissing).toBeGreaterThan(0);
    expect(results.listNotRequired).toBe(0); // the mutation twin: same template, no list demand
    expect(results.tooManyFields).toBeGreaterThan(0);
    expect(results.statesMissing).toBeGreaterThan(0);
    expect(results.statesCarried).toBe(0); // the matchup type carries a real machine
  });

  // ── Brief satisfaction: is this the graphic that was asked for? ────────────
  //
  // The benchmark's most common defect, and the one every other gate was blind to: a brief
  // routes to the catalog path CORRECTLY (the catalog really does carry stingers and timing
  // towers) and the design stage then assembles a lower third. Static validation passed, the
  // runtime bench passed, and the parts checks passed - a lower third genuinely has a
  // headline and genuinely sits bottom-left. Only identity catches it.
  //
  // These fixtures are named after the wrong outcomes the paid round actually produced.

  test('a lower third returned for a stinger brief is a finding, not a valid result', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { structuralKindFindings } = await import('/src/validation/structuralIntentCheck.ts');
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      // What a correct classifier returns for "a stinger that wipes the screen between
      // segments" - the catalog carries this, so routing to adapt is RIGHT.
      const stinger = normalizeIntent({
        kind: 'type', typeId: 'transition', confidence: 'high',
        summary: 'A full-frame stinger that covers a cut.',
        parts: [{ id: 'cover', role: 'full-frame cover' }],
        fields: [], originalityRequested: false,
      });
      const lowerThird = variantsFor('lower-third')[0];
      const transition = variantsFor('transition')[0];
      return {
        transitionExists: Boolean(transition),
        wrongGraphic: structuralKindFindings(stinger, lowerThird.id).map((f) => f.message),
        // The mutation twin: the SAME intent against the graphic that was asked for.
        rightGraphic: structuralKindFindings(stinger, transition?.id).map((f) => f.message),
      };
    });
    expect(result.transitionExists).toBe(true);
    expect(result.wrongGraphic.length).toBe(1);
    expect(result.wrongGraphic[0]).toContain('type:transition');
    expect(result.wrongGraphic[0]).toContain('different graphic');
    expect(result.rightGraphic).toEqual([]);
  });

  test('a wrong-kind grounded result FAILS CLOSED at the provider - the matched kind stays ok', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    // The owner decision (AI_PLATFORM_PLAN §16.3, ruled 2026-07-31): a structurally
    // wrong-kind grounded assembly is an ERROR, not a warning - a technically valid lower
    // third must never be DELIVERED for a stinger brief. Driven through the real provider
    // with the gateway intercepted, so the whole seam is pinned: intent -> route ->
    // grounded assembly -> the structural check's kind finding landing as a blocking error.
    // The mutation twin reruns the identical flow with the design stage answering the RIGHT
    // category; if the severity mapping ever stops firing (or fires indiscriminately), one
    // of the two halves fails.
    let designCategory = 'lower-third';
    await page.route('**/api/ai/generate', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        request?: { structuredOutput?: { name?: string } };
        route?: { model?: string };
      };
      const tool = body.request?.structuredOutput?.name ?? '(text)';
      const answer = (output: unknown) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          output,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          provider: 'vercel', model: body.route?.model ?? '', attempts: [],
        }),
      });
      if (tool === 'emit_structural_intent') {
        // What a correct classifier returns for a stinger brief - routing to adapt is RIGHT.
        await answer({
          kind: 'type', typeId: 'transition', confidence: 'high',
          summary: 'A full-frame stinger that covers a cut.',
          parts: [{ id: 'cover', role: 'full-frame cover' }],
          fields: [], originalityRequested: false, beyondScope: false,
        });
      } else if (tool === 'emit_design_spec') {
        await answer({ fit: 'catalog', category: designCategory, lines: [], summary: 'test spec' });
      } else {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'x', message: 'bench stop' } }) });
      }
    });
    const runs = await page.evaluate(async () => {
      const { saveAiSettings } = await import('/src/ai/settings.ts');
      saveAiSettings({ provider: 'vercel', model: 'qwen/qwen3-coder-next', fallbacks: [] });
      const { claudeProvider } = await import('/src/ai/claudeProvider.ts');
      const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
      const ctx = { images: [], palette: null, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25 };
      const change = await claudeProvider.generate(
        'A full-frame stinger that wipes the screen between segments.',
        ctx as never,
        { structuralCheck: benchStructuralIntent } as never,
      );
      return {
        path: change.path ?? null,
        ok: change.validation?.ok ?? null,
        kindErrors: (change.validation?.errors ?? []).filter((e) => e.rule === 'structural-kind').map((e) => e.message),
        kindWarnings: (change.validation?.warnings ?? []).filter((w) => w.rule === 'structural-kind').length,
      };
    });
    // The wrong graphic: assembled, surfaced, and FAILING - not delivered as a success.
    expect(runs.path).toBe('grounded');
    expect(runs.ok).toBe(false);
    expect(runs.kindErrors.length).toBe(1);
    expect(runs.kindErrors[0]).toContain('different graphic');
    expect(runs.kindWarnings).toBe(0); // an error, not merely a warning

    designCategory = 'transition';
    const twin = await page.evaluate(async () => {
      const { claudeProvider } = await import('/src/ai/claudeProvider.ts');
      const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
      const ctx = { images: [], palette: null, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25 };
      const change = await claudeProvider.generate(
        'A full-frame stinger that wipes the screen between segments.',
        ctx as never,
        { structuralCheck: benchStructuralIntent } as never,
      );
      return {
        ok: change.validation?.ok ?? null,
        kindFindings: [...(change.validation?.errors ?? []), ...(change.validation?.warnings ?? [])]
          .filter((f) => f.rule === 'structural-kind').length,
      };
    });
    expect(twin.ok).toBe(true);
    expect(twin.kindFindings).toBe(0);
  });

  test('a lower third returned for a timing-tower brief is a finding', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { variantsFor, variantById } = await import('/src/templates/catalog.ts');
      const { structuralKindFindings } = await import('/src/validation/structuralIntentCheck.ts');
      const { anchorsSatisfiedBy } = await import('/src/templates/structuralAnchor.ts');
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      // 'tower' is a FAMILY word, so this also proves the family vocabulary resolves to the
      // same anchor the router used - one table, not two.
      const tower = normalizeIntent({
        kind: 'family', families: ['tower'], confidence: 'high',
        summary: 'A live timing tower for a timed session.',
        parts: [{ id: 'rows', role: 'competitor row', repeating: true }],
        fields: [], originalityRequested: false,
      });
      const lowerThird = variantsFor('lower-third')[0];
      // Whatever design the timing-tower TYPE ships as - looked up live, never hardcoded.
      const towerVariant = [...variantsFor('results-board'), ...variantsFor('results')]
        .find((v) => v.typeId === 'timing-tower');
      return {
        wrongGraphic: structuralKindFindings(tower, lowerThird.id).map((f) => f.message),
        towerFound: Boolean(towerVariant),
        rightGraphic: towerVariant ? structuralKindFindings(tower, towerVariant.id).map((f) => f.message) : null,
        towerAnchors: towerVariant ? anchorsSatisfiedBy(towerVariant.id) : null,
        unknownVariant: structuralKindFindings(tower, 'no-such-variant').length,
        lowerThirdReal: Boolean(variantById(lowerThird.id)),
      };
    });
    expect(result.wrongGraphic.length).toBe(1);
    expect(result.wrongGraphic[0]).toContain('type:timing-tower');
    // The mutation twin: the real timing-tower design satisfies the same intent.
    expect(result.towerFound).toBe(true);
    expect(result.towerAnchors).toContain('type:timing-tower');
    expect(result.rightGraphic).toEqual([]);
    // A variant nothing resolves reports nothing here (it is not a satisfaction question),
    // so the check cannot manufacture findings from a bad id.
    expect(result.unknownVariant).toBe(0);
    expect(result.lowerThirdReal).toBe(true);
  });

  test('the kind check stays silent where it has no business speaking', async ({ page }) => {
    await open(page);
    // Three ways it must NOT fire. Without these the check could pass its positive cases by
    // simply always finding something.
    const quiet = await page.evaluate(async () => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { structuralKindFindings } = await import('/src/validation/structuralIntentCheck.ts');
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const lowerThird = variantsFor('lower-third')[0];
      const novel = normalizeIntent({
        kind: 'novel', novelDescription: 'a rotating sponsor carousel', confidence: 'high',
        summary: 'Something the catalog has no structure for.',
        parts: [{ id: 'c', role: 'content' }], fields: [], originalityRequested: false,
      });
      const strap = normalizeIntent({
        kind: 'family', families: ['strap'], confidence: 'high', summary: 'A name strap.',
        parts: [{ id: 'c', role: 'content' }], fields: [], originalityRequested: false,
      });
      return {
        // 1. A novel brief anchors to nothing - there is no promise to have broken.
        novelBrief: structuralKindFindings(novel, lowerThird.id).length,
        // 2. A free-form result has no catalog variant, so the question does not apply.
        freeForm: structuralKindFindings(strap, undefined).length,
        // 3. The honest match.
        matched: structuralKindFindings(strap, lowerThird.id).length,
      };
    });
    expect(quiet).toEqual({ novelBrief: 0, freeForm: 0, matched: 0 });
  });

  test('off-catalog briefs route to create, catalog-fit briefs to adapt', async ({ page }) => {
    await open(page);
    // The routing half of the same contract, over the structures the paid round got wrong.
    // Expectations are derived from the LIVE catalog, so this table cannot rot silently: a
    // structure the catalog gains flips to adapt here and the assertion says which.
    const routes = await page.evaluate(async () => {
      const { normalizeIntent, routeIntent, structuralFit } = await import('/src/ai/structuralIntent.ts');
      const base = {
        confidence: 'high' as const, summary: 's',
        parts: [{ id: 'c', role: 'content' }], fields: [], originalityRequested: false,
      };
      const probe = (raw: Record<string, unknown>) => {
        const intent = normalizeIntent({ ...base, ...raw });
        const { fit, anchor } = structuralFit(intent);
        return { route: routeIntent(intent, 'auto').route, fit, anchor: anchor ?? null };
      };
      return {
        stinger: probe({ kind: 'type', typeId: 'transition' }),
        timingTower: probe({ kind: 'family', families: ['tower'] }),
        stockStrip: probe({ kind: 'family', families: ['strip'] }),
        donut: probe({ kind: 'family', families: ['ring-meter'] }),
        // Genuinely off-catalog: nothing listed describes these structures.
        novelStructure: probe({ kind: 'novel', novelDescription: 'an isometric stadium seat map' }),
        hybrid: probe({ kind: 'hybrid', families: ['board', 'ring-meter'] }),
        unlisted: probe({ kind: 'family', families: ['seat-map'] }),
      };
    });
    // Structures the catalog carries: adapt, each with the anchor that carries it.
    expect(routes.stinger).toEqual({ route: 'adapt', fit: true, anchor: 'type:transition' });
    expect(routes.timingTower).toEqual({ route: 'adapt', fit: true, anchor: 'type:timing-tower' });
    expect(routes.stockStrip).toEqual({ route: 'adapt', fit: true, anchor: 'category:ticker' });
    expect(routes.donut).toEqual({ route: 'adapt', fit: true, anchor: 'category:infographic' });
    // Genuinely off-catalog: create, never forced onto the nearest lower-third-like option.
    expect(routes.novelStructure).toMatchObject({ route: 'create', fit: false });
    expect(routes.hybrid).toMatchObject({ route: 'create', fit: false });
    expect(routes.unlisted).toMatchObject({ route: 'create', fit: false });
  });

  test('structural check: repeating structure and placement measured in the rendered frame', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    const results = await page.evaluate(async () => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const lowerThird = variantsFor('lower-third')[0].create();
      const ticker = variantsFor('ticker')[0].create();
      const repeating = normalizeIntent({
        kind: 'novel', novelDescription: 'rows', confidence: 'high', summary: 't',
        parts: [{ id: 'rows', role: 'row', repeating: true }],
        fields: [], originalityRequested: false,
      });
      const placedWrong = normalizeIntent({
        kind: 'family', families: ['strap'], confidence: 'high', summary: 't',
        parts: [{ id: 'content', role: 'content' }],
        fields: [], originalityRequested: false, placement: 'top-right',
      });
      const placedRight = normalizeIntent({
        kind: 'family', families: ['strap'], confidence: 'high', summary: 't',
        parts: [{ id: 'content', role: 'content' }],
        fields: [], originalityRequested: false, placement: 'bottom-left',
      });
      const messages = async (t: unknown, i: unknown) =>
        (await benchStructuralIntent(t as never, i as never)).map((f) => f.message);
      return {
        noRows: await messages(lowerThird, repeating),
        tickerRows: await messages(ticker, repeating),
        wrongZone: await messages(lowerThird, placedWrong),
        rightZone: await messages(lowerThird, placedRight),
      };
    });
    expect(results.noRows.join(' ')).toContain('repeating');
    expect(results.tickerRows).toEqual([]); // the mutation twin: a real repeating template passes
    expect(results.wrongZone.join(' ')).toContain('top-right');
    expect(results.rightZone).toEqual([]); // and the honest zone stays silent
  });
});
