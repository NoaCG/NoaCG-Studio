// Graphic keys in Companion (E6.2, L1 AC-8): the Graphic action, its feedbacks and variable, and the
// pinned graphics' presets, over a fake relay. A key is its capability by id: never rebound by label
// or position, refused visibly when its graphic no longer offers it, and never sent twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PanelClient, OUTCOME_MS, SETTLE_MS, type PressOutcome } from '../panel.js'
import { ARGS_MAX_CHARS, ARGS_MAX_DEPTH, keyArgs, offerShape, readActions, type ActionPress } from '../protocol.js'
import { UpdateActions, capChoices, graphicChoices, pressGraphicKey, type GraphicKeyOptions } from '../actions.js'
import { UpdateFeedbacks } from '../feedbacks.js'
import { buildPresets, graphicPresets } from '../presets.js'
import { variableValues } from '../variables.js'
import type ModuleInstance from '../main.js'
import { FakeClock, FakeRelay, offer, rows, settle, state } from './fakes.js'

async function answering(o: Record<string, unknown> = offer()) {
	const relay = new FakeRelay()
	const clock = new FakeClock()
	const panel = new PanelClient({ relay, clock, instance: 'deck' })
	await panel.start({ key: 'ncpk_test', code: '', label: 'Desk' })
	await settle()
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	relay.emit('rows', rows())
	relay.emit('actions', o)
	return { relay, clock, panel }
}

const key = (over: Partial<GraphicKeyOptions>): GraphicKeyOptions => ({
	graphic: 'Scorebug',
	cap: 'event:goal-home',
	option: '',
	delta: '1',
	args: '',
	...over,
})

type Def = {
	options: { id: string; choices?: { id: string; label: string }[] }[]
	callback: (e: { options: Record<string, unknown> }) => unknown
}

/** The module's definitions as Companion would hold them, over this panel. */
function companion(panel: PanelClient) {
	const self = {
		panel,
		label: 'noacg',
		actions: {} as Record<string, Def>,
		feedbacks: {} as Record<string, Def>,
		setActionDefinitions(d: Record<string, Def>) {
			this.actions = d
		},
		setFeedbackDefinitions(d: Record<string, Def>) {
			this.feedbacks = d
		},
		async press() {
			return { ok: true, sentence: '' }
		},
		last: null as PressOutcome | null,
		async pressAction(o: Partial<GraphicKeyOptions>) {
			this.last = await pressGraphicKey(panel, o)
			return this.last
		},
	}
	UpdateActions(self as unknown as ModuleInstance)
	UpdateFeedbacks(self as unknown as ModuleInstance)
	const fb = (id: string, options: Record<string, unknown>) => self.feedbacks[id].callback({ options }) as boolean
	// A press goes through the action's own callback, as Companion runs it.
	const press = async (o: GraphicKeyOptions): Promise<PressOutcome> => {
		self.last = null
		await self.actions.graphic_action.callback({ options: o })
		return self.last!
	}
	return { self, fb, press }
}

const sent = (relay: FakeRelay) => relay.presses() as unknown as ActionPress[]

test('AC-1: a sports graphic, a quiz and a foreign package expose their declared actions and argument forms', async () => {
	const { panel } = await answering()
	const { self } = companion(panel)
	const opts = self.actions.graphic_action.options
	assert.deepEqual(
		opts.map((o) => o.id),
		['graphic', 'cap', 'option', 'delta', 'args'],
	)
	assert.deepEqual(graphicChoices(panel.actions), [
		{ id: 'Scorebug', label: 'Scorebug' },
		{ id: 'Quiz', label: 'Quiz' },
		{ id: 'Results', label: 'Results' },
	])
	// Every capability by its id, named as the page names it.
	assert.deepEqual(
		capChoices(panel.actions).map((c) => [c.id, c.label]),
		[
			['event:goal-home', '+1 HOME (Scorebug)'],
			['event:clock-start', 'Start clock (Scorebug)'],
			['event:clock-pause', 'Pause clock (Scorebug)'],
			['step:home', 'Home (Scorebug)'],
			['event:reveal', 'Reveal (Quiz)'],
			['event:choose', 'Answer (Quiz)'],
			['foreign:highlight', 'Highlight a team (Results)'],
			['foreign:reset', 'Reset (Results)'],
		],
	)
	// The foreign action's typed argument form is the page's, as sent.
	const highlight = panel.actions!.graphics[2].caps[0]
	assert.equal(highlight.invocable, true)
	assert.deepEqual(highlight.args?.properties?.[0].key, 'team')
})

