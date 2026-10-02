import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PanelClient, RESULT_MS, SILENCE_MS } from '../panel.js'
import { FakeClock, FakeRelay, rows, settle, state } from './fakes.js'

async function connected(over: { answering?: boolean } = {}) {
	const relay = new FakeRelay()
	if (over.answering === false)
		relay.helloAnswer = { ...relay.helloAnswer, answering: false } as typeof relay.helloAnswer
	const clock = new FakeClock()
	const saved: string[] = []
	const panel = new PanelClient({ relay, clock, instance: 'testinst', onPaired: (k) => saved.push(k) })
	await panel.start({ key: 'ncpk_test', code: '', label: 'Desk' })
	await settle()
	return { relay, clock, panel, saved }
}

async function answering() {
	const c = await connected()
	c.relay.live!.onStatus('joined')
	await settle()
	c.relay.emit('state', state())
	c.relay.emit('rows', rows())
	return c
}

test('pairing exchanges the code once, saves the key and connects with it', async () => {
	const relay = new FakeRelay()
	const clock = new FakeClock()
	const saved: string[] = []
	const panel = new PanelClient({ relay, clock, instance: 'testinst', onPaired: (k) => saved.push(k) })
	await panel.start({ key: '', code: ' abcd-efgh ', label: 'Desk deck' })
	assert.deepEqual(relay.calls[0], { name: 'pairFinish', args: ['ABCDEFGH', 'Desk deck'] })
	assert.deepEqual(saved, ['ncpk_test'])
	assert.equal(relay.calls[1].name, 'hello')
	assert.deepEqual(relay.calls[1].args, ['ncpk_test'])
	assert.equal(relay.live?.topic, 'pfb-aaa')
	assert.equal(panel.status, 'connecting')
})

test('a used or expired code is refused with a sentence, and nothing is saved', async () => {
	for (const [refused, words] of [
		['used-code', /already used/],
		['expired-code', /expired/],
		['unknown-code', /not known/],
	] as const) {
		const relay = new FakeRelay()
		relay.pairAnswer = { ok: false, refused }
		const saved: string[] = []
		const panel = new PanelClient({ relay, clock: new FakeClock(), onPaired: (k) => saved.push(k) })
		await panel.start({ key: '', code: 'ABCDEFGH', label: '' })
		assert.equal(panel.status, 'pairing')
		assert.match(panel.note, words)
		assert.deepEqual(saved, [])
		assert.equal(relay.count('hello'), 0)
	}
})

test('without a key or a code, it asks to pair and reaches nothing', async () => {
	const relay = new FakeRelay()
	const panel = new PanelClient({ relay, clock: new FakeClock() })
	await panel.start({ key: '', code: '', label: '' })
	assert.equal(panel.status, 'pairing')
	assert.equal(relay.calls.length, 0)
})

test('with no answering page the panel says so and refuses presses without sending them', async () => {
	const { relay, panel } = await connected({ answering: false })
	assert.equal(panel.status, 'no-page')
	assert.equal(panel.note, 'No operator page')
	const out = await panel.press('take')
	assert.equal(out.ok, false)
	assert.equal(out.sentence, 'No operator page')
	assert.equal(relay.count('press'), 0)
})

test('a published state makes the panel ok; 12 s of silence turns it to no operator page', async () => {
	const { panel, clock } = await answering()
	assert.equal(panel.status, 'ok')
	assert.equal(panel.state?.selected, 'cue_a')
	await clock.advance(SILENCE_MS - 100)
	assert.equal(panel.status, 'ok')
	await clock.advance(200)
	assert.equal(panel.status, 'no-page')
	assert.equal(panel.state, null)
})

test('beats keep it alive', async () => {
	const { panel, clock, relay } = await answering()
	for (let i = 0; i < 5; i++) {
		await clock.advance(4_000)
		relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 5, rowsVer: 1 })
	}
	assert.equal(panel.status, 'ok')
})

test('a press carries the verb, the selected row as target, the state version and a fresh id', async () => {
	const { panel, relay } = await answering()
	const out = await panel.press('take')
	assert.equal(out.ok, true)
	assert.deepEqual(relay.presses()[0], { verb: 'take', target: 'cue_a', seen: 5, id: 'testinst:1' })
	await panel.press('take-cue', 'cue_b')
	assert.deepEqual(relay.presses()[1], { verb: 'take-cue', target: 'cue_b', seen: 5, id: 'testinst:2' })
	await panel.press('select-next')
	assert.deepEqual(relay.presses()[2], { verb: 'select-next', target: '', seen: 5, id: 'testinst:3' })
})

test('pause-toggle targets the clip the clock follows', async () => {
	const { panel, relay } = await answering()
	relay.emit(
		'state',
		state({
			ver: 6,
			clip: { cue: 'cue_vt', label: 'VT', phase: 'counting', start: 0, end: 1, remaining: 1, estimated: false },
		}),
	)
	await panel.press('pause-toggle')
	assert.equal(relay.presses()[0].target, 'cue_vt')
})

