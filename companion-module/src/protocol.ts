// The NoaCG panel wire protocol, version 1, as the module sees it. The authority is
// docs/work-specs/hardware-panel-control/protocol.md in the NoaCG Studio repository.

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
] as const
export type PanelVerb = (typeof PANEL_VERBS)[number]

/** The verbs whose enabled state the page publishes in `allowed`. The two per-row verbs are answered
 *  by `rows` and `blocked` instead. */
export type SharedVerb = Exclude<PanelVerb, 'select-cue' | 'take-cue'>
export const SHARED_VERBS = PANEL_VERBS.filter((v): v is SharedVerb => v !== 'select-cue' && v !== 'take-cue')

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

export type Outcome = 'ran' | 'duplicate' | 'stale' | 'not-allowed' | 'not-here'

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
	const outcomes: Outcome[] = ['ran', 'duplicate', 'stale', 'not-allowed', 'not-here']
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
	}
}

/** A payload's protocol version, for the "update the module" check. */
export function versionOf(p: unknown): number | null {
	return isObject(p) ? num(p.v) : null
}
