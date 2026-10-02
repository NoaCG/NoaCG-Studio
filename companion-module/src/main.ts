import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_ADDRESS, GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions, variableValues, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { PanelClient, type PressOutcome, type Status } from './panel.js'
import { SupabaseRelay, discoverBackend, type Relay } from './relay.js'
import type { PanelVerb } from './protocol.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const COMPANION_STATUS: Record<Status, InstanceStatus> = {
	pairing: InstanceStatus.BadConfig,
	connecting: InstanceStatus.Connecting,
	ok: InstanceStatus.Ok,
	'no-page': InstanceStatus.UnknownWarning,
	revoked: InstanceStatus.AuthenticationFailure,
	offline: InstanceStatus.ConnectionFailure,
	outdated: InstanceStatus.UnknownError,
}

/** How often the clock, a blinking final key and a refused flash are redrawn. */
const TICK_MS = 250

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	secrets: ModuleSecrets = { key: '' }
	panel: PanelClient = new PanelClient({ relay: idleRelay() })
	#relay: Relay | null = null
	#tick: ReturnType<typeof setInterval> | null = null
	#shownRows = -1
	#shownValues: VariablesSchema = {}
	/** What the running panel was started with, so saving the key after pairing does not restart it. */
	#running = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.#defineAll()
		this.#tick = setInterval(() => this.#redraw(true), TICK_MS)
		await this.configUpdated(config, secrets)
	}

	async destroy(): Promise<void> {
		if (this.#tick) clearInterval(this.#tick)
		await this.#teardown()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = {
			code: config.code ?? '',
			name: config.name ?? 'Companion',
			address: config.address || DEFAULT_ADDRESS,
		}
		this.secrets = { key: secrets?.key ?? '' }
		const running = JSON.stringify([this.secrets.key, this.config.address, this.config.name])
		if (running === this.#running && !this.config.code.trim()) return
		this.#running = running
		await this.#teardown()
		if (!this.secrets.key && !this.config.code.trim()) {
			this.panel = new PanelClient({ relay: idleRelay(), onChange: () => this.#redraw(false) })
			await this.panel.start({ key: '', code: '', label: '' })
			return
		}
		let relay: Relay
		try {
			relay = new SupabaseRelay(await discoverBackend(this.config.address))
		} catch (err) {
			this.#running = ''
			this.updateStatus(InstanceStatus.ConnectionFailure, (err as Error).message)
			return
		}
		this.#relay = relay
		this.panel = new PanelClient({
			relay,
			onChange: () => this.#redraw(false),
			onPaired: (key) => {
				this.config = { ...this.config, code: '' }
				this.secrets = { key }
				this.#running = JSON.stringify([key, this.config.address, this.config.name])
				this.saveConfig(this.config, this.secrets)
			},
			log: (level, message) => this.log(level, message),
		})
		await this.panel.start({ key: this.secrets.key, code: this.config.code, label: this.config.name })
	}

	async #teardown(): Promise<void> {
		await this.panel.stop()
		await this.#relay?.close()
		this.#relay = null
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** An action's callback: press, and log what happened. */
	async press(verb: PanelVerb, row = ''): Promise<PressOutcome> {
		const outcome = await this.panel.press(verb, row)
		if (!outcome.ok) this.log('info', `${verb}${row ? ` ${row}` : ''}: ${outcome.sentence}`)
		return outcome
	}

	#defineAll(): void {
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdateVariableDefinitions(this)
		UpdatePresets(this)
	}

	/** Push what changed to Companion. The tick only redraws what time moves: the clock, blinks and flashes. */
	#redraw(tick: boolean): void {
		const rowsVer = this.panel.rows?.rowsVer ?? -1
		if (rowsVer !== this.#shownRows) {
			this.#shownRows = rowsVer
			this.#defineAll()
		}
		const values = variableValues(this.panel, Date.now())
		const changed: Partial<VariablesSchema> = {}
		for (const [k, val] of Object.entries(values)) if (this.#shownValues[k] !== val) changed[k] = val
		if (Object.keys(changed).length) this.setVariableValues(changed)
		this.#shownValues = values
		if (tick) {
			this.checkFeedbacks('clip_warning', 'clip_final', 'refused')
			return
		}
		this.updateStatus(COMPANION_STATUS[this.panel.status], this.panel.note)
		this.checkAllFeedbacks()
	}
}

/** The relay before a backend is known: everything refuses, nothing is reached. */
function idleRelay(): Relay {
	const fail = async () => Promise.reject(new Error('Not configured'))
	return { pairFinish: fail, hello: fail, press: fail, listen: () => () => {}, close: async () => Promise.resolve() }
}
