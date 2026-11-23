import {
	REALTIME_SUBSCRIBE_STATES,
	createClient,
	type RealtimeChannel,
	type SupabaseClient,
} from '@supabase/supabase-js'
import type { ActionPress, Answer, HelloAnswer, PairAnswer, Press, PressAnswer, SeenAnswer } from './protocol.js'

/** The channel's own state, as the panel needs it. */
export type ListenStatus = 'joined' | 'closed' | 'error'

/**
 * Everything the module says to the NoaCG cloud and hears from it. The panel logic talks only to
 * this, so its tests run against a fake relay instead of a backend.
 *
 * The calls answer a refusal as `{ok: false, refused}` and THROW only when the backend could not
 * be reached or answered something that is not a panel answer. A throw the backend's gateway made
 * by refusing the publishable key (HTTP 401 or 403) is a `RelayError` with `auth` set.
 */
export interface Relay {
	pairFinish(code: string, label: string): Promise<Answer<PairAnswer>>
	hello(key: string): Promise<Answer<HelloAnswer>>
	press(key: string, press: Press | ActionPress): Promise<Answer<PressAnswer>>
	/** The liveness report: this module's version and the status it shows (protocol §7.5). */
	seen(key: string, version: string, status: string): Promise<Answer<SeenAnswer>>
	/** Join a feedback topic; returns the leave function. */
	listen(
		topic: string,
		onEvent: (event: string, payload: unknown) => void,
		onStatus: (s: ListenStatus) => void,
	): () => void
	close(): Promise<void>
}

/** Where a NoaCG backend is, as its app publishes it at `/panel.json`. */
export interface Backend {
	url: string
	key: string
}

/**
 * Find the backend behind a NoaCG address (noacg.studio, or a self-hosted app). The app publishes
 * its own backend address and publishable key, both public, at `/panel.json`, so an operator only
 * ever types the address, and a backend whose publishable key is rotated needs no module update.
 */
export async function discoverBackend(address: string, fetchFn: typeof fetch = fetch): Promise<Backend> {
	const base = address.trim().replace(/\/+$/, '')
	const url = /^https?:\/\//i.test(base) ? base : `https://${base}`
	const res = await fetchFn(`${url}/panel.json`, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(DISCOVER_MS),
	})
	if (!res.ok) throw new Error(`${url} did not answer as a NoaCG app (HTTP ${res.status})`)
	const body = (await res.json()) as { v?: unknown; supabaseUrl?: unknown; supabaseKey?: unknown }
	if (typeof body.supabaseUrl !== 'string' || typeof body.supabaseKey !== 'string') {
		throw new Error(`${url} has no panel backend configured`)
	}
	return { url: body.supabaseUrl, key: body.supabaseKey }
}

/** How long finding the backend may take before the connection says it is offline. */
const DISCOVER_MS = 10_000
/** How long one panel call may take. A press waits 1.5 s for the page anyway, so a call still
 *  open after this has failed for the operator, and the action must not hang Companion. */
const RPC_MS = 5_000

/** A call that failed: `auth` when the backend refused the publishable key itself (HTTP 401 or
 *  403), so a module holding a rotated key finds the backend again; `missing` when the backend has
 *  no such function (an older NoaCG server). */
export class RelayError extends Error {
	readonly auth: boolean
	readonly missing: boolean
	constructor(message: string, status = 0, code = '') {
		super(message)
		this.auth = status === 401 || status === 403
		this.missing = code === 'PGRST202' || /could not find the function/i.test(message)
	}
}

function asAnswer<T>(data: unknown): Answer<T> {
	if (typeof data !== 'object' || data === null || typeof (data as { ok?: unknown }).ok !== 'boolean') {
		throw new Error('The backend answered something that is not a panel answer')
	}
	return data as Answer<T>
}

/** The relay over a Supabase backend: four RPCs and one private Realtime channel at a time. */
export class SupabaseRelay implements Relay {
	readonly #client: SupabaseClient
	readonly #channels = new Set<RealtimeChannel>()

	constructor(backend: Backend) {
		this.#client = createClient(backend.url, backend.key, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			realtime: { params: { eventsPerSecond: 20 } },
		})
	}

	async #rpc<T>(name: string, args: Record<string, unknown>): Promise<Answer<T>> {
		const { data, error, status } = await this.#client.rpc(name, args).abortSignal(AbortSignal.timeout(RPC_MS))
		if (error) throw new RelayError(error.message, status, error.code)
		return asAnswer<T>(data)
	}

	async pairFinish(code: string, label: string): Promise<Answer<PairAnswer>> {
		return this.#rpc('panel_pair_finish', { p_code: code, p_label: label })
	}

	async hello(key: string): Promise<Answer<HelloAnswer>> {
		return this.#rpc('panel_hello', { p_key: key })
	}

	async press(key: string, press: Press | ActionPress): Promise<Answer<PressAnswer>> {
		return this.#rpc('panel_press', { p_key: key, p_press: press })
	}

	async seen(key: string, version: string, status: string): Promise<Answer<SeenAnswer>> {
		return this.#rpc('panel_seen', { p_key: key, p_version: version, p_status: status })
	}

	listen(
		topic: string,
		onEvent: (event: string, payload: unknown) => void,
		onStatus: (s: ListenStatus) => void,
	): () => void {
		const channel = this.#client.channel(topic, { config: { private: true, broadcast: { self: false } } })
		channel.on('broadcast', { event: '*' }, (msg: { event: string; payload?: unknown }) =>
			onEvent(msg.event, msg.payload),
		)
		channel.subscribe((status) => {
			if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) onStatus('joined')
			else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) onStatus('closed')
			else onStatus('error')
		})
		this.#channels.add(channel)
		return () => {
			this.#channels.delete(channel)
			void this.#client.removeChannel(channel)
		}
	}

	async close(): Promise<void> {
		this.#channels.clear()
		await this.#client.removeAllChannels()
	}
}
