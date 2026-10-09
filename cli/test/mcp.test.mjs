// The MCP entrance, offline.
//
// `noacg mcp` is one of the three ways an agent reaches the door (docs/AGENT_CLI.md), and until
// this file it was the only one with no test that runs in CI: unit.test.mjs covers the terminal
// entrance, and everything the MCP server does end to end lives in smoke.test.mjs, which skips
// itself whenever no bridge answers. So the surface an installed plugin actually talks to could
// change shape - a verb renamed, an argument dropped, `caspar` quietly exposed - and every green
// run in this repository would have said nothing.
//
// What is covered is what a fault would make INVISIBLE rather than loud:
//
//   - the server exposes ONE tool, `noacg`, whose `command` enum is exactly the seven authoring
//     verbs, and `caspar` is NOT among them. That exclusion is a deliberate rule (it drives live
//     playout hardware, which is an operator's decision and not an authoring agent's) and it was
//     prose only. Prose does not fail a build.
//   - the tool carries a title, a description and the arguments the docs promise, and every
//     argument's description opens with the verbs that read it - the schema is where an agent
//     learns which flag belongs to which verb, and it is generated from the same table that
//     refuses a stray argument.
//   - the schema stays SMALL. An MCP client puts it into the model's context in every session
//     where the server is configured, NoaCG-related or not (docs/AGENT_CLI.md "What a session
//     pays" measured the seven-tool shape at about 1,160 tokens and this one at about 590). The
//     ceiling here is in characters, which is what the token count follows; a teaching sentence
//     added to a description fails it, which is the point - the teaching belongs in the skill.
//   - the server identifies itself as `noacg` at the package's own version - what an MCP client
//     shows the user, and what the plugin manifests are stamped from.
//   - `docs` answers WITHOUT a deployment. It is the one verb that reads the shipped skill off
//     disk, so an agent can learn the contract before it has a bridge, a browser or a key - and a
//     refactor that routed it through the bridge would break that silently.
//   - a verb missing its argument, or given one it does not read, is a usage error naming the
//     argument, not a bridge attempt and never a silent drop.
//   - the doc topics are also resources, and an unknown topic is an error rather than a hang.
//   - `screenshot` and `validate` take the state-render arguments the terminal takes (`--event`,
//     `--at`, `--background`), refuse a wrong one before any bridge is reached, name it the way
//     the tool does (`"background"`, never `--background`), and - against a live bridge only -
//     render the same frame the terminal does.
//   - a frame answer stays inside a client's limits: frames over a background are JPEG, at most
//     MCP_LIMITS.stateFrames state frames and MCP_LIMITS.imageBytes of images, and what is left
//     out is said. Measured before the limits: 11 MB for nine frames over the video plate, past
//     the 10 MiB one stdio message may be in the MCP SDK's own client, which then drops the
//     connection. A walk that fails part way keeps the frames and the report before it.
//
// Nothing above the live section starts a browser or reaches a deployment: NOACG_URL points at a
// closed port, and only the verbs that need no bridge are ever CALLED. The live section drives
// the state-timer fixture against NOACG_URL and skips itself when no bridge answers there, like
// screenshot-states.test.mjs.
//
// Run `npm run build` first - this drives the built `dist/`.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { cliVersion } from '../dist/config.js';
import { docTopics } from '../dist/commands/docs.js';
import { framesContent, MCP_LIMITS } from '../dist/mcp.js';
import { UsageError } from '../dist/output.js';
import { shootValidateFrames } from '../dist/screenshot.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'index.js');

/** The verbs the one tool speaks, in the order the loop uses them. */
const EXPECTED_COMMANDS = ['types', 'scaffold', 'validate', 'inspect', 'screenshot', 'docs', 'save', 'pack'];

/** Every argument the tool promises, and the verbs that read it - what each description must
 *  open with. Only `command` is required at the schema level; each verb checks its own. */
