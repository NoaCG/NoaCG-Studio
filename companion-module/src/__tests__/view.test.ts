import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SELECTED, clipClock, clockText, isAllowed, isOnAir, isSelected } from '../view.js'
import { buildPresets } from '../presets.js'
import { ACTION_VERBS } from '../actions.js'
import { PanelClient } from '../panel.js'
import { variableValues } from '../variables.js'
import { readState, type ClipState } from '../protocol.js'
import { FakeClock, FakeRelay, rows, settle, state } from './fakes.js'

const clip = (over: Partial<ClipState>): ClipState => ({
	cue: 'cue_vt',
	label: 'Opening VT',
	phase: 'counting',
	start: null,
	end: null,
	remaining: null,
	estimated: false,
	...over,
})

test('the clock counts down from the page end mapped to this machine, whatever the page clock says', () => {
	// The page's clock is an hour ahead of ours; the clip ends 30 s after the page published.
	const s = state({ at: 5_000_000, clip: clip({ end: 5_030_000, remaining: 30 }) })
	const received = 1_400_000
	assert.equal(clipClock(s, received, received).seconds, 30)
	assert.equal(clipClock(s, received, received + 19_500).seconds, 11)
	assert.equal(clipClock(s, received, received + 19_500).phase, 'counting')
	assert.equal(clipClock(s, received, received + 20_000).phase, 'warning')
	assert.equal(clipClock(s, received, received + 25_000).phase, 'final')
	assert.equal(clipClock(s, received, received + 40_000).seconds, 0)
	assert.equal(clipClock(s, received, received + 21_000).text, '0:09')
})

test('a paused clip shows its frozen time, a holding one the time past its end', () => {
	const paused = state({ clip: clip({ phase: 'paused', remaining: 42 }) })
	assert.deepEqual(clipClock(paused, 0, 99_999), { phase: 'paused', seconds: 42, text: '0:42', label: 'Opening VT' })
	const holding = state({ at: 1_000, clip: clip({ phase: 'holding', end: 1_000 }) })
	assert.equal(clipClock(holding, 1_000, 6_000).text, '+0:05')
	assert.equal(clipClock(state(), 0, 0).phase, 'none')
})

test('the warnings follow the thresholds the page publishes', () => {
	const s = state({ at: 0, warn: [20, 3], clip: clip({ end: 30_000 }) })
	assert.equal(clipClock(s, 0, 11_000).phase, 'warning')
	assert.equal(clipClock(s, 0, 27_500).phase, 'final')
})

test('clock text', () => {
	assert.equal(clockText(null), '--:--')
	assert.equal(clockText(65), '1:05')
	assert.equal(clockText(3725), '1:02:05')
})

test('on air, selected and allowed read the state as the page drew it', () => {
	const s = state({ live: ['cue_b'], selected: 'cue_b', blocked: ['cue_vt'] })
	const r = rows()
	assert.equal(isOnAir(s, 'cue_b'), true)
	assert.equal(isOnAir(s, SELECTED), true)
	assert.equal(isOnAir(s, 'cue_a'), false)
	assert.equal(isSelected(s, 'cue_b'), true)
	assert.equal(isAllowed(s, r, 'take'), true)
	assert.equal(isAllowed(s, r, 'out'), false)
	assert.equal(isAllowed(s, r, 'retake'), false, 'a verb the page did not publish is not allowed')
	assert.equal(isAllowed(s, r, 'take-cue', 'cue_a'), true)
	assert.equal(isAllowed(s, r, 'take-cue', 'cue_vt'), false)
	assert.equal(isAllowed(s, r, 'select-cue', 'cue_vt'), true)
	assert.equal(isAllowed(s, r, 'take-cue', 'gone'), false)
	assert.equal(isAllowed(null, r, 'take'), false)
})

test('reading a state ignores unknown fields and fills safe defaults', () => {
	const s = readState({ ver: 1, page: 'p', allowed: { take: true, bogus: true }, extra: 1 })!
	assert.deepEqual(s.allowed, { take: true })
	assert.deepEqual(s.warn, [10, 5])
	assert.equal(s.bridge, 'off')
	assert.equal(readState({ page: 'p' }), null)
})

test('presets: the transport, the clock, and a Take and a Select key per row, all wired to real ids', () => {
	const { structure, presets } = buildPresets('noacg', rows().rows)
	for (const id of [
		'take',
		'retake',
		'update',
		'next',
		'out',
		'select_prev',
		'select_next',
		'all_out',
		'clip_clock',
		'status',
		'take_cue_a',
		'select_cue_vt',
	]) {
		assert.ok(presets[id], `preset ${id}`)
	}
	const actionIds = new Set<string>([...Object.keys(ACTION_VERBS), 'select_cue', 'take_cue'])
	const feedbackIds = new Set([
		'on_air',
		'selected',
		'allowed',
		'clip_warning',
		'clip_final',
		'no_page',
		'offline',
		'refused',
	])
	for (const [id, p] of Object.entries(presets)) {
		for (const step of p!.steps)
			for (const a of step.down) assert.ok(actionIds.has(String(a.actionId)), `${id}: ${String(a.actionId)}`)
		for (const f of p!.feedbacks) assert.ok(feedbackIds.has(String(f.feedbackId)), `${id}: ${String(f.feedbackId)}`)
		// The status feedbacks come last, so they win over every other style.
		assert.deepEqual(
			p!.feedbacks.slice(-2).map((f) => f.feedbackId),
			['no_page', 'offline'],
			id,
		)
	}
	assert.deepEqual(presets['take_cue_b']!.steps[0].down[0], { actionId: 'take_cue', options: { row: 'cue_b' } })
	const referenced = structure.flatMap((s) =>
		s.definitions.flatMap((d) => (typeof d === 'string' ? [d] : 'presets' in d ? d.presets : [])),
	)
	for (const id of referenced) assert.ok(presets[id], `section names ${id}`)
	assert.equal(new Set(referenced).size, Object.keys(presets).length, 'every preset is in a section')
})

test('variables: the production, the selected cue, on air, the clock and the connection', async () => {
	const relay = new FakeRelay()
	const clock = new FakeClock()
	const panel = new PanelClient({ relay, clock, instance: 'x' })
	assert.equal(
		variableValues(panel, 0).connection,
		'Pair in the connection settings with the code the production page shows',
	)
	await panel.start({ key: 'k', code: '', label: '' })
	await settle()
	relay.emit(
		'state',
		state({ live: ['cue_b'], selected: 'cue_a', at: clock.now(), clip: clip({ end: clock.now() + 65_000 }) }),
	)
	relay.emit('rows', rows())
	const v = variableValues(panel, clock.now())
	assert.equal(v.production, 'Friday match')
	assert.equal(v.selected, 'Anna')
	assert.equal(v.on_air, 'Ben')
	assert.equal(v.clip_left, '1:05')
	assert.equal(v.clip_phase, 'counting')
	assert.equal(v.connection, 'Answered by Production page')
	assert.equal(v.row_3, 'Opening VT')
})
