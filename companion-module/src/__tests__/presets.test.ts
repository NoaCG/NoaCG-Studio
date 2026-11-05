// What a new operator meets first: the preset list as Companion draws it. The Pinned graphics section
// is there before anything is pinned, the cue keys say which one follows the usual model and which
// go straight to air, and a score banner offers one key per control. Renames change words only: every
// action id and option stays, so a key already on a deck keeps working.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type {
	CompanionActionDefinition,
	CompanionPresetSection,
	CompanionSimplePresetDefinition,
} from '@companion-module/base'
import { UpdateActions, capChoices } from '../actions.js'
import { buildPresets } from '../presets.js'
import { capabilityState, offerShape, readActions, type PanelActions } from '../protocol.js'
import type ModuleInstance from '../main.js'
import { offer, rows } from './fakes.js'

type Built = ReturnType<typeof buildPresets>

const NOTHING_PINNED = "Pin a graphic's live controls on the open production page to get them here."

/**
 * The sections and groups as Companion 5.0.6 draws them (its `Thread/Presets.ts` `convertGroup` and
 * `PresetsSectionsList`): a simple group with no preset is dropped, and a section left with no group
 * is hidden, description and all. A template group stays, drawing one key per value.
 */
function drawn({ structure }: Built) {
	return structure.flatMap((section: CompanionPresetSection<never>) => {
		const groups = section.definitions.flatMap((d) => {
			if (typeof d === 'string') return [{ name: '', keys: [d] }]
			if (d.type === 'template') return [{ name: d.name, keys: d.templateValues.map(() => d.presetId) }]
			return d.presets.length > 0 ? [{ name: d.name, keys: d.presets }] : []
		})
		return groups.length > 0 ? [{ name: section.name, description: section.description, groups }] : []
	})
}

const section = (built: Built, name: string) => drawn(built).find((s) => s.name === name)
const keyNames = (built: Built, ids: string[]) =>
	ids.map((id) => (built.presets[id] as CompanionSimplePresetDefinition<never>).name)
const offered = (graphics: Record<string, unknown>[]) => readActions(offer({ graphics })) as PanelActions

const cap = (id: string, label: string, more: Record<string, unknown> = {}) => ({
	id,
	label,
	place: 'section',
	args: null,
	allowed: true,
	invocable: true,
	...more,
})
const banner = (caps: Record<string, unknown>[], pinned = true) => ({
	graphic: 'Score banner',
	pinned,
	live: 'cue_sb',
	cue: 'Round 3',
	caps,
})

// src/templates/types/duelScore.ts as the page offers it (scripts/panel-feedback.test.mjs pins the
// page's half): a point and its undo per player, each moving one figure, and the two figures' steps.
const DUEL = [
	cap('event:pointA', '+1 P1'),
	cap('event:pointB', '+1 P2'),
	cap('event:undoA', '-1 P1'),
	cap('event:undoB', '-1 P2'),
	cap('event:final', 'Final'),
	cap('event:newGame', 'Reset 0-0'),
	cap('step:f1', 'Score 1', { covered: [1, -1] }),
	cap('step:f3', 'Score 2', { covered: [1, -1] }),
]

test('(1) with nothing pinned the Pinned graphics section still shows, holding its one line and no key', () => {
	const unpinned = offered([banner(DUEL, false)])
	for (const actions of [null, unpinned]) {
		const built = buildPresets('noacg', rows().rows, actions)
		const pinned = section(built, 'Pinned graphics')
		assert.ok(pinned, 'Companion draws the section')
		assert.equal(pinned.description, NOTHING_PINNED)
		assert.deepEqual(
			pinned.groups.map((g) => [g.name, g.keys]),
			[['', []]],
		)
		// What the empty group names must exist, or Companion drops the group and the section with it.
		for (const s of built.structure)
			for (const d of s.definitions)
				if (typeof d !== 'string' && d.type === 'template') assert.ok(built.presets[d.presetId], d.presetId)
	}
})

test('(1) a pinned graphic with no control a panel can press leaves the line, not a hidden section', () => {
	const built = buildPresets('noacg', [], offered([banner([cap('foreign:mark', 'Mark', { invocable: false })])]))
	assert.equal(section(built, 'Pinned graphics')?.description, NOTHING_PINNED)
})

