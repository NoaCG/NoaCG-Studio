// THE TEMPLATE FACTORY — Phase 3's batch loop (docs/noacg-master-goals.md Phase 3).
//
// "generate type+theme combinations -> run every generated template through the review
//  checklist and export validation -> reject or fix failures -> catalog the passes."
//
// This script is the "run every candidate through the checklist, reject or fix, catalog the
// passes" half, plus the matrix bookkeeping that says WHICH combinations are still missing.
// It is a real gate: it exits non-zero when any candidate fails, so it can sit in CI next to
// `npm run build`.
//
//   node scripts/factory.mjs                 # matrix + gates over every type design; the gate
//   node scripts/factory.mjs matrix          # just the type x family matrix
//   node scripts/factory.mjs check           # just the gates
//   node scripts/factory.mjs check --ids tk08,tk09     # gates on named designs only
//   node scripts/factory.mjs --json report.json        # also write the machine-readable report
//
// PREREQUISITE: the dev server must already be running on this checkout's port (the same
// contract scripts/l3-sweep.mjs has). Vite serves the source modules, so the checks run
// against the REAL registry and the REAL assemblers rather than a re-implementation of them —
// which is the only way a factory gate can be trusted.
//
// NO BACKTICKS BELOW, NOT EVEN IN A COMMENT. Everything from `const PROBE =` to its closing
// backtick is ONE template literal, so a backtick written inside it - around an identifier, in
// prose, anywhere - ends the string there and the rest of the probe is parsed as code. The error
// eslint reports for that points at the identifier AFTER the backtick and says nothing about
// strings, which is a long way from the cause.
//
// ── Why the matrix is derived in a browser and not parsed ────────────────────────────────
//
// A type's `structure.category` is KEBAB-CASE ('corner-bug', 'info-card', 'lower-third'). An
// earlier pass read those declarations with a /[a-zA-Z]+/ regex, silently truncated every
// hyphenated value, and produced a confident wrong answer (8 promotable cells against a true
// 24). Importing the registry and reading the objects cannot make that mistake: there is no
// parsing step to get wrong.

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

