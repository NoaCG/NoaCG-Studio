// covers: src/blocks/**, src/templates/**, src/assets/**

import { test, expect } from '@playwright/test';
import { toApp, HELPERS, rules } from './_bench';

// The runtime bench (src/validation/runtimeBench.ts) - the deterministic half of the AI
// harness's quality gate. Fast checks only:
//  1. Detection fixtures: hand-built bad templates must trip the exact rule they violate.
//  2. Design adjustments: an AI-adjusted assembly must still pass the bench.
// The exhaustive per-catalog-variant calibration tripwire lives in
// e2e/catalog/catalog-bench.spec.ts (npm run test:e2e:catalog) - it does not run as part of the
// default merge-gate suite because it only needs to run when the catalog or the bench itself
// changes, same as type-floor.mjs/overflow-sweep.mjs/l3-sweep.mjs.

test.describe('runtime bench detection fixtures', () => {
  test('two overlapping text elements trip bench-overlap', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:200px;font-size:48px;color:#fff;">Alpha headline text</div>' +
          '<div style="position:absolute;left:210px;top:210px;font-size:48px;color:#fff;">Beta headline text</div>' +
          '</div>'),
        js: FIXTURE_JS,
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect((res as { ok: boolean }).ok).toBe(false);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overlap');
  });

  test('a coincident same-text layer (karaoke wipe) is allowed; a misaligned one is not', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const layered = (offset) => fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:400px;top:800px;font-size:44px;color:#555;">Sing the same line here</div>' +
          '<div style="position:absolute;left:' + (400 + offset) + 'px;top:800px;font-size:44px;color:#fc3;">Sing the same line here</div>' +
          '</div>'),
        js: FIXTURE_JS,
      });
      const coincident = await bench(layered(0), { houseContract: false });
      const misaligned = await bench(layered(30), { houseContract: false });
      return { coincident, misaligned };
    })()`);
    const { coincident, misaligned } = res as {
      coincident: { ok: boolean; errors: { rule: string }[] };
      misaligned: { errors: { rule: string }[] };
    };
    expect(rules(coincident.errors)).not.toContain('bench-overlap');
    expect(coincident.ok).toBe(true);
    expect(rules(misaligned.errors)).toContain('bench-overlap');
  });

  // A PANEL OWNS NO TEXT, so it is not a leaf, so `bench-overlap` can never pair it with the
  // text it covers however completely the text disappears (docs/NOACG_PRO_PLAN.md §26.1). Each
  // fixture below covers the SAME line with the SAME box and differs only in what that box
  // paints - the two quiet cases are the constructions this rule would be unusable without.
  const coverFixture = (style: string) => `(async () => { ${HELPERS}
    const tpl = fixture({
      html: doc('<div class="fx">' +
        '<div id="f0" style="position:absolute;left:200px;top:400px;font-size:48px;color:#fff;">Covered headline text</div>' +
        '<div class="cover" style="position:absolute;left:200px;top:400px;width:700px;height:70px;${style}"></div>' +
        '</div>'),
      js: FIXTURE_JS,
      fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Covered headline text' }],
    });
    return bench(tpl, { houseContract: false });
  })()`;

  test('an opaque panel painted over text trips bench-occluded', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(coverFixture('background:#101418;'));
    const { ok, errors } = res as { ok: boolean; errors: { rule: string }[] };
    expect(rules(errors)).toContain('bench-occluded');
    expect(ok).toBe(false);
    // The panel owns no text, so the check that already existed cannot see this at all - which
    // is the whole reason the rule exists. If this ever starts passing, the two checks have
    // merged and one of them is redundant.
    expect(rules(errors)).not.toContain('bench-overlap');
  });

  test('a tint and a gradient scrim over text do NOT trip bench-occluded', async ({ page }) => {
    await toApp(page);
    // A scrim laid over the lower third of a frame is the commonest legitimate construction in
    // broadcast, and it is a gradient that is transparent exactly where the text is. A rule that
    // called it a defect would be one authors learn to ignore.
    const tint = await page.evaluate(coverFixture('background:#101418;opacity:0.3;'));
    const scrim = await page.evaluate(coverFixture('background:linear-gradient(to top, rgba(0,0,0,.9), transparent);'));
    for (const res of [tint, scrim]) {
      const { errors, warnings } = res as { errors: { rule: string }[]; warnings: { rule: string }[] };
      expect(rules(errors)).not.toContain('bench-occluded');
      expect(rules(warnings)).not.toContain('bench-occluded');
    }
  });

  test('text escaping the canvas trips bench-overflow', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:-300px;top:400px;width:500px;font-size:40px;color:#fff;">Half off the canvas</div>' +
          '</div>'),
        js: FIXTURE_JS,
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overflow');
  });

  test('a fixed box that clips doubled text trips bench-stress (and passes with defaults)', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:800px;width:260px;overflow:hidden;white-space:nowrap;">' +
          '<span id="f0" style="font-size:32px;color:#fff;">Short</span>' +
          '</div></div>'),
        js: FIXTURE_JS,
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Short' }],
      });
      return bench(tpl, { houseContract: false });
    })()`);
    const errs = (res as { errors: { rule: string }[] }).errors;
    expect(rules(errs)).toContain('bench-stress');
    // The default value fits - the failure must come from the stress pass only.
    expect(rules(errs)).not.toContain('bench-overflow');
    expect(rules(errs)).not.toContain('bench-binding');
  });

  // A clip-path cuts painted output with NO overflow property anywhere, so the
  // overflow-ancestor walk never saw it - text could lose most of its glyphs and every
  // geometry check still passed.
  const clipFixture = (clipPath: string, value: string) => `(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:800px;width:600px;height:80px;' +
          'clip-path:${clipPath};background:#123;">' +
          '<span id="f0" style="font-size:40px;color:#fff;white-space:nowrap;">${value}</span>' +
          '</div></div>'),
        js: FIXTURE_JS,
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '${value}' }],
      });
      return bench(tpl, { houseContract: false });
    })()`;

  test('a clip-path that cuts text mid-line trips bench-overflow', async ({ page }) => {
    await toApp(page);
    // The panel paints only its left 40% (240px); the name needs far more.
    const res = await page.evaluate(clipFixture('inset(0 60% 0 0)', 'Amina Okafor, East Africa Correspondent'));
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overflow');
  });

  // Text spilling past its own painted panel is NOT clipped, sits inside the canvas, and can sit
  // inside title-safe - so every geometry branch above missed it. Observed in a generated lower
  // third whose name ran ~30px past its plate: unusable by eye, clean by bench.
  const spillFixture = (panel: string, value: string, extra = '') => `(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:700px;${panel}">' +
          '<span id="f0" style="font-size:40px;color:#fff;white-space:nowrap;${extra}">${value}</span>' +
          '</div></div>'),
        js: FIXTURE_JS,
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '${value}' }],
      });
      const res = await bench(tpl, { houseContract: false });
      return { errors: res.errors, warnings: res.warnings };
    })()`;

  test('text spilling past its own painted panel warns, without being clipped or off-canvas', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(spillFixture('width:300px;height:70px;background:#123;', 'Elena Marsh, Senior Correspondent'));
    const { errors, warnings } = res as { errors: { rule: string }[]; warnings: { rule: string }[] };
    expect(rules(warnings)).toContain('bench-unbacked-text');
    // It is a warning on purpose: a headline overhanging its bar is a designed look, and this
    // gate runs over the whole catalog. Nothing here may block.
    expect(rules(errors)).not.toContain('bench-unbacked-text');
  });

  test('the same panel sized to its content does not warn - the twin that keeps the check honest', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(spillFixture('width:max-content;padding:12px 20px;background:#123;', 'Elena Marsh, Senior Correspondent'));
    const { warnings } = res as { warnings: { rule: string }[] };
    expect(rules(warnings)).not.toContain('bench-unbacked-text');
  });

  test('a scrim painted by a pseudo-element counts as the surface', async ({ page }) => {
    await toApp(page);
    // The panel itself paints nothing; its ::after does. That is how the observed frame drew its
    // surface, and reading only real elements would have found no surface and stayed silent.
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<style>.plate::after{content:"";position:absolute;inset:0;background:#123;z-index:-1}</style>' +
          '<div class="fx">' +
          '<div class="plate" style="position:absolute;left:200px;top:700px;width:300px;height:70px;isolation:isolate;">' +
          '<span id="f0" style="font-size:40px;color:#fff;white-space:nowrap;">Elena Marsh, Senior Correspondent</span>' +
          '</div></div>'),
        js: FIXTURE_JS,
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Elena Marsh, Senior Correspondent' }],
      });
      const res = await bench(tpl, { houseContract: false });
      return { warnings: res.warnings };
    })()`);
    expect(rules((res as { warnings: { rule: string }[] }).warnings)).toContain('bench-unbacked-text');
  });

  test('a glass panel counts as the surface however faint its tint', async ({ page }) => {
    await toApp(page);
    // A frosted panel: a near-transparent fill over a blurred backdrop, which the viewer sees as
    // the panel. The ticker and device checks already counted it; this one read it as bare (#893).
    const res = await page.evaluate(spillFixture(
      'width:300px;height:70px;background:rgba(255,255,255,0.04);backdrop-filter:blur(12px);',
      'Elena Marsh, Senior Correspondent',
    ));
    const { warnings } = res as { warnings: { rule: string }[] };
    expect(rules(warnings)).toContain('bench-unbacked-text');
  });

  test('text over bare video is silent here - that is the legibility floor\'s question, not this one', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(spillFixture('width:300px;height:70px;', 'Elena Marsh, Senior Correspondent'));
    const { warnings } = res as { warnings: { rule: string }[] };
    expect(rules(warnings)).not.toContain('bench-unbacked-text');
  });

  // A REVEAL MASK squeezed below its line (#770). A flex row shrinks an overflow-hidden mask,
  // which has no minimum width, so the line's end is cut off at rest. The bench used to skip
  // the mask and then describe the cut-off part as text past its panel.
  const maskFixture = (panel: string, span: string, value: string) => `(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:700px;padding:12px 20px;background:#123;${panel}">' +
          '<div class="fx-mask" style="overflow:hidden"><span id="f0" style="display:inline-block;font-size:40px;color:#fff;white-space:nowrap;${span}">${value}</span></div>' +
          '</div></div>'),
        js: FIXTURE_JS,
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '${value}' }],
      });
      const res = await bench(tpl, { houseContract: false });
      return { errors: res.errors, warnings: res.warnings };
    })()`;

  test('a mask that cuts its line off is reported as the cut, not as text past the panel', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(maskFixture('display:flex;width:300px;', '', 'Elena Marsh, Senior Correspondent'));
    const { warnings } = res as { warnings: { rule: string; message: string }[] };
    expect(warnings.some((w) => w.rule === 'bench-overflow' && w.message.includes('cut off by its mask .fx-mask'))).toBe(true);
    expect(rules(warnings)).not.toContain('bench-unbacked-text');
  });

  test('a block line whose words overflow its own box is cut too; one parked outside the mask is not', async ({ page }) => {
    await toApp(page);
    const cutAtRest = (res: unknown) => (res as { warnings: { message: string }[] }).warnings
      .some((w) => w.message.includes('cut off by its mask') && w.message.includes('default field values'));
    // The block is as wide as the squeezed mask, so only its words show the cut.
    expect(cutAtRest(await page.evaluate(maskFixture('display:flex;width:300px;', 'display:block;', 'Elena Marsh, Senior Correspondent')))).toBe(true);
    // Wholly outside its mask, waiting for an entrance: nothing of it shows, so nothing is cut.
    expect(cutAtRest(await page.evaluate(maskFixture('', 'transform:translateX(-120%);', 'Elena Marsh')))).toBe(false);
    // An ellipsis is a truncation the design chose and shows.
    expect(cutAtRest(await page.evaluate(maskFixture('display:flex;width:300px;',
      'display:block;overflow:hidden;text-overflow:ellipsis;', 'Elena Marsh, Senior Correspondent')))).toBe(false);
  });

  test('tracked caps hanging their last letter-spacing past the mask are not a cut', async ({ page }) => {
    await toApp(page);
    // Centred tracked caps pull the last letter's spacing back with a negative margin, so the
    // line's box hangs exactly that far past its mask with no ink in it (lt33).
    const res = await page.evaluate(maskFixture('', 'letter-spacing:12px;margin-right:-12px;', 'ALEXANDRA RIVA'));
    const { warnings } = res as { warnings: { rule: string; message: string }[] };
    // At its own value; the 60-character stress name is wider than the frame and is cut there.
    expect(warnings.filter((w) => w.message.includes('cut off by its mask') && w.message.includes('default field values'))).toEqual([]);
  });

  test('no untouched neutral scaffold cuts its text at a mask or runs it past its panel (#770, #928)', async ({ page }) => {
    // Six scaffolds said "extends past ... the nearest thing painted behind it" under the stress
    // values about text their own mask had cut off - text nowhere in the picture. Then the cut
    // itself (#928): a flex row squeezed the scoreboard's score mask to "18" of 188, and the
    // station bug's mask cut one long word to "Konstantopou". Every type with a neutral scaffold
    // is benched, so a new one starts clean too.
    test.setTimeout(240_000);
    await toApp(page);
    const told = await page.evaluate(async () => {
      const bridge = await import('/src/bridge/bridgeApi.ts');
      const { benchTemplateRuntime } = await import('/src/validation/runtimeBench.ts');
      const out: string[] = [];
      const types = (await bridge.types()).filter((t) => t.neutral).map((t) => t.id);
      if (types.length < 10) out.push(`only ${types.length} neutral scaffolds found`);
      for (const type of types) {
        const { template } = await bridge.scaffold({ type, design: 'neutral' });
        const res = await benchTemplateRuntime(template, { fieldPaints: true });
        for (const w of [...res.errors, ...res.warnings]) {
          if (w.message.includes('the nearest thing painted behind it') || w.message.includes('cut off by its mask')) {
            out.push(`${type}: ${w.message}`);
          }
        }
      }
      return out;
    });
    expect(told).toEqual([]);
  });

  test('the catalog designs that cut a long name at a mask now wrap it (#928)', async ({ page }) => {
    // Under the stress name these cut their line's end off at a reveal mask: a flex row shrank
    // the mask below its text, a capped panel could not wrap one long word (overflow-wrap:
    // break-word never narrows an inline-block line), or a nowrap label had nowhere to go.
    test.setTimeout(120_000);
    await toApp(page);
    const told = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { benchTemplateRuntime } = await import('/src/validation/runtimeBench.ts');
      const ids = ['lt60', 'ls03', 'ls07', 'ls20', 'card48', 'al09', 'gt08', 'sb27', 'bug33', 'bug34', 'vs02'];
      const out: string[] = [];
      for (const id of ids) {
        const variant = Object.values(CATALOG).flat().find((v) => v?.id === id);
        if (!variant) { out.push(`${id}: not in the catalog`); continue; }
        const res = await benchTemplateRuntime(variant.create({}), { fieldPaints: true });
        for (const w of res.warnings) if (w.message.includes('cut off by its mask')) out.push(`${id}: ${w.message}`);
      }
      return out;
    });
    expect(told).toEqual([]);
  });

  test('a clip-path the text fits inside does not trip bench-overflow', async ({ page }) => {
    await toApp(page);
    // Same 240px clip, a 232px name - a near miss, so the detector must not fire.
    const res = await page.evaluate(clipFixture('inset(0 60% 0 0)', 'Amina Okafor'));
    expect(rules((res as { errors: { rule: string }[] }).errors)).not.toContain('bench-overflow');
  });

  test('text inside a sheared bar\'s bbox but outside the shear trips bench-overflow', async ({ page }) => {
    await toApp(page);
    // The skewed-accent idiom from the spike review ("cuts of"): the bar's BOUNDING BOX is
    // 600px and the name fits it, but at the text's own height the sheared shape is far
    // narrower, so glyphs are sliced at both ends. A bbox-only check waves this through.
    const res = await page.evaluate(
      clipFixture('polygon(20% 0, 100% 0, 80% 100%, 0 100%)', 'PLAY-BY-PLAY COMMENTARY'),
    );
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overflow');
  });

  test('an angled polygon clip that cuts text trips bench-overflow', async ({ page }) => {
    await toApp(page);
    // The chevron idiom - a polygon bbox is an over-approximation, so firing here means
    // the text escaped even the most generous reading of the shape.
    const res = await page.evaluate(
      clipFixture('polygon(0 0, 30% 0, 30% 100%, 0 100%)', 'Amina Okafor, East Africa Correspondent'),
    );
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overflow');
  });

  test('a graphic that never hides on stop trips bench-hidden', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx"><div style="position:absolute;left:200px;top:200px;font-size:40px;color:#fff;">Always on air</div></div>'),
        js: FIXTURE_JS.replace("window.stop = function () { document.querySelector('.fx').style.visibility = 'hidden'; };",
                               'window.stop = function () {};'),
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-hidden');
  });

  test('update() that ignores a field trips bench-binding', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx"><span id="f0" style="position:absolute;left:200px;top:200px;font-size:40px;color:#fff;">Static</span></div>'),
        js: FIXTURE_JS.replace('window.update = function (data) {', 'window.update = function (data) { return; '),
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Static' }],
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-binding');
  });

  test('the house editability contract is enforced by default and waivable for imports', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx"><div style="position:absolute;left:200px;top:200px;font-size:40px;color:#fff;">Plain graphic</div></div>'),
        js: FIXTURE_JS,
      });
      const strict = await bench(tpl);
      const waived = await bench(tpl, { houseContract: false });
      return { strict, waived };
    })()`);
    const { strict, waived } = res as {
      strict: { errors: { rule: string }[] };
      waived: { ok: boolean; errors: { rule: string }[] };
    };
    expect(rules(strict.errors)).toContain('bench-editability');
    expect(rules(waived.errors)).not.toContain('bench-editability');
    expect(waived.ok).toBe(true);
  });
});

test.describe('design adjustments', () => {
  test('an aggressively adjusted grounded assembly still passes the bench', async ({ page }) => {
    test.setTimeout(60_000);
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const { applyDesignAdjustments } = await import('/src/ai/designAdjust.ts');
      const spec = {
        fit: 'catalog', reason: 'test', name: 'Adjusted Strap',
        summary: 'test', category: 'lower-third', variantId: 'lt01',
        lines: [{ title: 'Name', sample: 'Ada Lovelace' }, { title: 'Title', sample: 'Chief Analyst' }],
        typography: { scaleRatio: 2.4, headingWeight: 'black', tracking: 'wide', kickerCase: 'caps' },
        density: 'airy', alignment: 'center',
        shape: { corner: 'round', accentForm: 'none', panel: 'none' },
      };
      const assembled = specToTemplate(spec);
      const adjusted = applyDesignAdjustments(assembled.template, spec);
      const res = await bench(adjusted);
      return { ok: res.ok, errors: res.errors, changed: adjusted.css !== assembled.template.css };
    })()`);
    const { ok, errors, changed } = res as { ok: boolean; errors: { rule: string; message: string }[]; changed: boolean };
    expect(changed).toBe(true); // the parameters genuinely reshaped the CSS
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });
});