test('(1) with something pinned the section holds its controls, and the line to pin is gone', () => {
	const built = buildPresets('noacg', rows().rows, offered([banner(DUEL)]))
	const pinned = section(built, 'Pinned graphics')!
	assert.deepEqual(
		pinned.groups.map((g) => g.name),
		['Score banner'],
	)
	assert.ok(pinned.groups[0].keys.length > 0)
	assert.ok(!/^Pin a graphic/.test(pinned.description ?? ''))
})

test('with no rundown yet the Cues section shows its line too, with no empty headings', () => {
	const cues = section(buildPresets('noacg', [], null), 'Cues')
	assert.ok(cues, 'Companion draws the section')
	assert.equal(cues.description, 'The cues of your rundown appear here while an operator page answers the panel.')
	assert.deepEqual(
		cues.groups.map((g) => [g.name, g.keys]),
		[['', []]],
	)
})

test('(2) Select is the first cue key, and the section says what each of the three does', () => {
	const built = buildPresets('noacg', rows().rows)
	const cues = section(built, 'Cues')!
	assert.deepEqual(
		cues.groups.map((g) => g.name),
		['Select a cue', 'Take a cue now', 'Play now, keep selection'],
	)
	assert.match(cues.description!, /^Select a cue, then press Take in Show control\./)
	assert.match(cues.description!, /go straight to air and keep the selection/)
	assert.match(cues.description!, /Take a cue now takes it off on a second press, Play now restarts it/)
	assert.deepEqual(keyNames(built, cues.groups[0].keys).slice(0, 1), ['Select Anna'])
	assert.deepEqual(keyNames(built, cues.groups[1].keys).slice(0, 1), ['Take Anna now'])
	assert.deepEqual(keyNames(built, cues.groups[2].keys).slice(0, 1), ['Play Anna now, keep selection'])
	assert.match(
		section(buildPresets('noacg', [], offered([banner(DUEL)])), 'Pinned graphics')!.description!,
		/straight to air/,
	)
	assert.ok(!JSON.stringify(built.structure).includes('Trigger'), 'the word Trigger is gone from the list')
})

test('(2) a key that airs at once does not read like a key that only selects', () => {
	const { presets } = buildPresets('noacg', rows().rows)
	const text = (id: string) => (presets[id] as CompanionSimplePresetDefinition<never>).style.text
	assert.equal(text('select_cue_a'), 'Anna')
	assert.equal(text('take_cue_a'), 'TAKE\\nAnna')
	assert.equal(text('trigger_cue_a'), '▶ Anna')
	// Pressed again it takes the cue off, and the key says so, as the Show control Take does.
	const onAir = (id: string) =>
		(presets[id]!.feedbacks.find((f) => f.feedbackId === 'on_air') as unknown as { style: { text?: string } }).style
	assert.equal(onAir('take_cue_a')?.text, 'OUT\\nAnna')
	assert.equal(onAir('select_cue_a')?.text, undefined)
	assert.equal(onAir('trigger_cue_a')?.text, undefined)
})

test('(2) the actions read the same words, and a key on a deck keeps its action id and option', () => {
	const self = {
		panel: { rows: rows(), actions: null },
		actions: {} as Record<string, CompanionActionDefinition<never>>,
		setActionDefinitions(d: Record<string, CompanionActionDefinition<never>>) {
			this.actions = d
		},
	}
	UpdateActions(self as unknown as ModuleInstance)
	const { name: selectName, description: select } = self.actions.select_cue
	const { name: takeName, description: take } = self.actions.take_cue
	const { name: triggerName, description: trigger } = self.actions.trigger_cue
	assert.deepEqual([selectName, takeName, triggerName], ['Select a cue', 'Take a cue now', 'Play now, keep selection'])
	// A folder can be selected, and only selected: the page refuses the other two for it.
	const folders = {
		...self,
		panel: {
			rows: { ...rows(), rows: [...rows().rows, { id: 'fold_1', label: 'Part two', kind: 'folder', source: null }] },
			actions: null,
		},
	}
	UpdateActions(folders as unknown as ModuleInstance)
	const choices = (id: string) =>
		(folders.actions[id].options[0] as unknown as { choices: { id: string }[] }).choices.map((c) => c.id)
	assert.ok(choices('select_cue').includes('fold_1'))
	assert.ok(!choices('take_cue').includes('fold_1'))
	assert.ok(!choices('trigger_cue').includes('fold_1'))
	assert.match(select!, /Nothing airs: the Take key airs it/)
	assert.match(take!, /at once.*takes it off.*selection stays/)
	assert.match(trigger!, /at once.*restarts it.*selection and PREVIEW stay/)
	const { presets } = buildPresets('noacg', rows().rows)
	for (const [id, actionId] of [
		['select_cue_a', 'select_cue'],
		['take_cue_a', 'take_cue'],
		['trigger_cue_a', 'trigger_cue'],
	] as const)
		assert.deepEqual((presets[id] as CompanionSimplePresetDefinition<never>).steps, [
			{ down: [{ actionId, options: { row: 'cue_a' } }], up: [] },
		])
})