test('AC-1: targets, labels, legal actions and feedback follow the page; a key is held by id, never by label or row', async () => {
	const { relay, panel } = await answering()
	const { fb, press } = companion(panel)
	const k = { graphic: 'Quiz', cap: 'event:reveal' }
	assert.equal(fb('action_allowed', k), true)
	assert.equal(fb('action_active', { graphic: 'Quiz', cap: 'event:choose', option: 'B' }), true)
	assert.equal(fb('action_active', { graphic: 'Quiz', cap: 'event:choose', option: 'A' }), false)
	// The page greys it: so does the key.
	const greyed = offer({ actionsVer: 3_000_011 })
	greyed.graphics[1].caps[0] = {
		...greyed.graphics[1].caps[0],
		allowed: false,
		note: "Reveal cannot fire in the graphic's state now",
	}
	relay.emit('actions', greyed)
	assert.equal(fb('action_allowed', k), false)
	assert.equal(fb('action_unknown', k), false)
	await press(key(k))
	assert.equal(panel.lastPress, "Reveal cannot fire in the graphic's state now")
	// A package edit renames the action and moves it to the top: the saved key does not follow the
	// label or the position. It reads unknown, visible and disabled, and sends nothing.
	const edited = offer({ actionsVer: 3_000_012 })
	edited.graphics[1].caps = [
		{ ...edited.graphics[1].caps[0], id: 'event:reveal-answer', label: 'Reveal' },
		edited.graphics[1].caps[1],
	]
	relay.emit('actions', edited)
	assert.equal(fb('action_unknown', k), true)
	assert.equal(fb('action_allowed', k), false)
	const out = await press(key(k))
	assert.equal((out as { sentence: string }).sentence, 'That action is not on Quiz')
	assert.equal(relay.count('press'), 0)
	// No offer at all (no page) is the connection's to say, not an unknown action.
	relay.emit('gone', { v: 1, page: 'page0000page0000', claim: 3 })
	assert.equal(fb('action_unknown', k), false)
})

test('AC-2: +1 moves one score once, a pick sends its option, a step its sign; one press is one send', async () => {
	const { relay, panel } = await answering()
	const { press } = companion(panel)
	await press(key({ cap: 'event:goal-home' }))
	await press(key({ graphic: 'Quiz', cap: 'event:choose', option: 'A' }))
	await press(key({ cap: 'step:home', delta: '-1' }))
	assert.deepEqual(
		sent(relay).map((p) => [p.target, p.cap, p.instance, p.args, p.seen]),
		[
			['Scorebug', 'event:goal-home', 'cue_sb', {}, 3_000_010],
			['Quiz', 'event:choose', 'cue_q1', { option: 'A' }, 3_000_010],
			['Scorebug', 'step:home', 'cue_sb', { delta: -1 }, 3_000_010],
		],
	)
	// Every press its own id: the page drops a repeated one, so the one retry cannot run twice.
	assert.equal(new Set(sent(relay).map((p) => p.id)).size, 3)
})

test('AC-2: a quiz reveal is its own capability: it never sends a clock action, and a clock key keeps its own', async () => {
	const { relay, panel } = await answering()
	const { press } = companion(panel)
	await press(key({ cap: 'event:clock-start' }))
	await press(key({ graphic: 'Quiz', cap: 'event:reveal' }))
	assert.deepEqual(
		sent(relay).map((p) => [p.target, p.cap]),
		[
			['Scorebug', 'event:clock-start'],
			['Quiz', 'event:reveal'],
		],
	)
})

