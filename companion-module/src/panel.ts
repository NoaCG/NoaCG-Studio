import {
	PROTOCOL,
	SELECTED_ROW_VERBS,
	outcomeSentence,
	readBeat,
	readResult,
	readRows,
	readState,
	refusalSentence,
	versionOf,
	type PanelRows,
	type PanelState,
	type PanelVerb,
	type Press,
	type PressResult,
} from './protocol.js'
import type { ListenStatus, Relay } from './relay.js'

/** The time functions the panel uses, so a test can drive them. */
export interface Clock {
	now(): number
	setTimeout(fn: () => void, ms: number): unknown
	clearTimeout(handle: unknown): void
}

export const systemClock: Clock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

/** Where the connection stands (protocol §7.2). */
export type Status = 'pairing' | 'connecting' | 'ok' | 'no-page' | 'revoked' | 'offline' | 'outdated'

/** No `state` or `beat` for this long means no operator page (protocol §7.2). */
export const SILENCE_MS = 12_000
/** How long a press waits for the page's `result`. */
export const RESULT_MS = 1_500
/** How long a refused key flashes. */
export const FLASH_MS = 1_200
/** The rejoin backoff, then every 8 s. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000]

export interface PressOutcome {
	ok: boolean
	sentence: string
	result?: PressResult
}

export interface Flash {
	verb: PanelVerb
	row: string
	until: number
}

export interface PanelOptions {
	relay: Relay
	clock?: Clock
	/** Mints this run's press-id prefix; a test passes a fixed one. */
	instance?: string
	/** Called after a pairing code was exchanged: save the key, clear the code. */
	onPaired?: (key: string) => void
	/** Called whenever anything a key or variable shows may have changed. */
	onChange?: () => void
	log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
}

function mintInstance(): string {
	const a = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let s = ''
	for (let i = 0; i < 12; i++) s += a[Math.floor(Math.random() * a.length)]
	return s
}

/**
 * ONE PANEL'S CONNECTION TO A NOACG PRODUCTION: pairing, hello, the feedback topic, and presses.
 * It knows nothing about Companion; `main.ts` turns what it holds into keys and variables.
 *
 * It never queues a press. A press that cannot go now is refused with a sentence, and one that
 * went but was not answered in 1.5 s says so; the page refuses a repeated id, so the one retry
 * after a network error can never run twice.
 */
export class PanelClient {
	readonly #relay: Relay
	readonly #clock: Clock
	readonly #instance: string
	readonly #opts: PanelOptions

	#key = ''
	#status: Status = 'pairing'
	#note = 'Pair in the connection settings with the code the production page shows'
	#title = ''
	#topic = ''
	#leave: (() => void) | null = null
	#state: PanelState | null = null
	#stateAt = 0
	#rows: PanelRows | null = null
	#heardAt = 0
	#counter = 0
	#attempt = 0
	#retryTimer: unknown = null
	#silenceTimer: unknown = null
	#helloBusy = false
	#helloAgain = false
	#stopped = false
	#waits = new Map<string, (r: PressResult) => void>()
	#flash: Flash | null = null
	#lastPress = ''

	constructor(opts: PanelOptions) {
		this.#opts = opts
		this.#relay = opts.relay
		this.#clock = opts.clock ?? systemClock
		this.#instance = opts.instance ?? mintInstance()
	}

	get status(): Status {
		return this.#status
	}
	/** The sentence the connection variable and the status key show. */
	get note(): string {
		return this.#note
	}
	get title(): string {
		return this.#state?.title || this.#title
	}
	get state(): PanelState | null {
		return this.#status === 'ok' ? this.#state : null
	}
	/** The last state's receive time on this machine, for the clock (protocol §7.4). */
	get stateAt(): number {
		return this.#stateAt
	}
	get rows(): PanelRows | null {
		return this.#rows
	}
	get flash(): Flash | null {
		return this.#flash && this.#flash.until > this.#clock.now() ? this.#flash : null
	}
	get lastPress(): string {
		return this.#lastPress
	}

