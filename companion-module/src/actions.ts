import type { CompanionActionDefinition, DropdownChoice } from '@companion-module/base'
import { VERB_NAMES, type PanelVerb } from './protocol.js'
import type ModuleInstance from './main.js'

/** Companion action ids are the verbs with underscores. */
export const ACTION_VERBS = {
	take: 'take',
	retake: 'retake',
	update: 'update',
	next: 'next',
	out: 'out',
	select_prev: 'select-prev',
	select_next: 'select-next',
	pause: 'pause',
	resume: 'resume',
	pause_toggle: 'pause-toggle',
	all_out: 'all-out',
} as const satisfies Record<string, PanelVerb>

type PlainAction = keyof typeof ACTION_VERBS

export type ActionsSchema = { [K in PlainAction]: { options: Record<string, never> } } & {
	select_cue: { options: { row: string } }
	take_cue: { options: { row: string } }
	trigger_cue: { options: { row: string } }
}

const DESCRIPTIONS: Partial<Record<PanelVerb, string>> = {
	take: 'The SPACE key on the answering page: takes the selected cue, or takes it off when it is on air.',
	'all-out': 'Takes everything off air, like the header button on the production page.',
	'take-cue': 'Airs this cue whatever the SPACE mode; pressed while it is on air, takes it off.',
	'trigger-cue': 'Plays or restarts this cue, preserving selection and preview. Does not start a rundown sequence.',
	'select-cue': 'Moves the selection to this cue. Nothing airs.',
}

export function rowChoices(self: ModuleInstance): DropdownChoice<string>[] {
	const rows = self.panel.rows?.rows ?? []
	return rows.map((r) => ({ id: r.id, label: r.kind === 'folder' ? `Folder: ${r.label}` : r.label }))
}

export function UpdateActions(self: ModuleInstance): void {
	const choices = rowChoices(self)
	const plain = {} as Record<PlainAction, CompanionActionDefinition<Record<string, never>>>
	for (const id of Object.keys(ACTION_VERBS) as PlainAction[]) {
		const verb = ACTION_VERBS[id]
		plain[id] = {
			name: VERB_NAMES[verb],
			description: DESCRIPTIONS[verb],
			options: [],
			callback: async () => {
				await self.press(verb)
			},
		}
	}
	const rowOption = {
		id: 'row' as const,
		type: 'dropdown' as const,
		label: 'Cue',
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: true,
		minChoicesForSearch: 8,
	}
	self.setActionDefinitions({
		...plain,
		select_cue: {
			name: VERB_NAMES['select-cue'],
			description: DESCRIPTIONS['select-cue'],
			options: [rowOption],
			callback: async (event) => {
				await self.press('select-cue', String(event.options.row))
			},
		},
		take_cue: {
			name: VERB_NAMES['take-cue'],
			description: DESCRIPTIONS['take-cue'],
			options: [rowOption],
			callback: async (event) => {
				await self.press('take-cue', String(event.options.row))
			},
		},
		trigger_cue: {
			name: VERB_NAMES['trigger-cue'],
			description: DESCRIPTIONS['trigger-cue'],
			options: [
				{
					...rowOption,
					choices: choices.filter((c) => self.panel.rows?.rows.some((r) => r.id === c.id && r.kind === 'cue')),
				},
			],
			callback: async (event) => {
				await self.press('trigger-cue', String(event.options.row))
			},
		},
	})
}