test('AC-2: a controller reconnect replays nothing: a clock press that ran is not sent again, and its settled still lands', async () => {
	const { relay, clock, panel } = await answering()
	const { press, fb } = companion(panel)
	await press(key({ cap: 'event:clock-start' }))
	assert.equal(fb('action_outcome', { graphic: 'Scorebug', cap: 'event:clock-start', outcome: 'running' }), true)
	// The channel drops and comes back; the page answers again with its state and offer.
	relay.live!.onStatus('closed')
	await settle()
	assert.equal(panel.status, 'offline')
	await clock.advance(1_000)
	relay.live!.onStatus('joined')
	await settle()
	relay.emit('state', state())
	relay.emit('actions', offer())
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'accepted' })
	assert.equal(relay.count('press'), 1)
	assert.equal(panel.lastPress, 'Done')
	assert.equal(fb('action_outcome', { graphic: 'Scorebug', cap: 'event:clock-start', outcome: 'done' }), true)
})

test('AC-2: a lost acknowledgement never replays a +1; the key reads not known and stays so until its next press', async () => {
	const { relay, clock, panel } = await answering()
	const { press, fb } = companion(panel)
	relay.autoResult = null
	const k = { graphic: 'Scorebug', cap: 'event:goal-home' }
	const pressing = press(key(k))
	await clock.advance(1_500)
	await pressing
	assert.equal(fb('action_outcome', { ...k, outcome: 'unknown' }), true)
	await clock.advance(SETTLE_MS)
	assert.equal(relay.count('press'), 1)
	assert.equal(fb('action_outcome', { ...k, outcome: 'unknown' }), true)
	assert.equal(panel.lastPress, 'Not confirmed: the operator page did not say what it came to')
	// A late settled for that press changes nothing; the next press of the key is its own.
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'accepted' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'unknown' }), true)
	relay.autoResult = 'ran'
	// The page is still there (it beats every 4 s); the module heard nothing for the wait.
	relay.emit('state', state())
	relay.emit('actions', offer())
	await press(key(k))
	assert.equal(fb('action_outcome', { ...k, outcome: 'running' }), true)
	relay.emit('settled', { av: 2, id: 'deck:2', outcome: 'accepted' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'done' }), true)
	await clock.advance(OUTCOME_MS)
	assert.equal(fb('action_outcome', { ...k, outcome: 'done' }), false)
	assert.equal(relay.count('press'), 2)
})

test('AC-2: a refused or stale press shows failed on its key, and an older press never overwrites a newer one', async () => {
	const { relay, panel } = await answering()
	const { press, fb } = companion(panel)
	const k = { graphic: 'Scorebug', cap: 'event:goal-home' }
	relay.autoResult = 'stale'
	await press(key(k))
	assert.equal(fb('action_outcome', { ...k, outcome: 'failed' }), true)
	relay.autoResult = 'ran'
	await press(key(k))
	// The first press's late word is about an older press: the key shows the newer one.
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'refused', note: 'stale' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'running' }), true)
	relay.emit('settled', { av: 2, id: 'deck:2', outcome: 'refused', note: 'Nothing sent: the cue on Scorebug changed.' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'failed' }), true)
	assert.equal(panel.lastPress, 'Nothing sent: the cue on Scorebug changed.')
})

test("a foreign action is pressed on the program instance with the cue's arguments, or the key's own as JSON", async () => {
	const { relay, panel } = await answering()
	const { press } = companion(panel)
	await press(key({ graphic: 'Results', cap: 'foreign:highlight' }))
	await press(key({ graphic: 'Results', cap: 'foreign:highlight', args: ' {"team": 2} ' }))
	assert.deepEqual(
		sent(relay).map((p) => [p.verb, p.v, p.target, p.cap, p.instance, p.args]),
		[
			['graphic-action', 2, 'Results', 'foreign:highlight', 'cue_r1', {}],
			['graphic-action', 2, 'Results', 'foreign:highlight', 'cue_r1', { team: 2 }],
		],
	)
	// Arguments a key cannot send are refused here: nothing goes.
	for (const args of ['{team: 2}', '[2]', '2'])
		assert.equal(
			((await press(key({ graphic: 'Results', cap: 'foreign:highlight', args }))) as { ok: boolean }).ok,
			false,
		)
	assert.equal(relay.count('press'), 2)
	// Off air, the page's own reason; the key never sends to whatever airs next.
	const off = offer({ actionsVer: 3_000_013 })
	off.graphics[2] = {
		...off.graphics[2],
		live: null,
		caps: off.graphics[2].caps.map((c) => ({ ...c, allowed: false, note: 'Results is off air' })),
	}
	relay.emit('actions', off)
	assert.equal(
		((await press(key({ graphic: 'Results', cap: 'foreign:reset' }))) as { sentence: string }).sentence,
		'Results is off air',
	)
	assert.equal(relay.count('press'), 2)
})