test('a stale or not-allowed answer from the page is a refusal, and the key flashes', async () => {
	const { panel, relay } = await answering()
	relay.autoResult = 'stale'
	const out = await panel.press('out')
	assert.equal(out.ok, false)
	assert.match(out.sentence, /changed/)
	assert.equal(panel.flash?.verb, 'out')
})

test('no answer from the page in 1.5 s says so; nothing is retried or queued', async () => {
	const { panel, relay, clock } = await answering()
	relay.autoResult = null
	const pending = panel.press('take')
	await settle()
	await clock.advance(RESULT_MS)
	const out = await pending
	assert.equal(out.ok, false)
	assert.equal(out.sentence, 'No answer from the operator page')
	assert.equal(relay.count('press'), 1)
})

test('a network error retries once with the same id', async () => {
	const { panel, relay } = await answering()
	relay.pressAnswers = [new Error('socket hang up')]
	const out = await panel.press('take')
	assert.equal(out.ok, true)
	const [a, b] = relay.presses()
	assert.equal(a.id, b.id)
	assert.equal(relay.count('press'), 2)
})

test('a press refused no-page by the server turns the keys to no operator page', async () => {
	const { panel, relay } = await answering()
	relay.pressAnswers = [{ ok: false, refused: 'no-page' }]
	const out = await panel.press('take')
	assert.equal(out.sentence, 'No operator page')
	assert.equal(panel.status, 'no-page')
})

test('a revoked key stops the panel and leaves the feedback topic', async () => {
	const { panel, relay } = await answering()
	relay.pressAnswers = [{ ok: false, refused: 'revoked' }]
	const out = await panel.press('take')
	assert.match(out.sentence, /revoked/)
	assert.equal(panel.status, 'revoked')
	assert.equal(relay.live, undefined)
})

test('moved makes it ask again and follow the new feedback topic', async () => {
	const { panel, relay } = await answering()
	relay.helloAnswer = { ...relay.helloAnswer, feedback_topic: 'pfb-bbb' } as typeof relay.helloAnswer
	relay.emit('moved', { v: 1 })
	await settle()
	assert.equal(relay.live?.topic, 'pfb-bbb')
	assert.equal(relay.listeners.filter((l) => l.topic === 'pfb-aaa' && !l.left).length, 0)
	relay.emit('state', state({ ver: 9 }))
	assert.equal(panel.status, 'ok')
})

test('a revoked key asking again after moved is told so', async () => {
	const { panel, relay } = await answering()
	relay.helloAnswer = { ok: false, refused: 'revoked' }
	relay.emit('moved', { v: 1 })
	await settle()
	assert.equal(panel.status, 'revoked')
	assert.equal(panel.note, 'Panel key revoked. Pair again.')
})

test('hello refused no-page (hosted control switched off) shows no operator page and asks again later', async () => {
	const { panel, relay, clock } = await answering()
	relay.helloAnswer = { ok: false, refused: 'no-page' }
	relay.emit('moved', { v: 1 })
	await settle()
	assert.equal(panel.status, 'no-page')
	assert.equal(panel.note, 'No operator page')
	const hellos = relay.count('hello')
	await clock.advance(1_000)
	assert.equal(relay.count('hello'), hellos + 1)
})

test('gone from the answering page means no operator page at once', async () => {
	const { panel, relay } = await answering()
	relay.emit('gone', { v: 1, page: 'page0000page0000', claim: 3 })
	assert.equal(panel.status, 'no-page')
})

test('a state from an older claim is ignored; a beat ahead of what we hold asks again', async () => {
	const { panel, relay } = await answering()
	relay.emit('state', state({ claim: 2, selected: 'cue_b' }))
	assert.equal(panel.state?.selected, 'cue_a')
	const hellos = relay.count('hello')
	relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 8, rowsVer: 1 })
	await settle()
	assert.equal(relay.count('hello'), hellos + 1)
})

test('a newer protocol version asks for a module update', async () => {
	const { panel, relay } = await answering()
	relay.emit('state', { ...state(), v: 2 })
	assert.equal(panel.status, 'outdated')
	const out = await panel.press('take')
	assert.equal(out.ok, false)
})

test('a dropped live connection reconnects with backoff and asks again', async () => {
	const { panel, relay, clock } = await answering()
	relay.live!.onStatus('error')
	assert.equal(panel.status, 'offline')
	const hellos = relay.count('hello')
	await clock.advance(1_000)
	assert.equal(relay.count('hello'), hellos + 1)
	assert.equal(relay.live?.topic, 'pfb-aaa')
})

test('presses made while there was no page are not run when a page appears', async () => {
	const { panel, relay } = await connected({ answering: false })
	await panel.press('take')
	relay.emit('state', state())
	await settle()
	assert.equal(panel.status, 'ok')
	assert.equal(relay.count('press'), 0)
})