const pinnedKeys = (graphics: Record<string, unknown>[]) => {
	const built = buildPresets('noacg', [], offered(graphics))
	return keyNames(built, section(built, 'Pinned graphics')!.groups[0].keys).map((n) => n.replace(' (Score banner)', ''))
}

test('(3) a pinned score banner offers one key per control: its actions, not its figures as well', () => {
	assert.deepEqual(pinnedKeys([banner(DUEL)]), ['+1 P1', '+1 P2', '-1 P1', '-1 P2', 'Final', 'Reset 0-0'])
})

test('(3) a step no action covers keeps its key, so the set kept loses no control', () => {
	// src/templates/types/scoreboard.ts: a goal moves the score up with its flag, and only the step
	// corrects it down. A figure no event moves (a round) keeps both, as does a move of several figures.
	assert.deepEqual(
		pinnedKeys([
			banner([
				cap('event:goalA', 'Goal A'),
				cap('event:clearFlag', 'Clear flag'),
				cap('step:f1', 'Score A', { covered: [1] }),
				cap('step:f5', 'Round'),
			]),
		]),
		['Goal A', 'Clear flag', 'Score A -1', 'Round -1', 'Round +1'],
	)
})

test('(3) the imported score tracker: its rows read +1 and -1, so the key says which row, in place of the figure', () => {
	// src/templates/behaviours/score.ts: one section per team, named with the designer's word, and its
	// figure's field named by the designer too. Without its row name the +1 keys could not be told apart.
	const built = buildPresets(
		'noacg',
		[],
		offered([
			banner([
				cap('event:score1', '+1', { section: 'Player 1' }),
				cap('event:unscore1', '-1', { section: 'Player 1' }),
				cap('event:score2', '+1', { section: 'Player 2' }),
				cap('event:unscore2', '-1', { section: 'Player 2' }),
				cap('event:newGame', 'New game', { section: 'Board' }),
				cap('step:f1', 'Player 1 point', { covered: [1, -1] }),
				cap('step:f3', 'Player 2 point', { covered: [1, -1] }),
			]),
		]),
	)
	const ids = section(built, 'Pinned graphics')!.groups[0].keys
	assert.deepEqual(
		keyNames(built, ids).map((n) => n.replace(' (Score banner)', '')),
		['+1 Player 1', '-1 Player 1', '+1 Player 2', '-1 Player 2', 'New game'],
	)
	assert.equal((built.presets[ids[0]] as CompanionSimplePresetDefinition<never>).style.text, '+1\\nPlayer 1')
	// The Graphic action's list, where a silent correction is chosen, tells them apart the same way.
	assert.deepEqual(
		capChoices(
			offered([
				banner([
					cap('event:score1', '+1', { section: 'Player 1' }),
					cap('event:score2', '+1', { section: 'Player 2' }),
					cap('step:f1', 'Player 1 point', { covered: [1, -1] }),
				]),
			]),
		).map((c) => c.label),
		['+1 Player 1 (Score banner)', '+1 Player 2 (Score banner)', 'Player 1 point (Score banner)'],
	)
	assert.equal((built.presets[ids[4]] as CompanionSimplePresetDefinition<never>).style.text, 'New game')
	// A figure of that label is not a second control of that name: "Home" stays "Home".
	assert.deepEqual(
		pinnedKeys([banner([cap('event:home', 'Home', { section: 'Sides' }), cap('step:f1', 'Home')])]).map((n) =>
			n.replace(' (Score banner)', ''),
		),
		['Home', 'Home -1', 'Home +1'],
	)
})