	#set(status: Status, note: string): void {
		this.#status = status
		this.#note = note
		this.#opts.onChange?.()
	}

	/** Start, or restart after the config changed. */
	async start(config: { key: string; code: string; label: string }): Promise<void> {
		this.#stopped = false
		this.#key = config.key.trim()
		const code = config.code.replace(/[\s-]/g, '').toUpperCase()
		if (!this.#key && code) {
			this.#set('pairing', 'Pairing...')
			let answer
			try {
				answer = await this.#relay.pairFinish(code, config.label.trim() || 'Companion')
			} catch (err) {
				this.#set('offline', `NoaCG offline: ${(err as Error).message}`)
				return
			}
			if (!answer.ok) {
				this.#set('pairing', refusalSentence(answer.refused, answer.note))
				return
			}
			this.#key = answer.key
			this.#title = answer.title
			this.#opts.onPaired?.(answer.key)
		}
		if (!this.#key) {
			this.#set('pairing', 'Pair in the connection settings with the code the production page shows')
			return
		}
		this.#set('connecting', 'Connecting to NoaCG...')
		await this.#hello()
	}

	async stop(): Promise<void> {
		this.#stopped = true
		this.#clock.clearTimeout(this.#retryTimer)
		this.#clock.clearTimeout(this.#silenceTimer)
		this.#leave?.()
		this.#leave = null
		this.#topic = ''
		for (const resolve of this.#waits.values())
			resolve({ v: PROTOCOL, id: '', panel: '', outcome: 'not-here', note: 'Stopped' })
		this.#waits.clear()
	}

	/** Ask the cloud who we are and where to listen. One at a time; a request during one runs once after. */
	async #hello(): Promise<void> {
		if (this.#stopped || !this.#key) return
		if (this.#helloBusy) {
			this.#helloAgain = true
			return
		}
		this.#helloBusy = true
		try {
			let answer
			try {
				answer = await this.#relay.hello(this.#key)
			} catch (err) {
				this.#set('offline', `NoaCG offline: ${(err as Error).message}`)
				this.#retryLater()
				return
			}
			if (this.#stopped) return
			if (!answer.ok) {
				this.#leaveTopic()
				this.#state = null
				// Hosted control switched off for the production's account: no page can answer, and
				// one may again later, so ask again on the backoff.
				if (answer.refused === 'no-page') {
					this.#noPage()
					this.#retryLater()
					return
				}
				this.#set(
					answer.refused === 'unknown-key' || answer.refused === 'revoked' ? 'revoked' : 'offline',
					refusalSentence(answer.refused, answer.note),
				)
				return
			}
			this.#attempt = 0
			this.#title = answer.title
			if (answer.feedback_topic !== this.#topic) this.#join(answer.feedback_topic)
			if (!answer.answering) this.#noPage()
			else if (this.#status !== 'ok') {
				// The answering page republishes on our hello; until its state lands, wait for it.
				this.#set('connecting', 'Waiting for the operator page...')
				this.#heardAt = this.#clock.now()
				this.#armSilence()
			}
		} finally {
			this.#helloBusy = false
			if (this.#helloAgain) {
				this.#helloAgain = false
				void this.#hello()
			}
		}
	}

	#retryLater(): void {
		this.#clock.clearTimeout(this.#retryTimer)
		const ms = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)]
		this.#attempt++
		this.#retryTimer = this.#clock.setTimeout(() => void this.#hello(), ms)
	}

	#join(topic: string): void {
		this.#leaveTopic()
		this.#topic = topic
		this.#leave = this.#relay.listen(
			topic,
			(event, payload) => this.#onEvent(topic, event, payload),
			(s) => this.#onListen(topic, s),
		)
	}

	#leaveTopic(): void {
		this.#leave?.()
		this.#leave = null
		this.#topic = ''
	}

	#onListen(topic: string, s: ListenStatus): void {
		if (topic !== this.#topic || this.#stopped) return
		// A rejoined channel may have missed a state: ask again, which also makes the page republish.
		if (s === 'joined') void this.#hello()
		else {
			this.#set('offline', 'NoaCG offline: the live connection dropped. Reconnecting...')
			this.#leaveTopic()
			this.#retryLater()
		}
	}

	#noPage(): void {
		this.#clock.clearTimeout(this.#silenceTimer)
		this.#state = null
		this.#set('no-page', 'No operator page')
	}

	#armSilence(): void {
		this.#clock.clearTimeout(this.#silenceTimer)
		this.#silenceTimer = this.#clock.setTimeout(() => {
			if (this.#stopped) return
			if (this.#clock.now() - this.#heardAt >= SILENCE_MS) this.#noPage()
			else this.#armSilence()
		}, SILENCE_MS)
	}

	#heard(): void {
		this.#heardAt = this.#clock.now()
		this.#armSilence()
	}

	#onEvent(topic: string, event: string, payload: unknown): void {
		if (topic !== this.#topic || this.#stopped) return
		const v = versionOf(payload)
		if (v !== null && v !== PROTOCOL) {
			this.#set('outdated', 'Update the NoaCG module: the production speaks a newer panel protocol')
			return
		}
		switch (event) {
			case 'state': {
				const state = readState(payload)
				if (!state) return
				// A state from an older claim is a page that has since been replaced.
				if (this.#state && state.claim < this.#state.claim) return
				this.#state = state
				this.#stateAt = this.#clock.now()
				this.#heard()
				if (this.#status !== 'ok') this.#set('ok', `Answered by ${state.label || 'the operator page'}`)
				else this.#opts.onChange?.()
				return
			}
			case 'rows': {
				const rows = readRows(payload)
				if (!rows) return
				this.#rows = rows
				this.#opts.onChange?.()
				return
			}
			case 'beat': {
				const beat = readBeat(payload)
				if (!beat) return
				const s = this.#state
				if (s && beat.claim < s.claim) return
				this.#heard()
				// A beat ahead of what we hold means we missed a message: hello makes the page resend.
				if (!s || beat.claim !== s.claim || beat.ver > s.ver || beat.rowsVer > (this.#rows?.rowsVer ?? -1))
					void this.#hello()
				return
			}
			case 'gone': {
				const beat = readBeat(payload)
				if (beat && this.#state && beat.claim === this.#state.claim) {
					this.#noPage()
				}
				return
			}
			case 'moved':
				void this.#hello()
				return
			case 'result': {
				const result = readResult(payload)
				if (!result) return
				this.#waits.get(result.id)?.(result)
				return
			}
		}
	}

	/** What a key acts on: the row it showed (spec, protocol §7.3). */
	targetOf(verb: PanelVerb, row = ''): string {
		const s = this.#state
		if (verb === 'select-cue' || verb === 'take-cue' || verb === 'trigger-cue') return row
		if (verb === 'pause-toggle') return s?.clip?.cue ?? ''
		if (SELECTED_ROW_VERBS.includes(verb)) return s?.selected ?? ''
		return ''
	}

	/** Press a verb. Resolves when the page answered, or with the reason it was not run. */
	async press(verb: PanelVerb, row = ''): Promise<PressOutcome> {
		const refused = (sentence: string, result?: PressResult): PressOutcome => {
			this.#flash = { verb, row, until: this.#clock.now() + FLASH_MS }
			this.#lastPress = sentence
			this.#opts.onChange?.()
			return { ok: false, sentence, ...(result ? { result } : {}) }
		}
		if (this.#status !== 'ok' || !this.#state) return refused(this.#note)
		if ((verb === 'select-cue' || verb === 'take-cue' || verb === 'trigger-cue') && !row)
			return refused('Choose a cue for this key')
		const press: Press = {
			verb,
			target: this.targetOf(verb, row),
			seen: this.#state.ver,
			id: `${this.#instance}:${++this.#counter}`,
		}
		const answered = new Promise<PressResult | null>((resolve) => {
			const timer = this.#clock.setTimeout(() => {
				this.#waits.delete(press.id)
				resolve(null)
			}, RESULT_MS)
			this.#waits.set(press.id, (r) => {
				this.#clock.clearTimeout(timer)
				this.#waits.delete(press.id)
				resolve(r)
			})
		})
		let answer
		try {
			answer = await this.#relay.press(this.#key, press)
		} catch {
			// One retry, same id: the page drops an id it has already run.
			try {
				answer = await this.#relay.press(this.#key, press)
			} catch (err) {
				this.#waits.get(press.id)?.({ v: PROTOCOL, id: press.id, panel: '', outcome: 'not-here' })
				return refused(`NoaCG offline: ${(err as Error).message}`)
			}
		}
		if (!answer.ok) {
			this.#waits.get(press.id)?.({ v: PROTOCOL, id: press.id, panel: '', outcome: 'not-here' })
			if (answer.refused === 'no-page') {
				this.#noPage()
			} else if (answer.refused === 'revoked' || answer.refused === 'unknown-key') {
				this.#state = null
				this.#leaveTopic()
				this.#set('revoked', refusalSentence(answer.refused))
			}
			return refused(refusalSentence(answer.refused, answer.note))
		}
		const result = await answered
		if (!result) return refused('No answer from the operator page')
		if (result.outcome !== 'ran') return refused(outcomeSentence(result), result)
		this.#lastPress = outcomeSentence(result)
		this.#opts.onChange?.()
		return { ok: true, sentence: this.#lastPress, result }
	}
}
