// The vMix adapter: the NoaCG output as a Web Browser input on one of vMix's overlay channels, over
// vMix's TCP API on this computer (docs/work-specs/bridge-vmix-adapter/spec.md).
//
// The Bridge keeps the key of the Browser input it made for each output address. Input numbers
// are positions and move. Out and Clear are sent only while the overlay holds that key: vMix's
// channel-level commands remove whatever is there. Program and Preview stay with the mixer.
//
//// Honest results. vMix answers `FUNCTION OK Completed` to every function, even one it does not have
// or an input key it does not know, so an OK proves nothing: what matters is read back from the XML.
// A function that was sent and got no answer is `uncertain` and never sent again.

import type { AgentError, ItemRef, PlayoutAction, VmixInfo, VmixInput, VmixOverlayState, VmixSlot, VmixTarget } from '../protocol.js';
import { DEFAULT_VMIX_PORT, VmixConnection, parseVmixXml, vmixOverlayCount, type VmixXml } from '../vmixTcp.js';
import { VMIX_INPUT_KEY, vmixOutputId, vmixOutputStore, type VmixOutputStore } from '../vmixOutputs.js';
import type { ActResult, AdapterResult, PlayoutAdapter } from './casparcg.js';

/** The time ONE verb may take, all its commands together, inside the page's 9 s for `/act`. */
const VMIX_TIMEOUT_MS = 7_000;
/** Observe the full window before claiming a new input. Reserve time to finish in the same verb. */
const ADDED_WAIT_MS = 3_000;
const ADDED_POLL_MS = 150;
const ADDED_FINISH_MS = 600;

/** vMix's word for a Web Browser input in its XML. */
const VMIX_BROWSER_TYPE = 'Browser';

/** The name the output input carries in vMix: what the operator sees on its button. */
export function outputInputName(title: string): string {
  return `NoaCG ${title}`;
}

/** One function line: its parameters URL-encoded, which vMix decodes. */
export function functionLine(name: string, params: Record<string, string> = {}): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `FUNCTION ${name}${query ? ` ${query}` : ''}`;
}

/** The vMix adapter: the protocol's verbs, the connection status and what each overlay holds. */
export interface VmixAdapter extends PlayoutAdapter<VmixTarget> {
  /** The port a target that names none reaches: 8099, or `--vmix-port`. */
  readonly port: number;
  status(target: VmixTarget): Promise<AdapterResult<{ version: string; vmix: VmixInfo }>>;
  overlays(target: VmixTarget, outputUrl?: string): Promise<AdapterResult<VmixOverlayState[]>>;
  /** Close every connection, for a Bridge that stops. */
  close(): void;
}

const unsupported = (what: string): { ok: false; error: AgentError } => ({
  ok: false,
  error: { hop: 'agent', code: 'unsupported', detail: `vMix takes the NoaCG output and nothing else from the Bridge, so ${what} was not sent.` },
});
const uncertain = (detail: string): { ok: false; error: AgentError } =>
  ({ ok: false, error: { hop: 'target', code: 'uncertain', detail } });
const refused = (detail: string): { ok: false; error: AgentError } =>
  ({ ok: false, error: { hop: 'target', code: 'refused', detail } });
const storageFailed = () => refused('NoaCG Bridge could not read or keep its vMix output keys. Check vmix-outputs.json before trying again.');
const usage = (detail: string): { ok: false; error: AgentError } => ({ ok: false, error: { hop: 'agent', code: 'usage', detail } });

/** The production's title from a url item, cleaned for an input name: one line, no control
 *  characters or lone surrogates (which could not be URL-encoded), at most 100 characters. */
