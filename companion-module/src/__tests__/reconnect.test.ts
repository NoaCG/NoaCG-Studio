// Connection health (docs/work-specs/live-production-reliability/spec.md P4): every start and
// transport failure goes through one reconnect loop with backoff; only a refused key is final; a
// stale access key finds the backend again; and the liveness report the page reads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AUTH_FAILS_MAX, BEAT_GAP_MS, BEAT_MS, PanelClient } from '../panel.js'
import { RelayError } from '../relay.js'
import { MODULE_VERSION } from '../version.js'
import { FakeClock, FakeRelay, settle, state } from './fakes.js'

/** A panel that makes its relays through `connect`, as the module does, failing the first `fails` times. */
function supervised(fails = 0) {
	const clock = new FakeClock()
	const relays: FakeRelay[] = []
	let tries = 0
	const panel = new PanelClient({
		clock,
		instance: 'testinst',
		version: '9.8.7',
		connect: async () => {
			tries++
			if (tries <= fails) throw new Error('https://noacg.studio did not answer as a NoaCG app (HTTP 502)')
			const relay = new FakeRelay()
			relays.push(relay)
			return relay
		},
	})
	return { clock, relays, panel, tries: () => tries }
}

const gateway = () => new RelayError('Invalid API key', 401)

test('a backend not reachable at start is found again on the backoff, then connects', async () => {
	const { clock, relays, panel, tries } = supervised(2)
	await panel.start({ key: 'ncpk_test', code: '', label: 'Desk' })
	assert.equal(panel.status, 'offline')
	assert.match(panel.note, /HTTP 502.*Retrying/)
	await clock.advance(1_000)
	assert.equal(tries(), 2)
	assert.equal(panel.status, 'offline')
	await clock.advance(2_000)
	assert.equal(tries(), 3)
	assert.equal(relays.length, 1)
	assert.equal(relays[0].count('hello'), 1)
	relays[0].live!.onStatus('joined')
	await settle()
	relays[0].emit('state', state())
	assert.equal(panel.status, 'ok')
})

test('a pairing code that hits a network error is tried again, and pairs once it goes through', async () => {
	const r = new FakeRelay()
	r.pairErrors = [new TypeError('fetch failed')]
	const clock = new FakeClock()
	const kept: string[] = []
	const panel = new PanelClient({ relay: r, clock, onPaired: (k) => kept.push(k) })
	await panel.start({ key: '', code: 'ABCD-EFGH', label: 'Desk' })
	assert.equal(panel.status, 'offline')
	assert.deepEqual(kept, [])
	await clock.advance(1_000)
	assert.equal(r.count('pairFinish'), 2)
	assert.deepEqual(r.calls[1], { name: 'pairFinish', args: ['ABCDEFGH', 'Desk'] })
	assert.deepEqual(kept, ['ncpk_test'])
	assert.equal(r.count('hello'), 1)
	assert.equal(panel.status, 'connecting')
})

test('a refused pairing code is final, but too many tries waits and tries again', async () => {
	const r = new FakeRelay()
	r.pairAnswer = { ok: false, refused: 'expired-code' }
	const clock = new FakeClock()
	const panel = new PanelClient({ relay: r, clock })
	await panel.start({ key: '', code: 'ABCDEFGH', label: '' })
	await clock.advance(60_000)
	assert.equal(r.count('pairFinish'), 1)
	assert.match(panel.note, /expired/)

	const slow = new FakeRelay()
	slow.pairAnswer = { ok: false, refused: 'slow-down' }
	const clock2 = new FakeClock()
	const panel2 = new PanelClient({ relay: slow, clock: clock2 })
	await panel2.start({ key: '', code: 'ABCDEFGH', label: '' })
	assert.match(panel2.note, /Too many tries/)
	await clock2.advance(1_000)
	assert.equal(slow.count('pairFinish'), 2)
})

test('hello refused for an unexpected reason retries on the backoff instead of stopping', async () => {
	const r = new FakeRelay()
	const good = r.helloAnswer
	r.helloAnswer = { ok: false, refused: 'maintenance', note: 'NoaCG is updating.' }
	const clock = new FakeClock()
	const panel = new PanelClient({ relay: r, clock })
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	assert.equal(panel.status, 'offline')
	assert.match(panel.note, /NoaCG is updating\. Retrying/)
	r.helloAnswer = good
	await clock.advance(1_000)
	assert.equal(r.count('hello'), 2)
	assert.equal(panel.status, 'connecting')
	assert.equal(r.live?.topic, 'pfb-aaa')
})

test('a hello that fails on the network keeps retrying, 1, 2, 4 then every 8 s', async () => {
	const r = new FakeRelay()
	r.helloErrors = Array.from({ length: 6 }, () => new TypeError('fetch failed'))
	const clock = new FakeClock()
	const panel = new PanelClient({ relay: r, clock })
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	const at: number[] = []
	for (let s = 0; s < 40; s++) {
		const before = r.count('hello')
		await clock.advance(1_000)
		if (r.count('hello') > before) at.push(s + 1)
	}
	assert.deepEqual(at.slice(0, 6), [1, 3, 7, 15, 23, 31])
	assert.equal(panel.status, 'connecting')
})

