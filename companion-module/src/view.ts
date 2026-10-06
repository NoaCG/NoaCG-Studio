import type { PanelRows, PanelState, PanelVerb } from './protocol.js'

/** The row option's special value: whatever row is selected on the page. */
export const SELECTED = '__selected__'

export function resolveRow(state: PanelState | null, row: string): string {
	return row === SELECTED ? (state?.selected ?? '') : row
}

export function isOnAir(state: PanelState | null, row: string): boolean {
	const id = resolveRow(state, row)
	return !!state && !!id && state.live.includes(id)
}

export function isSelected(state: PanelState | null, row: string): boolean {
	return !!state && !!row && state.selected === row
}

/** Whether the page would run this verb now, as its own button shows it. */
export function isAllowed(state: PanelState | null, rows: PanelRows | null, verb: PanelVerb, row = ''): boolean {
	if (!state) return false
	if (verb === 'select-cue' || verb === 'take-cue' || verb === 'trigger-cue') {
		const known = !!rows?.rows.some((r) => r.id === row && (verb !== 'trigger-cue' || r.kind === 'cue'))
		return known && (verb === 'select-cue' || !state.blocked.includes(row))
	}
	return state.allowed[verb] === true
}

export type ClockPhase = 'none' | 'counting' | 'warning' | 'final' | 'holding' | 'paused' | 'looping'

export interface ClockView {
	phase: ClockPhase
	/** Whole seconds left (rounded up), or seconds over for a holding clip; null when unknown. */
	seconds: number | null
	text: string
	label: string
}

/** `m:ss`, or `h:mm:ss` from an hour. */
export function clockText(seconds: number | null): string {
	if (seconds === null) return '--:--'
	const s = Math.max(0, Math.round(seconds))
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const ss = String(s % 60).padStart(2, '0')
	return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * THE CLIP CLOCK, counted here (protocol §7.4). The page sends the clip's end in its own clock and
 * its clock at publish; `receivedAt` is when this machine got that state, so the page's time maps
 * to ours by the difference, and no clock needs to agree with another.
 */
export function clipClock(state: PanelState | null, receivedAt: number, now: number): ClockView {
	const clip = state?.clip
	if (!state || !clip) return { phase: 'none', seconds: null, text: '', label: '' }
	const toLocal = (pageMs: number) => pageMs + (receivedAt - state.at)
	if (clip.phase === 'paused')
		return { phase: 'paused', seconds: clip.remaining, text: clockText(clip.remaining), label: clip.label }
	if (clip.phase === 'holding') {
		const over = clip.end === null ? null : Math.max(0, (now - toLocal(clip.end)) / 1000)
		return { phase: 'holding', seconds: over, text: over === null ? 'HOLD' : `+${clockText(over)}`, label: clip.label }
	}
	let left: number | null
	if (clip.end !== null) left = Math.max(0, (toLocal(clip.end) - now) / 1000)
	else if (clip.remaining !== null) left = Math.max(0, clip.remaining - (now - receivedAt) / 1000)
	else left = null
	const shown = left === null ? null : Math.ceil(left)
	if (clip.phase === 'looping') return { phase: 'looping', seconds: shown, text: clockText(shown), label: clip.label }
	const [warn, final] = state.warn
	const phase: ClockPhase = left === null ? 'counting' : left <= final ? 'final' : left <= warn ? 'warning' : 'counting'
	return { phase, seconds: shown, text: clockText(shown), label: clip.label }
}

export function rowLabel(rows: PanelRows | null, id: string | null): string {
	if (!id) return ''
	return rows?.rows.find((r) => r.id === id)?.label ?? ''
}
