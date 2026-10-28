// The NoaCG panel wire protocol, version 1, and its graphic actions (actions protocol 2), as the
// module sees it. The authority is docs/work-specs/hardware-panel-control/protocol.md in the NoaCG
// Studio repository (§10 for graphic actions).

/** The verbs a panel may press (spec D5). */
export const PANEL_VERBS = [
	'take',
	'retake',
	'update',
	'next',
	'out',
	'select-prev',
	'select-next',
	'pause',
	'resume',
	'pause-toggle',
	'all-out',
	'select-cue',
	'take-cue',
	'trigger-cue',
] as const
export type PanelVerb = (typeof PANEL_VERBS)[number]

/** The verbs whose enabled state the page publishes in `allowed`. The two per-row verbs are answered
 *  by `rows` and `blocked` instead. */
export type SharedVerb = Exclude<PanelVerb, 'select-cue' | 'take-cue' | 'trigger-cue'>
export const SHARED_VERBS = PANEL_VERBS.filter(
	(v): v is SharedVerb => v !== 'select-cue' && v !== 'take-cue' && v !== 'trigger-cue',
)

/** Verbs that act on the selected row, so the key's target is what was selected when it was drawn. */
export const SELECTED_ROW_VERBS: readonly PanelVerb[] = ['take', 'retake', 'update', 'next', 'out', 'pause', 'resume']

export const VERB_NAMES: Record<PanelVerb, string> = {
	take: 'Take (the SPACE toggle)',
	retake: 'Re-take',
	update: 'Update',
	next: 'Next',
	out: 'Out',
	'select-prev': 'Select the previous cue',
	'select-next': 'Select the next cue',
	pause: 'Pause the server clip',
	resume: 'Resume the server clip',
	'pause-toggle': 'Pause or resume the clip on air',
	'all-out': 'All out',
	'select-cue': 'Select a cue',
	'take-cue': 'Take a cue',
	'trigger-cue': 'Trigger a cue',
}

/** The press as the module sends it. */
export interface Press {
	verb: PanelVerb
	target: string
	seen: number
	id: string
}

export interface ClipState {
	cue: string
	label: string
	phase: 'counting' | 'holding' | 'paused' | 'looping'
	start: number | null
	end: number | null
	remaining: number | null
	estimated: boolean
	next?: string | null
}

/** The answering page's feedback state (protocol §8). */
export interface PanelState {
	v: number
	ver: number
	rowsVer: number
	page: string
	claim: number
	where: 'production' | 'control'
	label: string
	title: string
	at: number
	selected: string | null
	space: 'take' | 'take-off' | 'preview' | null
	live: string[]
	allowed: Partial<Record<SharedVerb, boolean>>
	blocked: string[]
	clip: ClipState | null
	warn: [number, number]
	bridge: 'ok' | 'down' | 'off'
}

export interface PanelRow {
	id: string
	label: string
	kind: 'cue' | 'folder'
	source: 'graphic' | 'server' | null
	folder?: string
}

export interface PanelRows {
	v: number
	rowsVer: number
	rows: PanelRow[]
	more: boolean
}

/** `invalid`: a graphic action's arguments do not fit its declared schema. */
export type Outcome = 'ran' | 'duplicate' | 'stale' | 'not-allowed' | 'not-here' | 'invalid'

export interface PressResult {
	v: number
	id: string
	panel: string
	outcome: Outcome
	note?: string
}

export interface Beat {
	v: number
	page: string
	claim: number
	ver: number
	rowsVer: number
	/** The page's newest graphic-actions offer (protocol §10.2); absent from a page without them. */
	actionsVer?: number
}

/** The only protocol version this module understands. */
export const PROTOCOL = 1

/** The answers of the panel RPCs. An expected refusal is an answer, never a thrown error. */
export type Refusal = { ok: false; refused: string; note?: string }
export type Answer<T> = ({ ok: true } & T) | Refusal

export interface PairAnswer {
	key: string
	key_id: string
	label: string
	title: string
	feedback_topic: string
}

export interface HelloAnswer {
	key_id: string
	label: string
	title: string
	feedback_topic: string
	answering: boolean
}

export interface PressAnswer {
	claim: number
}

/** The sentence an operator reads for a refusal code from the server. */
export function refusalSentence(code: string, note?: string): string {
	switch (code) {
		case 'unknown-code':
			return 'That pairing code is not known. Check it on the production page.'
		case 'used-code':
			return 'That pairing code was already used. Make a new one on the production page.'
		case 'expired-code':
			return 'That pairing code has expired. Make a new one on the production page.'
		case 'slow-down':
			return 'Too many tries. Wait a minute and try again.'
		case 'unknown-key':
		case 'revoked':
			return 'Panel key revoked. Pair again.'
		case 'no-page':
			return 'No operator page'
		case 'not-a-panel-verb':
			return 'That action cannot be pressed from a panel.'
		case 'not-a-graphic-action':
			return 'Graphic actions wait for a NoaCG server update.'
		case 'bad-press':
			return 'The press was not understood. Update the NoaCG module.'
		default:
			return note || `Refused: ${code}`
	}
}

