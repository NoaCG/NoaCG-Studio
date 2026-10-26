// Graphic actions on the module's side of the wire (protocol §10): reading what a page offers,
// pressing a capability by id, and refusing visibly whatever the page, the server or this module
// cannot do.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PanelClient } from '../panel.js'
import {
	ACTIONS_PROTOCOL,
	ACTION_VERB,
	capabilityState,
	readActions,
	readSettled,
	versionOf,
	type ActionPress,
} from '../protocol.js'
import { FakeClock, FakeRelay, rows, settle, state } from './fakes.js'

/** An `actions` event as the production page sends it (src/control/panelActions.ts wireActions). */
function actions(over: Record<string, unknown> = {}, graphic: Record<string, unknown> = {}) {
	return {
		av: 2,
		actionsVer: 3_000_004,
		page: 'page0000page0000',
		claim: 3,
		relay: true,
		more: false,
		graphics: [
			{
				graphic: 'Scorebug',
				pinned: false,
				live: 'cue_sb',
				cue: 'Final',
				caps: [
					{
						id: 'event:goal',
						kind: 'event',
						label: 'Goal',
						place: 'section',
						section: 'Actions',
						args: null,
						allowed: true,
						invocable: true,
					},
					{
						id: 'event:pick',
						kind: 'event',
						label: 'Answer',
						place: 'pinned',
						args: {
							path: '',
							type: 'object',
							closed: true,
							properties: [
								{ key: 'option', required: true, node: { path: 'option', type: 'string', enum: ['A', 'B'] } },
							],
						},
						options: [
							{ value: 'A', label: 'Answer A' },
							{ value: 'B', label: 'Answer B' },
						],
						active: 'B',
						allowed: true,
						invocable: true,
					},
					{
						id: 'step:score',
						kind: 'step',
						label: 'Score',
						place: 'section',
						args: { path: '', type: 'object' },
						allowed: true,
						invocable: true,
					},
					{
						id: 'foreign:highlight',
						kind: 'foreign',
						label: 'Highlight',
						place: 'section',
						args: { path: '', type: 'object' },
						allowed: true,
						invocable: true,
					},
				],
				...graphic,
			},
		],
		...over,
	}
}

async function answering() {
	const relay = new FakeRelay()
	const clock = new FakeClock()
	const panel = new PanelClient({ relay, clock, instance: 'testinst' })
	await panel.start({ key: 'ncpk_test', code: '', label: 'Desk' })
	await settle()
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	relay.emit('actions', actions())
	return { relay, clock, panel }
}

test('an actions event carries no `v`, so a module that predates it ignores it rather than calling itself outdated', () => {
	assert.equal(versionOf(actions()), null)
	assert.equal(versionOf({ av: 2, id: 'x:1', outcome: 'accepted' }), null)
})

test('the page offer is read as sent: labels, places, options and the live instance', () => {
	const read = readActions(actions())
	assert.ok(read && read !== 'newer')
	const g = read.graphics[0]
	assert.equal(g.live, 'cue_sb')
	assert.deepEqual(
		g.caps.map((c) => [c.id, c.label, c.place, c.allowed]),
		[
			['event:goal', 'Goal', 'section', true],
			['event:pick', 'Answer', 'pinned', true],
			['step:score', 'Score', 'section', true],
			// A foreign descriptor is shown, never pressed, whatever the payload claims.
			['foreign:highlight', 'Highlight', 'section', false],
		],
	)
	assert.deepEqual(g.caps[1].options, [
		{ value: 'A', label: 'Answer A' },
		{ value: 'B', label: 'Answer B' },
	])
	assert.equal(g.caps[1].active, 'B')
})

test('a newer actions protocol is answered "update the module" for actions only; transport keys keep working', async () => {
	const { relay, panel } = await answering()
	relay.emit('actions', actions({ av: 3 }))
	assert.equal(readActions(actions({ av: 3 })), 'newer')
	assert.equal(panel.actions, null)
	const out = await panel.pressAction('Scorebug', 'event:goal')
	assert.equal(out.ok, false)
	assert.match(out.sentence, /Update the NoaCG module/)
	assert.equal(relay.count('press'), 0)
	assert.equal(panel.status, 'ok')
	assert.equal((await panel.press('take')).ok, true)
})

