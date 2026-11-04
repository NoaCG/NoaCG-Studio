import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CompanionPresetFeedback } from '@companion-module/base'
import { UpdateActions } from '../actions.js'
import { AMBER, BLACK, DARK_AMBER, GREY, RED, UpdateFeedbacks, WHITE, type FeedbacksSchema } from '../feedbacks.js'
import { PanelClient } from '../panel.js'
import { buildPresets } from '../presets.js'
import type { PanelRows, PanelState, PanelVerb } from '../protocol.js'
import { variableValues } from '../variables.js'
import { SELECTED } from '../view.js'
import type ModuleInstance from '../main.js'
import { FakeClock, FakeRelay, rows, settle, state } from './fakes.js'

// THE TAKE KEY SAYS WHAT THE NEXT PRESS DOES (issue 2071). Each key below is drawn as Companion draws
// it: the preset's base style, then every feedback that holds, in order, each over the last, and the
// variables filled in. The states are what the page publishes for that situation; which press each
// one means is pinned on the page's side in scripts/verb-dispatch.test.mjs.

type Feedback = CompanionPresetFeedback<FeedbacksSchema>
type Style = { text?: string; color?: number; bgcolor?: number }
type Def = { callback: (e: { options: Record<string, unknown> }) => unknown }

async function paired() {
	const relay = new FakeRelay()
	const clock = new FakeClock()
	const panel = new PanelClient({ relay, clock, instance: 'x' })
	await panel.start({ key: 'k', code: '', label: '' })
	await settle()
	const self = {
		panel,
		label: 'noacg',
		feedbacks: {} as Record<string, Def>,
		actions: {} as Record<string, Def>,
		setFeedbackDefinitions(d: Record<string, Def>) {
			this.feedbacks = d
		},
		setActionDefinitions(d: Record<string, Def>) {
			this.actions = d
		},
		async press(verb: PanelVerb, row = '') {
			return panel.press(verb, row)
		},
	}
	UpdateFeedbacks(self as unknown as ModuleInstance)
	UpdateActions(self as unknown as ModuleInstance)
	const show = (s: PanelState, r: PanelRows = rows()) => {
		relay.emit('state', s)
		relay.emit('rows', r)
	}
	const draw = (base: Style, feedbacks: readonly Feedback[]) => {
		const out: Style = { ...base }
		for (const f of feedbacks) {
			const holds = !!self.feedbacks[String(f.feedbackId)].callback({ options: f.options })
			if (holds !== !!f.isInverted) Object.assign(out, f.style)
		}
		const values = variableValues(panel, clock.now())
		const text = (out.text ?? '').replace(/\$\(noacg:(\w+)\)/g, (_, name: string) => String(values[name] ?? ''))
		return { text, color: out.color, bgcolor: out.bgcolor }
	}
	return { relay, clock, self, show, draw }
}

const takePreset = () => buildPresets('noacg', rows().rows).presets['take']!

/** The Take key as dragged from the 0.2.0 module: a button keeps its own copy of these. */
const DECK_KEY_0_2_0: { style: Style; feedbacks: Feedback[] } = {
	style: { text: 'TAKE\\n$(noacg:selected)', color: WHITE, bgcolor: BLACK },
	feedbacks: [
		{
			feedbackId: 'on_air',
			options: { row: SELECTED },
			style: { bgcolor: RED, color: WHITE, text: 'TAKE OFF\\n$(noacg:selected)' },
		},
		{ feedbackId: 'allowed', options: { verb: 'take', row: '' }, isInverted: true, style: { color: GREY } },
		{ feedbackId: 'refused', options: { verb: 'take', row: '' }, style: { bgcolor: AMBER, color: BLACK } },
		{ feedbackId: 'no_page', options: {}, style: { text: 'No operator page' } },
		{ feedbackId: 'offline', options: {}, style: { text: '$(noacg:connection)' } },
	],
}