const argv = process.argv.slice(2);
// A flag's VALUE is not a command: `factory.mjs --json report.json` must not read
// "report.json" as the command (the first CI run failed on exactly that).
const VALUE_FLAGS = ['--ids', '--json'];
const flagValueAt = new Set(argv.flatMap((a, i) => (VALUE_FLAGS.includes(a) ? [i + 1] : [])));
const command = argv.find((a, i) => !a.startsWith('-') && !flagValueAt.has(i)) ?? 'run';
const flag = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : null;
};
const onlyIds = (flag('--ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const jsonPath = flag('--json');

if (!['run', 'matrix', 'check'].includes(command)) {
  console.error(`Unknown command "${command}". Use: run | matrix | check`);
  process.exit(2);
}

// ── The in-page probe ────────────────────────────────────────────────────────────────────
//
// Everything below runs INSIDE the dev-server page, against Vite-served source modules. It
// returns plain data; all judgement about pass/fail lives in Node, so the report shape is one
// place and not two.

const PROBE = `(async (onlyIds) => {
  const { TYPES } = await import('/src/templates/types/registry.ts');
  const { HAND_WRITTEN, CATALOG } = await import('/src/templates/catalog.ts');
  const { variantsFromType, typeFieldsToSpx, missingParts } = await import('/src/templates/types/graphicType.ts');
  const { parseAnimData } = await import('/src/blocks/animData.ts');
  const { validateMachine, spxSteps, deriveMachine, allOperatorEvents } = await import('/src/blocks/animMachine.ts');
  const { hasMachineRuntime } = await import('/src/templates/shared/animRuntime.ts');
  const { validateTemplate } = await import('/src/validation/validateTemplate.ts');

  const FAMILIES = ['minimal', 'editorial', 'cinematic', 'sport', 'glass', 'noacg', 'sticker', 'showtime', 'arcade'];

  // ── The matrix ─────────────────────────────────────────────────────────────────────────
  // Read off the live TYPES array. 12 types x 4 families; a cell is filled when some design
  // of that type carries that styleTag.
  const cells = [];
  for (const type of TYPES) {
    for (const family of FAMILIES) {
      const design = type.designs.find((d) => d.styleTag === family);
      cells.push({
        typeId: type.id,
        typeName: type.name,
        category: type.structure.category,
        frequency: type.frequency ?? null,
        family,
        designId: design ? design.id : '',
      });
    }
  }

  // ── The gates, per design ──────────────────────────────────────────────────────────────
  const handWrittenById = {};
  for (const list of Object.values(HAND_WRITTEN)) {
    for (const v of list ?? []) handWrittenById[v.id] = v;
  }

  const candidates = [];
  for (const type of TYPES) {
    const compiled = variantsFromType(type);
    for (const design of type.designs) {
      if (onlyIds.length && !onlyIds.includes(design.id)) continue;
      const rec = {
        designId: design.id,
        designName: design.name,
        typeId: type.id,
        category: type.structure.category,
        family: design.styleTag,
        // gate -> array of failure strings. An empty array is a pass.
        gates: { parts: [], fields: [], machine: [], capabilities: [], samples: [], semantics: [] },
        warnings: [],
      };

      let tpl = null;
      const variant = compiled.find((v) => v.id === design.id);
      try {
        // variantsFromType wraps create() with the parts check and throws on a miss, so this
        // one call exercises assembly, attachMachine's shape gate, and parts at once.
        tpl = variant.create({});
      } catch (e) {
        rec.gates.parts.push('create() threw: ' + String(e && e.message ? e.message : e));
      }

      if (tpl) {
        // ── parts ──────────────────────────────────────────────────────────────────────
        // Re-run explicitly: create() already throws, but a design built through a path that
        // did not throw still has to resolve every part the type promised.
        for (const miss of missingParts(type, tpl)) rec.gates.parts.push('missing required part: ' + miss);

        // ── fields ─────────────────────────────────────────────────────────────────────
        let declared = [];
        try {
          declared = typeFieldsToSpx(type.fields);
        } catch (e) {
          rec.gates.fields.push('the type\\'s own field declaration is invalid: ' + String(e.message ?? e));
        }
        if (declared.length !== tpl.fields.length) {
          rec.gates.fields.push(
            'the design emits ' + tpl.fields.length + ' field(s), the type declares ' + declared.length,
          );
        }
        for (const f of tpl.fields) {
          const re = new RegExp('id="' + f.field + '"');
          if (!re.test(tpl.html) && !re.test(tpl.js)) {
            rec.gates.fields.push('field ' + f.field + ' has no id="' + f.field + '" element');
          }
        }
        // The declared ftype against the emitted one. The count matching is not the contract:
        // a score DECLARED as a number and EMITTED as a text box passes every other check here
        // and still ships the wrong control. TITLE is not compared - a design may relabel a
        // field for its own vocabulary (mr04, rs04) - and a role:'hidden' field is skipped
        // because ftypeFor maps that role to ftype 'hidden' while the role actually means
        // "input-only", i.e. the operator still types it (see e2e/graphic-types.spec.ts).
        for (let i = 0; i < Math.min(declared.length, tpl.fields.length); i += 1) {
          if (type.fields[i]?.role === 'hidden') continue;
          if (declared[i].ftype !== tpl.fields[i].ftype) {
            rec.gates.fields.push(
              'field ' + tpl.fields[i].field + ' (' + tpl.fields[i].title + '): the type declares ftype ' +
                declared[i].ftype + ', the design emits ' + tpl.fields[i].ftype,
            );
          }
        }

        // ── machine + motion ───────────────────────────────────────────────────────────
        const data = parseAnimData(tpl.js);
        if (!data) {
          rec.gates.machine.push('the animation data does not parse');
        } else {
          if (String(spxSteps(data)) !== String(tpl.settings.steps)) {
            rec.gates.machine.push(
              'settings.steps is "' + tpl.settings.steps + '" but the default path derives ' + spxSteps(data),
            );
          }
          if (data.machine) {
            for (const err of validateMachine(data).errors) rec.gates.machine.push(err);
            for (const warn of validateMachine(data).warnings) rec.warnings.push('machine: ' + warn);
            if (!hasMachineRuntime(tpl.js)) {
              rec.gates.machine.push('the interpreter predates the machine engine (re-emit the ANIMATION region)');
            }
          }
          // Every control the type declares must have a real arrow, or the Phase 5 control
          // page grows a button that dispatches an event nothing listens for.
          const machine = data.machine ?? deriveMachine(data);
          const events = allOperatorEvents(machine);
          for (const c of type.controls ?? []) {
            if (!events.includes(c.event)) {
              rec.gates.machine.push('control event "' + c.event + '" is not authored on any transition');
            }
          }
        }

        // ── the export gate ────────────────────────────────────────────────────────────
        const val = validateTemplate(tpl);
        for (const e of val.errors) rec.gates.machine.push('validateTemplate ' + e.rule + ': ' + e.message);
        for (const w of val.warnings) rec.warnings.push('validateTemplate ' + w.rule + ': ' + w.message);
      }

      // ── capabilities ─────────────────────────────────────────────────────────────────
      // A compiled variant takes its TYPE's capabilities EXCEPT where the design overrides one.
      // When the design is a PROMOTED hand-written variant, the pre-merge entry still carries
      // what the design was actually built for — so the two can be compared. This is the card04
      // check: it widened a 3-line design to 5 and broke nothing, so no test objected.
      //
      // WHAT IS COMPARED IS THE EFFECTIVE CAPABILITY, not the type's raw one, and the difference
      // is the whole point of the override. TypeDesign.logo exists so a design can decline a
      // mark its type permits (2026-08-21, docs/MARK_CAPABILITY_AUDIT.md): the countdown type
      // says a clock CAN carry one, and gt01/gt02/gt05/gt06 were drawn without a place for it.
      // Comparing against type.capabilities.logo failed all four for declining — which is the
      // gate reporting the override as the very drift the override exists to prevent.
      const own = handWrittenById[design.id];
      if (own) {
        if (own.maxLines !== type.capabilities.maxLines) {
          rec.gates.capabilities.push(
            'the design is built for ' + own.maxLines + ' line(s), the type offers ' + type.capabilities.maxLines,
          );
        }
        const compiledLogo = design.logo ?? type.capabilities.logo;
        if (own.logo !== compiledLogo) {
          rec.gates.capabilities.push(
            'the design declares logo "' + own.logo + '", it compiles to "' + compiledLogo + '"',
          );
        }
        // MOTION AND POSITION ARE GATES, NOT WARNINGS — and getting this wrong once is why
        // the comment is long. An earlier version of this check reported a differing preset
        // list as a mere warning, reasoning that the shared preset bank is prefix-parameterized
        // so any preset "works" on any design. That reasoning is true about the CODE and false
        // about the PRODUCT: animationPresets[0] IS the default a new project is created
        // with, and the compiled list is the whole set the wizard, the Inspector and the AI are
        // allowed to offer. So a promotion silently re-choreographs the design — card02's
        // snap-stinger stopped being reachable at all, and minimal sb02 defaulted to a sport
        // stinger. Same for the zone: bug01's frosted tile is drawn for the top-right safe
        // area and the type was parking it top-left.
        //
        // The drift is invisible to every output-based check, because create({}) resolves the
        // preset from the design's OWN variant record — the emitted code never moves and neither
        // does any baseline taken from it. Comparing against the hand-written variant is the
        // only way to see it. TypeDesign.animationPresets / defaultZone are how a design keeps
        // what it was authored with, so conformance is now expressible and this is a gate.
        const compiledPresets = design.animationPresets ?? type.capabilities.animationPresets;
        const authoredPresets = own.animationPresets ?? [];
        if (JSON.stringify(compiledPresets) !== JSON.stringify(authoredPresets)) {
          rec.gates.capabilities.push(
            'motion drift: the design is authored for [' + authoredPresets.join(', ') +
              '] but compiles to [' + compiledPresets.join(', ') +
              ']. Declare TypeDesign.animationPresets to keep the design’s own vocabulary.',
          );
        }
        // Steps drift, for the same reason as motion drift: defaultSteps is what create({})
        // resolves, so a stepped design compiled unstepped ships a checklist that shows its
        // last item on the first frame — and, like the preset list, no output-based check can
        // see it, because the design's OWN variant record is what every baseline was taken from.
        const compiledSteps = !!(design.defaultSteps ?? type.capabilities.defaultSteps);
        if (compiledSteps !== !!own.defaultSteps) {
          rec.gates.capabilities.push(
            'steps drift: the design is authored ' + (own.defaultSteps ? 'STEPPED' : 'unstepped') +
              ' but compiles ' + (compiledSteps ? 'STEPPED' : 'unstepped') +
              '. Declare TypeDesign.defaultSteps to keep the design’s own reveal.',
          );
        }
        const compiledZone = design.defaultZone ?? type.capabilities.defaultZone;
        if (own.defaultZone && compiledZone !== own.defaultZone) {
          rec.gates.capabilities.push(
            'position drift: the design is drawn for "' + own.defaultZone + '" but compiles to "' +
              compiledZone + '". Declare TypeDesign.defaultZone to keep the design’s own corner.',
          );
        }

        // ── samples ────────────────────────────────────────────────────────────────────
        // A promoted design must keep the text it was written around. Where its own variant's
        // sample differs from the type's field default, TypeDesign.samples has to carry it.
        const lineFields = type.fields.filter((f) => f.role === 'line');
        for (let i = 0; i < lineFields.length; i++) {
          const field = lineFields[i];
          const ownSample = (own.suggestedLines ?? [])[i];
          if (!ownSample) continue;
          const resolved = (design.samples ?? {})[field.key] ?? field.value;
          if (ownSample.sample !== resolved) {
            rec.gates.samples.push(
              'line ' + i + ' (' + field.key + '): the design ships "' + String(ownSample.sample).slice(0, 40) +
                '" but the type would show "' + String(resolved).slice(0, 40) + '" — declare it in samples',
            );
          }
        }

        // ── semantics (a SIGNAL, acknowledged or failed) ───────────────────────────────
        // Not decidable by machine. But the real failure — lt01 into social-bug — had a
        // mechanical tell: the design labels its lines "Name"/"Title" and the type calls them
        // handle/platform. Same shape, different meaning. Raise it; let the author sign it off
        // with TypeDesign.semantics.
        const lineFields2 = type.fields.filter((f) => f.role === 'line');
        const mismatched = [];
        for (let i = 0; i < lineFields2.length; i++) {
          const ownLine = (own.suggestedLines ?? [])[i];
          if (!ownLine) continue;
          if (ownLine.title !== lineFields2[i].label) {
            mismatched.push('line ' + i + ': design calls it "' + ownLine.title + '", type calls it "' + lineFields2[i].label + '"');
          }
        }
        if (mismatched.length && !design.semantics) {
          rec.gates.semantics.push(
            'the design and the type name these lines differently, so they may MEAN different things — ' +
              'read them and record the decision in TypeDesign.semantics: ' + mismatched.join('; '),
          );
        }
      } else {
        // A design with no hand-written twin builds its own template inline. There is nothing
        // to compare it against, which is exactly why a purpose-built design is easier to get
        // right than a promotion.
        rec.warnings.push('no hand-written variant with this id — capabilities and samples not comparable');
      }

      candidates.push(rec);
    }
  }

  // ── The kits (the taxonomy config, src/templates/packs.ts) ─────────────────────────────
  // A kit is pure config over the filled matrix, so the whole taxonomy is checkable: every
  // type id resolves in the kit's family, every extra exists in the merged catalog, every
  // starter is about ten graphics that can run a show in the kit's own Style, and the 60
  // reference formats are covered exactly once.
  const { PACKS, resolvePack, validatePacks } = await import('/src/templates/packs.ts');
  const variantStyleTags = new Map();
  for (const list of Object.values(CATALOG)) for (const v of list ?? []) variantStyleTags.set(v.id, v.styleTag);
  const packProblems = validatePacks(variantStyleTags);
  // The discovery-taxonomy assertions (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §17 stage 2):
  // format-id ↔ sheet-name bijection, subtypes from the controlled lists, positional
  // semantics matching schema length. Same failure surface as the pack problems.
  const { validateTaxonomy } = await import('/src/templates/templateMeta.ts');
  packProblems.push(...validateTaxonomy());
  const packs = [];
  for (const pack of PACKS) {
    let resolved = [];
    try {
      resolved = resolvePack(pack);
    } catch (e) {
      packProblems.push(String(e && e.message ? e.message : e));
    }
    packs.push({
      id: pack.id,
      name: pack.name,
      family: pack.family,
      formats: pack.formats,
      starter: pack.starter,
      cells: resolved,
      extras: pack.extras ?? [],
    });
  }

  // ── Literal token drift (the override map's blind spot) ────────────────────────────────
  // The conformance metric only sees values routed through the tokens: map. A design that
  // hand-types the value a token was meant to carry reads as conformant — bug02/lt12/tk05/
  // tk06 shipped near-miss glows that way (THEME_DEFAULTS_REVIEW §"The blind spot"). So grep
  // the emitted CSS for the literal FORMS, scoped to families where the token has a real
  // value (a sport accent halo is intentional; sport's accentGlow is NO_SHADOW, so it is
  // skipped by construction). :root's own token declarations never match — the patterns
  // require the consuming property name.
  const { FAMILY_TOKENS, NO_SHADOW } = await import('/src/model/themeTokens.ts');
  const literalDrift = [];
  for (const [category, variants] of Object.entries(CATALOG)) {
    for (const variant of variants ?? []) {
      const tokens = FAMILY_TOKENS[variant.styleTag];
      if (!tokens) continue;
      let css = '';
      try {
        css = variant.create({}).css;
      } catch (e) { continue; } // a creation failure is the six gates' finding, not this one's
      const findings = [];
      if (
        tokens.accentGlow !== NO_SHADOW &&
        /box-shadow:[^;]*\\b0 0 calc\\(\\d+px \\* var\\(--scale\\)\\) color-mix\\(in srgb, var\\(--accent\\)/.test(css)
      ) {
        findings.push('hand-typed accent glow — route it through var(--accent-glow)');
      }
      if (tokens.panelBlur !== 'none' && /backdrop-filter:\\s*blur\\(/.test(css)) {
        findings.push('hand-typed backdrop blur — route it through var(--panel-blur)');
      }
      if (findings.length) literalDrift.push({ id: variant.id, category, family: variant.styleTag, findings });
    }
  }

  return { cells, candidates, packs, packProblems, literalDrift };
})`;

// ── Run it ───────────────────────────────────────────────────────────────────────────────

const base = `http://localhost:${devPort()}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let probe;
try {
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Escape'); // dismiss the creation wizard
  probe = await page.evaluate(`(${PROBE})(${JSON.stringify(onlyIds)})`);
} catch (e) {
  console.error(`\nThe factory could not reach the app at ${base}.`);
  console.error('Start the dev server first (the same prerequisite scripts/l3-sweep.mjs has).');
  console.error(String(e.message ?? e));
  await browser.close();
  process.exit(2);
} finally {
  await browser.close();
}

const { cells, candidates, packs, packProblems, literalDrift } = probe;

// ── The matrix report ────────────────────────────────────────────────────────────────────

const FAMILIES = ['minimal', 'editorial', 'cinematic', 'sport', 'glass', 'noacg', 'sticker', 'showtime', 'arcade'];
const filled = cells.filter((c) => c.designId);
const empty = cells.filter((c) => !c.designId);

function printMatrix() {
  const types = [];
  for (const c of cells) if (!types.some((t) => t.id === c.typeId)) types.push({ id: c.typeId, name: c.typeName, frequency: c.frequency });
  const width = Math.max(...types.map((t) => t.name.length));
  console.log('\nTHE MATRIX — type x style family');
  console.log(''.padEnd(width + 6) + FAMILIES.map((f) => f.padEnd(10)).join(''));
  for (const t of types) {
    const row = FAMILIES.map((f) => {
      const cell = cells.find((c) => c.typeId === t.id && c.family === f);
      return (cell.designId || '·').padEnd(10);
    }).join('');
    const freq = t.frequency == null ? '   ' : String(t.frequency).padStart(3);
    console.log(`${t.name.padEnd(width)} ${freq}  ${row}`);
  }
  console.log(`\n${filled.length}/${cells.length} cells filled · ${empty.length} empty`);
}

// ── The gate report ──────────────────────────────────────────────────────────────────────

const GATE_ORDER = ['parts', 'fields', 'machine', 'capabilities', 'samples', 'semantics'];

function gateFailures(rec) {
  return GATE_ORDER.flatMap((g) => rec.gates[g].map((m) => ({ gate: g, message: m })));
}

const failing = candidates.filter((c) => gateFailures(c).length > 0);
const perGate = Object.fromEntries(GATE_ORDER.map((g) => [g, candidates.filter((c) => c.gates[g].length).length]));

function printGates() {
  console.log(`\nGATES — ${candidates.length} candidate design(s)`);
  for (const rec of candidates) {
    const fails = gateFailures(rec);
    const mark = fails.length ? 'FAIL' : 'pass';
    console.log(`  ${mark}  ${rec.designId.padEnd(8)} ${rec.family.padEnd(8)} ${rec.typeId}`);
    for (const f of fails) console.log(`          ${f.gate}: ${f.message}`);
    for (const w of rec.warnings) console.log(`          (warn) ${w}`);
  }
  console.log(`\n  ${candidates.length - failing.length}/${candidates.length} passed`);
  const byGate = GATE_ORDER.filter((g) => perGate[g] > 0).map((g) => `${g}=${perGate[g]}`);
  console.log(`  failures per gate: ${byGate.length ? byGate.join(' · ') : 'none'}`);
}

// ── The packs and literal-drift reports ──────────────────────────────────────────────────

function printPacks() {
  console.log(`\nKITS - ${packs.length} kit(s), src/templates/packs.ts`);
  for (const p of packs) {
    console.log(
      `  ${p.id.padEnd(14)} ${p.family.padEnd(8)} starts with ${String(p.starter.length).padStart(2)}` +
        ` · library ${String(p.cells.length).padStart(2)} types` +
        (p.extras.length ? ` +${p.extras.length} extra(s)` : '') +
        ` · ${p.formats.length} format(s)`,
    );
  }
  const mapped = packs.reduce((n, p) => n + p.formats.length, 0);
  console.log(`  ${mapped} reference formats mapped`);
  for (const prob of packProblems) console.log(`  PROBLEM: ${prob}`);
}

function printLiteralDrift() {
  if (!literalDrift.length) return;
  console.log(`\nLITERAL TOKEN DRIFT — ${literalDrift.length} variant(s)`);
  for (const d of literalDrift) {
    for (const f of d.findings) console.log(`  FAIL  ${d.id.padEnd(8)} ${d.family.padEnd(8)} ${f}`);
  }
}

if (command === 'run' || command === 'matrix') printMatrix();
if (command === 'run' || command === 'check') {
  printGates();
  printPacks();
  printLiteralDrift();
}

if (pageErrors.length) {
  console.log('\nPage errors during the probe:');
  for (const e of pageErrors) console.log('  ' + e);
}

const report = {
  $comment:
    'The template factory report (scripts/factory.mjs). Cells are the type x family matrix; ' +
    'candidates are every type design run through the six promotion gates (docs/GRAPHIC_TYPES.md §5).',
  generated: { command, onlyIds },
  matrix: { total: cells.length, filled: filled.length, empty: empty.length, cells },
  gates: {
    attempted: candidates.length,
    passed: candidates.length - failing.length,
    perGate,
    candidates,
  },
  packs: { total: packs.length, problems: packProblems, packs },
  literalDrift,
};

if (jsonPath) {
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nreport -> ${jsonPath}`);
}

// A candidate that fails any gate fails the run. The matrix having empty cells does NOT: an
// empty cell is work not yet done, and the whole point of the six gates is that leaving one
// empty costs nothing while shipping a wrong design costs a lot. A pack problem or a literal
// token drift is also a failure — both are config/conformance claims this loop exists to keep
// true.
const otherFailures =
  (command === 'matrix' ? 0 : packProblems.length + literalDrift.length);
if (failing.length || otherFailures) {
  if (failing.length) console.log(`\n${failing.length} candidate(s) failed. Nothing enters the catalog on a failed gate.`);
  if (otherFailures) console.log(`\n${otherFailures} pack/literal-drift problem(s). See above.`);
  process.exit(1);
}
console.log('\nAll candidates passed their gates.');
