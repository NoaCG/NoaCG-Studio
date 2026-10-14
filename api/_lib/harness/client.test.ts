// The harness client against the stub that replays Managed Agents' documented shapes: what one
// session is created with, how its end is read, what is collected, and that everything it left is
// deleted. No call reaches Anthropic (spec AC-1; AC-9 and AC-10 build on the same seams in H9).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import {
  agentVerdict,
  briefMessage,
  completionOf,
  disposeSession,
  downloadFile,
  handIn,
  listCostCents,
  listOutputs,
  MANAGED_AGENTS_BETA,
  progressLine,
  readSession,
  sessionCreateParams,
  sessionGone,
  sessionStatus,
  startSession,
  type ManagedAgentsApi,
  type StartRequest,
} from './client.js';
import { createManagedAgentsStub, settled, type StubScenario } from './managedAgentsStub.js';

type StatusIdleEvent = Anthropic.Beta.Sessions.BetaManagedAgentsSessionStatusIdleEvent;

// The real SDK client is a ManagedAgentsApi: this line stops compiling if a call it makes changes shape.
export const sdkFits: (client: Anthropic) => ManagedAgentsApi = (client) => client;

const REQUEST: StartRequest = {
  agent: { id: 'agent_x', version: 3 },
  environmentId: 'env_x',
  brief: '  A lower third for the evening news  ',
  type: 'lower-third',
  budgetCents: 300,
  runId: 'run-1',
  files: [{ fileId: 'file_cli', mountPath: '/noacg-cli.tgz' }],
};

const enc = (s: string) => new TextEncoder().encode(s);
const agentWith = (outputs: Array<[string, string]>) => () => ({
  outputs: outputs.map(([filename, text]) => ({ filename, bytes: enc(text) })),
  commands: [
    'noacg doctor',
    'noacg scaffold --type lower-third --out ./graphic',
    { command: 'noacg validate ./graphic --json', output: `{"ok":true,"digest":"sha256:${'a'.repeat(64)}"}` },
    { command: 'noacg coverage ./graphic --out /mnt/session/outputs/coverage', output: `Digest: sha256:${'b'.repeat(64)}` },
    { command: 'noacg record ./graphic --out /mnt/session/outputs/record.json', output: `Digest: sha256:${'c'.repeat(64)}` },
  ],
});

test('a session starts with the brief, the budget in cents, the run id and nothing else of NoaCG', () => {
  const params = sessionCreateParams(REQUEST);
  assert.deepEqual(params.agent, { type: 'agent', id: 'agent_x', version: 3 }, 'pinned to the synced version');
  assert.deepEqual(params.budget, { type: 'limit', max_list_cost: { amount: '300', currency: 'USD' } });
  assert.deepEqual(params.metadata, { run_id: 'run-1' });
  assert.deepEqual(params.resources, [{ type: 'file', file_id: 'file_cli', mount_path: '/noacg-cli.tgz' }]);
  assert.equal(params.initial_events?.length, 1);
  assert.deepEqual(params.initial_events?.[0], { type: 'user.message', content: [{ type: 'text', text: 'Brief: A lower third for the evening news\nGraphic type: lower-third (the user chose it).' }] });
  assert.equal(briefMessage('x', null), 'Brief: x', 'no type line when none was named');
  assert.doesNotMatch(JSON.stringify(params), /api[_-]?key|token|secret|supabase/i);
  for (const budgetCents of [0, -5, 2.5]) assert.throws(() => sessionCreateParams({ ...REQUEST, budgetCents }), /budgetCents/);
  // Another model for one session overrides the synced version's model and nothing else.
  const haiku = sessionCreateParams({ ...REQUEST, model: { id: 'claude-haiku-5-5' } });
  assert.deepEqual(haiku.agent, { type: 'agent_with_overrides', id: 'agent_x', version: 3, model: { id: 'claude-haiku-5-5' } });
  assert.deepEqual({ ...haiku, agent: undefined }, { ...params, agent: undefined });
});

test('the end of a session is read from its status and its last idle', () => {
  const idle = (type: string) => ({ type: 'session.status_idle', id: 'e', processed_at: 'now', stop_details: null, stop_reason: { type } }) as unknown as StatusIdleEvent;
  assert.deepEqual(completionOf('running', null), { state: 'running' });
  assert.deepEqual(completionOf('rescheduling', idle('end_turn')), { state: 'running' });
  assert.deepEqual(completionOf('idle', null), { state: 'running' }, 'idle before any idle event is a session not started');
  assert.deepEqual(completionOf('idle', idle('end_turn')), { state: 'delivered' });
  assert.deepEqual(completionOf('idle', idle('budget_reached')), { state: 'not-ready', reason: 'budget_reached' });
  for (const reason of ['retries_exhausted', 'refusal', 'requires_action']) assert.deepEqual(completionOf('idle', idle(reason)), { state: 'failed', reason });
  assert.deepEqual(completionOf('terminated', null), { state: 'failed', reason: 'terminated' });
});

test('cost is the session list cost in cents, and never a guess', () => {
  assert.equal(listCostCents({ usage: { list_cost: { amount: '147', currency: 'USD' } } } as never), 147);
  assert.equal(listCostCents({ usage: {} } as never), 0);
  assert.throws(() => listCostCents({ usage: { list_cost: { amount: '1.47', currency: 'USD' } } } as never), /whole number/);
});