test("AC-3: arguments are read in time linear in their size, within the relay's bound", () => {
	assert.equal(ARGS_MAX_CHARS, 4096)
	assert.deepEqual(keyArgs('step:home', { delta: '-1' }), { args: { delta: -1 } })
	assert.deepEqual(keyArgs('step:home', { delta: 'x' }), { args: { delta: 1 } })
	// A declared value is sent exactly: spaces may be part of it (Codex P2 on 955c28d).
	assert.deepEqual(keyArgs('event:choose', { option: ' A ' }), { args: { option: ' A ' } })
	assert.deepEqual(keyArgs('event:goal', { args: '{"x":1}' }), { args: {} })
	assert.deepEqual(keyArgs('foreign:x', { args: '' }), { args: {} })
	// Measured as the server writes it back: `{"t": "x…"}`, one space more than typed.
	const atBound = `{"t":"${'x'.repeat(ARGS_MAX_CHARS - 9)}"}`
	assert.equal(atBound.length + 1, ARGS_MAX_CHARS)
	assert.ok('args' in keyArgs('foreign:x', { args: atBound }))
	const pastBound = `{"t":"${'x'.repeat(ARGS_MAX_CHARS - 8)}"}`
	assert.deepEqual(keyArgs('foreign:x', { args: pastBound }), {
		refused: 'The arguments are longer than a press takes',
	})
	// Every member and item adds its space: 3 colons and 2 commas, and 1 comma in the list.
	const spaced = (n: number) => `{"a":1,"b":[1,2],"t":"${'x'.repeat(n)}"}`
	assert.ok('args' in keyArgs('foreign:x', { args: spaced(ARGS_MAX_CHARS - 30) }))
	assert.ok('refused' in keyArgs('foreign:x', { args: spaced(ARGS_MAX_CHARS - 29) }))
	// Characters, not UTF-16 units: 4089 emoji are 4096 with the server's space.
	assert.ok('args' in keyArgs('foreign:x', { args: `{"t":"${'\u{1F600}'.repeat(ARGS_MAX_CHARS - 9)}"}` }))
	assert.ok('refused' in keyArgs('foreign:x', { args: `{"t":"${'\u{1F600}'.repeat(ARGS_MAX_CHARS - 8)}"}` }))
	// A number JavaScript writes with an exponent is not what the server writes: refused, never changed.
	for (const n of ['1e300', '1e400', '1e-7', '-1e21'])
		assert.deepEqual(keyArgs('foreign:x', { args: `{"n":${n}}` }), {
			refused: 'A number in the arguments is too large or too small to send',
		})
	assert.deepEqual(keyArgs('foreign:x', { args: '{"n":[-2.5, 1e3, 0]}' }), { args: { n: [-2.5, 1000, 0] } })
	// An integer past the safe range would arrive as another number: refused, never changed.
	assert.ok('refused' in keyArgs('foreign:x', { args: '{"n":9007199254740993}' }))
	assert.ok('args' in keyArgs('foreign:x', { args: '{"n":9007199254740991}' }))
	// Text the server cannot store (NUL, half a surrogate pair), in a value or a name, is refused here.
	for (const bad of ['{"t":"\\u0000"}', '{"t":"\\ud800"}', '{"t":"\\udc00x"}', '{"\\u0000":1}'])
		assert.deepEqual(keyArgs('foreign:x', { args: bad }), {
			refused: 'The arguments hold a character that cannot be sent',
		})
	assert.ok('args' in keyArgs('foreign:x', { args: '{"t":"\\ud83d\\ude00 ok"}' }))
	// Nesting: the object and seven more levels, never eight.
	assert.equal(ARGS_MAX_DEPTH, 8)
	assert.ok('args' in keyArgs('foreign:x', { args: `{"d":${'['.repeat(7)}${']'.repeat(7)}}` }))
	assert.deepEqual(keyArgs('foreign:x', { args: `{"d":${'['.repeat(8)}${']'.repeat(8)}}` }), {
		refused: 'The arguments nest deeper than 8 levels',
	})
	const t = process.hrtime.bigint()
	assert.ok('refused' in keyArgs('foreign:x', { args: '['.repeat(5_000_000) }))
	assert.ok('refused' in keyArgs('foreign:x', { args: '{"a":' + '['.repeat(2000) + ']'.repeat(2000) + '}' }))
	assert.ok(Number(process.hrtime.bigint() - t) / 1e6 < 500)
})