/** The sentence for an outcome the page answered. */
export function outcomeSentence(result: PressResult): string {
	if (result.note) return result.note
	switch (result.outcome) {
		case 'ran':
			return 'Done'
		case 'duplicate':
			return 'Already done'
		case 'stale':
			return 'Refused: the page changed since the key was drawn'
		case 'not-allowed':
			return 'Refused: not allowed right now'
		case 'not-here':
			return 'Refused: the answering page cannot do that'
		case 'invalid':
			return 'Refused: the action does not take that'
	}
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Read a `state` payload, or null when it is not one. Unknown fields are ignored. */
export function readState(p: unknown): PanelState | null {
	if (!isObject(p) || num(p.ver) === null || typeof p.page !== 'string') return null
	const allowed: Partial<Record<SharedVerb, boolean>> = {}
	if (isObject(p.allowed))
		for (const v of SHARED_VERBS) if (typeof p.allowed[v] === 'boolean') allowed[v] = p.allowed[v]
	const clip = isObject(p.clip) && typeof p.clip.cue === 'string' ? readClip(p.clip) : null
	const warn = Array.isArray(p.warn) && p.warn.length === 2 ? [num(p.warn[0]) ?? 10, num(p.warn[1]) ?? 5] : [10, 5]
	const space = p.space === 'take' || p.space === 'take-off' || p.space === 'preview' ? p.space : null
	return {
		v: num(p.v) ?? 0,
		ver: num(p.ver)!,
		rowsVer: num(p.rowsVer) ?? 0,
		page: p.page,
		claim: num(p.claim) ?? 0,
		where: p.where === 'control' ? 'control' : 'production',
		label: typeof p.label === 'string' ? p.label : '',
		title: typeof p.title === 'string' ? p.title : '',
		at: num(p.at) ?? 0,
		selected: typeof p.selected === 'string' ? p.selected : null,
		space,
		live: strings(p.live),
		allowed,
		blocked: strings(p.blocked),
		clip,
		warn: warn as [number, number],
		bridge: p.bridge === 'ok' || p.bridge === 'down' ? p.bridge : 'off',
	}
}

function readClip(c: Record<string, unknown>): ClipState {
	const phase = c.phase === 'holding' || c.phase === 'paused' || c.phase === 'looping' ? c.phase : 'counting'
	return {
		cue: c.cue as string,
		label: typeof c.label === 'string' ? c.label : '',
		phase,
		start: num(c.start),
		end: num(c.end),
		remaining: num(c.remaining),
		estimated: c.estimated === true,
		next: typeof c.next === 'string' ? c.next : null,
	}
}

/** Read a `rows` payload, or null when it is not one. */
export function readRows(p: unknown): PanelRows | null {
	if (!isObject(p) || !Array.isArray(p.rows)) return null
	const rows: PanelRow[] = []
	for (const r of p.rows) {
		if (!isObject(r) || typeof r.id !== 'string' || !r.id) continue
		rows.push({
			id: r.id,
			label: typeof r.label === 'string' ? r.label : r.id,
			kind: r.kind === 'folder' ? 'folder' : 'cue',
			source: r.source === 'graphic' || r.source === 'server' ? r.source : null,
			...(typeof r.folder === 'string' ? { folder: r.folder } : {}),
		})
	}
	return { v: num(p.v) ?? 0, rowsVer: num(p.rowsVer) ?? 0, rows, more: p.more === true }
}

export function readResult(p: unknown): PressResult | null {
	if (!isObject(p) || typeof p.id !== 'string' || typeof p.outcome !== 'string') return null
	const outcomes: Outcome[] = ['ran', 'duplicate', 'stale', 'not-allowed', 'not-here', 'invalid']
	if (!outcomes.includes(p.outcome as Outcome)) return null
	return {
		v: num(p.v) ?? 0,
		id: p.id,
		panel: typeof p.panel === 'string' ? p.panel : '',
		outcome: p.outcome as Outcome,
		...(typeof p.note === 'string' && p.note ? { note: p.note } : {}),
	}
}

export function readBeat(p: unknown): Beat | null {
	if (!isObject(p) || typeof p.page !== 'string') return null
	return {
		v: num(p.v) ?? 0,
		page: p.page,
		claim: num(p.claim) ?? 0,
		ver: num(p.ver) ?? 0,
		rowsVer: num(p.rowsVer) ?? 0,
		...(num(p.actionsVer) !== null ? { actionsVer: num(p.actionsVer)! } : {}),
	}
}

// ── Graphic actions (protocol §10) ───────────────────────────────────────────────────────────────

/** The graphic-actions protocol this module speaks. Its events carry `av`, never `v`, so a module
 *  that predates them ignores them; a page advertising a newer `av` is answered "update the module"
 *  for its actions only, while every transport key keeps working. */
export const ACTIONS_PROTOCOL = 2
export const ACTION_VERB = 'graphic-action'

/** An argument schema, as the page sends it (NoaCG's typed model, read only as far as a key needs). */
export interface ArgSchema {
	type: string
	enum?: (string | number | boolean)[]
	properties?: { key: string; required: boolean; node: ArgSchema }[]
	[more: string]: unknown
}

export interface Capability {
	id: string
	kind: 'event' | 'step' | 'foreign'
	label: string
	place: 'pinned' | 'section' | 'more'
	section?: string
	args: ArgSchema | null
	options?: { value: string; label: string }[]
	active?: string
	allowed: boolean
	note?: string
	/** False for a control the page says a panel cannot press: shown, never pressed. */
	invocable: boolean
}

export interface ActionGraphic {
	graphic: string
	pinned: boolean
	live: string | null
	cue: string | null
	caps: Capability[]
}

/** The `actions` event: what the answering page offers on each pool graphic. */
export interface PanelActions {
	av: number
	actionsVer: number
	page: string
	claim: number
	/** The NoaCG server relays graphic actions. */
	relay: boolean
	graphics: ActionGraphic[]
	more: boolean
}

/** A graphic action as the module sends it. */
export interface ActionPress {
	v: typeof ACTIONS_PROTOCOL
	verb: typeof ACTION_VERB
	target: string
	seen: number
	id: string
	cap: string
	instance: string
	args: Record<string, unknown>
}

/** What a graphic action came to on the page, after its `result` said it ran. */
export interface Settled {
	id: string
	outcome: 'accepted' | 'refused' | 'failed' | 'unknown'
	note?: string
}

const CAP_ID = /^(event|step|foreign):\P{Cc}{1,96}$/u
const TEXT_128 = /^\P{Cc}{0,128}$/u
/** At most this many graphics and capabilities are read from one `actions` event. */
const GRAPHICS_MAX = 32
const CAPS_MAX = 48

/** Read an `actions` payload: the actions, `'newer'` for an actions protocol this module does not
 *  speak, or null when it is not one. Bounded: at most 32 graphics of 48 capabilities are read. */
export function readActions(p: unknown): PanelActions | 'newer' | null {
	const av = isObject(p) ? num(p.av) : null
	if (!isObject(p) || av === null) return null
	if (av !== ACTIONS_PROTOCOL) return 'newer'
	const actionsVer = num(p.actionsVer)
	if (actionsVer === null || typeof p.page !== 'string' || !Array.isArray(p.graphics)) return null
	const graphics: ActionGraphic[] = []
	for (const g of p.graphics.slice(0, GRAPHICS_MAX)) {
		if (!isObject(g) || typeof g.graphic !== 'string' || !g.graphic || !TEXT_128.test(g.graphic)) continue
		const caps: Capability[] = []
		for (const c of Array.isArray(g.caps) ? g.caps.slice(0, CAPS_MAX) : []) {
			if (!isObject(c) || typeof c.id !== 'string' || !CAP_ID.test(c.id)) continue
			const kind = c.id.slice(0, c.id.indexOf(':')) as Capability['kind']
			// Pressed only when the page says so: an older page offers foreign actions as descriptors.
			const invocable = c.invocable === true
			const options = Array.isArray(c.options)
				? c.options
						.filter(isObject)
						.flatMap((o) =>
							typeof o.value === 'string'
								? [{ value: o.value, label: typeof o.label === 'string' ? o.label : o.value }]
								: [],
						)
				: undefined
			caps.push({
				id: c.id,
				kind,
				label: typeof c.label === 'string' ? c.label : c.id,
				place: c.place === 'pinned' || c.place === 'more' ? c.place : 'section',
				...(typeof c.section === 'string' ? { section: c.section } : {}),
				args: isObject(c.args) && typeof c.args.type === 'string' ? (c.args as ArgSchema) : null,
				...(options ? { options } : {}),
				...(typeof c.active === 'string' ? { active: c.active } : {}),
				allowed: invocable && c.allowed === true,
				...(typeof c.note === 'string' && c.note ? { note: c.note } : {}),
				invocable,
			})
		}
		graphics.push({
			graphic: g.graphic,
			pinned: g.pinned === true,
			live: typeof g.live === 'string' && TEXT_128.test(g.live) ? g.live : null,
			cue: typeof g.cue === 'string' ? g.cue : null,
			caps,
		})
	}
	return {
		av: ACTIONS_PROTOCOL,
		actionsVer,
		page: p.page,
		claim: num(p.claim) ?? 0,
		relay: p.relay === true,
		graphics,
		more: p.more === true || p.graphics.length > GRAPHICS_MAX,
	}
}

export function readSettled(p: unknown): Settled | null {
	if (!isObject(p) || num(p.av) !== ACTIONS_PROTOCOL || typeof p.id !== 'string') return null
	const outcomes: Settled['outcome'][] = ['accepted', 'refused', 'failed', 'unknown']
	if (!outcomes.includes(p.outcome as Settled['outcome'])) return null
	return {
		id: p.id,
		outcome: p.outcome as Settled['outcome'],
		...(typeof p.note === 'string' && p.note ? { note: p.note } : {}),
	}
}

/** The sentence for what a graphic action came to. */
export function settledSentence(s: Settled): string {
	if (s.outcome === 'accepted') return 'Done'
	if (s.outcome === 'unknown') return s.note ? `Not confirmed: ${s.note}` : 'Sent, not confirmed'
	return s.note || (s.outcome === 'failed' ? 'Failed' : 'Refused')
}

/** WHAT A SAVED KEY FOR A GRAPHIC ACTION SHOWS: its capability by id only, never by label or
 *  position, so a key whose action the graphic no longer declares reads unknown and stays dark. */
export function capabilityState(
	actions: PanelActions | null,
	graphic: string,
	id: string,
): { state: 'allowed' | 'refused' | 'unknown'; note: string; cap?: Capability; live?: string | null } {
	if (!actions) return { state: 'unknown', note: 'No graphic actions from the operator page' }
	const g = actions.graphics.find((x) => x.graphic === graphic)
	const cap = g?.caps.find((c) => c.id === id)
	if (!g || !cap) return { state: 'unknown', note: `That action is not on ${graphic}` }
	const base = { cap, live: g.live }
	if (!actions.relay) return { state: 'refused', note: 'Graphic actions wait for a NoaCG server update', ...base }
	if (!cap.invocable)
		return { state: 'refused', note: cap.note ?? `${cap.label} cannot be pressed from a panel`, ...base }
	if (!cap.allowed) return { state: 'refused', note: cap.note ?? 'Not allowed right now', ...base }
	return { state: 'allowed', note: cap.label, ...base }
}

/** The longest argument text a key may carry: the relay's own bound on the argument object. */
export const ARGS_MAX_CHARS = 4096

/**
 * THE ARGUMENTS A SAVED KEY SENDS, from its options and its capability's kind (the id's prefix, never
 * the offer): a pick's option, a number's step, a foreign action's JSON object, or none. A foreign
 * key with no arguments sends the live cue's, as the page's own button does. Null, with why, for
 * arguments a key cannot send; the page validates the rest against the declared schema.
 */
export function keyArgs(
	cap: string,
	o: { option?: unknown; delta?: unknown; args?: unknown },
): { args: Record<string, unknown> } | { refused: string } {
	const kind = cap.slice(0, cap.indexOf(':'))
	if (kind === 'step') return Number(o.delta) < 0 ? { args: { delta: -1 } } : { args: { delta: 1 } }
	if (kind === 'event') {
		const option = typeof o.option === 'string' ? o.option.trim() : ''
		return { args: option ? { option } : {} }
	}
	const text = typeof o.args === 'string' ? o.args.trim() : ''
	if (kind !== 'foreign' || !text) return { args: {} }
	if (text.length > ARGS_MAX_CHARS) return { refused: 'The arguments are longer than a press takes' }
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return { refused: 'The arguments are not JSON: write them like {"team": 2}' }
	}
	return isObject(parsed) ? { args: parsed } : { refused: 'The arguments must be an object, like {"team": 2}' }
}

/** What a graphic key shows of its capability's offer, for redefining presets and choices: the
 *  graphics, their pins and their capabilities' ids, labels and options, never what moves live. */
export function offerShape(actions: PanelActions | null): string {
	if (!actions) return ''
	return JSON.stringify(
		actions.graphics.map((g) => [
			g.graphic,
			g.pinned,
			g.caps.map((c) => [c.id, c.label, c.invocable, c.options?.map((o) => [o.value, o.label]) ?? null]),
		]),
	)
}

/** A payload's protocol version, for the "update the module" check. */
export function versionOf(p: unknown): number | null {
	return isObject(p) ? num(p.v) : null
}
