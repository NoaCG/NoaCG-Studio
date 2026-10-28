import type {
	CompanionPresetDefinitions,
	CompanionPresetSection,
	CompanionPresetFeedback,
} from '@companion-module/base'
import type { PanelActions, PanelRow, PanelVerb } from './protocol.js'
import { ACTION_VERBS, type GraphicKeyOptions } from './actions.js'
import { AMBER, BLACK, DARK_AMBER, DIM, GREEN, GREY, RED, WHITE, type FeedbacksSchema } from './feedbacks.js'
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

/** What a graphic key shows: grey when its page would not run it, dark amber while it runs, amber
 *  when it failed or is not known, and dark with a question mark when its graphic no longer has it. */
function graphicFeedbacks(o: GraphicKeyOptions, text: string): Feedback[] {
	const key = { graphic: o.graphic, cap: o.cap }
	return [
		{ feedbackId: 'action_allowed', options: key, isInverted: true, style: { color: GREY } },
		{ feedbackId: 'action_outcome', options: { ...key, outcome: 'running' }, style: { bgcolor: DARK_AMBER } },
		{ feedbackId: 'action_outcome', options: { ...key, outcome: 'failed' }, style: { bgcolor: AMBER, color: BLACK } },
		{
			feedbackId: 'action_outcome',
			options: { ...key, outcome: 'unknown' },
			style: { bgcolor: AMBER, color: BLACK, text: `${text}\\n?` },
		},
		{ feedbackId: 'action_unknown', options: key, style: { bgcolor: DIM, color: GREY, text: `? ${text}` } },
	]
}

/**
 * THE PINNED GRAPHICS' LIVE CONTROLS AS KEYS (L1 AC-8): for each graphic pinned on the production's
 * pages, its block's controls in the block's order, a pick as one key per option and a number as
 * its -1 and +1. A pin decides only what is listed here: every graphic's actions stay pressable
 * through the Graphic action, and a saved key keeps working after its graphic is unpinned.
 */
export function graphicPresets(
	label: string,
	actions: PanelActions | null,
): { presets: Presets; groups: { id: string; name: string; ids: string[] }[] } {
	const presets: Presets = {}
	const groups: { id: string; name: string; ids: string[] }[] = []
	const pinned = (actions?.graphics ?? []).filter((g) => g.pinned)
	pinned.forEach((g, i) => {
		const ids: string[] = []
		const key = (text: string, name: string, o: GraphicKeyOptions, extra: Feedback[] = []) => {
			const id = `graphic_${i}_${ids.length}`
			ids.push(id)
			presets[id] = {
				type: 'simple',
				name: `${name} (${g.graphic})`,
				style: { text, size: 'auto', color: WHITE, bgcolor: BLACK },
				steps: [{ down: [{ actionId: 'graphic_action', options: o }], up: [] }],
				feedbacks: [...extra, ...graphicFeedbacks(o, text), ...statusFeedbacks(label)],
			}
		}
		const base = { graphic: g.graphic, option: '', delta: '1', args: '' }
		for (const c of g.caps) {
			if (c.kind === 'step') {
				key(`-1\\n${c.label}`, `${c.label} -1`, { ...base, cap: c.id, delta: '-1' })
				key(`+1\\n${c.label}`, `${c.label} +1`, { ...base, cap: c.id })
			} else if (c.options?.length) {
				for (const opt of c.options)
					key(`${opt.label}`, `${c.label}: ${opt.label}`, { ...base, cap: c.id, option: opt.value }, [
						{
							feedbackId: 'action_active',
							options: { graphic: g.graphic, cap: c.id, option: opt.value },
							style: { bgcolor: GREEN, color: WHITE },
						},
					])
			} else key(c.label, c.label, { ...base, cap: c.id })
		}
		groups.push({ id: `graphic_${i}`, name: g.graphic, ids })
	})
	return { presets, groups }
}

/**
 * The ready keys an operator drags onto the grid: the transport, the clip clock, one Take and one
 * Select key per rundown row, one Trigger key per cue, and the pinned graphics' live controls,
 * rebuilt whenever the production's rows or the graphics' controls change.
 */
export function buildPresets(
	label: string,
	rows: readonly PanelRow[],
	actions: PanelActions | null = null,
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
	key('update', 'Update', 'UPDATE', 'update', [], '14')
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
	const triggerIds: string[] = []
	for (const row of rows) {
		const name = row.kind === 'folder' ? `Folder: ${row.label}` : row.label
		const tally: Feedback[] = [
			{ feedbackId: 'selected', options: { row: row.id }, style: { bgcolor: GREEN, color: WHITE } },
			{ feedbackId: 'on_air', options: { row: row.id }, style: { bgcolor: RED, color: WHITE } },
		]
		// Trigger plays or restarts a cue by its own row id and leaves the selection alone; a folder
		// has nothing to play, so only cues get one.
		const keys = [
			{ verb: 'take-cue', ids: takeIds, prefix: 'take', title: 'Take', action: 'take_cue', text: row.label },
			{ verb: 'select-cue', ids: selectIds, prefix: 'select', title: 'Select', action: 'select_cue', text: row.label },
			...(row.kind === 'cue'
				? [
						{
							verb: 'trigger-cue',
							ids: triggerIds,
							prefix: 'trigger',
							title: 'Trigger',
							action: 'trigger_cue',
							text: `\u25B6 ${row.label}`,
						} as const,
					]
				: []),
		] as const
		for (const { verb, ids, prefix, title, action, text } of keys) {
			const id = `${prefix}_${row.id}`
			ids.push(id)
			presets[id] = {
				type: 'simple',
				name: `${title} ${name}`,
				style: { text, size: 'auto', color: WHITE, bgcolor: BLACK },
				steps: [{ down: [{ actionId: action, options: { row: row.id } }], up: [] }],
				feedbacks: [...tally, ...verbFeedbacks(verb, row.id), ...statusFeedbacks(label)],
			}
		}
	}

	const graphics = graphicPresets(label, actions)
	Object.assign(presets, graphics.presets)

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
				? "Take, Select and Trigger keys for each cue of this production's rundown: red on air, green selected."
				: 'The cues appear here once an operator page answers the panel.',
			definitions: [
				{ id: 'take_cues', type: 'simple', name: 'Take a cue', presets: takeIds },
				{ id: 'select_cues', type: 'simple', name: 'Select a cue', presets: selectIds },
				{ id: 'trigger_cues', type: 'simple', name: 'Trigger a cue', presets: triggerIds },
			],
		},
		{
			id: 'graphics',
			name: 'Pinned graphics',
			description: graphics.groups.length
				? "The live controls of each graphic pinned on the production page. They act on that graphic's cue on air."
				: 'Pin a graphic on the production page to list its live controls here.',
			definitions: graphics.groups.map((g) => ({ id: g.id, type: 'simple' as const, name: g.name, presets: g.ids })),
		},
	]
	return { structure, presets }
}

export function UpdatePresets(self: ModuleInstance): void {
	const { structure, presets } = buildPresets(self.label, self.panel.rows?.rows ?? [], self.panel.actions)
	self.setPresetDefinitions(structure, presets)
}