const EXPECTED_ARGUMENTS = {
  path: ['validate', 'inspect', 'screenshot', 'save'],
  paths: ['pack'],
  out: ['scaffold', 'pack'],
  type: ['scaffold'],
  design: ['scaffold'],
  fields: ['scaffold'],
  name: ['scaffold', 'save', 'pack'],
  values: ['scaffold'],
  palette: ['scaffold'],
  font: ['scaffold'],
  zone: ['scaffold'],
  bench: ['validate', 'save', 'pack'],
  houseContract: ['validate', 'save', 'pack'],
  screenshots: ['validate'],
  state: ['screenshot'],
  data: ['screenshot'],
  events: ['screenshot'],
  at: ['screenshot'],
  background: ['validate', 'screenshot'],
  topic: ['docs'],
  folder: ['save'],
  rundown: ['pack'],
  share: ['pack'],
};

/** The schema's size ceiling, in characters of the JSON an MCP client receives. The measured
 *  shape is about 3,110 characters (~750 tokens, 2026-10-02); the ceiling leaves room for a verb,
 *  not for prose. Raise it only with a measurement in docs/AGENT_CLI.md "What a session pays". */
const SCHEMA_CHAR_CEILING = 3400;

/** Connect a real MCP client to `noacg mcp` over stdio, run `fn`, always close. `url` is the
 *  deployment the server may reach; by default a closed port, so any verb that tried to reach one
 *  would fail fast rather than quietly driving the developer's own studio. */