test('AC-3: an older page offers foreign actions as descriptors only, and a newer one is "update the module"', async () => {
	const old = offer()
	old.graphics[2].caps = old.graphics[2].caps.map((c) => ({
		...c,
		allowed: false,
		invocable: false,
		note: 'Foreign actions are not pressed from a panel yet',
	}))
	const { relay, panel } = await answering(old)
	const { press, fb } = companion(panel)
	assert.equal(fb('action_allowed', { graphic: 'Results', cap: 'foreign:reset' }), false)
	assert.equal(
		((await press(key({ graphic: 'Results', cap: 'foreign:reset' }))) as { sentence: string }).sentence,
		'Foreign actions are not pressed from a panel yet',
	)
	relay.emit('actions', offer({ av: 3 }))
	assert.match(((await press(key({}))) as { sentence: string }).sentence, /Update the NoaCG module/)
	assert.equal(
		variableValues(panel, 0).graphic_actions,
		"Update the NoaCG module to press this production's graphic actions",
	)
	assert.equal(relay.count('press'), 0)
	// The transport keys keep working.
	assert.equal((await panel.press('take')).ok, true)
})

test("L1 AC-8: presets list the pinned graphics' live controls only, picks as options and numbers as -1 and +1", async () => {
	const { panel } = await answering()
	const { groups, presets } = graphicPresets('noacg', panel.actions)
	assert.deepEqual(
		groups.map((g) => [g.name, g.ids.map((id) => (presets[id] as { name: string }).name)]),
		[
			[
				'Scorebug',
				[
					'+1 HOME (Scorebug)',
					'Start clock (Scorebug)',
					'Pause clock (Scorebug)',
					'Home -1 (Scorebug)',
					'Home +1 (Scorebug)',
				],
			],
			['Quiz', ['Reveal (Quiz)', 'Answer: Answer A (Quiz)', 'Answer: Answer B (Quiz)']],
		],
	)
	const answerB = presets['graphic_1_2'] as {
		steps: { down: { actionId: string; options: unknown }[] }[]
		feedbacks: { feedbackId: string }[]
	}
	assert.deepEqual(answerB.steps[0].down[0], {
		actionId: 'graphic_action',
		options: { graphic: 'Quiz', cap: 'event:choose', option: 'B', delta: '1', args: '' },
	})
	assert.deepEqual(
		answerB.feedbacks.map((f) => f.feedbackId),
		[
			'action_active',
			'action_allowed',
			'action_outcome',
			'action_outcome',
			'action_outcome',
			'action_unknown',
			'no_page',
			'offline',
		],
	)
	const { structure } = buildPresets('noacg', rows().rows, panel.actions)
	assert.equal(structure.at(-1)!.name, 'Pinned graphics')
	// A control no panel can press (an OGraf action whose arguments this version cannot carry) gets no key.
	const notCarried = offer({ actionsVer: 3_000_017 })
	notCarried.graphics[2] = { ...notCarried.graphics[2], pinned: true }
	notCarried.graphics[2].caps[0] = { ...notCarried.graphics[2].caps[0], allowed: false, invocable: false }
	const carried = graphicPresets('noacg', readActions(notCarried) as never)
	assert.deepEqual(
		carried.groups.at(-1)!.ids.map((id) => (carried.presets[id] as { name: string }).name),
		['Reset (Results)'],
	)
	assert.equal(
		buildPresets('noacg', [], null).structure.at(-1)!.description,
		'Pin a graphic on the production page to list its live controls here.',
	)
})

