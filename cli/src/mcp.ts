// `noacg mcp` - the CLI as an MCP server over stdio, for Claude Code, Codex, Cursor or any MCP
// client. ONE tool, `noacg`, with the terminal's own grammar: `command` is the verb, the other
// arguments are the verb's flags. One warm browser + bridge page for the life of the process;
// screenshots come back as image content so the agent SEES the frame it is judging.
//
// Why one tool and not seven. An MCP client puts every tool's schema into the model's context in
// EVERY session where the server is configured, whether or not that session is about NoaCG. Seven
// tools with teaching descriptions measured about 1,160 tokens of system prompt; one tool with
// dispatch-only descriptions measures about 590 (docs/AGENT_CLI.md "What a session pays"), and a
// new verb costs one enum entry rather than a schema. The teaching lives in the noacg-graphic skill
// and its references (`docs`), which load only when a graphic is being made. Keep the descriptions
// here short and about DISPATCH - which verb, which argument - never about how to design.
//
// Which verb reads which argument is ONE table, READS. It writes the argument descriptions, and it
// refuses an argument the verb does not read - a flat schema accepts every key for every verb, and
// an argument that is silently dropped (a `houseContract` that validate honoured and save ignored)
// is the drift a per-tool schema used to prevent by construction.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { z } from 'zod';
import { resolveKey } from './auth.js';
import { BridgeClient } from './bridgeClient.js';
import { closeBrowser } from './browser.js';
import { cliVersion, noacgUrl } from './config.js';
import { describeInspection } from './commands/inspect.js';
import { docTopics, readDoc } from './commands/docs.js';
import { scaffoldRequestFrom } from './commands/scaffold.js';
import { notLoggedIn, savePackage } from './commands/save.js';
import { describeValidation, regenerateInPlace, sourcesOf } from './commands/validate.js';
import { ografBench } from './ografBench.js';
import { EXIT_OK, parseArgs, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from './output.js';
import { shoot } from './screenshot.js';
import { isEmptyDir, packageEntries, readPackageInput, unzipTo } from './workspace.js';

/** The verbs the tool speaks - the authoring verbs of the terminal, in the order the loop uses
 *  them. `caspar` is deliberately absent: it drives live playout hardware, which is an operator's
 *  decision and not an authoring agent's (pinned by cli/test/mcp.test.mjs). */
export const MCP_COMMANDS = ['types', 'scaffold', 'validate', 'inspect', 'screenshot', 'docs', 'save'] as const;
export type McpCommand = (typeof MCP_COMMANDS)[number];

const arg = <S extends z.ZodTypeAny>(schema: S, about = '') => ({ schema, about });

/** Every argument a verb can read, with the one line the schema says about it. The verbs that
 *  read it are prefixed from READS, never typed here. */
const ARGUMENTS = {
  path: arg(z.string(), 'package dir or .zip'),
  out: arg(z.string(), 'an empty or new dir'),
  type: arg(z.string(), 'a type id (see types)'),
  design: arg(z.string(), 'a design id, or "neutral"'),
  fields: arg(z.string(), 'typeless: "Label:kind[=value],..."; kinds text|lines|number|color|select|toggle|image; select options as Label:select=a|b|c'),
  name: arg(z.string(), 'the graphic\'s name (scaffold) or the library name (save)'),
  values: arg(z.record(z.string()), 'starting values by field key'),
  palette: arg(z.string()),
  font: arg(z.string()),
  zone: arg(z.string()),
  bench: arg(z.boolean(), 'live runtime bench (default true)'),
  houseContract: arg(z.boolean(), 'editability contract as errors (default true)'),
  screenshots: arg(z.boolean(), 'return off/onair/stress frames as images'),
  state: arg(z.enum(['off', 'onair', 'stress']), 'default onair'),
  data: arg(z.record(z.string()), 'explicit field values'),
  topic: arg(z.string(), docTopics().join('|')),
  folder: arg(z.string(), 'a library folder'),
};
type ArgName = keyof typeof ARGUMENTS;

/** Which verb reads which argument - the one source for the descriptions and the refusals. */
const READS: Record<McpCommand, readonly ArgName[]> = {
  types: [],
  scaffold: ['out', 'type', 'design', 'fields', 'name', 'values', 'palette', 'font', 'zone'],
  validate: ['path', 'bench', 'houseContract', 'screenshots'],
  inspect: ['path'],
  screenshot: ['path', 'state', 'data'],
  docs: ['topic'],
  save: ['path', 'name', 'folder', 'bench', 'houseContract'],
};

const COMMAND = z.enum(MCP_COMMANDS).describe('types: the graphic types NoaCG knows | scaffold: write a package | validate: gate + runtime bench, regenerates the package | inspect: the operator surface | screenshot: one frame, as an image | docs: a reference text | save: validate, then into the user\'s NoaCG library');

type InputShape = { command: typeof COMMAND } & { [K in ArgName]: z.ZodOptional<(typeof ARGUMENTS)[K]['schema']> };
type Input = z.infer<z.ZodObject<InputShape>>;

/** The tool's schema, built when the server starts rather than when the module loads, so a
 *  terminal command that imports this file pays nothing for it. */
function inputShape(): InputShape {
  const shape: Record<string, z.ZodTypeAny> = { command: COMMAND };
  for (const [name, { schema, about }] of Object.entries(ARGUMENTS)) {
    const verbs = MCP_COMMANDS.filter((c) => READS[c].includes(name as ArgName)).join('/');
    shape[name] = schema.optional().describe(about ? `${verbs}: ${about}` : verbs);
  }
  return shape as InputShape;
}

type Content = Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
type Result = { content: Content; isError?: boolean };

let shared: BridgeClient | null = null;
async function bridge(): Promise<BridgeClient> {
  if (shared) return shared;
  shared = await BridgeClient.connect();
  return shared;
}

const text = (s: string): Content => [{ type: 'text', text: s }];
const image = (png: Uint8Array): Content[number] => ({ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' });
const refuse = (s: string): Result => ({ content: text(s), isError: true });

/** A string argument the verb cannot do without - the terminal's usage error, in the tool's words. */
function need(input: Input, key: 'path' | 'out' | 'topic'): string {
  const value = input[key];
  if (typeof value !== 'string' || value === '') throw new UsageError(`noacg ${input.command} needs "${key}".`);
  return value;
}

/** An argument no verb in this call reads is refused, never dropped. */
function refuseStray(input: Input): void {
  const stray = (Object.keys(input) as Array<keyof Input>).filter((k) => k !== 'command' && input[k] !== undefined && !READS[input.command].includes(k as ArgName));
  if (stray.length) throw new UsageError(`noacg ${input.command} does not take ${stray.map((k) => `"${k}"`).join(', ')}.`);
}

async function types(): Promise<Result> {
  const b = await bridge();
  return { content: text(JSON.stringify(await b.types(), null, 2)) };
}

async function scaffold(input: Input): Promise<Result> {
  const out = need(input, 'out');
  const argv: string[] = ['scaffold', '--out', out];
  if (input.type) argv.push('--type', input.type);
  if (input.design) argv.push('--design', input.design);
  if (input.fields) argv.push('--fields', input.fields);
  if (input.name) argv.push('--name', input.name);
  for (const [k, v] of Object.entries(input.values ?? {})) argv.push('--set', `${k}=${v}`);
  if (input.palette) argv.push('--palette', input.palette);
  if (input.font) argv.push('--font', input.font);
  if (input.zone) argv.push('--zone', input.zone);
  const args = parseArgs(argv);
  if (!(await isEmptyDir(out))) return refuse(`${out} is not empty - scaffold into a new directory.`);
  const b = await bridge();
  const { template, notes } = await b.scaffold(scaffoldRequestFrom(args));
  const files = await unzipTo(await b.exportPackage(template), out);
  return { content: text(`Scaffolded "${template.name}" (${template.type}) into ${path.resolve(out)}\n\n${notes.map((n) => `- ${n}`).join('\n')}\n\nFiles:\n${files.map((f) => `  ${f}`).join('\n')}`) };
}

async function validate(input: Input): Promise<Result> {
  const target = need(input, 'path');
  const b = await bridge();
  const { bytes, fileName, isDirectory } = await readPackageInput(target);
  const pkg = await b.readPackage(bytes, fileName);
  if (!pkg.imported) {
    // A third-party OGraf package: manifest conformance + a host-driven lifecycle check.
    const read = pkg.ograf!;
    const result = await ografBench(b, read, await packageEntries(bytes), { screenshot: !!input.screenshots });
    const errors = [...read.errors.map((e) => `ograf-manifest: ${e}`), ...result.errors];
    const content: Content = text(`${errors.length ? 'FAIL' : 'OK'} - third-party OGraf Graphic ${String(read.manifest.id ?? '')}\n${errors.map((e) => `- ERROR ${e}`).join('\n')}\nHost: ${result.steps.map((s) => `${s.action} -> ${s.statusCode}`).join(', ')}\n${describeInspection({ ...read.contract, stateGroups: [] })}`);
    if (result.screenshot) content.push(image(result.screenshot));
    return { content, isError: errors.length > 0 };
  }
  const dir = isDirectory ? path.resolve(target) : null;
  const before = dir ? await sourcesOf(dir, pkg.imported.template) : {};
  const normalized = await b.normalize(pkg.imported.template);
  const template = normalized.template;
  const validation = await b.validate(template, { bench: input.bench ?? true, houseContract: input.houseContract ?? true });
  const content: Content = text(describeValidation(validation) + (normalized.converted || !normalized.dataRegion ? `\nNormalize: ${normalized.note}` : ''));
  let thumbnail: { png: Uint8Array; width: number; height: number } | undefined;
  if (input.screenshots) {
    const size = { width: template.resolution.width, height: template.resolution.height };
    for (const state of ['off', 'onair', 'stress'] as const) {
      const png = await shoot(b.bench, b.origin, await b.compose(template, state), undefined, size);
      content.push({ type: 'text', text: `${state}:` }, image(png));
      if (state === 'onair') thumbnail = { png, ...size };
    }
  }
  if (dir) {
    const changes = await regenerateInPlace(b, dir, template, { thumbnail, before, converted: normalized.converted });
    content.push({ type: 'text', text: `Regenerated the package in ${dir}.${changes.map((c) => `\n  changed: ${c}`).join('')}` });
  }
  return { content, isError: !validation.ok };
}

async function inspect(input: Input): Promise<Result> {
  const target = need(input, 'path');
  const b = await bridge();
  const { bytes, fileName } = await readPackageInput(target);
  const pkg = await b.readPackage(bytes, fileName);
  const inspection = pkg.imported ? await b.inspect({ template: pkg.imported.template }) : await b.inspect({ manifest: pkg.ograf?.manifest });
  return { content: text(describeInspection(inspection)) };
}

async function screenshot(input: Input): Promise<Result> {
  const target = need(input, 'path');
  const b = await bridge();
  const { bytes, fileName } = await readPackageInput(target);
  const pkg = await b.readPackage(bytes, fileName);
  if (!pkg.imported) throw new UsageError('Screenshots of a third-party OGraf package come from validate with screenshots: true.');
  const t = pkg.imported.template;
  // Explicit values win over a state only when there are some; an empty `data` is no request.
  const frame = input.data && Object.keys(input.data).length ? input.data : (input.state ?? 'onair');
  const png = await shoot(b.bench, b.origin, await b.compose(t, frame), undefined, { width: t.resolution.width, height: t.resolution.height });
  return { content: [image(png)] };
}

async function docs(input: Input): Promise<Result> {
  return { content: text(await readDoc(need(input, 'topic'))) };
}

async function save(input: Input): Promise<Result> {
  const target = need(input, 'path');
  // The cheapest refusal first: no key means no save, and that answer needs no browser.
  const origin = noacgUrl();
  if (!(await resolveKey(origin))) return refuse(notLoggedIn(origin));
  const b = await bridge();
  const outcome = await savePackage(target, { name: input.name, folder: input.folder, bench: input.bench ?? true, houseContract: input.houseContract ?? true }, b, () => undefined);
  const lines: string[] = [];
  if (outcome.validation) lines.push(describeValidation(outcome.validation));
  lines.push(outcome.ok ? `Saved "${outcome.name}" to the NoaCG library -> ${outcome.url}` : (outcome.error ?? 'Not saved.'));
  return { content: text(lines.join('\n\n')), isError: !outcome.ok };
}

const VERBS: Record<McpCommand, (input: Input) => Promise<Result>> = { types, scaffold, validate, inspect, screenshot, docs, save };

export async function runMcp(args: ParsedArgs, _out: Out): Promise<number> {
  refuseStrayArgs(args, 0);
  const server = new McpServer({ name: 'noacg', version: cliVersion() });

  server.registerTool(
    'noacg',
    {
      title: 'NoaCG broadcast graphics',
      description: 'NoaCG Studio broadcast graphics (lower third, scoreboard, ticker, countdown, any on-air graphic; SPX / CasparCG / OGraf packages): make, check and save one. The verbs of the `noacg` terminal CLI; the noacg-graphic skill is the procedure, docs "contract" the rulebook.',
      inputSchema: inputShape(),
    },
    // A throw - a usage error, an IO error, the bridge refusing - becomes a tool error carrying
    // the message; the SDK does that itself, so nothing is caught here.
    async (input) => {
      refuseStray(input);
      return VERBS[input.command](input);
    },
  );

  for (const topic of docTopics()) {
    server.registerResource(`docs-${topic}`, `noacg://docs/${topic}`, { title: `NoaCG ${topic}`, mimeType: 'text/markdown' }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readDoc(topic) }],
    }));
  }

  const transport = new StdioServerTransport();
  const shutdown = async () => {
    await shared?.close().catch(() => undefined);
    await closeBrowser();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('end', shutdown);
  await server.connect(transport);
  // Keep the process alive until the transport ends.
  await new Promise<void>(() => undefined);
  return EXIT_OK;
}
