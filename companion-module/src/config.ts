import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	code: string
	name: string
	address: string
}

export type ModuleSecrets = {
	key: string
}

export const DEFAULT_ADDRESS = 'https://noacg.studio'

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'intro',
			label: 'Pairing',
			width: 12,
			value:
				'On the NoaCG production page, open Panels and press "Pair a panel". Type the code it shows below and save. The code works once, for five minutes.',
		},
		{
			type: 'textinput',
			id: 'code',
			label: 'Pairing code',
			width: 6,
			default: '',
			tooltip: 'Eight letters and digits, like ABCD-EFGH. Cleared once the panel is paired.',
		},
		{
			type: 'textinput',
			id: 'name',
			label: 'Panel name',
			width: 6,
			default: 'Companion',
			tooltip: 'How the production page lists this panel.',
		},
		{
			type: 'secret-text',
			id: 'key',
			label: 'Panel key',
			width: 12,
			default: '',
			tooltip: 'Filled in by pairing. To pair again, clear it and type a new code.',
		},
		{
			type: 'textinput',
			id: 'address',
			label: 'NoaCG address',
			width: 12,
			default: DEFAULT_ADDRESS,
			tooltip: 'Change this only for a self-hosted NoaCG.',
		},
	]
}