test('L1 AC-8: unpinning a graphic drops its presets and refuses nothing: a saved key keeps working', async () => {
	const { relay, panel } = await answering()
	const { press } = companion(panel)
	const unpinned = offer({ actionsVer: 3_000_014 })
	unpinned.graphics[0] = { ...unpinned.graphics[0], pinned: false }
	const before = offerShape(panel.actions)
	relay.emit('actions', unpinned)
	assert.notEqual(offerShape(panel.actions), before, 'the presets are redefined')
	assert.deepEqual(
		graphicPresets('noacg', panel.actions).groups.map((g) => g.name),
		['Quiz'],
	)
	await press(key({ cap: 'event:goal-home' }))
	assert.equal(sent(relay)[0].cap, 'event:goal-home')
	// What moves live (greying, the cue on air, a pick's option) does not redefine anything.
	const live = offer({ actionsVer: 3_000_015 })
	live.graphics[1] = { ...live.graphics[1], live: 'cue_q2' }
	live.graphics[1].caps[1] = { ...live.graphics[1].caps[1], active: 'A', allowed: false }
	assert.equal(offerShape(readActions(live) as never), offerShape(readActions(offer()) as never))
})

test('AC-2: an older press answered late, or not at all, never rewrites what a newer press of the key shows', async () => {
	const { relay, clock, panel } = await answering()
	const { press, fb } = companion(panel)
	const k = { graphic: 'Scorebug', cap: 'step:home' }
	// Only the second press is answered: the first one's result is lost.
	relay.autoResult = null
	const original = relay.press.bind(relay)
	relay.press = async (keyId, p) => {
		const answer = await original(keyId, p)
		if (p.id === 'deck:2') queueMicrotask(() => relay.emit('result', { v: 1, id: p.id, panel: 'k1', outcome: 'ran' }))
		return answer
	}
	const first = press(key({ ...k }))
	await settle()
	await press(key({ ...k, delta: '-1' }))
	assert.equal(fb('action_outcome', { ...k, outcome: 'running' }), true)
	await clock.advance(1_500)
	await first
	assert.equal(
		fb('action_outcome', { ...k, outcome: 'running' }),
		true,
		'the first press timing out says nothing on the key',
	)
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'accepted' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'running' }), true)
	relay.emit('settled', { av: 2, id: 'deck:2', outcome: 'accepted' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'done' }), true)
	assert.equal(relay.count('press'), 2)
})

test('AC-2: a press refused before it went never hides what an earlier press of the key may have done', async () => {
	const { relay, clock, panel } = await answering()
	const { press, fb } = companion(panel)
	const k = { graphic: 'Scorebug', cap: 'event:goal-home' }
	await press(key(k))
	assert.equal(fb('action_outcome', { ...k, outcome: 'running' }), true)
	// The scorebug goes off air: a second press is refused here and shows so, briefly.
	const off = offer({ actionsVer: 3_000_016 })
	off.graphics[0] = {
		...off.graphics[0],
		live: null,
		caps: off.graphics[0].caps.map((c) => ({ ...c, allowed: false, note: 'Scorebug is off air' })),
	}
	relay.emit('actions', off)
	await press(key(k))
	assert.equal(fb('action_outcome', { ...k, outcome: 'failed' }), true)
	await clock.advance(OUTCOME_MS)
	// Then the first press shows again, and what it came to is still said on the key.
	assert.equal(fb('action_outcome', { ...k, outcome: 'running' }), true)
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'unknown', note: 'no answer from the server' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'unknown' }), true)
	assert.equal(relay.count('press'), 1)
})

