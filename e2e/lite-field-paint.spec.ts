// Every field a NoaCG Lite graphic declares must reach the screen.
//
// The defect, from the 2026-08-08 quality round (benchmarks/lite/ROUND-2026-08-08-QUALITY.md
// §4): one generation shipped a lower third that painted the name, reserved a wide band under
// it, and drew nothing there. `fieldCount` said 2. Driving the graphic with fresh data through
// `update()` changed nothing on screen. Static validation, the runtime bench, the type floor and
// the wrap check were all silent, because every one of them asks about an element that IS drawn.
//
// The question that answers it already existed - `structuralIntentCheck` drives every field to a
// sentinel and re-reads the painted frame - and it could not run here: it needs a StructuralIntent,
// and Lite runs no intent stage at all, so `withStructuralFindings` returns early on every Lite
// result. The drive now lives in `src/validation/fieldPaint.ts`, shared by both, and the bench
// exposes it as the opt-in `fieldPaints` that Lite's validator turns on.
//
// Three tests, because a gate that only proves it can fire is satisfied by a check that flags
// everything, and a gate nobody enables is decoration:
//   1. an ordinary Lite compile stays quiet;
//   2. a template whose field genuinely cannot paint raises it (the mutation half);
//   3. it is OFF unless a caller asks - a hand-written template may hide whatever it likes.
//
// THE MULTI-STATE HALF (added 2026-08-09, docs/CONTROL_PANEL_PARITY.md §6) is the last three.
// The drive used to read the frame ONCE, at the settled default path, which is the whole answer
// only for a graphic that has no states - so a field a later operator event reveals read as
// unreachable and would have failed a correct graphic. That was the standing blocker on running
// this check for any interactive category, and it is not hypothetical: the quiz board's audience
// percentages are painted only on entry to its `audience` branch, three events past settled.
//
// THE ARROW WALK (added 2026-09-15) is the last block, and it is here because this file is
// already where the bench's MACHINE behaviour is pinned - the drive above walks states, the block
// below walks the arrows between them, and both are measured through `benchTemplateRuntime` on a
// real graphic. Its subject is gate 3 of the agent road (docs/CONTROL_PANEL_ANY_GRAPHIC.md §2c):
// "the bench walks every operator arrow".
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Page = import('@playwright/test').Page;

/** Compile one ordinary Lite decision through the shared grounded path. */
async function rulesFor(page: Page, mutate: 'none' | 'hide-second-field'): Promise<string[]> {
  return page.evaluate(async (how) => {
    const pipeline = await import('/src/ai/lite/pipeline.ts');
    const bench = await import('/src/validation/runtimeBench.ts');
    type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
    type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
    const decision = {
      fit: 'catalog', reason: 'pinned by e2e', name: 'Field paint', summary: 'Field paint',
      category: 'lower-third', variantId: 'lt11',
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
      lines: [
        { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
        { title: 'Role', sample: 'Head Coach', role: 'person-role' },
      ],
      flourish: null,
    } as unknown as Decision;
    const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
    const template = compiled.template;
    if (!template) return ['NO TEMPLATE'];
    if (how === 'none') {
      // The real path: whatever `compileLiteDecision` decided, read at its own severity.
      return [...compiled.validation.errors, ...compiled.validation.warnings].map((f) => f.rule);
    }
    const second = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea')[1];
    if (!second) return ['NO SECOND FIELD'];
    // `display: none` is the crudest form of the defect and the one the drive is specified
    // against (`visibleText` skips display:none and visibility:hidden, and deliberately does
    // NOT consult opacity - a region a later step reveals is transparent and perfectly
    // reachable). A colour that vanishes into the panel is the same finding by a different
    // route, and is not pinned here because it would be testing the browser's compositor.
    const hidden = { ...template, css: `${template.css}\n#${second.field} { display: none !important; }\n` };
    const result = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
    return [...result.errors, ...result.warnings].map((f) => f.rule);
  }, mutate);
}

test.describe('a Lite graphic paints every field it declares', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('an ordinary Lite compile raises nothing', async ({ page }) => {
    // `compileLiteDecision` turns `fieldPaints` on, so this is the check running on a real
    // result - a gate that fired on the platform's own output would be worse than no gate.
    expect(await rulesFor(page, 'none')).not.toContain('bench-field-unpainted');
  });

  test('a field that cannot paint raises bench-field-unpainted', async ({ page }) => {
    expect(await rulesFor(page, 'hide-second-field')).toContain('bench-field-unpainted');
  });

  test('the drive is off unless a caller asks, and leaves the default data behind it', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const pipeline = await import('/src/ai/lite/pipeline.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
      type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
      const decision = {
        fit: 'catalog', reason: 'x', name: 'x', summary: 'x',
        category: 'lower-third', variantId: 'lt11',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
          { title: 'Role', sample: 'Head Coach', role: 'person-role' },
        ],
        flourish: null,
      } as unknown as Decision;
      const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
      const hidden = {
        ...compiled.template,
        css: `${compiled.template.css}\n#f1 { display: none !important; }\n`,
      };
      // Same broken template, twice: once with the option and once without.
      const off = await bench.benchTemplateRuntime(hidden, {});
      const on = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
      return {
        off: [...off.errors, ...off.warnings].map((f) => f.rule),
        on: [...on.errors, ...on.warnings].map((f) => f.rule),
      };
    });

    expect(out.off).not.toContain('bench-field-unpainted');
    expect(out.on).toContain('bench-field-unpainted');
    // The drive replaces the frame's data with sentinels, and the exit, replay and stress
    // phases run after it. If the restore were dropped, those phases would silently start
    // measuring `ZQ0X` instead of the real copy - so the two runs must otherwise agree.
    const others = (rules: string[]) => rules.filter((r) => r !== 'bench-field-unpainted').sort();
    expect(others(out.on)).toEqual(others(out.off));
  });
});