test('a revoked or unknown key is final: nothing reconnects, the keys say pair again', async () => {
	for (const refused of ['revoked', 'unknown-key'] as const) {
		const r = new FakeRelay()
		r.helloAnswer = { ok: false, refused }
		const clock = new FakeClock()
		const panel = new PanelClient({ relay: r, clock })
		await panel.start({ key: 'ncpk_test', code: '', label: '' })
		await clock.advance(120_000)
		assert.equal(panel.status, 'revoked')
		assert.equal(panel.note, 'Panel key revoked. Pair again.')
		assert.equal(r.count('hello'), 1)
	}
})

test(`${AUTH_FAILS_MAX} gateway refusals in a row find the backend again with a fresh relay`, async () => {
	const relays: FakeRelay[] = []
	const clock = new FakeClock()
	const logs: string[] = []
	const panel = new PanelClient({
		clock,
		log: (_level, message) => logs.push(message),
		connect: async () => {
			const relay = new FakeRelay()
			// The first relay's publishable key was rotated: the gateway refuses every call.
			if (relays.length === 0) {
				relay.helloErrors = Array.from({ length: 10 }, gateway)
				relay.seenAnswer = gateway()
			}
			relays.push(relay)
			return relay
		},
	})
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	assert.equal(panel.status, 'offline')
	await clock.advance(1_000)
	assert.equal(relays.length, 1)
	await clock.advance(10_000)
	// The third refusal let the stale relay go, and the next step read panel.json again.
	assert.equal(relays[0].closed, true)
	assert.match(logs.join(), /finding the backend again/)
	assert.equal(relays.length, 2)
	assert.equal(relays[1].count('hello'), 1)
	assert.equal(panel.status, 'connecting')
})

test('a network error is not a gateway refusal: the relay is kept', async () => {
	const relays: FakeRelay[] = []
	const clock = new FakeClock()
	const p = new PanelClient({
		clock,
		connect: async () => {
			const relay = new FakeRelay()
			relay.helloErrors = Array.from({ length: 5 }, () => new RelayError('fetch failed', 0))
			relays.push(relay)
			return relay
		},
	})
	await p.start({ key: 'ncpk_test', code: '', label: '' })
	await clock.advance(30_000)
	assert.equal(relays.length, 1)
	assert.equal(relays[0].closed, false)
	assert.equal(p.status, 'connecting')
})

test('stopping lets go of the relay it made and reconnects nothing', async () => {
	const { clock, relays, panel } = supervised()
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	await panel.stop()
	assert.equal(relays[0].closed, true)
	const hellos = relays[0].count('hello')
	await clock.advance(60_000)
	assert.equal(relays[0].count('hello'), hellos)
	assert.equal(relays[0].count('seen'), 0)
})

test('the liveness report goes at once with the version and status, then every 15 s', async () => {
	const { clock, relays, panel } = supervised()
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	await clock.advance(0)
	const relay = relays[0]
	assert.deepEqual(
		relay.calls.filter((c) => c.name === 'seen').map((c) => c.args),
		[['ncpk_test', '9.8.7', 'connecting']],
	)
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	// The status moved to ok: reported BEAT_GAP_MS after the last report, not at the next beat.
	await clock.advance(BEAT_GAP_MS)
	assert.deepEqual(relay.calls.filter((c) => c.name === 'seen').at(-1)?.args, ['ncpk_test', '9.8.7', 'ok'])
	const n = relay.count('seen')
	for (let i = 0; i < 4; i++) relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 5, rowsVer: 1 })
	await clock.advance(BEAT_MS)
	assert.equal(relay.count('seen'), n + 1)
	// At most one report per 15 s while nothing changes: four a minute.
	const before = relay.count('seen')
	for (let s = 0; s < 60; s += 4) {
		relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 5, rowsVer: 1 })
		await clock.advance(4_000)
	}
	assert.equal(relay.count('seen') - before, 4)
})

test('a report refused for a revoked key says pair again, and keeps reporting so the page can say so', async () => {
	const { clock, relays, panel } = supervised()
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	const relay = relays[0]
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	relay.seenAnswer = { ok: false, refused: 'revoked' }
	await clock.advance(BEAT_MS)
	assert.equal(panel.status, 'revoked')
	assert.equal(relay.live, undefined)
	const hellos = relay.count('hello')
	const seen = relay.count('seen')
	await clock.advance(BEAT_MS * 2)
	assert.equal(relay.count('hello'), hellos)
	assert.equal(relay.count('seen'), seen + 2)
	assert.equal(relay.calls.filter((c) => c.name === 'seen').at(-1)?.args[2], 'revoked')
})

test('an older NoaCG server without the report keeps working and is not asked again', async () => {
	const { clock, relays, panel } = supervised()
	await panel.start({ key: 'ncpk_test', code: '', label: '' })
	const relay = relays[0]
	relay.seenAnswer = new RelayError(
		'Could not find the function public.panel_seen(p_key, p_status, p_version) in the schema cache',
		404,
		'PGRST202',
	)
	await clock.advance(0)
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	assert.equal(panel.status, 'ok')
	await clock.advance(BEAT_MS * 4)
	assert.equal(relay.count('seen'), 1)
})

test('the version reported is the package version', () => {
	const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
	assert.equal(MODULE_VERSION, pkg.version)
})

test('a gateway refusal of the access key is told apart from a network error and an older server', () => {
	assert.deepEqual([new RelayError('Invalid API key', 401).auth, new RelayError('Forbidden', 403).auth], [true, true])
	assert.equal(new RelayError('fetch failed', 0).auth, false)
	assert.equal(new RelayError('x', 404, 'PGRST202').missing, true)
	assert.equal(new RelayError('fetch failed').missing, false)
})