async function withServer(fn, url = 'http://127.0.0.1:1') {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    env: { ...process.env, NOACG_URL: url, NOACG_AGENT_KEY: '' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'noacg-cli-test', version: '0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

const call = (client, args) => client.callTool({ name: 'noacg', arguments: args });

/** One `tools/list`, shared by every assertion about the schema - a server start per assertion
 *  was the file's whole cost. */
let tools;
before(async () => {
  tools = await withServer(async (client) => (await client.listTools()).tools);
});

// ------------------------------------------------------------------ the tool set

test('the MCP server exposes exactly one tool, noacg, speaking the authoring verbs', () => {
  assert.deepEqual(tools.map((t) => t.name), ['noacg']);
  assert.deepEqual(tools[0].inputSchema.properties.command.enum, EXPECTED_COMMANDS);
});

test('caspar is not a verb: it drives live playout hardware, which is not an authoring verb', () => {
  for (const verb of tools[0].inputSchema.properties.command.enum) {
    assert.ok(!/caspar/i.test(verb), `${verb} would put live playout in an authoring agent's hands`);
  }
});

test('the tool states what it is, takes the arguments the docs promise, and says which verb reads each', () => {
  const [tool] = tools;
  assert.ok(tool.title && tool.title.length > 0, 'the tool has no title');
  assert.ok(tool.description && tool.description.length > 40, 'the tool has no usable description');
  const { properties, required } = tool.inputSchema;
  assert.deepEqual(Object.keys(properties).sort(), ['command', ...Object.keys(EXPECTED_ARGUMENTS)].sort(), 'arguments changed');
  assert.deepEqual(required, ['command'], 'only command is required; every verb checks its own');
  for (const [name, verbs] of Object.entries(EXPECTED_ARGUMENTS)) {
    const description = properties[name].description ?? '';
    assert.ok(description.startsWith(verbs.join('/')), `"${name}" should open with "${verbs.join('/')}", says: ${description}`);
  }
});

test('the schema stays small enough to sit in every session unnoticed', () => {
  const [tool] = tools;
  const rendered = JSON.stringify({ description: tool.description, name: tool.name, parameters: tool.inputSchema });
  assert.ok(
    rendered.length <= SCHEMA_CHAR_CEILING,
    `the tool schema is ${rendered.length} characters, over the ${SCHEMA_CHAR_CEILING} ceiling - move the prose into the skill`,
  );
});

test('the server names itself noacg at the version the release tags', async () => {
  const info = await withServer(async (client) => client.getServerVersion());
  assert.equal(info.name, 'noacg');
  assert.equal(info.version, cliVersion());
});

// ------------------------------------------------------------------ the contract, with no bridge

test('docs answers off the shipped skill - no deployment, no browser, no key', async () => {
  const result = await withServer((client) => call(client, { command: 'docs', topic: 'contract' }));
  assert.notEqual(result.isError, true, 'docs must not need a deployment');
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.content[0].text.length > 500, 'the contract reference came back empty');
});

test('an unknown doc topic is an error that names the topics, not a hang', async () => {
  const result = await withServer((client) => call(client, { command: 'docs', topic: 'no-such-topic' }));
  assert.equal(result.isError, true);
  const said = result.content.map((c) => c.text ?? '').join('\n');
  for (const topic of docTopics()) assert.ok(said.includes(topic), `the refusal should name "${topic}"`);
});

test('a verb without its argument, or with one it does not read, is a usage error naming the argument', async () => {
  const missing = [['docs', 'topic'], ['scaffold', 'out'], ['validate', 'path'], ['inspect', 'path'], ['screenshot', 'path'], ['save', 'path'], ['pack', 'paths']];
  await withServer(async (client) => {
    for (const [command, argument] of missing) {
      const result = await call(client, { command });
      assert.equal(result.isError, true, `${command} without ${argument} should refuse`);
      assert.ok(result.content[0].text.includes(`"${argument}"`), `${command}: the refusal should name "${argument}", said: ${result.content[0].text}`);
    }
    // A stray argument is refused before anything else happens - `docs` never reaches a bridge,
    // so a refusal here can only be the table saying no.
    const stray = await call(client, { command: 'docs', topic: 'contract', houseContract: false });
    assert.equal(stray.isError, true, 'docs with houseContract should refuse');
    assert.ok(stray.content[0].text.includes('"houseContract"'), `the refusal should name the stray argument, said: ${stray.content[0].text}`);
  });
});

test('pack shares only with a login and the user\'s own licence, name and description', async () => {
  // The share is opt-in (docs/AGENT_SAVE.md §8); its refusals need no bridge and send nothing.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-mcp-share-'));
  try {
    await withServer(async (client) => {
      const share = { license: 'cc-by-4.0', shownAs: 'Quizmaster K', description: 'A pub quiz' };
      const unsaved = await call(client, { command: 'pack', paths: [dir], name: 'Quiz', out: path.join(dir, 'q.noacgpack.json'), share });
      assert.equal(unsaved.isError, true);
      assert.match(unsaved.content[0].text, /noacg login/, `a share needs the Home copy, said: ${unsaved.content[0].text}`);
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('an unknown verb is refused by the schema itself, before dispatch', async () => {
  const result = await withServer((client) => call(client, { command: 'caspar' }));
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /validation/i, `the refusal should come from input validation, said: ${result.content[0].text}`);
});

test('every doc topic is also a resource, so a client can read the contract without a tool call', async () => {
  const uris = await withServer(async (client) => (await client.listResources()).resources.map((r) => r.uri).sort());
  assert.deepEqual(uris, docTopics().map((t) => `noacg://docs/${t}`).sort());
});

test('a resource returns the same markdown the tool does', async () => {
  const [viaResource, viaTool] = await withServer(async (client) => [
    await client.readResource({ uri: 'noacg://docs/package' }),
    await call(client, { command: 'docs', topic: 'package' }),
  ]);
  assert.equal(viaResource.contents[0].mimeType, 'text/markdown');
  assert.equal(viaResource.contents[0].text, viaTool.content[0].text);
});

// ------------------------------------------------------------------ state renders, refused offline

const fixture = path.join(here, 'fixtures', 'state-timer');

test('the state-render arguments are checked before any bridge is reached', async () => {
  const refusals = [
    [{ command: 'screenshot', path: fixture, state: 'off', events: ['reveal'] }, /start from a Take/],
    [{ command: 'screenshot', path: fixture, at: 'soon' }, /"at" expects a duration/],
    [{ command: 'screenshot', path: fixture, background: 'red;x' }, /^"background" is transparent, checker, video/],
    [{ command: 'validate', path: fixture, background: 'video' }, /"background" only with "screenshots"/],
  ];
  await withServer(async (client) => {
    for (const [args, said] of refusals) {
      const result = await call(client, args);
      assert.equal(result.isError, true, `${JSON.stringify(args)} should refuse`);
      assert.match(result.content[0].text, said);
    }
  });
});

// ------------------------------------------------------------------ frame answers, offline

const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(n)]);
const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(n)]);

test('the limits keep the largest frame answer far inside a 10 MiB stdio message and a 60 s tool timeout', () => {
  assert.equal(MCP_LIMITS.stateFrames, 6, 'the cap the docs and the changelog say');
  // Base64 is 4/3 of the bytes; the labels and the report are a few kilobytes on top.
  assert.ok((MCP_LIMITS.imageBytes * 4) / 3 + 100_000 < 0.6 * 10 * 1024 * 1024, 'the image budget leaves no margin under 10 MiB');
  assert.ok(MCP_LIMITS.walkMs <= 20_000, 'the walk alone could take most of a 60 s timeout');
});

test('a frame answer says its type per frame, keeps to its image budget, and says what it left out and why', () => {
  const limits = { stateFrames: 2, imageBytes: 250, walkMs: 20_000 };
  const state = (via) => ({ shows: 'timer: Timer running', via, reached: [{ group: 'timer', state: 'running' }] });
  const content = framesContent(
    {
      frames: [
        { name: 'off', image: png(100) },
        { name: 'onair', image: jpeg(100) },
        { name: 'stress', image: jpeg(100) },
        { name: 'timer-running', image: jpeg(10), state: state(['startTimer']) },
      ],
      unshot: ['main: Revealed'],
      stopped: 'frames',
    },
    limits,
  );
  assert.deepEqual(content.filter((c) => c.type === 'image').map((c) => c.mimeType), ['image/png', 'image/jpeg', 'image/jpeg']);
  const said = content.filter((c) => c.type === 'text').map((c) => c.text);
  assert.ok(said.some((t) => /^stress: not returned: this answer is at its/.test(t)), said.join(' | '));
  assert.ok(said.includes('timer-running: timer: Timer running (screenshot events ["startTimer"])'), said.join(' | '));
  assert.ok(said.some((t) => t.startsWith('This answer carries at most 2 state frames. Not shot: main: Revealed.')), said.join(' | '));
  const timed = framesContent({ frames: [], unshot: ['main: Revealed'], stopped: 'time' }, limits).map((c) => c.text).join('\n');
  assert.match(timed, /stopped at its 20 s limit for one answer\. Not shot: main: Revealed/);
});

test('a state walk that fails part way keeps what came before it; a usage error still refuses', async () => {
  const template = { resolution: { width: 1920, height: 1080 } };
  const failing = (error) => ({ origin: 'http://127.0.0.1:1', compose: async () => '<!doctype html>', bench: { newPage: async () => { throw error; } } });
  const shot = await shootValidateFrames(failing(new Error('the browser went away')), template, {});
  assert.equal(shot.failure, 'the browser went away');
  assert.deepEqual(shot.frames, []);
  // The MCP verb puts the validation report first and this after it, so the report stays.
  assert.equal(framesContent(shot).at(-1).text, 'Screenshots stopped part way: the browser went away');
  await assert.rejects(shootValidateFrames(failing(new UsageError('"background": "x" is not a CSS colour')), template, {}), UsageError);
});

// ------------------------------------------------------------------ state renders, live

const liveUrl = process.env.NOACG_URL?.replace(/\/+$/, '');
async function bridgeUp() {
  if (!liveUrl) return false;
  try {
    return (await fetch(`${liveUrl}/bridge`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}
const live = (await bridgeUp()) ? false : `no NoaCG bridge at NOACG_URL=${liveUrl ?? '(unset)'} - start a dev server and set NOACG_URL`;
const exec = promisify(execFile);
/** One scratch folder for the live tests' frames and package copy, removed when they are done. */
const scratch = live ? null : await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-mcp-'));
after(() => scratch && fs.rm(scratch, { recursive: true, force: true }));

/** The frame the terminal writes for the same request, to hold the MCP image against. */
async function terminalFrame(...flags) {
  const file = path.join(scratch, `${flags.join(' ').replace(/[^\w-]+/g, '_')}.png`);
  await exec(process.execPath, [cli, 'screenshot', fixture, '--out', file, ...flags], { env: { ...process.env, NOACG_URL: liveUrl } });
  return fs.readFile(file);
}
const imageOf = (result) => Buffer.from(result.content.find((c) => c.type === 'image').data, 'base64');
const textOf = (result) => result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

test('screenshot drives an event sequence to a moment, says the machine, and matches the terminal', { skip: live }, async () => {
  const result = await withServer((client) => call(client, { command: 'screenshot', path: fixture, events: ['startTimer'], at: '10.5s' }), liveUrl);
  assert.notEqual(result.isError, true, textOf(result));
  assert.match(textOf(result), /take > startTimer, then 10500 ms/);
  assert.match(textOf(result), /timer=running/);
  assert.ok(imageOf(result).equals(await terminalFrame('--event', 'startTimer', '--at', '10.5s')), "the MCP frame is the terminal's frame");
});

/** The width and height a baseline or progressive JPEG declares in its start-of-frame segment. */
function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9; ) {
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

test('screenshot paints a background behind the graphic, and that frame comes back as a full-size JPEG', { skip: live }, async () => {
  const [plain, red] = await withServer(
    async (client) => [
      await call(client, { command: 'screenshot', path: fixture, events: ['reveal'] }),
      await call(client, { command: 'screenshot', path: fixture, events: ['reveal'], background: '#ff0000' }),
    ],
    liveUrl,
  );
  assert.notEqual(red.isError, true, textOf(red));
  // The terminal writes the same frame as PNG (screenshot-states.test.mjs); over MCP a frame with
  // no alpha to keep is JPEG, at the graphic's own size, and a transparent one stays PNG.
  assert.equal(plain.content.find((c) => c.type === 'image').mimeType, 'image/png');
  assert.equal(red.content.find((c) => c.type === 'image').mimeType, 'image/jpeg');
  assert.deepEqual(jpegSize(imageOf(red)), { width: 1920, height: 1080 });
  assert.ok(imageOf(red).length < 200_000, `a red frame is ${imageOf(red).length} bytes`);
});

test('validate with screenshots returns a frame per state the events reach, and the events that reach it', { skip: live }, async () => {
  const pkg = path.join(scratch, 'pkg');
  await fs.cp(fixture, pkg, { recursive: true });
  const [overVideo, transparent] = await withServer(
    async (client) => [
      await call(client, { command: 'validate', path: pkg, screenshots: true, background: 'video' }),
      await call(client, { command: 'validate', path: pkg, screenshots: true }),
    ],
    liveUrl,
  );
  const labels = overVideo.content.map((c, i) => (c.type === 'text' && overVideo.content[i + 1]?.type === 'image' ? c.text : null)).filter(Boolean);
  assert.deepEqual(labels.slice(0, 3), ['off:', 'onair:', 'stress:']);
  assert.ok(labels.some((l) => l.startsWith('timer-running:') && l.includes('["startTimer"]')), `labels: ${labels.join(' | ')}`);
  assert.ok(labels.some((l) => l.startsWith('main-revealed:')), `labels: ${labels.join(' | ')}`);
  // Over the plate every frame is JPEG and the answer is small (6.1 MB of PNG before); a frame
  // with nothing behind it keeps its alpha as PNG.
  const types = (r) => [...new Set(r.content.filter((c) => c.type === 'image').map((c) => c.mimeType))];
  assert.deepEqual(types(overVideo), ['image/jpeg']);
  assert.deepEqual(types(transparent), ['image/png']);
  assert.ok(JSON.stringify(overVideo).length < 1_000_000, `the answer over the plate is ${JSON.stringify(overVideo).length} characters`);
});

test('a refusal names the argument the caller used, not the terminal flag', { skip: live }, async () => {
  const [event, colour] = await withServer(
    async (client) => [
      await call(client, { command: 'screenshot', path: fixture, events: ['goalA'] }),
      await call(client, { command: 'screenshot', path: fixture, background: 'notacolour' }),
    ],
    liveUrl,
  );
  assert.equal(event.isError, true);
  assert.match(textOf(event), /^"events" entry "goalA": not an event this graphic declares/);
  assert.equal(colour.isError, true);
  assert.match(textOf(colour), /^"background": "notacolour" is not a CSS colour/);
  for (const r of [event, colour]) assert.ok(!/--event|--background/.test(textOf(r)), textOf(r));
});