test.describe('the drive asks the whole machine, not one state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a field only a later branch paints is NOT reported unreachable', async ({ page }) => {
    // The quiz board is the case the widening exists for. `audienceResults` (f7) is painted by
    // applyAudienceResult(), which runs on entry to the `audience` branch - three operator events
    // past the settled default path. Read at settled it paints nothing, and the check used to
    // call a perfectly correct catalog graphic broken.
    const out = await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const template = variantById('qz02')!.create({});
      // The field's own default is empty (nobody has picked yet), and an empty value paints
      // nothing anywhere - the drive replaces every value with a sentinel, which is the whole
      // point, but the SAMPLE has to be reachable for the graphic to be worth measuring.
      const result = await bench.benchTemplateRuntime(template, { fieldPaints: true });
      return [...result.errors, ...result.warnings]
        .filter((f) => f.rule === 'bench-field-unpainted')
        .map((f) => f.message);
    });
    expect(out).toEqual([]);
  });

  test('a machine-bearing graphic still reports a field that paints in NO state', async ({ page }) => {
    // The mutation half of the widening: unioning across states must not turn the check into one
    // that can never fire. Same quiz, one field hidden in every state.
    const out = await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const template = variantById('qz02')!.create({});
      const hidden = { ...template, css: `${template.css}\n#f7, .quiz-aud { display: none !important; }\n` };
      const result = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    });
    expect(out).toContain('bench-field-unpainted');
  });

  test('no shipped machine is anywhere near the walk cap', async ({ page }) => {
    // MAX_WALKED_STATES bounds a graph an author controls, and a bound that silently truncated
    // would decide the answer instead of measuring it. This measures the real maximum across the
    // whole catalog, so the cap can never quietly start biting as types are added.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { MAX_WALKED_STATES } = await import('/src/validation/fieldPaint.ts');
      let worst = { id: '', states: 0 };
      for (const variants of Object.values(CATALOG)) {
        for (const variant of variants) {
          let machine;
          try {
            machine = parseAnimData(variant.create({}).js)?.machine;
          } catch {
            continue; // a variant that refuses its own defaults is another spec's finding
          }
          if (!machine) continue;
          const states = machine.groups.reduce((n, g) => n + g.states.length, 0);
          if (states > worst.states) worst = { id: variant.id, states };
        }
      }
      return { worst, cap: MAX_WALKED_STATES };
    });
    expect(out.worst.states).toBeGreaterThan(0); // the measurement itself works
    expect(out.worst.states, `${out.worst.id} is the largest machine in the catalog`)
      .toBeLessThan(out.cap);
  });
});