export function titleOf(item: ItemRef | undefined): string | undefined {
  const clean = item?.label?.replace(/[\p{Cc}\p{Cf}\p{Cs}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const title = clean && Array.from(clean).slice(0, 100).join('').trim();
  return title || undefined;
}

/** What `/status` says of a vMix. */
function describe(xml: VmixXml): VmixInfo {
  return { version: xml.version, edition: xml.edition, overlays: vmixOverlayCount(xml.version, xml.edition), inputs: xml.inputs.length };
}

/** The input on an overlay channel, through the number the XML gives it. */
function onChannel(xml: VmixXml, overlay: number): VmixInput | undefined {
  const n = xml.overlays.get(overlay);
  return n === undefined ? undefined : xml.inputs.find((i) => i.number === n);
}

/** An absent reference is empty. A number that cannot be resolved to a key is unknown. */
function channelKey(xml: VmixXml, overlay: number): string | null | undefined {
  return xml.overlays.has(overlay) ? onChannel(xml, overlay)?.key : null;
}

function ownBrowser(xml: VmixXml, key: string | undefined): VmixInput | undefined {
  return key && VMIX_INPUT_KEY.test(key)
    ? xml.inputs.find(input => input.key === key && input.type === VMIX_BROWSER_TYPE)
    : undefined;
}

function availableName(xml: VmixXml, base: string, key: string): string {
  const taken = new Set(xml.inputs.filter(input => input.key !== key).map(input => input.title));
  let title = base;
  for (let n = 2; taken.has(title); n += 1) title = base + ' (' + n + ')';
  return title;
}

function otherOverlay(xml: VmixXml, input: VmixInput, overlay: number): number | undefined {
  for (const [channel, number] of xml.overlays) {
    if (channel !== overlay && number === input.number) return channel;
  }
}

export function createVmixAdapter(options: { port?: number; timeoutMs?: number; greetingMs?: number; replyMs?: number; outputs?: VmixOutputStore } = {}): VmixAdapter {
  const defaultPort = options.port ?? DEFAULT_VMIX_PORT;
  const timeoutMs = options.timeoutMs ?? VMIX_TIMEOUT_MS;
  const outputs = options.outputs ?? vmixOutputStore();
  const connections = new Map<number, VmixConnection>();
  const portOf = (target: VmixTarget) => target.port ?? defaultPort;
  /** One action at a time per vMix: Put on air knows the input it added only as the one new key
   *  between two readings, which another action's AddInput must not fall between. */
  const turns = new Map<number, Promise<unknown>>();
  const exclusive = <T>(port: number, run: () => Promise<T>): Promise<T> => {
    const next = (turns.get(port) ?? Promise.resolve()).then(run, run);
    turns.set(port, next.catch(() => undefined));
    return next;
  };

  /** The one connection to this port, greeted, or the sentence that says why there is none. */
  async function session(target: VmixTarget): Promise<{ conn: VmixConnection } | { ok: false; error: AgentError }> {
    const port = portOf(target);
    let conn = connections.get(port);
    if (!conn) {
      conn = new VmixConnection(port, { greetingMs: options.greetingMs, replyMs: options.replyMs });
      connections.set(port, conn);
    }
    const r = await conn.open();
    if (r.ok) return { conn };
    const detail =
      r.setup === 'not-running'
        ? `vMix is not running on this computer: nothing answers on port ${port}. Start vMix.`
        : `Something on port ${port} is not vMix's TCP API (${r.why}).`;
    return { ok: false, error: { hop: 'target', code: 'unreachable', setup: r.setup, detail } };
  }

  async function read(conn: VmixConnection, until: number): Promise<AdapterResult<VmixXml> & { lost?: boolean }> {
    const r = await conn.command('XML', until);
    if (!r.ok) {
      const why = r.lost === 'timeout' ? 'no answer in time' : r.lost === 'late' ? 'no time left to ask' : 'the connection closed';
      const lost = r.lost === 'closed' || r.lost === 'not-sent';
      return { ok: false, lost, error: { hop: 'target', code: 'unreachable', detail: `vMix did not answer its state XML (${why}). Is it still running?` } };
    }
    const xml = r.body === undefined ? undefined : parseVmixXml(r.body);
    if (!xml) return { ok: false, error: { hop: 'target', code: 'refused', detail: 'vMix answered XML with something that is not its state.', raw: r.line } };
    return { ok: true, value: xml, raw: r.line };
  }

  /**
   * The connection and vMix's state as it is now: what every verb starts from. A read is safe to
   * repeat, so one that finds the kept connection already closed - vMix quit, or restarted, since
   * the last request - opens a new one and reads again, and reports why when there is none.
   */
  async function begin(target: VmixTarget, until: number): Promise<{ conn: VmixConnection; xml: VmixXml; raw: string } | { ok: false; error: AgentError }> {
    for (let attempt = 0; ; attempt += 1) {
      const s = await session(target);
      if (!('conn' in s)) return s;
      const xml = await read(s.conn, until);
      if (xml.ok) return { conn: s.conn, xml: xml.value, raw: xml.raw };
      if (!xml.lost || attempt > 0) return xml;
    }
  }

  /** One function, never repeated. vMix's OK is only that it read the line. */
  async function fn(conn: VmixConnection, name: string, params: Record<string, string> | undefined, until: number): Promise<AdapterResult<null>> {
    const r = await conn.command(functionLine(name, params), until);
    if (!r.ok) {
      if (r.lost === 'not-sent' || r.lost === 'late') return { ok: false, error: { hop: 'target', code: 'unreachable', detail: `vMix was not sent ${name}: the connection was gone or the time was up. Nothing changed.` } };
      return {
        ok: false,
        error: { hop: 'target', code: 'uncertain', detail: `vMix was sent ${name} and gave no answer (${r.lost === 'timeout' ? 'none in time' : 'the connection closed'}). It may have acted on it: look at vMix before trying again.` },
      };
    }
    if (r.status !== 'OK') return { ok: false, error: { hop: 'target', code: 'refused', detail: `vMix refused ${name}: ${r.line}.`, raw: r.line } };
    return { ok: true, value: null, raw: `${name} ${r.status}` };
  }

  return {
    id: 'vmix',
    port: defaultPort,

    capabilities() {
      return { lists: [], thumbnails: false, verbs: ['take', 'out', 'clear'], target: ['state'] };
    },

    async status(target) {
      const s = await begin(target, Date.now() + timeoutMs);
      if (!('conn' in s)) return s;
      const vmix = describe(s.xml);
      return { ok: true, value: { version: vmix.version, vmix }, raw: `VERSION OK ${vmix.version}; ${vmix.edition}, ${vmix.overlays} overlay channels, ${vmix.inputs} inputs` };
    },

    async overlays(target, outputUrl) {
      const s = await begin(target, Date.now() + timeoutMs);
      if (!('conn' in s)) return s;
      const count = vmixOverlayCount(s.xml.version, s.xml.edition);
      const id = outputUrl === undefined ? undefined : vmixOutputId(outputUrl);
      if (outputUrl !== undefined && !id) return usage('The vMix state reading needs an http or https output address.');
      let owned: VmixInput | undefined;
      if (id) {
        try {
          owned = ownBrowser(s.xml, (await outputs.read(portOf(target))).keys[id]);
        } catch {
          return storageFailed();
        }
      }
      const value: VmixOverlayState[] = [];
      for (let overlay = 1; overlay <= count; overlay += 1) {
        const input = onChannel(s.xml, overlay);
        if (!input && s.xml.overlays.has(overlay)) return refused('vMix did not identify the input on overlay ' + overlay + '.');
        value.push({ overlay, ...(input ? { input } : {}), ...(id ? { ownsOutput: !!owned && input?.key === owned.key } : {}) });
      }
      return { ok: true, value, raw: s.raw };
    },

    async list() {
      return unsupported('a list');
    },

    async thumbnail() {
      return unsupported('a thumbnail');
    },

    async act(target, action: PlayoutAction) {
      // Everything vMix cannot do from here is refused before anything is sent: the cues play inside
      // the output, so the only things the Bridge puts on a channel are that page and nothing else.
      if (action.verb !== 'take' && action.verb !== 'out' && action.verb !== 'clear') return unsupported(`a ${action.verb}`);
      if (action.slot.adapter !== 'vmix') return usage('A vMix command needs a vmix slot.');
      const slot: VmixSlot = action.slot;
      const { item } = action;
      if (item && item.kind !== 'url') return unsupported(`a ${item.kind}`);
      if (action.verb === 'take' && (action.loop || action.playback)) return unsupported('a loop or a playback');
      const title = titleOf(item);
      if (!title) return usage(`${action.verb === 'take' ? 'Put on air' : 'Taking the output off'} names the production: the item's label is its title, which names the vMix input.`);
      const name = outputInputName(title);
      const address = item?.name ?? '';
      const id = vmixOutputId(address);
      if (!id) return usage("vMix needs the NoaCG output's http or https address.");

      const until = Date.now() + timeoutMs;
      return exclusive(portOf(target), () => perform(target, action, slot, name, id, address, until));
    },

    close() {
      for (const c of connections.values()) c.close();
      connections.clear();
    },
  };

  /** Wait for an observable change without repeating a function. */
  async function observe<T>(
    conn: VmixConnection, until: number, stop: number, find: (xml: VmixXml) => T | undefined,
  ): Promise<T | undefined> {
    for (;;) {
      const reply = await read(conn, until);
      if (!reply.ok) return;
      const found = find(reply.value);
      if (found !== undefined || Date.now() + ADDED_POLL_MS >= stop) return found;
      await new Promise(resolve => setTimeout(resolve, ADDED_POLL_MS));
    }
  }

  /** A generic OK does not identify a Browser. Keep every new Browser seen, including one that
   *  disappears. A later AddInput may not use any candidate of an unresolved turn. */
  async function observeAdded(
    conn: VmixConnection, until: number, known: ReadonlySet<string>, expectedTitle: string,
  ): Promise<{ xml: VmixXml; input: VmixInput } | undefined> {
    const stop = Date.now() + ADDED_WAIT_MS;
    const readBy = until - ADDED_FINISH_MS;
    if (stop >= readBy) return;
    const seen = new Set<string>();
    for (;;) {
      const finalRead = Date.now() >= stop;
      const reply = await read(conn, readBy);
      if (!reply.ok) return;
      const current = reply.value.inputs.filter(input => input.type === VMIX_BROWSER_TYPE && !known.has(input.key));
      for (const input of current) seen.add(input.key);
      if (seen.size > 1) return;
      if (finalRead) {
        const input = current[0];
        if (input?.title === expectedTitle && VMIX_INPUT_KEY.test(input.key)) return { xml: reply.value, input };
        return;
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(ADDED_POLL_MS, stop - Date.now()))));
    }
  }

  async function perform(
    target: VmixTarget, action: Extract<PlayoutAction, { verb: 'take' | 'out' | 'clear' }>,
    slot: VmixSlot, name: string, id: string, address: string, until: number,
  ): Promise<ActResult> {
    const port = portOf(target);
    const s = await begin(target, until);
    if (!('conn' in s)) return s;
    const { conn, xml: before } = s;
    const overlay = slot.overlay;
    const count = vmixOverlayCount(before.version, before.edition);
    if (overlay > count) return usage('This vMix offers overlay channels 1 to ' + count + '; there is no channel ' + overlay + '.');
    const original = channelKey(before, overlay);
    if (original === undefined) return refused('vMix did not identify the input on overlay ' + overlay + '.');
    const changed = () => refused('The input on vMix overlay ' + overlay + ' changed. Check it and try again.');
    if (action.verb === 'take' && action.expectedOverlayInput !== undefined && original !== action.expectedOverlayInput) return changed();

    let kept;
    try {
      kept = await outputs.read(port);
      if (kept.keys[id] && !ownBrowser(before, kept.keys[id])) {
        const keys = { ...kept.keys };
        delete keys[id];
        kept = { ...kept, keys };
        await outputs.save(port, kept);
      }
    } catch {
      return storageFailed();
    }
    let output = ownBrowser(before, kept.keys[id]);
    if (action.verb !== 'take') {
      if (!output || original !== output.key) {
        const held = onChannel(before, overlay);
        return { ok: true, value: {}, raw: `already off: overlay ${overlay} holds ${held ? `"${held.title}"` : 'nothing'}` };
      }
      // The overlay command cannot address an input. Recheck after the disk read, then send Out.
      const fresh = await read(conn, until);
      if (!fresh.ok) return fresh;
      const current = channelKey(fresh.value, overlay);
      if (current === undefined) return changed();
      const key = output.key;
      if (current !== key || !ownBrowser(fresh.value, key)) return { ok: true, value: {}, raw: 'already off: overlay ' + overlay + ' no longer holds the output' };
      const sent = await fn(conn, 'OverlayInput' + overlay + (action.verb === 'out' ? 'Out' : 'Off'), undefined, until);
      if (!sent.ok) return sent;
      const off = await observe(conn, until, until, xml => {
        const holds = channelKey(xml, overlay);
        return holds !== undefined && holds !== key ? xml : undefined;
      });
      if (!off) return uncertain('vMix accepted the command, but the Bridge could not confirm the output left overlay ' + overlay + '. Look at vMix.');
      output = ownBrowser(off, key);
      if (action.verb === 'out' && output) {
        const title = availableName(off, name, key);
        if (output.title !== title) {
          const renamed = await fn(conn, 'SetInputName', { Input: key, Value: title }, until);
          if (!renamed.ok) return { ok: true, value: { warning: renamed.error.detail }, raw: sent.raw };
          const checked = await read(conn, until);
          if (!checked.ok || ownBrowser(checked.value, key)?.title !== title) {
            return { ok: true, value: { warning: 'The output is off, but the Bridge could not confirm the new vMix input name.' }, raw: sent.raw };
          }
        }
      }
      return { ok: true, value: {}, raw: sent.raw };
    }

    const alreadyOn = (channel: number) => refused(`Unload the output from vMix overlay ${channel} before loading it on overlay ${overlay}.`);
    const existingOverlay = output && otherOverlay(before, output, overlay);
    if (existingOverlay !== undefined) return alreadyOn(existingOverlay);
    let namingState = before;
    if (!output) {
      if (kept.pending) {
        return uncertain('The Bridge could not identify a previous vMix Browser addition. Check vMix and follow the Bridge guide before adding another output.');
      }
      const tooLate = () => Date.now() + ADDED_WAIT_MS + ADDED_FINISH_MS >= until;
      const noTime = () => refused('There was not enough time to add a new vMix Browser input. Try Load again.');
      if (tooLate()) return noTime();
      try {
        await outputs.save(port, { ...kept, pending: true });
        if (tooLate()) {
          await outputs.save(port, { keys: kept.keys });
          return noTime();
        }
      } catch {
        return storageFailed();
      }
      const added = await fn(conn, 'AddInput', { Value: 'Browser|' + address }, until);
      if (!added.ok) {
        if (added.error.code !== 'uncertain') {
          try {
            await outputs.save(port, { keys: kept.keys });
          } catch {
            return storageFailed();
          }
        }
        return added;
      }
      const known = new Set([...before.inputs.map(input => input.key), ...Object.values(kept.keys)]);
      const found = await observeAdded(conn, until, known, 'Browser ' + new URL(address).hostname);
      if (!found) {
        return uncertain('vMix accepted adding a Browser, but the Bridge could not identify one new output input. Nothing was put on air. Look at vMix.');
      }
      output = found.input;
      namingState = found.xml;
      try {
        await outputs.save(port, { keys: { ...kept.keys, [id]: output.key } });
      } catch {
        return uncertain('vMix added a Browser input, but the Bridge could not keep its key. Nothing was put on air. Look at vMix.');
      }
    }

    const title = availableName(namingState, name, output.key);
    if (output.title !== title) {
      const renamed = await fn(conn, 'SetInputName', { Input: output.key, Value: title }, until);
      if (!renamed.ok) return renamed;
    }
    const fresh = await read(conn, until);
    if (!fresh.ok) return fresh;
    if (channelKey(fresh.value, overlay) !== original) return changed();
    const confirmed = ownBrowser(fresh.value, output.key);
    if (confirmed?.title !== title) {
      return uncertain('vMix did not confirm the name of the output Browser input. Nothing was put on air.');
    }
    const moved = otherOverlay(fresh.value, confirmed, overlay);
    if (moved !== undefined) return alreadyOn(moved);
    const shown = await fn(conn, 'OverlayInput' + overlay + 'In', { Input: output.key }, until);
    if (!shown.ok) return shown;
    const after = await read(conn, until);
    if (!after.ok || channelKey(after.value, overlay) !== output.key) {
      return uncertain('vMix accepted putting the output on overlay ' + overlay + ', but the Bridge could not confirm it. Look at vMix.');
    }
    return { ok: true, value: {}, raw: shown.raw + '; overlay ' + overlay + ' holds the output' };
  }
}