test('AC-2: a press whose two calls both failed reads not known, and a settled that comes still says what it came to', async () => {
	const { relay, panel } = await answering()
	const { press, fb } = companion(panel)
	const k = { graphic: 'Scorebug', cap: 'event:goal-home' }
	relay.pressAnswers.push(new Error('reset'), new Error('reset'))
	const out = await press(key(k))
	assert.match(out.sentence, /NoaCG offline/)
	assert.equal(fb('action_outcome', { ...k, outcome: 'unknown' }), true)
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'accepted' })
	assert.equal(fb('action_outcome', { ...k, outcome: 'done' }), true)
	assert.equal(panel.lastPress, 'Done')
	assert.equal(relay.count('press'), 2, 'the one same-id retry, never a third')
	assert.deepEqual(new Set(sent(relay).map((p) => p.id)), new Set(['deck:1']))
})

test('a settled that came before both calls failed stands: the key reads what the action came to', async () => {
	const { relay, panel } = await answering()
	const { press, fb } = companion(panel)
	const k = { graphic: 'Scorebug', cap: 'event:goal-home' }
	// The page runs the press and says so; both of the module's calls then lose their answers.
	let calls = 0
	relay.press = async (_key, p) => {
		relay.calls.push({ name: 'press', args: [_key, p] })
		if (++calls === 1) relay.emit('settled', { av: 2, id: p.id, outcome: 'accepted' })
		throw new Error('reset')
	}
	const out = await press(key(k))
	assert.equal(out.ok, true)
	assert.equal(out.sentence, 'Done')
	assert.equal(fb('action_outcome', { ...k, outcome: 'done' }), true)
	assert.equal(panel.lastPress, 'Done')
	assert.equal(relay.count('press'), 2)
})

test('what keys show is kept for a bounded number of keys', async () => {
	const caps = ['a', 'b', 'c'].map((n) => ({
		id: `event:${n}`,
		kind: 'event',
		label: n,
		place: 'section',
		args: null,
		allowed: true,
		invocable: true,
	}))
	const many = offer({
		graphics: Array.from({ length: 32 }, (_, i) => ({
			graphic: `G${i}`,
			pinned: false,
			live: 'cue',
			cue: 'Cue',
			caps,
		})),
	})
	const { relay, panel } = await answering(many)
	relay.autoResult = 'ran'
	// 96 keys pressed, each still running: only the newest 64 keys are held.
	for (let i = 0; i < 32; i++) for (const c of caps) await pressGraphicKey(panel, key({ graphic: `G${i}`, cap: c.id }))
	assert.equal(relay.count('press'), 96)
	assert.equal(panel.keyOutcome('G31', 'event:c'), 'running')
	assert.equal(panel.keyOutcome('G0', 'event:a'), null)
})

test('a press that falls out of the bounded wait reads not known on its key, never running for good', async () => {
	const { panel } = await answering()
	await pressGraphicKey(panel, key({ cap: 'event:clock-start' }))
	// 64 newer presses of another key, each still waiting for what it came to.
	for (let i = 0; i < 64; i++) await pressGraphicKey(panel, key({ cap: 'event:goal-home' }))
	assert.equal(panel.keyOutcome('Scorebug', 'event:clock-start'), 'unknown')
	assert.equal(panel.keyOutcome('Scorebug', 'event:goal-home'), 'running')
})

test('a press still waiting keeps its key while many later presses settle, and its own settled lands', async () => {
	const { relay, panel } = await answering()
	await pressGraphicKey(panel, key({ cap: 'event:clock-start' }))
	// 64 presses of another key each settle at once: the first press is still waited for.
	for (let i = 2; i <= 65; i++) {
		await pressGraphicKey(panel, key({ cap: 'event:goal-home' }))
		relay.emit('settled', { av: 2, id: `deck:${i}`, outcome: 'accepted' })
	}
	assert.equal(panel.keyOutcome('Scorebug', 'event:clock-start'), 'running')
	relay.emit('settled', { av: 2, id: 'deck:1', outcome: 'accepted' })
	assert.equal(panel.keyOutcome('Scorebug', 'event:clock-start'), 'done')
})