test('a noacg verb in a bash call is a progress line; anything else is not', () => {
  const use = (command: unknown) => ({ type: 'agent.tool_use', id: 'e', name: 'bash', processed_at: 'now', input: { command } }) as never;
  assert.equal(progressLine(use('cd graphic && noacg coverage . --out shots')), 'Checking every state');
  assert.equal(progressLine(use('NOACG_URL=x noacg scaffold --type a')), 'Designing');
  assert.equal(progressLine(use('npm i -g /mnt/session/uploads/noacg-cli.tgz')), null);
  assert.equal(progressLine(use(42)), null);
  assert.equal(progressLine({ type: 'agent.message', id: 'e', processed_at: 'now', content: [] } as never), null);
});

for (const [scenario, expected] of [
  ['end_turn', { state: 'delivered' }],
  ['budget_reached', { state: 'not-ready', reason: 'budget_reached' }],
  ['refusal', { state: 'failed', reason: 'refusal' }],
] as Array<[StubScenario, unknown]>) {
  test(`a stubbed session that ends with ${scenario} is read, collected and fully deleted`, async () => {
    const stub = createManagedAgentsStub({ scenario, costCents: 0, runningReads: 1, agent: agentWith([['record.json', '{"format":"noacg-record-v1"}'], ['record.zip', 'PK'], ['coverage/take-00020ms.jpg', 'jpg']]) });
    const { sessionId, status } = await startSession(stub, REQUEST);
    assert.equal(status, 'running', 'a session created with initial events starts running');
    await settled(stub);
    assert.deepEqual((await readSession(stub, sessionId)).completion, { state: 'running' }, 'the first read still says running');
    const reading = await readSession(stub, sessionId);
    assert.deepEqual(reading.completion, expected);
    assert.equal(reading.costCents, 0);
    assert.deepEqual(reading.progress, ['Getting ready', 'Designing', 'Checking the graphic', 'Checking every state', 'Handing it in']);
    assert.equal(reading.commands.length, 5);
    assert.equal(reading.lastReviewedDigest, `sha256:${'b'.repeat(64)}`, 'the last validate or coverage digest, not the record\'s own');
    assert.deepEqual(reading.digests.map((d) => d.digest && d.digest.slice(7, 8)), [null, null, 'a', 'b', 'c']);

    const files = await listOutputs(stub, sessionId);
    assert.equal(files.length, 3);
    const listed = stub.calls.find((c) => c.method === 'files.list');
    assert.deepEqual(listed?.args[0], { scope_id: sessionId, betas: [MANAGED_AGENTS_BETA] }, 'outputs are listed by session, with the beta that filter needs');
    const { record, zip } = handIn(files);
    assert.ok(record && zip);
    assert.equal(new TextDecoder().decode(await downloadFile(stub, record.id)), '{"format":"noacg-record-v1"}');

    assert.deepEqual(await disposeSession(stub, sessionId, { pollMs: 0 }), { filesDeleted: 3, sessionDeleted: true });
    assert.equal(await sessionGone(stub, sessionId), true, 'a fetch of the deleted session answers not found');
    assert.deepEqual(await listOutputs(stub, sessionId), [], 'and no file of it is listed');
    assert.deepEqual(await disposeSession(stub, sessionId, { pollMs: 0 }), { filesDeleted: 0, sessionDeleted: true }, 'disposing twice is harmless');
  });
}

test('an agent that ends its turn saying NOT READY has not delivered, whatever the stop reason', async () => {
  assert.deepEqual(agentVerdict('All done.\nNOT READY: the score overflows on the light plate'), { notReady: true, why: 'the score overflows on the light plate' });
  assert.deepEqual(agentVerdict('DELIVERED'), { notReady: false, why: null });
  const stub = createManagedAgentsStub({ finalMessage: 'I could not fix the overflow.\nNOT READY: the score overflows', agent: agentWith([['record.json', '{}'], ['record.zip', 'PK']]) });
  const { sessionId } = await startSession(stub, REQUEST);
  await settled(stub);
  const reading = await readSession(stub, sessionId);
  assert.deepEqual(reading.completion, { state: 'not-ready', reason: 'agent_not_ready' });
  assert.equal(await sessionStatus(stub, sessionId), 'idle', 'a poll reads the status alone');
  const delivered = createManagedAgentsStub({ finalMessage: 'Made a lower third.\nDELIVERED', agent: agentWith([]) });
  const second = await startSession(delivered, REQUEST);
  await settled(delivered);
  assert.deepEqual((await readSession(delivered, second.sessionId)).completion, { state: 'delivered' });
});

test('a session still running is interrupted before it is deleted', async () => {
  let release: () => void = () => undefined;
  const stub = createManagedAgentsStub({ agent: () => new Promise((resolve) => { release = () => resolve({ outputs: [], commands: [] }); }) });
  const { sessionId } = await startSession(stub, REQUEST);
  await disposeSession(stub, sessionId, { pollMs: 0 });
  const methods = stub.calls.map((c) => c.method);
  assert.ok(methods.indexOf('sessions.events.send') >= 0 && methods.indexOf('sessions.events.send') < methods.indexOf('sessions.delete'), methods.join(', '));
  assert.deepEqual((stub.calls.find((c) => c.method === 'sessions.events.send')?.args[1] as { events: unknown[] }).events, [{ type: 'user.interrupt' }]);
  assert.equal(await sessionGone(stub, sessionId), true);
  release();
});
