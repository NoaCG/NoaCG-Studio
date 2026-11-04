// gate: build
// guards: src/ai/designSpec.ts, src/ai/structuralIntent.ts, src/ai/pro/language/contract.ts, src/ai/creative/style.ts, src/ai/creative/critique.ts, src/ai/creative/stages.ts, src/ai/polish.ts, src/ai/video/tools.ts
//
// TOOL SCHEMAS A GEMINI ROUTE RECEIVES (#2077). Gemini refuses any schema enum that is not of type
// string before generating anything ("For schema with enum values, schema type should be STRING",
// recorded for #2022). The browser harness sends its tools through /api/ai/generate, and a user's
// own Google key or a `google/*` gateway model receives them as response_format, so one numeric
// enum fails that whole stage with HTTP 400 - quietly, because the harness then falls back. The
// design spec's `animation.speed` was one; bounds plus a description replace an enum.
//
//   node --test scripts/ai-tool-schemas.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
import { measured } from './measured.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function load(entry) {
  const bundle = await rolldown({ input: path.join(root, entry), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

/** The harness's exported ModelTools, by module. Two cannot load in plain Node and are left out:
 *  REFERENCE_TOOL (src/ai/creative/references.ts pulls in the Supabase client) and TEMPLATE_TOOL
 *  (src/ai/claudeProvider.ts reads browser settings). Neither declares an enum on a non-string. */
const MODULES = {
  'src/ai/designSpec.ts': ['DESIGN_SPEC_TOOL', 'DESIGN_ALTERNATIVES_TOOL'],
  'src/ai/structuralIntent.ts': ['INTENT_TOOL'],
  'src/ai/pro/language/contract.ts': ['DESIGN_LANGUAGE_TOOL'],
  'src/ai/creative/style.ts': ['CREATIVE_STYLE_TOOL'],
  'src/ai/creative/critique.ts': ['CRITIQUE_TOOL'],
  'src/ai/creative/stages.ts': ['CONCEPTS_TOOL', 'CREATIVE_SPEC_TOOL'],
  'src/ai/polish.ts': ['POLISH_TOOL'],
  'src/ai/video/tools.ts': ['MOTION_PLAN_TOOL', 'REMOTION_MODULE_TOOL', 'HYPERFRAMES_MODULE_TOOL', 'DETECT_SKILLS_TOOL'],
};

/** Each node holding an enum that is not a string enum, with its path. */
function nonStringEnums(node, at, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node.enum) && (node.type !== 'string' || node.enum.some((value) => typeof value !== 'string'))) {
    out.push(`${at} = ${JSON.stringify(node.enum)}`);
  }
  for (const [key, value] of Object.entries(node)) nonStringEnums(value, `${at}.${key}`, out);
  return out;
}

test('no harness tool schema carries an enum Gemini cannot express', async () => {
  const tools = [];
  for (const [entry, names] of Object.entries(MODULES)) {
    const mod = await load(entry);
    for (const name of names) {
      assert.ok(mod[name]?.input_schema, `${entry} exports ${name}`);
      tools.push(mod[name]);
    }
  }
  // The narrowing the design stage applies sends this shape too.
  const { narrowFitTool } = await load('src/ai/structuralIntent.ts');
  const designSpec = await load('src/ai/designSpec.ts');
  tools.push(narrowFitTool(designSpec.DESIGN_SPEC_TOOL, 'catalog'), narrowFitTool(designSpec.DESIGN_ALTERNATIVES_TOOL, 'custom'));
  measured(tools.length, 'harness tool schemas');

  const offenders = tools.flatMap((tool) => nonStringEnums(tool.input_schema, tool.name));
  assert.deepEqual(offenders, [], `non-string enum(s) - Gemini will 400 the whole stage: ${offenders.join('; ')}. Use minimum/maximum plus a description.`);
});

test('the design spec keeps its speed to the three legal values without an enum', async () => {
  const { DESIGN_SPEC_TOOL } = await load('src/ai/designSpec.ts');
  const speed = DESIGN_SPEC_TOOL.input_schema.properties.animation.properties.speed;
  assert.deepEqual({ type: speed.type, minimum: speed.minimum, maximum: speed.maximum }, { type: 'number', minimum: 0.75, maximum: 1.5 });
  assert.equal('enum' in speed, false);
  assert.match(speed.description, /0\.75.*1.*1\.5/);
});
