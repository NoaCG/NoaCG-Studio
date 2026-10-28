// A fake relay and a hand-driven clock: the module's tests never reach a backend.
import type { Clock } from '../panel.js'
import type {
	ActionPress,
	Answer,
	HelloAnswer,
	PairAnswer,
	PanelRows,
	PanelState,
	Press,
	PressAnswer,
} from '../protocol.js'
import type { ListenStatus, Relay } from '../relay.js'

export class FakeClock implements Clock {
	t = 1_000_000
	#timers: { at: number; fn: () => void; id: number }[] = []
	#next = 1
	now(): number {
		return this.t
	}
	setTimeout(fn: () => void, ms: number): unknown {
		const id = this.#next++
		this.#timers.push({ at: this.t + ms, fn, id })
		return id
	}
	clearTimeout(handle: unknown): void {
		this.#timers = this.#timers.filter((x) => x.id !== handle)
	}
	/** Move time on, running every timer that falls due, in order. */
	async advance(ms: number): Promise<void> {
		const end = this.t + ms
		for (;;) {
			this.#timers.sort((a, b) => a.at - b.at)
			const due = this.#timers[0]
			if (!due || due.at > end) break
			this.#timers.shift()
			this.t = due.at
			due.fn()
			await settle()
		}
		this.t = end
		await settle()
	}
}

/** Let pending promises run. */
export async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve()
}

type Listener = {
	topic: string
	onEvent: (e: string, p: unknown) => void
	onStatus: (s: ListenStatus) => void
	left: boolean
}

export class FakeRelay implements Relay {
	calls: { name: string; args: unknown[] }[] = []
	pairAnswer: Answer<PairAnswer> = {
		ok: true,
		key: 'ncpk_test',
		key_id: 'k1',
		label: 'Desk',
		title: 'Friday match',
		feedback_topic: 'pfb-aaa',
	}
	helloAnswer: Answer<HelloAnswer> = {
		ok: true,
		key_id: 'k1',
		label: 'Desk',
		title: 'Friday match',
		feedback_topic: 'pfb-aaa',
		answering: true,
	}
	pressAnswers: (Answer<PressAnswer> | Error)[] = []
	listeners: Listener[] = []
	/** Answer every press with this result on the topic, as an answering page would. */
	autoResult: string | null = 'ran'

	async pairFinish(code: string, label: string): Promise<Answer<PairAnswer>> {
		this.calls.push({ name: 'pairFinish', args: [code, label] })
		return this.pairAnswer
	}
	async hello(key: string): Promise<Answer<HelloAnswer>> {
		this.calls.push({ name: 'hello', args: [key] })
		return this.helloAnswer
	}
	async press(key: string, press: Press | ActionPress): Promise<Answer<PressAnswer>> {
		this.calls.push({ name: 'press', args: [key, press] })
		const next = this.pressAnswers.shift() ?? { ok: true, claim: 1 }
		if (next instanceof Error) throw next
		if (next.ok && this.autoResult) {
			const outcome = this.autoResult
			queueMicrotask(() => this.emit('result', { v: 1, id: press.id, panel: 'k1', outcome }))
		}
		return next
	}
	listen(topic: string, onEvent: (e: string, p: unknown) => void, onStatus: (s: ListenStatus) => void): () => void {
		const l: Listener = { topic, onEvent, onStatus, left: false }
		this.listeners.push(l)
		return () => {
			l.left = true
		}
	}
	async close(): Promise<void> {}

	get live(): Listener | undefined {
		return this.listeners.filter((l) => !l.left).at(-1)
	}
	emit(event: string, payload: unknown): void {
		this.live?.onEvent(event, payload)
	}
	count(name: string): number {
		return this.calls.filter((c) => c.name === name).length
	}
	presses(): Press[] {
		return this.calls.filter((c) => c.name === 'press').map((c) => c.args[1] as Press)
	}
}

export function state(over: Partial<PanelState> = {}): PanelState {
	return {
		v: 1,
		ver: 5,
		rowsVer: 1,
		page: 'page0000page0000',
		claim: 3,
		where: 'production',
		label: 'Production page',
		title: 'Friday match',
		at: 1_000_000,
		selected: 'cue_a',
		space: 'take',
		live: [],
		allowed: { take: true, out: false, 'select-next': true, 'select-prev': true, 'all-out': true },
		blocked: [],
		clip: null,
		warn: [10, 5],
		bridge: 'off',
		...over,
	}
}

export function rows(): PanelRows {
	return {
		v: 1,
		rowsVer: 1,
		more: false,
		rows: [
			{ id: 'cue_a', label: 'Anna', kind: 'cue', source: 'graphic' },
			{ id: 'cue_b', label: 'Ben', kind: 'cue', source: 'graphic' },
			{ id: 'cue_vt', label: 'Opening VT', kind: 'cue', source: 'server' },
		],
	}
}

const optionArgs = (values: string[]) => ({
	path: '',
	type: 'object',
	closed: true,
	properties: [{ key: 'option', required: true, node: { path: 'option', type: 'string', enum: values } }],
})
const STEP = {
	path: '',
	type: 'object',
	closed: true,
	properties: [{ key: 'delta', required: true, node: { path: 'delta', type: 'integer', enum: [-1, 1] } }],
}

/**
 * An `actions` event of three pool graphics, as the production page offers them (E6.1, E6.2): a
 * pinned sports scorebug (a goal, a clock and the ± score), a pinned quiz (a reveal and a pick) and
 * an unpinned stranger's OGraf package (two foreign actions, one with typed arguments).
 */
export function offer(over: Record<string, unknown> = {}): Record<string, unknown> & { graphics: OfferGraphic[] } {
	const cap = (id: string, label: string, more: Record<string, unknown> = {}) => ({
		id,
		kind: id.slice(0, id.indexOf(':')),
		label,
		place: 'section',
		args: null,
		allowed: true,
		invocable: true,
		...more,
	})
	return {
		av: 2,
		actionsVer: 3_000_010,
		page: 'page0000page0000',
		claim: 3,
		relay: true,
		more: false,
		graphics: [
			{
				graphic: 'Scorebug',
				pinned: true,
				live: 'cue_sb',
				cue: 'Final',
				caps: [
					cap('event:goal-home', '+1 HOME', { place: 'pinned' }),
					cap('event:clock-start', 'Start clock', { section: 'Clock' }),
					cap('event:clock-pause', 'Pause clock', { section: 'Clock' }),
					cap('step:home', 'Home', { args: STEP }),
				],
			},
			{
				graphic: 'Quiz',
				pinned: true,
				live: 'cue_q1',
				cue: 'Question 1',
				caps: [
					cap('event:reveal', 'Reveal'),
					cap('event:choose', 'Answer', {
						args: optionArgs(['A', 'B']),
						options: [
							{ value: 'A', label: 'Answer A' },
							{ value: 'B', label: 'Answer B' },
						],
						active: 'B',
					}),
				],
			},
			{
				graphic: 'Results',
				pinned: false,
				live: 'cue_r1',
				cue: 'Results 1',
				caps: [
					cap('foreign:highlight', 'Highlight a team', {
						args: {
							path: '',
							type: 'object',
							properties: [{ key: 'team', required: true, node: { path: 'team', type: 'integer' } }],
						},
					}),
					cap('foreign:reset', 'Reset', { place: 'pinned' }),
				],
			},
		],
		...over,
	}
}

export type OfferGraphic = {
	graphic: string
	pinned: boolean
	live: string | null
	cue: string
	caps: Record<string, unknown>[]
}
