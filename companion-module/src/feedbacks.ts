import type { DropdownChoice } from '@companion-module/base'
import { PANEL_VERBS, VERB_NAMES, type PanelVerb } from './protocol.js'
import { SELECTED, clipClock, isAllowed, isOnAir, isSelected, resolveRow } from './view.js'
import { rowChoices } from './actions.js'
import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	on_air: { type: 'boolean'; options: { row: string } }
	selected: { type: 'boolean'; options: { row: string } }
	allowed: { type: 'boolean'; options: { verb: string; row: string } }
	clip_warning: { type: 'boolean'; options: Record<string, never> }
	clip_final: { type: 'boolean'; options: { blink: boolean } }
	no_page: { type: 'boolean'; options: Record<string, never> }
	offline: { type: 'boolean'; options: Record<string, never> }
	refused: { type: 'boolean'; options: { verb: string; row: string } }
}

/** Broadcast tally colours: program red, preview green, the warning amber. */
export const RED = 0xcc0000
export const GREEN = 0x008a3e
export const AMBER = 0xe08a00
export const DIM = 0x333333
export const GREY = 0x808080
export const WHITE = 0xffffff
export const BLACK = 0x000000

const VERB_CHOICES: DropdownChoice<string>[] = PANEL_VERBS.map((v) => ({ id: v, label: VERB_NAMES[v] }))

export function UpdateFeedbacks(self: ModuleInstance): void {
	const rows = rowChoices(self)
	const rowOrSelected = {
		id: 'row' as const,
		type: 'dropdown' as const,
		label: 'Cue',
		choices: [{ id: SELECTED, label: 'The selected cue' }, ...rows],
		default: SELECTED,
		allowCustom: true,
		minChoicesForSearch: 8,
	}
	const forRow = {
		...rowOrSelected,
		label: 'Cue (for Select a cue and Take a cue)',
		choices: [{ id: '', label: 'None' }, ...rows],
		default: '',
	}
	const now = () => Date.now()
	self.setFeedbackDefinitions({
		on_air: {
			type: 'boolean',
			name: 'Cue is on air',
			description: 'The cue is on air, as the answering page shows it.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [rowOrSelected],
			callback: (fb) => isOnAir(self.panel.state, String(fb.options.row)),
		},
		selected: {
			type: 'boolean',
			name: 'Cue is selected',
			description: 'The cue is the one selected on the answering page (what PREVIEW shows).',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [{ ...rowOrSelected, choices: rows, default: rows[0]?.id ?? '' }],
			callback: (fb) => isSelected(self.panel.state, String(fb.options.row)),
		},
		allowed: {
			type: 'boolean',
			name: 'Action is allowed now',
			description: 'The answering page would run this action now: its own button is enabled.',
			defaultStyle: { color: WHITE },
			showInvert: true,
			options: [{ id: 'verb', type: 'dropdown', label: 'Action', choices: VERB_CHOICES, default: 'take' }, forRow],
			callback: (fb) =>
				isAllowed(self.panel.state, self.panel.rows, String(fb.options.verb) as PanelVerb, String(fb.options.row)),
		},
		clip_warning: {
			type: 'boolean',
			name: 'Clip: last 10 seconds',
			description: 'The server clip on air has 10 seconds or less left (and more than 5).',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [],
			callback: () => clipClock(self.panel.state, self.panel.stateAt, now()).phase === 'warning',
		},
		clip_final: {
			type: 'boolean',
			name: 'Clip: last 5 seconds',
			description: 'The server clip on air has 5 seconds or less left.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [{ id: 'blink', type: 'checkbox', label: 'Blink', default: true }],
			callback: (fb) => {
				if (clipClock(self.panel.state, self.panel.stateAt, now()).phase !== 'final') return false
				return !fb.options.blink || Math.floor(now() / 500) % 2 === 0
			},
		},
		no_page: {
			type: 'boolean',
			name: 'No operator page',
			description: 'No operator page answers the panel: presses are refused.',
			defaultStyle: { bgcolor: DIM, color: GREY, text: 'No operator page', size: '14' },
			options: [],
			callback: () => self.panel.status === 'no-page',
		},
		offline: {
			type: 'boolean',
			name: 'Not connected',
			description: 'Not paired, revoked, offline, or the module needs an update.',
			defaultStyle: { bgcolor: DIM, color: GREY },
			options: [],
			callback: () => self.panel.status !== 'ok' && self.panel.status !== 'no-page',
		},
		refused: {
			type: 'boolean',
			name: 'Press was refused',
			description: 'Flashes for a moment when a press of this action was refused or not answered.',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [{ id: 'verb', type: 'dropdown', label: 'Action', choices: VERB_CHOICES, default: 'take' }, forRow],
			callback: (fb) => {
				const f = self.panel.flash
				if (!f || f.verb !== fb.options.verb) return false
				return !fb.options.row || resolveRow(self.panel.state, String(fb.options.row)) === f.row
			},
		},
	})
}
