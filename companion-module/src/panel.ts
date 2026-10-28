import {
	ACTIONS_PROTOCOL,
	ACTION_VERB,
	PROTOCOL,
	SELECTED_ROW_VERBS,
	capabilityState,
	outcomeSentence,
	readActions,
	readSettled,
	settledSentence,
	readBeat,
	readResult,
	readRows,
	readState,
	refusalSentence,
	versionOf,
	type ActionPress,
	type PanelActions,
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
/** What the last-press variable says while a press waits for the page's answer. */
export const PENDING_SENTENCE = 'Sent, waiting for the operator page'
/** What a graphic action says once the page ran it and before it said what it came to. */
export const RUNNING_SENTENCE = 'Running on the graphic'
/** How long a graphic action that ran waits to say what it came to (the page's longest wait for
 *  the press before it on its graphic, its send and the attempt after it, with room). */
export const SETTLE_MS = 15_000
/** What it says when that wait passes: dispatched, outcome not known. Never sent again. */
export const UNSETTLED_SENTENCE = 'Not confirmed: the operator page did not say what it came to'

/** At most this many graphic actions wait for their `settled` at once. */
const UNSETTLED_MAX = 64

/** How long a refused key flashes. */
export const FLASH_MS = 1_200
/** The rejoin backoff, then every 8 s. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000]

/** What a graphic key's last press came to, as its key shows it: on its way (`running`), done, not
 *  known (`unknown`: it may have run, and is never sent again), or refused or failed. */
export type KeyOutcome = 'running' | 'done' | 'unknown' | 'failed'

/** How long a key shows done or failed; running lasts until it settles, unknown until its next press. */
export const OUTCOME_MS = 2_000

export interface PressOutcome {
	ok: boolean
	sentence: string
	result?: PressResult
}

export interface Flash {
	verb: PanelVerb | typeof ACTION_VERB
	/** The row a cue key acts on; for a graphic action, `<graphic>/<capability id>`. */
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
	/** The graphic actions the answering page offers, for its claim; null when none were heard. */
	#actions: PanelActions | null = null
	/** The answering page speaks a newer actions protocol than this module. */
	#actionsNewer = false
	/** Graphic actions that ran and have not said what they came to. */
	#unsettled = new Map<string, number>()
	/** What graphic actions came to, by press id, once said: a press whose own answers come late
	 *  reads this rather than "no answer". Bounded like `#unsettled`. */
	#settledSaid = new Map<string, string>()
	/** Each graphic key's last outcome (`<graphic>/<capability id>`), and the press it belongs to. */
	#keyOutcomes = new Map<string, { outcome: KeyOutcome; id: string; until: number }>()
	/** The graphic key whose press was refused before it went, while it shows so. */
	#refusedHere: { row: string; until: number } | null = null
	/** The key each graphic-action press still waited for was made on: an entry lives exactly as long
	 *  as the press's place in `#unsettled`, so it is bounded by that. */
	#pressKeys = new Map<string, string>()
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
	/** The newest press made; only it may write the last-press sentence. */
	#pressSeq = 0

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
	/** The graphic actions offered now, only while connected and only for the page that answers. */
	get actions(): PanelActions | null {
		const s = this.state
		return s && this.#actions && this.#actions.claim === s.claim ? this.#actions : null
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
	/** Why graphic actions cannot be pressed at all now, or '' when they can. */
	get actionsNote(): string {
		if (this.#status !== 'ok') return this.#note
		if (this.#actionsNewer) return "Update the NoaCG module to press this production's graphic actions"
		const a = this.actions
		if (!a) return 'No graphic actions from the operator page'
		if (!a.relay) return 'Graphic actions wait for a NoaCG server update'
		return ''
	}
	/** What the last press of a graphic key came to, while its key shows it. */
	keyOutcome(graphic: string, cap: string): KeyOutcome | null {
		// A press refused before it went shows failed briefly over whatever the key's last sent press shows.
		const here = this.#refusedHere
		if (here && here.row === `${graphic}/${cap}` && here.until > this.#clock.now()) return 'failed'
		const k = this.#keyOutcomes.get(`${graphic}/${cap}`)
		return k && k.until > this.#clock.now() ? k.outcome : null
	}

	/** A press is no longer waited for: its key shows `outcome` (when given), and it is forgotten. */
	#settle(id: string, outcome: KeyOutcome | null): void {
		if (outcome) this.#keyOutcome(id, outcome)
		this.#unsettled.delete(id)
		this.#pressKeys.delete(id)
	}

	/** What a key shows, kept for at most UNSETTLED_MAX keys: shown ones expire, the oldest go first. */
	#setOutcome(key: string, k: { outcome: KeyOutcome; id: string; until: number }): void {
		// A key keeps its place when it is written again: the bound drops the longest-held key.
		this.#keyOutcomes.set(key, k)
		const now = this.#clock.now()
		for (const [row, held] of this.#keyOutcomes)
			if (held.until <= now || this.#keyOutcomes.size > UNSETTLED_MAX) this.#keyOutcomes.delete(row)
	}

	#keyOutcome(id: string, outcome: KeyOutcome): void {
		const key = this.#pressKeys.get(id)
		if (key === undefined) return
		// Only the key's newest press writes what it shows.
		const held = this.#keyOutcomes.get(key)
		if (!held || held.id !== id) return
		const until = outcome === 'done' || outcome === 'failed' ? this.#clock.now() + OUTCOME_MS : Infinity
		this.#setOutcome(key, { outcome, id, until })
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
		// A new topic's page says its own offer; the last topic's is not carried over.
		this.#actions = null
		this.#actionsNewer = false
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
		this.#actions = null
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
				const actions = this.#actions && this.#actions.claim === beat.claim ? this.#actions.actionsVer : -1
				if (
					!s ||
					beat.claim !== s.claim ||
					beat.ver > s.ver ||
					beat.rowsVer > (this.#rows?.rowsVer ?? -1) ||
					// An offer this module cannot read is not missed: asking again would only repeat it.
					(!this.#actionsNewer && beat.actionsVer !== undefined && beat.actionsVer > actions)
				)
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
			case 'actions': {
				const actions = readActions(payload)
				if (actions === 'newer') {
					this.#actions = null
					this.#actionsNewer = true
					this.#opts.onChange?.()
					return
				}
				// Only the newest page's, and never an older count of it.
				if (
					!actions ||
					(this.#actions &&
						(actions.claim < this.#actions.claim ||
							(actions.claim === this.#actions.claim && actions.actionsVer < this.#actions.actionsVer)))
				)
					return
				this.#actions = actions
				this.#actionsNewer = false
				this.#opts.onChange?.()
				return
			}
			case 'settled': {
				const settled = readSettled(payload)
				const seq = settled && this.#unsettled.get(settled.id)
				if (!settled || seq === undefined) return
				this.#settle(
					settled.id,
					settled.outcome === 'accepted' ? 'done' : settled.outcome === 'unknown' ? 'unknown' : 'failed',
				)
				this.#settledSaid.set(settled.id, settledSentence(settled))
				for (const id of this.#settledSaid.keys())
					if (this.#settledSaid.size > UNSETTLED_MAX) this.#settledSaid.delete(id)
				// Settled means it ran: a press still waiting for a lost `result` takes this as it.
				this.#waits.get(settled.id)?.({ v: PROTOCOL, id: settled.id, panel: '', outcome: 'ran' })
				if (seq === this.#pressSeq) this.#lastPress = settledSentence(settled)
				this.#opts.onChange?.()
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
		const send = this.#sender({ verb, row })
		if (this.#status !== 'ok' || !this.#state) return send.refused(this.#note)
		if ((verb === 'select-cue' || verb === 'take-cue' || verb === 'trigger-cue') && !row)
			return send.refused('Choose a cue for this key')
		return send.go({
			verb,
			target: this.targetOf(verb, row),
			seen: this.#state.ver,
			id: `${this.#instance}:${++this.#counter}`,
		})
	}

	/**
	 * PRESS A GRAPHIC ACTION (protocol §10.3): the capability by its id on its pool graphic, with its
	 * arguments, against the actions the page last advertised. Resolves when the page answered; what
	 * the action came to (`settled`) arrives after, into the last-press sentence. Never queued, never
	 * resent but for the one same-id retry every press has.
	 */
	async pressAction(
		graphic: string,
		cap: string,
		args: Record<string, unknown> = {},
		/** Why the key's own arguments cannot be sent (`keyArgs`): refused here, nothing goes. */
		unsendable?: string,
	): Promise<PressOutcome> {
		const send = this.#sender({ verb: ACTION_VERB, row: `${graphic}/${cap}` })
		if (this.#status !== 'ok' || !this.#state) return send.refused(this.#note)
		if (unsendable) return send.refused(unsendable)
		if (this.#actionsNewer) return send.refused("Update the NoaCG module to press this production's graphic actions")
		const actions = this.actions
		const known = capabilityState(actions, graphic, cap)
		if (known.state !== 'allowed' || !actions) return send.refused(known.note)
		const press: ActionPress = {
			v: ACTIONS_PROTOCOL,
			verb: ACTION_VERB,
			target: graphic,
			seen: actions.actionsVer,
			id: `${this.#instance}:${++this.#counter}`,
			cap,
			instance: known.live ?? '',
			args,
		}
		return send.go(press, (refused) => (refused === 'not-a-panel-verb' ? 'not-a-graphic-action' : refused))
	}

	/** The send half every press shares: the last-press sentence, the flash, the one retry, the wait
	 *  for the page's `result`. */
	#sender(flash: { verb: Flash['verb']; row: string }) {
		const seq = ++this.#pressSeq
		// An older press answered after a newer one was made must not overwrite the newer one's sentence.
		const tell = (sentence: string) => {
			if (seq === this.#pressSeq) this.#lastPress = sentence
		}
		/** The press this key sent, once it went: its own `settled` may still write what the key shows. */
		let sentId = ''
		const refused = (sentence: string, result?: PressResult, outcome: KeyOutcome = 'failed'): PressOutcome => {
			this.#flash = { ...flash, until: this.#clock.now() + FLASH_MS }
			// A graphic key's press that went and was answered refused shows failed briefly; one that
			// went unanswered shows not known until its own `settled` says what it came to. A newer
			// press of the same key holds what it shows, and a press refused before it went writes
			// nothing (its flash reads failed), so an earlier press's outcome is never hidden.
			const held = this.#keyOutcomes.get(flash.row)
			if (flash.verb === ACTION_VERB && !sentId)
				this.#refusedHere = { row: flash.row, until: this.#clock.now() + OUTCOME_MS }
			else if (flash.verb === ACTION_VERB && !(held && held.id !== sentId)) {
				const until = outcome === 'failed' ? this.#clock.now() + OUTCOME_MS : Infinity
				this.#setOutcome(flash.row, { outcome, id: sentId, until })
			}
			tell(sentence)
			this.#opts.onChange?.()
			return { ok: false, sentence, ...(result ? { result } : {}) }
		}
		const go = async (
			press: Press | ActionPress,
			code: (refused: string) => string = (r) => r,
		): Promise<PressOutcome> => {
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
			// A graphic action says what it came to after it ran (`settled`), which can arrive before
			// this RPC's own answer: it is listened for from now. Bounded, oldest first.
			if (press.verb === ACTION_VERB) {
				this.#unsettled.set(press.id, seq)
				// A press that falls off the end is no longer waited for: its key reads not known.
				for (const id of this.#unsettled.keys()) if (this.#unsettled.size > UNSETTLED_MAX) this.#settle(id, 'unknown')
				sentId = press.id
				this.#pressKeys.set(press.id, flash.row)
				this.#setOutcome(flash.row, { outcome: 'running', id: press.id, until: Infinity })
				if (this.#refusedHere?.row === flash.row) this.#refusedHere = null
			}
			/** A graphic action that may still say what it came to: unsaid in SETTLE_MS, it is not
			 *  confirmed. */
			const awaitSettled = () =>
				this.#clock.setTimeout(() => {
					if (this.#unsettled.get(press.id) !== seq) return
					this.#settle(press.id, 'unknown')
					tell(UNSETTLED_SENTENCE)
					this.#opts.onChange?.()
				}, SETTLE_MS)
			// Sent and not yet answered: the last-press variable says so, apart from done and refused.
			tell(PENDING_SENTENCE)
			this.#opts.onChange?.()
			let answer
			try {
				answer = await this.#relay.press(this.#key, press)
			} catch {
				// One retry, same id: the page drops an id it has already run.
				try {
					answer = await this.#relay.press(this.#key, press)
				} catch (err) {
					this.#waits.get(press.id)?.({ v: PROTOCOL, id: press.id, panel: '', outcome: 'not-here' })
					// The page already said what it came to: that stands, whatever the calls' own answers.
					const said = this.#settledSaid.get(press.id)
					if (said !== undefined) return { ok: true, sentence: said }
					// Both calls failed: it may still have reached the page, so a graphic key reads not
					// known, and a `settled` that comes still says what it came to.
					if (this.#unsettled.has(press.id)) awaitSettled()
					return refused(`NoaCG offline: ${(err as Error).message}`, undefined, 'unknown')
				}
			}
			if (!answer.ok) {
				this.#waits.get(press.id)?.({ v: PROTOCOL, id: press.id, panel: '', outcome: 'not-here' })
				this.#settle(press.id, null)
				if (answer.refused === 'no-page') {
					this.#noPage()
				} else if (answer.refused === 'revoked' || answer.refused === 'unknown-key') {
					this.#state = null
					this.#leaveTopic()
					this.#set('revoked', refusalSentence(answer.refused))
				}
				return refused(refusalSentence(code(answer.refused), answer.note))
			}
			const result = await answered
			if (press.verb === ACTION_VERB) {
				// What a graphic action came to is `settled`'s to say, whenever it comes: before the
				// press's own `result`, after the wait for it, or instead of a lost one.
				const said = this.#settledSaid.get(press.id)
				if (said !== undefined) {
					this.#opts.onChange?.()
					return { ok: true, sentence: said, ...(result ? { result } : {}) }
				}
				// A duplicate with no note is the answer to the one retry of a press that ran.
				const ran = result?.outcome === 'ran' || (result?.outcome === 'duplicate' && !result.note)
				if (result && !ran) {
					this.#settle(press.id, null)
					return refused(outcomeSentence(result), result)
				}
				if (this.#unsettled.has(press.id)) awaitSettled()
				// No `result` heard and nothing settled yet: say so; a `settled` that comes still says
				// what it came to, so a lost acknowledgement never reads as a press that did nothing.
				if (!result) return refused('No answer from the operator page', undefined, 'unknown')
				tell(RUNNING_SENTENCE)
				this.#opts.onChange?.()
				return { ok: true, sentence: RUNNING_SENTENCE, result }
			}
			if (!result) return refused('No answer from the operator page')
			if (result.outcome !== 'ran') return refused(outcomeSentence(result), result)
			const sentence = outcomeSentence(result)
			tell(sentence)
			this.#opts.onChange?.()
			return { ok: true, sentence, result }
		}
		return { refused, go }
	}
}
