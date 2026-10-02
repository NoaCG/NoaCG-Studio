import type { CompanionVariableDefinitions } from '@companion-module/base'
import type { PanelClient } from './panel.js'
import { clipClock, rowLabel } from './view.js'
import type ModuleInstance from './main.js'

export type VariablesSchema = Record<string, string | number>

const FIXED: Record<string, string> = {
	production: 'Production title',
	selected: 'Selected cue',
	on_air: 'Cues on air',
	clip_name: 'Clip on air',
	clip_left: 'Clip time left (m:ss; +m:ss past the end while holding)',
	clip_left_s: 'Clip time left in seconds',
	clip_phase: 'Clip clock: counting, warning, final, holding, paused, looping or none',
	answering: 'The page that answers the panel',
	connection: 'Connection status, in words',
	last_press: 'What happened to the last press',
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const defs: CompanionVariableDefinitions<VariablesSchema> = {}
	for (const [id, name] of Object.entries(FIXED)) defs[id] = { name }
	const rows = self.panel.rows?.rows ?? []
	rows.forEach((r, i) => (defs[`row_${i + 1}`] = { name: `Rundown row ${i + 1} (${r.kind})` }))
	self.setVariableDefinitions(defs)
}

/** Every variable's value now. Pure over the panel and the time, so a test can read it. */
export function variableValues(panel: PanelClient, now: number): VariablesSchema {
	const state = panel.state
	const rows = panel.rows
	const clock = clipClock(state, panel.stateAt, now)
	const values: VariablesSchema = {
		production: panel.title,
		selected: rowLabel(rows, state?.selected ?? null),
		on_air: (state?.live ?? []).map((id) => rowLabel(rows, id) || id).join(', '),
		clip_name: clock.label,
		clip_left: clock.text,
		clip_left_s: clock.seconds ?? '',
		clip_phase: clock.phase,
		answering: state ? state.label : '',
		connection: panel.status === 'ok' ? `Answered by ${state?.label || 'the operator page'}` : panel.note,
		last_press: panel.lastPress,
	}
	;(rows?.rows ?? []).forEach((r, i) => (values[`row_${i + 1}`] = r.label))
	return values
}