test.describe('a declared input-only holder is not a field that failed to paint', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('every shipped game-timer passes, though its minutes field is never drawn', async ({ page }) => {
    // The 2026-09-06 Pro Harness round refused every countdown it generated on
    // `bench-field-unpainted`, for markup the root `AGENTS.md` prescribes verbatim:
    // `<span id="f1" class="noacg-data-source">`, hidden by a stylesheet rule, read by the clock
    // engine, never drawn. The whole shipped family does the same thing, so the check as written
    // refused NoaCG's own work - the signature src/ai/pro/AGENTS.md names, an instrument whose
    // false positives are the good designs.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const rows: Array<{ id: string; findings: string[] }> = [];
      for (const variant of CATALOG['game-timer']) {
        const result = await bench.benchTemplateRuntime(variant.create({}), { fieldPaints: true });
        rows.push({
          id: variant.id,
          findings: [...result.errors, ...result.warnings]
            .filter((f) => f.rule === 'bench-field-unpainted')
            .map((f) => f.message),
        });
      }
      return rows;
    });
    expect(out.length).toBeGreaterThan(0); // the family is still there to measure
    expect(out.filter((r) => r.findings.length)).toEqual([]);
  });

  test('the same holder WITHOUT the class is still reported', async ({ page }) => {
    // The mutation half: what clears the finding is the author's DECLARATION, not the fact that a
    // value is hidden. Strip the class (keeping the element hidden by its own rule) and the field
    // is an ordinary hidden holder again - which is the defect the check exists for.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const template = CATALOG['game-timer'][0].create({});
      const stripped = {
        ...template,
        html: template.html.replace(/ class="noacg-data-source"/g, ''),
        css: `${template.css}
#f1 { display: none !important; }
`,
      };
      const result = await bench.benchTemplateRuntime(stripped, { fieldPaints: true });
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    });
    expect(out).toContain('bench-field-unpainted');
  });
});

// ── The arrow walk: gate 3's promise, measured ──────────────────────────────────────────────
//
// The fixture is the vote-show proof case (e2e/fixtures/agent-made/), two graphics an agent
// authored through the CLI against the shipped skill. The totals board is the one that matters
// here: eleven controls, each legal from both states of its parallel `flash` group, so TWENTY-TWO
// arrows - and on 2026-09-15 `validate` reported 0 errors and 0 warnings on it having pressed
// EIGHT of them (docs/handoffs/2026-09-15-hb-release-and-first-walk.md).
//
// HOW A PRESS IS OBSERVED. The bench has no "what did you press" channel, and adding one would be
// a test-only seam. It does not need one: the phase words ride into every layout finding, so a
// deliberately broken frame makes the walk speak in its own voice. The two graphics are broken two
// ways, each chosen so a finding can only exist if the press it names really happened:
//
//   - the totals board gets two of its fields stacked on the same 320x60 patch, so EVERY frame
//     the bench measures raises `bench-overlap` and the set of phases named is exactly the set of
//     presses made;
//   - the votes board gets an `alarm` arrow into a new state whose timeline fades in an element
//     that is `opacity: 0` in every other state. A finding naming `.vb-alarm` proves the machine
//     ENTERED `alert` - the phase label alone would not, since it is written before the dispatch
//     and a guarded-out event leaves it standing over the pose that was already on screen.
const PROOF_PACK = readFileSync(
  fileURLToPath(new URL('./fixtures/agent-made/vote-show.noacgpack.json', import.meta.url)),
  'utf8',
);

/** How a graphic is mutated before it is benched. Data only - the edits cross into the page. */
interface BenchMutation {
  css?: string;
  /** Inserted just before `</body>`. */
  html?: string;
  /** `[pattern, replacement]` applied to the graphic's JS, globally. */
  js?: [string, string];
  /** Appended to `machine.groups[group].states`. */
  states?: Array<{ group: number; state: Record<string, unknown> }>;
  /** Appended to `machine.groups[group].transitions`, as operator arrows. */
  arrows?: Array<{ group: number; from: string; to: string; event: string }>;
}

/** Bench one proof-case graphic; report what the run said, which arrows it pressed, and how long
 *  it took. `arrows` is read out of the mutated code, so a fixture edit can never quietly shrink
 *  the walk the assertions compare against. */