const withFolder: PanelRows = {
	...rows(),
	rows: [...rows().rows, { id: 'fold_1', label: 'Part two', kind: 'folder', source: null }],
}
const allowsTake = { take: true, out: true }

test('the selected cue off air: Take and its name', async () => {
	const { show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: 'cue_a', space: 'take', live: [] }))
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'TAKE\\nAnna', color: WHITE, bgcolor: BLACK })
})

test('the selected cue on air: Out on the on-air red, and it flips back after Out by itself', async () => {
	const { show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: 'cue_a', space: 'take-off', live: ['cue_a'], allowed: allowsTake }))
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'OUT\\nAnna', color: WHITE, bgcolor: RED })
	show(state({ ver: 6, selected: 'cue_a', space: 'take', live: [] }))
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'TAKE\\nAnna', color: WHITE, bgcolor: BLACK })
})

test('nothing selected: the grey Take every key shows when a press would do nothing', async () => {
	const { show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: null, space: null, live: ['cue_b'], allowed: { take: false } }))
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'TAKE\\n', color: GREY, bgcolor: BLACK })
})

test('another cue on air: a press takes the selected one, so the key reads Take with its name, not red', async () => {
	const { relay, self, show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: 'cue_a', space: 'take', live: ['cue_b'], allowed: allowsTake }))
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'TAKE\\nAnna', color: WHITE, bgcolor: BLACK })
	// And the press names the cue the key names.
	await self.actions.take.callback({ options: {} })
	const sent = relay.presses().at(-1)!
	assert.deepEqual([sent.verb, sent.target], ['take', 'cue_a'])
})

test('preview first: the key says the press only previews', async () => {
	const { show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: 'cue_a', space: 'preview', live: [] }))
	const key = draw(p.style, p.feedbacks)
	assert.equal(key.text, 'PREVIEW\\nAnna')
	assert.equal(key.bgcolor, DARK_AMBER, 'nothing airs, so not the on-air red')
})

test("a held folder: the word comes from what the page says a press does, though `live` only lists a folder's cues", async () => {
	const { show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: 'fold_1', space: 'take-off', live: ['cue_a'], allowed: allowsTake }), withFolder)
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'OUT\\nPart two', color: WHITE, bgcolor: RED })
	// A One-by-one folder at its end with nothing up: the page's own face is FROM THE TOP.
	show(state({ ver: 6, selected: 'fold_1', space: 'preview', live: [], allowed: allowsTake }), withFolder)
	assert.equal(draw(p.style, p.feedbacks).text, 'FROM THE TOP\\nPart two')
})

test('the words follow what a press does, not the on-air list, when the two disagree for a moment', async () => {
	const { show, draw } = await paired()
	const p = takePreset()
	show(state({ selected: 'cue_a', space: 'take', live: ['cue_a'] }))
	assert.deepEqual(draw(p.style, p.feedbacks), { text: 'TAKE\\nAnna', color: WHITE, bgcolor: BLACK })
})

test('a key already on a deck keeps its own words but follows the same state, a folder included', async () => {
	const { show, draw } = await paired()
	const { style, feedbacks } = DECK_KEY_0_2_0
	show(state({ selected: 'cue_a', space: 'take-off', live: ['cue_a'], allowed: allowsTake }))
	assert.deepEqual(draw(style, feedbacks), { text: 'TAKE OFF\\nAnna', color: WHITE, bgcolor: RED })
	show(state({ ver: 6, selected: 'cue_a', space: 'take', live: ['cue_b'] }))
	assert.equal(draw(style, feedbacks).text, 'TAKE\\nAnna')
	show(state({ ver: 7, selected: 'fold_1', space: 'take-off', live: ['cue_a'], allowed: allowsTake }), withFolder)
	assert.deepEqual(draw(style, feedbacks), { text: 'TAKE OFF\\nPart two', color: WHITE, bgcolor: RED })
})