test('(3) a control lifted out of its section still says which row, when the page sends it', () => {
	assert.deepEqual(
		pinnedKeys([
			banner([
				cap('event:score1', '+1', { place: 'pinned', section: 'Player 1' }),
				cap('event:score2', '+1', { place: 'more', section: 'Player 2' }),
			]),
		]),
		['+1 Player 1', '+1 Player 2'],
	)
})

test('(3) a graphic with actions and figures of its own loses nothing, and a page that says nothing keeps both', () => {
	// The fixture's scorebug and quiz: no action of theirs is declared to cover a figure.
	const built = buildPresets('noacg', [], readActions(offer()) as PanelActions)
	const pinned = section(built, 'Pinned graphics')!
	assert.deepEqual(
		pinned.groups.map((g) => keyNames(built, g.keys)),
		[
			[
				'+1 HOME (Scorebug)',
				'Start clock (Scorebug)',
				'Pause clock (Scorebug)',
				'Home -1 (Scorebug)',
				'Home +1 (Scorebug)',
			],
			['Reveal (Quiz)', 'Answer: Answer A (Quiz)', 'Answer: Answer B (Quiz)'],
		],
	)
})

test('a preset keeps its id when the list around it changes, so a Linked key never becomes another control', () => {
	// Companion 5.1 keeps a Linked key on its preset by id (Controls/ControlTypes/Button/PresetReference.ts).
	const idsByName = (graphics: Record<string, unknown>[]) => {
		const built = buildPresets('noacg', [], offered(graphics))
		return new Map(
			section(built, 'Pinned graphics')!.groups.flatMap((g) => g.keys.map((id) => [keyNames(built, [id])[0], id])),
		)
	}
	const strip = (covered?: number[]) =>
		banner([
			cap('event:goalA', 'Goal A'),
			cap('step:f1', 'Score A', covered ? { covered } : {}),
			cap('step:f3', 'Score B', covered ? { covered } : {}),
		])
	const before = idsByName([strip()])
	const after = idsByName([strip([1])])
	// Leaving out Score A +1 moves nothing else onto its id.
	assert.equal(after.get('Score B -1 (Score banner)'), before.get('Score B -1 (Score banner)'))
	assert.equal(after.get('Score A -1 (Score banner)'), before.get('Score A -1 (Score banner)'))
	assert.ok(![...after.values()].includes(before.get('Score A +1 (Score banner)')!))
	// Nor does another graphic pinned ahead of it, and two controls never share an id.
	const other = { ...strip(), graphic: 'Other' }
	assert.equal(idsByName([other, strip()]).get('Goal A (Score banner)'), before.get('Goal A (Score banner)'))
	assert.equal(new Set(before.values()).size, before.size)
	const picks = cap('event:choose', 'Answer', {
		options: [
			{ value: 'A', label: 'Same' },
			{ value: 'B', label: 'Other' },
		],
	})
	assert.equal(idsByName([banner([picks])]).size, 2)
})

test('(3) a step left out of the presets stays on offer: a key already on a deck keeps working', () => {
	const actions = offered([banner(DUEL)])
	assert.equal(capabilityState(actions, 'Score banner', 'step:f1').state, 'allowed')
	assert.deepEqual(actions.graphics[0].caps.find((c) => c.id === 'step:f1')!.covered, [1, -1])
	assert.equal(actions.graphics[0].caps.find((c) => c.id === 'event:pointA')!.covered, undefined)
	// Only a step of one is read, and a change of it redraws the presets.
	const odd = offered([banner([cap('step:f1', 'Score 1', { covered: [1, 5, '-1'] })])])
	assert.deepEqual(odd.graphics[0].caps[0].covered, [1])
	assert.notEqual(offerShape(actions), offerShape(offered([banner(DUEL.map((c) => ({ ...c, covered: undefined })))])))
	// A row's new name redraws them too, since the key reads it.
	assert.notEqual(
		offerShape(offered([banner([cap('event:score1', '+1', { section: 'Player 1' })])])),
		offerShape(offered([banner([cap('event:score1', '+1', { section: 'Home' })])])),
	)
})