async function benchProofGraphic(page: Page, name: string, mutate: BenchMutation = {}) {
  return page.evaluate(
    async ([json, graphicName, edit]) => {
      const { parsePack } = await import('/src/packs/graphicsPack.ts');
      const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
      const { allOperatorArrows } = await import('/src/blocks/animMachine.ts');
      const bench = await import('/src/validation/runtimeBench.ts');

      const { pack } = parsePack(json);
      const entry = pack!.graphics.find((g) => g.template.name === graphicName)!;
      let template = entry.template;
      if (edit.css) template = { ...template, css: `${template.css}\n${edit.css}` };
      if (edit.html) {
        template = { ...template, html: template.html.replace('</body>', `${edit.html}\n</body>`) };
      }
      if (edit.js) {
        template = { ...template, js: template.js.split(edit.js[0]).join(edit.js[1]) };
      }
      if (edit.states || edit.arrows) {
        const data = parseAnimData(template.js)!;
        const groups = data.machine!.groups;
        for (const { group, state } of edit.states ?? []) groups[group].states.push(state as never);
        for (const { group, from, to, event } of edit.arrows ?? []) {
          groups[group].transitions.push({ from, to, trigger: 'operator', event });
        }
        template = { ...template, js: spliceAnimData(template.js, data)! };
      }
      const machine = parseAnimData(template.js)?.machine;
      const arrows = machine
        ? allOperatorArrows(machine).map((a) => `${a.event}@${a.groupId}/${a.from}`)
        : [];

      const startedAt = performance.now();
      const result = await bench.benchTemplateRuntime(template, { fieldPaints: true });
      const ms = Math.round(performance.now() - startedAt);
      const findings = [...result.errors, ...result.warnings];
      // The phase words every branch finding carries: `after the "plus1" event from flash/none`.
      const pressed = new Set<string>();
      for (const f of findings) {
        const m = /after the "([^"]+)" event from (\S+)/.exec(f.message);
        if (m) pressed.add(`${m[1]}@${m[2]}`);
      }
      return {
        ms,
        arrows,
        pressed: [...pressed],
        rules: findings.map((f) => f.rule),
        messages: findings.map((f) => f.message),
        skipped: findings.filter((f) => f.rule === 'bench-events-skipped').map((f) => f.message),
      };
    },
    [PROOF_PACK, name, mutate] as const,
  );
}

/** Two of the totals board's fields, pinned onto the same patch - every frame then collides. */
const STACK_TWO_FIELDS = `
#f0, #f5 { position: fixed !important; left: 200px !important; top: 200px !important;
  width: 320px !important; height: 60px !important; }
`;

