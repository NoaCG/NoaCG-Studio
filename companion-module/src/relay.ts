import {
	REALTIME_SUBSCRIBE_STATES,
	createClient,
	type RealtimeChannel,
	type SupabaseClient,
} from '@supabase/supabase-js'
import type { Answer, HelloAnswer, PairAnswer, Press, PressAnswer } from './protocol.js'

/** The channel's own state, as the panel needs it. */
export type ListenStatus = 'joined' | 'closed' | 'error'

/**
 * Everything the module says to the NoaCG cloud and hears from it. The panel logic talks only to
 * this, so its tests run against a fake relay instead of a backend.
 *
 * The three calls answer a refusal as `{ok: false, refused}` and THROW only when the backend
 * could not be reached or answered something that is not a panel answer.
 */
export interface Relay {
	pairFinish(code: string, label: string): Promise<Answer<PairAnswer>>
	hello(key: string): Promise<Answer<HelloAnswer>>
	press(key: string, press: Press): Promise<Answer<PressAnswer>>
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
	const res = await fetchFn(`${url}/panel.json`, { headers: { accept: 'application/json' } })
	if (!res.ok) throw new Error(`${url} did not answer as a NoaCG app (HTTP ${res.status})`)
	const body = (await res.json()) as { v?: unknown; supabaseUrl?: unknown; supabaseKey?: unknown }
	if (typeof body.supabaseUrl !== 'string' || typeof body.supabaseKey !== 'string') {
		throw new Error(`${url} has no panel backend configured`)
	}
	return { url: body.supabaseUrl, key: body.supabaseKey }
}

function asAnswer<T>(data: unknown): Answer<T> {
	if (typeof data !== 'object' || data === null || typeof (data as { ok?: unknown }).ok !== 'boolean') {
		throw new Error('The backend answered something that is not a panel answer')
	}
	return data as Answer<T>
}

/** The relay over a Supabase backend: three RPCs and one private Realtime channel at a time. */
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
		const { data, error } = await this.#client.rpc(name, args)
		if (error) throw new Error(error.message)
		return asAnswer<T>(data)
	}

	async pairFinish(code: string, label: string): Promise<Answer<PairAnswer>> {
		return this.#rpc('panel_pair_finish', { p_code: code, p_label: label })
	}

	async hello(key: string): Promise<Answer<HelloAnswer>> {
		return this.#rpc('panel_hello', { p_key: key })
	}

	async press(key: string, press: Press): Promise<Answer<PressAnswer>> {
		return this.#rpc('panel_press', { p_key: key, p_press: press })
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
