import type {
	CompanionPresetDefinitions,
	CompanionPresetSection,
	CompanionPresetFeedback,
} from '@companion-module/base'
import type { PanelRow, PanelVerb } from './protocol.js'
import { ACTION_VERBS } from './actions.js'
import { AMBER, BLACK, DIM, GREEN, GREY, RED, WHITE, type FeedbacksSchema } from './feedbacks.js'
import { SELECTED } from './view.js'
import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'

type Feedback = CompanionPresetFeedback<FeedbacksSchema>
type Presets = CompanionPresetDefinitions<ModuleSchema>

const actionOf = (verb: PanelVerb) =>
	(Object.keys(ACTION_VERBS) as (keyof typeof ACTION_VERBS)[]).find((k) => ACTION_VERBS[k] === verb)!

/** The feedbacks every NoaCG key carries last, so a key never looks pressable when nothing would run it. */
function statusFeedbacks(label: string): Feedback[] {
	return [
		{ feedbackId: 'no_page', options: {}, style: { bgcolor: DIM, color: GREY, text: 'No operator page', size: '14' } },
		{
			feedbackId: 'offline',
			options: {},
			style: { bgcolor: DIM, color: GREY, text: `$(${label}:connection)`, size: '7' },
		},
	]
}

function verbFeedbacks(verb: PanelVerb, row = ''): Feedback[] {
	return [
		{ feedbackId: 'allowed', options: { verb, row }, isInverted: true, style: { color: GREY } },
		{ feedbackId: 'refused', options: { verb, row }, style: { bgcolor: AMBER, color: BLACK } },
	]
}

/**
 * The ready keys an operator drags onto the grid: the transport, the clip clock, and one Take and
 * one Select key per rundown row, rebuilt whenever the production's rows change.
 */
export function buildPresets(
	label: string,
	rows: readonly PanelRow[],
): { structure: CompanionPresetSection<ModuleSchema>[]; presets: Presets } {
	const presets: Presets = {}
	const v = (name: string) => `$(${label}:${name})`
	const key = (
		id: string,
		name: string,
		text: string,
		verb: PanelVerb,
		extra: Feedback[] = [],
		size: '14' | '18' | 'auto' = '18',
	) => {
		presets[id] = {
			type: 'simple',
			name,
			style: { text, size, color: WHITE, bgcolor: BLACK },
			steps: [{ down: [{ actionId: actionOf(verb), options: {} }], up: [] }],
			feedbacks: [...extra, ...verbFeedbacks(verb), ...statusFeedbacks(label)],
		}
	}
	key(
		'take',
		'Take (SPACE)',
		`TAKE\\n${v('selected')}`,
		'take',
		[
			{
				feedbackId: 'on_air',
				options: { row: SELECTED },
				style: { bgcolor: RED, color: WHITE, text: `TAKE OFF\\n${v('selected')}` },
			},
		],
		'14',
	)
	key('retake', 'Re-take', 'RE-TAKE', 'retake')
	key('update', 'Update', 'UPDATE', 'update')
	key('next', 'Next', 'NEXT', 'next')
	key('out', 'Out', 'OUT', 'out')
	key('select_prev', 'Previous cue', 'CUE\\nUP', 'select-prev')
	key('select_next', 'Next cue', 'CUE\\nDOWN', 'select-next')
	key('all_out', 'All out', 'ALL\\nOUT', 'all-out')
	key('pause_toggle', 'Pause or resume the clip', 'PAUSE\\nRESUME', 'pause-toggle')
	key('pause', 'Pause the clip', 'PAUSE', 'pause')
	key('resume', 'Resume the clip', 'RESUME', 'resume')

	presets['clip_clock'] = {
		type: 'simple',
		name: 'Clip clock (press: pause or resume)',
		style: { text: `${v('clip_name')}\\n${v('clip_left')}`, size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [{ actionId: 'pause_toggle', options: {} }], up: [] }],
		feedbacks: [
			{ feedbackId: 'clip_warning', options: {}, style: { bgcolor: AMBER, color: BLACK } },
			{ feedbackId: 'clip_final', options: { blink: true }, style: { bgcolor: RED, color: WHITE } },
			...statusFeedbacks(label),
		],
	}
	presets['status'] = {
		type: 'simple',
		name: 'Connection status',
		style: { text: v('connection'), size: '7', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [], up: [] }],
		feedbacks: statusFeedbacks(label),
	}

	const takeIds: string[] = []
	const selectIds: string[] = []
	for (const row of rows) {
		const name = row.kind === 'folder' ? `Folder: ${row.label}` : row.label
		const tally: Feedback[] = [
			{ feedbackId: 'selected', options: { row: row.id }, style: { bgcolor: GREEN, color: WHITE } },
			{ feedbackId: 'on_air', options: { row: row.id }, style: { bgcolor: RED, color: WHITE } },
		]
		for (const [verb, ids, prefix] of [
			['take-cue', takeIds, 'take'],
			['select-cue', selectIds, 'select'],
		] as const) {
			const id = `${prefix}_${row.id}`
			ids.push(id)
			presets[id] = {
				type: 'simple',
				name: `${verb === 'take-cue' ? 'Take' : 'Select'} ${name}`,
				style: { text: row.label, size: 'auto', color: WHITE, bgcolor: BLACK },
				steps: [
					{ down: [{ actionId: verb === 'take-cue' ? 'take_cue' : 'select_cue', options: { row: row.id } }], up: [] },
				],
				feedbacks: [...tally, ...verbFeedbacks(verb, row.id), ...statusFeedbacks(label)],
			}
		}
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'show',
			name: 'Show control',
			description: 'The operator page verb bar as keys. Keys go grey when the page would not run them.',
			definitions: ['take', 'retake', 'update', 'next', 'out', 'select_prev', 'select_next', 'all_out', 'status'],
		},
		{
			id: 'clip',
			name: 'Server clip',
			description: 'The clip clock counts down on the key and turns amber at 10 s and red at 5 s.',
			definitions: ['clip_clock', 'pause_toggle', 'pause', 'resume'],
		},
		{
			id: 'cues',
			name: 'Cues',
			description: rows.length
				? "One key per cue of this production's rundown: red on air, green selected."
				: 'The cues appear here once an operator page answers the panel.',
			definitions: [
				{ id: 'take_cues', type: 'simple', name: 'Take a cue', presets: takeIds },
				{ id: 'select_cues', type: 'simple', name: 'Select a cue', presets: selectIds },
			],
		},
	]
	return { structure, presets }
}

export function UpdatePresets(self: ModuleInstance): void {
	const { structure, presets } = buildPresets(self.label, self.panel.rows?.rows ?? [])
	self.setPresetDefinitions(structure, presets)
}