test.describe('the bench presses every operator ARROW, not every event NAME', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('all twenty-two totals board arrows are pressed, shared names included', async ({ page }) => {
    const out = await benchProofGraphic(page, 'Totals board', { css: STACK_TWO_FIELDS });

    // The machine's own count, read from its code rather than written down here - a fixture edit
    // that changes the board has to change this number with it, not quietly pass a smaller walk.
    expect(out.arrows).toHaveLength(22);
    expect([...out.pressed].sort()).toEqual([...out.arrows].sort());

    // The two halves of the defect, named. `plus1` is one control with two arrows, and the walk
    // folded them into one dispatch; `newGame` was the eleventh distinct event and fell off an
    // eight-event cap, so neither of its arrows was ever pressed.
    expect(out.pressed).toContain('plus1@flash/none');
    expect(out.pressed).toContain('plus1@flash/shown');
    expect(out.pressed).toContain('newGame@flash/none');
    expect(out.pressed).toContain('newGame@flash/shown');
  });

  test('an arrow out of a state the walk has already left is still pressed', async ({ page }) => {
    // The votes board's own `reveal` arrow leaves `votes`, and the default walk ends at
    // `revealed` - so a dispatch made from wherever the walk stopped is dropped by structural
    // guarding, silently. That costs nothing observable on the shipped board (the walk paints
    // `revealed` on its way through), so the fixture gets a SECOND arrow out of `votes`, into a
    // state nothing else reaches. Its pose is the only thing that can raise this finding.
    const out = await benchProofGraphic(page, 'Votes board', {
      html: '<div class="vb-alarm">ALARM</div>',
      // Parked far off the 1920x1080 canvas, so the moment it becomes visible it raises
      // `bench-overflow` naming itself. A collision with a second element would say the same
      // thing and is not used: two boxes only meet if they share a containing block, and the
      // entrance leaves an inline transform on the root, which makes one for its own
      // descendants and not for this. Off-canvas needs no such agreement.
      css: `
.vb-alarm { position: fixed; left: 3000px; top: 200px; width: 320px; height: 60px;
  opacity: 0; color: #fff; font-size: 40px; }
`,
      states: [
        {
          group: 0,
          state: {
            id: 'alert',
            name: 'Alert',
            timeline: {
              name: 'Alert',
              // `ease` is not optional on an AnimStep, and leaving it out does not fail loudly:
              // the serializer writes `"ease": undefined`, the block stops being JSON, and
              // `parseAnimData` answers null for the WHOLE machine - so the bench walks no
              // arrows at all and this test passes its fixture nothing to press.
              ease: 'power2.out',
              duration: 0.2,
              layers: { '.vb-alarm': { opacity: [{ time: 0, value: 0 }, { time: 0.2, value: 1 }] } },
            },
          },
        },
      ],
      arrows: [{ group: 0, from: 'votes', to: 'alert', event: 'alarm' }],
    });

    // Sorted: the serializer orders a group's transitions itself, so the order they were
    // appended in says nothing about the order they come back in.
    expect([...out.arrows].sort()).toEqual(['alarm@main/votes', 'reveal@main/votes']);
    const fromAlarm = out.messages.filter((m) => m.includes('after the "alarm" event from main/votes'));
    expect(fromAlarm.some((m) => m.includes('.vb-alarm'))).toBe(true);
  });

  test('past the ceiling the unpressed arrows are named, not dropped', async ({ page }) => {
    // Three more arrows than the ceiling admits. The first two ride inside it; the twenty-fifth
    // is the one the finding has to name, because a bench that stops early without saying so is
    // the exact silence AC-3 exists to end.
    const out = await benchProofGraphic(page, 'Totals board', {
      arrows: [
        { group: 1, from: 'none', to: 'shown', event: 'plus6' },
        { group: 1, from: 'shown', to: 'shown', event: 'plus6' },
        { group: 1, from: 'none', to: 'shown', event: 'plus7' },
      ],
    });

    expect(out.arrows).toHaveLength(25);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]).toContain('pressed 24 of this machine');

    // WHICH arrow lands twenty-fifth belongs to the serializer, not to the order they were
    // appended in: `serializeGroup` sorts a group's transitions by from-state before writing
    // them, so the machine's own read-back order is the only honest expectation here.
    const [event, from] = out.arrows[24].split('@');
    expect(out.skipped[0]).toContain(`"${event}" from ${from}`);
    // One arrow named, not a list that happens to contain the right one.
    expect(out.skipped[0].match(/ from flash\//g)).toHaveLength(1);
  });

  test('an arrow the bench cannot stand in front of is named, never claimed', async ({ page }) => {
    // THE MUTATION HALF OF THE SNAP, pinned rather than hand-run. Renaming `noacgSnap` inside the
    // graphic's own JS leaves the interpreter working and takes the global away, which is exactly
    // the position the bench was in before 2026-09-15: it can dispatch, but it cannot put the
    // machine in front of the arrow first. The votes board's `reveal` leaves `votes` and the
    // default walk ends at `revealed`, so without the snap that press cannot be made - and the
    // point of this row is that the bench now SAYS so rather than measuring the pose it is
    // standing in and reporting it as the arrow's.
    const out = await benchProofGraphic(page, 'Votes board', { js: ['noacgSnap', 'noacgSnapGone'] });
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]).toContain('"reveal" from main/votes');
    expect(out.skipped[0]).toContain('the machine reported "revealed"');

    // The OTHER global, and the reason a null answer is treated as a state the bench could not
    // reach rather than as permission to press blind: an interpreter that cannot say where it is
    // gives the walk no way to tell a real press from a guarded-out one, which is the whole
    // defect. Taking `noacgMachineState` away must therefore skip the arrow, not press it.
    const blind = await benchProofGraphic(page, 'Votes board', {
      js: ['noacgMachineState', 'noacgMachineStateGone'],
    });
    expect(blind.skipped).toHaveLength(1);
    expect(blind.skipped[0]).toContain('the machine reported "nowhere"');
  });

  test('no shipped machine is anywhere near the arrow ceiling', async ({ page }) => {
    // The twin of "no shipped machine is anywhere near the walk cap" above, and for the same
    // reason: a ceiling that quietly starts biting would decide the answer instead of measuring
    // it - every graphic past it would carry a permanent `bench-events-skipped` warning, which is
    // the shape of a warning people learn to ignore. The margin is thinner here than for states,
    // because arrows MULTIPLY with parallel groups: the proof case's eleven controls are
    // twenty-two arrows because each is legal from both of its `flash` states.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { allOperatorArrows } = await import('/src/blocks/animMachine.ts');
      const { MAX_BENCH_ARROWS } = await import('/src/validation/runtimeBench.ts');
      let worst = { id: '', arrows: 0 };
      for (const variants of Object.values(CATALOG)) {
        for (const variant of variants) {
          let machine;
          try {
            machine = parseAnimData(variant.create({}).js)?.machine;
          } catch {
            continue; // a variant that refuses its own defaults is another spec's finding
          }
          if (!machine) continue;
          const arrows = allOperatorArrows(machine).length;
          if (arrows > worst.arrows) worst = { id: variant.id, arrows };
        }
      }
      return { worst, cap: MAX_BENCH_ARROWS };
    });
    expect(out.worst.arrows).toBeGreaterThan(0); // the measurement itself works
    expect(out.worst.arrows, `${out.worst.id} declares the most operator arrows in the catalog`)
      .toBeLessThan(out.cap);
  });

  test('both proof-case graphics walk clean - nothing skipped, nothing timed out', async ({ page }) => {
    // The green half of the test above: on the shipped graphics every arrow IS reachable, so the
    // finding must stay silent. A check that can only fire is worth as little as one that cannot.
    const totals = await benchProofGraphic(page, 'Totals board');
    const votes = await benchProofGraphic(page, 'Votes board');
    expect(totals.rules).not.toContain('bench-events-skipped');
    expect(votes.rules).not.toContain('bench-events-skipped');

    // The walk must also stay inside the run's own budget: a longer walk that ends in
    // `bench-timeout` reports one vague finding instead of the precise ones it was measuring.
    expect(totals.rules).not.toContain('bench-timeout');
    expect(votes.rules).not.toContain('bench-timeout');
    console.log(`[bench-time] totals ${totals.ms} ms (22 arrows), votes ${votes.ms} ms (1 arrow)`);
  });
});