test('a press names its capability, graphic, instance and the actions it was drawn from, in protocol 2', async () => {
	const { relay, panel } = await answering()
	const out = await panel.pressAction('Scorebug', 'event:pick', { option: 'A' })
	assert.equal(out.ok, true)
	const sent = relay.presses()[0] as unknown as ActionPress
	assert.deepEqual(sent, {
		v: ACTIONS_PROTOCOL,
		verb: ACTION_VERB,
		target: 'Scorebug',
		seen: 3_000_004,
		id: 'testinst:1',
		cap: 'event:pick',
		instance: 'cue_sb',
		args: { option: 'A' },
	})
})

test('what the action came to arrives after it ran and becomes the last-press sentence', async () => {
	const { relay, panel } = await answering()
	await panel.pressAction('Scorebug', 'step:score', { delta: 1 })
	// Ran is dispatched, not done.
	assert.equal(panel.lastPress, 'Running on the graphic')
	relay.emit('settled', { av: 2, id: 'testinst:1', outcome: 'unknown', note: 'no answer from the server' })
	assert.equal(panel.lastPress, 'Not confirmed: no answer from the server')
	// Settled once: a repeat changes nothing.
	relay.emit('settled', { av: 2, id: 'testinst:1', outcome: 'accepted' })
	assert.equal(panel.lastPress, 'Not confirmed: no answer from the server')
	assert.equal(readSettled({ av: 2, id: 'x:1', outcome: 'replayed' }), null)
})

test('a saved key is matched by capability id only: a renamed or removed action reads unknown and sends nothing', async () => {
	const { relay, panel } = await answering()
	// The graphic now declares `goal2` with the same label in the same row.
	relay.emit(
		'actions',
		actions(
			{ actionsVer: 3_000_005 },
			{
				caps: [
					{
						id: 'event:goal2',
						kind: 'event',
						label: 'Goal',
						place: 'section',
						args: null,
						allowed: true,
						invocable: true,
					},
				],
			},
		),
	)
	assert.equal(capabilityState(panel.actions, 'Scorebug', 'event:goal').state, 'unknown')
	const out = await panel.pressAction('Scorebug', 'event:goal')
	assert.equal(out.ok, false)
	assert.equal(out.sentence, 'That action is not on Scorebug')
	assert.equal(relay.count('press'), 0)
})

test('a foreign descriptor, a refused capability and an older server are refused here with the reason', async () => {
	const { relay, panel } = await answering()
	assert.match((await panel.pressAction('Scorebug', 'foreign:highlight')).sentence, /cannot be pressed|not pressed/)
	relay.emit('actions', actions({ actionsVer: 3_000_006, relay: false }))
	assert.equal(
		(await panel.pressAction('Scorebug', 'event:goal')).sentence,
		'Graphic actions wait for a NoaCG server update',
	)
	relay.emit(
		'actions',
		actions(
			{ actionsVer: 3_000_007 },
			{
				live: null,
				caps: [
					{
						id: 'event:goal',
						kind: 'event',
						label: 'Goal',
						place: 'section',
						args: null,
						allowed: false,
						note: 'Scorebug is off air',
						invocable: true,
					},
				],
			},
		),
	)
	assert.equal((await panel.pressAction('Scorebug', 'event:goal')).sentence, 'Scorebug is off air')
	assert.equal(relay.count('press'), 0)
})

test('a server without graphic actions refuses the verb, and the module says the server needs an update', async () => {
	const { relay, panel } = await answering()
	relay.pressAnswers.push({ ok: false, refused: 'not-a-panel-verb' })
	const out = await panel.pressAction('Scorebug', 'event:goal')
	assert.equal(out.ok, false)
	assert.equal(out.sentence, 'Graphic actions wait for a NoaCG server update.')
	assert.equal(panel.status, 'ok')
})

test('actions belong to the page that answers: an older claim is ignored, and a new page drops them', async () => {
	const { relay, panel } = await answering()
	relay.emit('actions', actions({ claim: 2, actionsVer: 9_000_000 }))
	assert.equal(panel.actions?.actionsVer, 3_000_004)
	// Another page answers now and has said nothing about actions yet.
	relay.emit('state', state({ claim: 4, ver: 4_000_001 }))
	assert.equal(panel.actions, null)
	assert.match((await panel.pressAction('Scorebug', 'event:goal')).sentence, /No graphic actions/)
})

test('a hostile offer is read in bounded time: at most 32 graphics of 48 capabilities', () => {
	const cap = { id: 'event:x', label: 'X', args: null, allowed: true, invocable: true }
	const huge = actions({
		graphics: Array.from({ length: 100_000 }, (_, i) => ({
			graphic: `G${i}`,
			caps: Array.from({ length: 200 }, () => cap),
		})),
	})
	const t = process.hrtime.bigint()
	const read = readActions(huge)
	const ms = Number(process.hrtime.bigint() - t) / 1e6
	assert.ok(read && read !== 'newer')
	assert.equal(read.graphics.length, 32)
	assert.equal(read.graphics[0].caps.length, 48)
	assert.equal(read.more, true)
	assert.ok(ms < 200, `read took ${ms} ms`)
})

