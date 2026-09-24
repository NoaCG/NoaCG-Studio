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
//
// Nothing here starts a browser or reaches a deployment: NOACG_URL points at a closed port, and
// only the verbs that need no bridge are ever CALLED.
//
// Run `npm run build` first - this drives the built `dist/`.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { cliVersion } from '../dist/config.js';
import { docTopics } from '../dist/commands/docs.js';

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
  topic: ['docs'],
  folder: ['save'],
  rundown: ['pack'],
};

/** The schema's size ceiling, in characters of the JSON an MCP client receives. The measured
 *  shape is about 2,450 characters (~590 tokens); the ceiling leaves room for a verb, not for
 *  prose. Raise it only with a measurement in docs/AGENT_CLI.md "What a session pays". */
const SCHEMA_CHAR_CEILING = 2800;

/** Connect a real MCP client to `noacg mcp` over stdio, run `fn`, always close. */
async function withServer(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    // A closed port, so any verb that tried to reach a deployment would fail fast rather than
    // quietly driving the developer's own studio.
    env: { ...process.env, NOACG_URL: 'http://127.0.0.1:1', NOACG_AGENT_KEY: '' },
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