test.describe('a REPORTED field is read, never painted', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('the votes board raises nothing for its hidden reported holder', async ({ page }) => {
    // `Shown` (f16) is a `hidden` field in a `noacg-data-source` holder: the OGraf reported-field
    // shape, which R4 requires to be off screen (docs/OGRAF_STATE_IN_FIELDS.md §5). The check that
    // asks "does this value reach a pixel" was asking the wrong question of it, and every graphic
    // the `noacg-graphic` skill teaches carries such a holder.
    const out = await benchProofGraphic(page, 'Votes board');
    expect(out.rules).not.toContain('bench-field-unpainted');
  });

  test('the same holder WITHOUT the declaration is still reported', async ({ page }) => {
    // The mutation half, and the reason the exemption is not "hidden fields are exempt": what
    // clears the finding is the author's DECLARATION. Strip the class and f16 is an ordinary
    // invisible field, which is the defect this whole check exists for.
    //
    // THE HIDING HAS TO BE PUT BACK BY HAND, and a first draft that forgot passed vacuously. On
    // this board the class is not only a declaration - `.noacg-data-source { display: none; }` is
    // what hides the holder - so stripping it also DRAWS the value, and the check then correctly
    // says nothing at all. That would have tested the browser, not the exemption.
    const out = await page.evaluate(async (json) => {
      const { parsePack } = await import('/src/packs/graphicsPack.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const { pack } = parsePack(json);
      const entry = pack!.graphics.find((g) => g.template.name === 'Votes board')!;
      const stripped = {
        ...entry.template,
        html: entry.template.html.replace('<div id="f16" class="noacg-data-source">', '<div id="f16">'),
        css: `${entry.template.css}\n#f16 { display: none !important; }\n`,
      };
      const result = await bench.benchTemplateRuntime(stripped, { fieldPaints: true });
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    }, PROOF_PACK);
    expect(out).toContain('bench-field-unpainted');
  });
});