test('a settled that arrives before the press RPC answers is kept, and Done does not cover it', async () => {
	const { relay, panel } = await answering()
	relay.autoResult = null
	// The page answers on the topic before the RPC's own HTTP answer comes back.
	const original = relay.press.bind(relay)
	relay.press = async (key, press) => {
		relay.emit('result', { v: 1, id: press.id, panel: 'k1', outcome: 'ran' })
		relay.emit('settled', {
			av: 2,
			id: press.id,
			outcome: 'refused',
			note: 'Nothing sent: the cue on Scorebug changed.',
		})
		return original(key, press)
	}
	const out = await panel.pressAction('Scorebug', 'event:goal')
	assert.equal(out.ok, true)
	assert.equal(panel.lastPress, 'Nothing sent: the cue on Scorebug changed.')
})

test('a beat ahead of the offer this module holds asks the page again, so a missed offer is recovered', async () => {
	const { relay, panel } = await answering()
	relay.emit('rows', rows())
	const hellos = relay.count('hello')
	// Up to date: nothing asked.
	relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 5, rowsVer: 1, actionsVer: 3_000_004 })
	await settle()
	assert.equal(relay.count('hello'), hellos)
	// The page moved its offer on and this module missed it.
	relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 5, rowsVer: 1, actionsVer: 3_000_005 })
	await settle()
	assert.equal(relay.count('hello'), hellos + 1)
	assert.equal(panel.status, 'ok')
})

test('an offer in a newer actions protocol is not asked for again on every beat', async () => {
	const { relay } = await answering()
	relay.emit('rows', rows())
	relay.emit('actions', actions({ av: 3, actionsVer: 3_000_009 }))
	const hellos = relay.count('hello')
	relay.emit('beat', { v: 1, page: 'page0000page0000', claim: 3, ver: 5, rowsVer: 1, actionsVer: 3_000_009 })
	await settle()
	assert.equal(relay.count('hello'), hellos)
})

test('a graphic action that ran and never says what it came to reads not confirmed, and is never sent again', async () => {
	const { relay, clock, panel } = await answering()
	await panel.pressAction('Scorebug', 'event:goal')
	assert.equal(panel.lastPress, 'Running on the graphic')
	await clock.advance(14_999)
	assert.equal(panel.lastPress, 'Running on the graphic')
	await clock.advance(1)
	assert.equal(panel.lastPress, 'Not confirmed: the operator page did not say what it came to')
	assert.equal(relay.count('press'), 1)
	// A settled arriving after that changes nothing.
	relay.emit('settled', { av: 2, id: 'testinst:1', outcome: 'accepted' })
	assert.equal(panel.lastPress, 'Not confirmed: the operator page did not say what it came to')
})

test("a re-joined topic does not carry the last page's offer", async () => {
	const { relay, panel } = await answering()
	assert.ok(panel.actions)
	// The page goes away; a new one answers on the same claim but has not offered anything yet.
	relay.emit('gone', { v: 1, page: 'page0000page0000', claim: 3 })
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	assert.equal(panel.actions, null)
})

test('a lost result does not cover what the action came to: settled before the timeout, or after it', async () => {
	// Settled arrives, the result never does: the press reads what it came to, never "no answer".
	const early = await answering()
	early.relay.autoResult = null
	const original = early.relay.press.bind(early.relay)
	early.relay.press = async (key, press) => {
		const answer = await original(key, press)
		queueMicrotask(() => early.relay.emit('settled', { av: 2, id: press.id, outcome: 'accepted' }))
		return answer
	}
	const out = await early.panel.pressAction('Scorebug', 'event:goal')
	assert.equal(out.ok, true)
	await early.clock.advance(2_000)
	assert.equal(early.panel.lastPress, 'Done')

	// Neither comes in time: "no answer"; a settled after that still says what it came to.
	const late = await answering()
	late.relay.autoResult = null
	const pressing = late.panel.pressAction('Scorebug', 'event:goal')
	await late.clock.advance(1_500)
	assert.equal((await pressing).sentence, 'No answer from the operator page')
	late.relay.emit('settled', { av: 2, id: 'testinst:1', outcome: 'accepted' })
	assert.equal(late.panel.lastPress, 'Done')
	assert.equal(late.relay.count('press'), 1)
})
