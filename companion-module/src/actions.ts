import type {
	CompanionActionDefinition,
	CompanionInputFieldDropdown,
	CompanionInputFieldTextInput,
	DropdownChoice,
} from '@companion-module/base'
import { VERB_NAMES, keyArgs, type PanelActions, type PanelVerb } from './protocol.js'
import type { PanelClient, PressOutcome } from './panel.js'
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
	graphic_action: { options: GraphicKeyOptions }
}

/** What a graphic key saves: its graphic and capability by name and id (never a label or a row),
 *  and its arguments. */
export type GraphicKeyOptions = { graphic: string; cap: string; option: string; delta: string; args: string }

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

/** PRESS A SAVED GRAPHIC KEY: its capability by the id it saved, with the arguments its options
 *  carry; arguments it cannot send are refused here and nothing goes. */
export async function pressGraphicKey(panel: PanelClient, o: Partial<GraphicKeyOptions>): Promise<PressOutcome> {
	const graphic = String(o.graphic ?? '')
	const cap = String(o.cap ?? '')
	const args = keyArgs(cap, o)
	return 'refused' in args
		? panel.pressAction(graphic, cap, {}, args.refused)
		: panel.pressAction(graphic, cap, args.args)
}

/** The graphics the answering page offers, for a key's graphic option. */
export function graphicChoices(actions: PanelActions | null): DropdownChoice<string>[] {
	return (actions?.graphics ?? []).map((g) => ({ id: g.graphic, label: g.graphic }))
}

/** Every capability offered, for a key's action option: by id, named with its graphics' labels. */
export function capChoices(actions: PanelActions | null): DropdownChoice<string>[] {
	const named = new Map<string, string[]>()
	for (const g of actions?.graphics ?? [])
		for (const c of g.caps) named.set(c.id, [...(named.get(c.id) ?? []), `${c.label} (${g.graphic})`])
	return [...named].map(([id, labels]) => ({ id, label: labels.join(', ') }))
}

/** The graphic key options every graphic key carries, so a saved key keeps its own values. */
export function graphicKeyOptions(actions: PanelActions | null): {
	graphic: CompanionInputFieldDropdown<'graphic', string>
	cap: CompanionInputFieldDropdown<'cap', string>
	option: CompanionInputFieldTextInput<'option'>
	delta: CompanionInputFieldDropdown<'delta', string>
	args: CompanionInputFieldTextInput<'args'>
} {
	const graphics = graphicChoices(actions)
	const caps = capChoices(actions)
	return {
		graphic: {
			id: 'graphic' as const,
			type: 'dropdown' as const,
			label: 'Graphic',
			choices: graphics,
			default: graphics[0]?.id ?? '',
			allowCustom: true,
			minChoicesForSearch: 8,
		},
		cap: {
			id: 'cap' as const,
			type: 'dropdown' as const,
			label: 'Action',
			choices: caps,
			default: caps[0]?.id ?? '',
			allowCustom: true,
			minChoicesForSearch: 8,
		},
		option: {
			id: 'option' as const,
			type: 'textinput' as const,
			label: 'Option (for a pick)',
			default: '',
			tooltip: "The option's value, as the production page names it.",
		},
		delta: {
			id: 'delta' as const,
			type: 'dropdown' as const,
			label: 'Step (for a number)',
			choices: [
				{ id: '1', label: '+1' },
				{ id: '-1', label: '-1' },
			],
			default: '1',
		},
		args: {
			id: 'args' as const,
			type: 'textinput' as const,
			label: 'Arguments (for an OGraf action)',
			default: '',
			tooltip: 'Empty sends the on-air cue\'s arguments, as the button on the page does. Or JSON, like {"team": 2}.',
		},
	}
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
		graphic_action: {
			name: 'Graphic action',
			description:
				'A live control of a graphic in the production, as its block on the production page draws it. Runs on the cue on air on that graphic.',
			options: Object.values(graphicKeyOptions(self.panel.actions)),
			callback: async (event) => {
				await self.pressAction(event.options)
			},
		},
	})
}
