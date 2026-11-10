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

import { VMIX_INPUT_KEY, type AgentError, type ItemRef, type PlayoutAction, type VmixInfo, type VmixInput, type VmixOverlayState, type VmixSlot, type VmixTarget } from '../protocol.js';
import { DEFAULT_VMIX_PORT, VmixConnection, parseVmixXml, vmixOverlayCount, type VmixXml } from '../vmixTcp.js';
import { newVmixBrowser, vmixOutputAddress, vmixOutputId, vmixOutputStore, vmixRedirectRequest, type VmixOutputStore } from '../vmixOutputs.js';
import type { ActResult, AdapterResult, PlayoutAdapter } from './casparcg.js';

/** The time ONE verb may take, all its commands together, inside the page's 9 s for `/act`. */
const VMIX_TIMEOUT_MS = 7_000;
/** Wait this long for the exact Browser marker. Reserve time to finish in the same verb. */
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
  status(target: VmixTarget, receivedAt?: number): Promise<AdapterResult<{ version: string; vmix: VmixInfo }>>;
  overlays: NonNullable<PlayoutAdapter<VmixTarget>['overlays']>;
  outputRedirect(host: string | undefined, path: string | undefined, port: number): Promise<string | undefined>;
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
  if (!xml.reportedOverlays.has(overlay)) return undefined;
  return xml.overlays.has(overlay) ? onChannel(xml, overlay)?.key : null;
}

function unreadChannel(xml: VmixXml, count: number): number | undefined {
  for (let channel = 1; channel <= count; channel += 1) {
    if (channelKey(xml, channel) === undefined) return channel;
  }
}

/** An Out needs its selected channel. Load and state need all supported channels. */
interface SnapshotScope {
  expectedCount?: number;
  overlay?: number;
  selectedOnly?: boolean;
}

function ownBrowser(xml: VmixXml, key: string | undefined): VmixInput | undefined {
  return key && VMIX_INPUT_KEY.test(key)
    ? xml.inputs.find(input => input.key === key.toLowerCase() && input.type === VMIX_BROWSER_TYPE)
    : undefined;
}

function browserPortProblem(keptPort: number | undefined, bridgePort: number | undefined): string | undefined {
  if (keptPort === undefined) return 'NoaCG Bridge cannot verify this vMix Browser address. Unload and remove the Browser input in vMix before loading again.';
  if (keptPort !== bridgePort) return `This vMix Browser uses NoaCG Bridge port ${keptPort}. Start Bridge on that port and pair it again before loading.`;
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

export function createVmixAdapter(options: {
  port?: number; timeoutMs?: number; greetingMs?: number; replyMs?: number; outputs?: VmixOutputStore;
  ownershipProblem?: () => string | undefined;
} = {}): VmixAdapter {
  const defaultPort = options.port ?? DEFAULT_VMIX_PORT;
  const timeoutMs = options.timeoutMs ?? VMIX_TIMEOUT_MS;
  const outputs = options.outputs ?? vmixOutputStore();
  const connections = new Map<number, VmixConnection>();
  const portOf = (target: VmixTarget) => target.port ?? defaultPort;
  // A Browser can navigate while AddInput is still being confirmed. Only committed aliases
  // survive a Bridge restart.
  const adding = new Map<string, string>();
  /** Keep each vMix request's TCP turn through the final read and any channel command. */
  const turns = new Map<number, Promise<unknown>>();
  const exclusive = <T>(port: number, run: () => Promise<T>): Promise<T> => {
    const next = (turns.get(port) ?? Promise.resolve()).then(run, run);
    turns.set(port, next.catch(() => undefined));
    return next;
  };

  const timedOut = (): { ok: false; error: AgentError } =>
    ({ ok: false, error: { hop: 'target', code: 'unreachable', detail: 'vMix did not answer within the request deadline.' } });

  /** The one connection to this port, greeted, or the sentence that says why there is none. */
  async function session(target: VmixTarget, until: number): Promise<{ conn: VmixConnection } | { ok: false; error: AgentError }> {
    const port = portOf(target);
    let conn = connections.get(port);
    if (!conn) {
      conn = new VmixConnection(port, { greetingMs: options.greetingMs, replyMs: options.replyMs });
      connections.set(port, conn);
    }
    const r = await conn.open(until);
    if (r.ok) return { conn };
    if (!r.setup) return timedOut();
    const detail =
      r.setup === 'not-running'
        ? `vMix is not running on this computer: nothing answers on port ${port}. Start vMix.`
        : `Something on port ${port} is not vMix's TCP API (${r.why}).`;
    return { ok: false, error: { hop: 'target', code: 'unreachable', setup: r.setup, detail } };
  }

  async function read(conn: VmixConnection, until: number, scope: SnapshotScope | 'diagnostic' = {}): Promise<AdapterResult<VmixXml> & { lost?: boolean }> {
    const r = await conn.command('XML', until);
    if (!r.ok) {
      const why = r.lost === 'timeout' ? 'no answer in time' : r.lost === 'late' ? 'no time left to ask' : 'the connection closed';
      const lost = r.lost === 'closed' || r.lost === 'not-sent';
      return { ok: false, lost, error: { hop: 'target', code: 'unreachable', detail: `vMix did not answer its state XML (${why}). Is it still running?` } };
    }
    const xml = r.body === undefined ? undefined : parseVmixXml(r.body);
    if (!xml) return { ok: false, error: { hop: 'target', code: 'refused', detail: 'vMix answered XML with something that is not its state.', raw: r.line } };
    if (scope !== 'diagnostic') {
      const count = vmixOverlayCount(xml.version, xml.edition);
      if (scope.expectedCount !== undefined && scope.expectedCount !== count) return refused('The vMix overlay count changed. Check it and try again.');
      const selected = scope.overlay;
      const missing = selected !== undefined && selected <= count && channelKey(xml, selected) === undefined
        ? selected
        : scope.selectedOnly ? undefined : unreadChannel(xml, count);
      if (missing !== undefined) return refused('vMix did not identify the input on overlay ' + missing + '.');
    }
    return { ok: true, value: xml, raw: r.line };
  }

  /**
   * The connection and vMix's state as it is now: what every verb starts from. A read is safe to
   * repeat, so one that finds the kept connection already closed - vMix quit, or restarted, since
   * the last request - opens a new one and reads again, and reports why when there is none.
   */
  async function begin(target: VmixTarget, until: number, scope?: SnapshotScope | 'diagnostic'): Promise<{ conn: VmixConnection; xml: VmixXml; raw: string } | { ok: false; error: AgentError }> {
    for (let attempt = 0; ; attempt += 1) {
      if (Date.now() >= until) return timedOut();
      const s = await session(target, until);
      if (!('conn' in s)) return s;
      const xml = await read(s.conn, until, scope);
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

    async status(target, receivedAt = Date.now()) {
      return exclusive(portOf(target), async () => {
        const s = await begin(target, receivedAt + timeoutMs, 'diagnostic');
        if (!('conn' in s)) return s;
        const vmix = describe(s.xml);
        return { ok: true, value: { version: vmix.version, vmix }, raw: `VERSION OK ${vmix.version}; ${vmix.edition}, ${vmix.overlays} overlay channels, ${vmix.inputs} inputs` };
      });
    },

    async overlays(target, outputUrl, { receivedAt = Date.now(), vmixBridgePort } = {}) {
      return exclusive(portOf(target), async () => {
        const s = await begin(target, receivedAt + timeoutMs);
        if (!('conn' in s)) return s;
        const count = vmixOverlayCount(s.xml.version, s.xml.edition);
        const id = outputUrl === undefined ? undefined : vmixOutputId(outputUrl);
        if (outputUrl !== undefined && !id) return usage('The vMix state reading needs an http or https output address.');
        const ownershipProblem = id ? options.ownershipProblem?.() : undefined;
        let owned: VmixInput | undefined;
        let loadProblem = ownershipProblem;
        if (id && !ownershipProblem) {
          try {
            const kept = await outputs.read(portOf(target));
            owned = ownBrowser(s.xml, kept.keys[id]);
            if (owned && vmixBridgePort !== undefined) loadProblem = browserPortProblem(kept.bridgePorts?.[id], vmixBridgePort);
          } catch {
            return storageFailed();
          }
        }
        const value: VmixOverlayState[] = [];
        for (let overlay = 1; overlay <= count; overlay += 1) {
          const input = onChannel(s.xml, overlay);
          value.push({ overlay, ...(input ? { input } : {}), ...(id && !ownershipProblem ? { ownsOutput: !!owned && input?.key === owned.key } : {}) });
        }
        return { ok: true, value: { overlays: value, ...(loadProblem ? { loadProblem } : {}) }, raw: s.raw };
      });
    },

    async list() {
      return unsupported('a list');
    },

    async thumbnail() {
      return unsupported('a thumbnail');
    },

    async outputRedirect(host, path, port) {
      if (options.ownershipProblem?.()) return;
      const request = vmixRedirectRequest(host, path, port);
      if (!request) return;
      const digest = adding.get(request.alias) ?? await outputs.redirect(request.alias);
      if (digest === request.digest) return request.output;
    },

    async act(target, action: PlayoutAction, context) {
      // Everything vMix cannot do from here is refused before anything is sent: the cues play inside
      // the output, so the only things the Bridge puts on a channel are that page and nothing else.
      if (action.verb !== 'take' && action.verb !== 'out' && action.verb !== 'clear') return unsupported(`a ${action.verb}`);
      const ownershipProblem = options.ownershipProblem?.();
      if (ownershipProblem) return refused(ownershipProblem);
      if (action.slot.adapter !== 'vmix') return usage('A vMix command needs a vmix slot.');
      const slot: VmixSlot = action.slot;
      const { item } = action;
      if (item && item.kind !== 'url') return unsupported(`a ${item.kind}`);
      if (action.verb === 'take' && (action.loop || action.playback)) return unsupported('a loop or a playback');
      const title = titleOf(item);
      if (!title) return usage(`${action.verb === 'take' ? 'Put on air' : 'Taking the output off'} names the production: the item's label is its title, which names the vMix input.`);
      const name = outputInputName(title);
      const address = vmixOutputAddress(item?.name ?? '')?.href;
      const id = address && vmixOutputId(address);
      if (!address || !id) return usage("vMix needs the NoaCG output's http or https address.");

      const until = (context?.receivedAt ?? Date.now()) + timeoutMs;
      return exclusive(portOf(target), () => perform(target, action, slot, name, id, address, until, context?.vmixBridgePort));
    },

    close() {
      for (const c of connections.values()) c.close();
      connections.clear();
    },
  };

  /** Wait for an observable change without repeating a function. */
  async function observe<T>(
    conn: VmixConnection, until: number, stop: number, scope: SnapshotScope, find: (xml: VmixXml) => T | undefined,
  ): Promise<T | undefined> {
    for (;;) {
      const reply = await read(conn, until, scope);
      if (!reply.ok) return;
      const found = find(reply.value);
      if (found !== undefined || Date.now() + ADDED_POLL_MS >= stop) return found;
      await new Promise(resolve => setTimeout(resolve, ADDED_POLL_MS));
    }
  }

  /** Observe only this attempt's exact default title over the existing observation interval. */
  async function observeAdded(
    conn: VmixConnection, until: number, scope: SnapshotScope, known: ReadonlySet<string>, expectedTitle: string,
  ): Promise<{ xml: VmixXml; input: VmixInput } | undefined> {
    const readBy = Math.min(Date.now() + ADDED_WAIT_MS, until - ADDED_FINISH_MS);
    let observedKey: string | undefined;
    for (;;) {
      const finalRead = Date.now() + ADDED_POLL_MS >= readBy;
      const reply = await read(conn, readBy, scope);
      if (!reply.ok || Date.now() > readBy) return;
      const matches = reply.value.inputs.filter(input => input.type === VMIX_BROWSER_TYPE && input.title === expectedTitle);
      if (matches.length > 1) return;
      const [input] = matches;
      if (input) {
        if (known.has(input.key) || (observedKey && observedKey !== input.key)) return;
        observedKey = input.key;
      }
      if (finalRead) return input && { xml: reply.value, input };
      await new Promise(resolve => setTimeout(resolve, ADDED_POLL_MS));
    }
  }

  async function perform(
    target: VmixTarget, action: Extract<PlayoutAction, { verb: 'take' | 'out' | 'clear' }>,
    slot: VmixSlot, name: string, id: string, address: string, until: number, bridgePort: number | undefined,
  ): Promise<ActResult> {
    const port = portOf(target);
    const overlay = slot.overlay;
    const selectedOnly = action.verb !== 'take';
    const s = await begin(target, until, { overlay, selectedOnly });
    if (!('conn' in s)) return s;
    const { conn, xml: before } = s;
    const count = vmixOverlayCount(before.version, before.edition);
    if (overlay > count) return usage('This vMix offers overlay channels 1 to ' + count + '; there is no channel ' + overlay + '.');
    const scope = { overlay, selectedOnly, expectedCount: count };
    const original = channelKey(before, overlay);
    const changed = () => refused('The input on vMix overlay ' + overlay + ' changed. Check it and try again.');
    if (action.verb === 'take' && action.expectedOverlayInput !== undefined && original !== action.expectedOverlayInput) return changed();

    let kept;
    try {
      kept = await outputs.read(port);
      if (action.verb === 'take' && kept.keys[id] && !ownBrowser(before, kept.keys[id])) {
        const keys = { ...kept.keys };
        const bridgePorts = { ...kept.bridgePorts };
        delete keys[id];
        delete bridgePorts[id];
        kept = { keys, bridgePorts };
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
      const fresh = await read(conn, until, scope);
      if (!fresh.ok) return fresh;
      const current = channelKey(fresh.value, overlay);
      const key = output.key;
      if (current !== key || !ownBrowser(fresh.value, key)) return { ok: true, value: {}, raw: 'already off: overlay ' + overlay + ' no longer holds the output' };
      const sent = await fn(conn, 'OverlayInput' + overlay + (action.verb === 'out' ? 'Out' : 'Off'), undefined, until);
      if (!sent.ok) return sent;
      const off = await observe(conn, until, until, scope, xml => channelKey(xml, overlay) !== key ? xml : undefined);
      if (!off) return uncertain('vMix accepted the command, but the Bridge could not confirm the output left overlay ' + overlay + '. Look at vMix.');
      output = ownBrowser(off, key);
      if (action.verb === 'out' && output) {
        const title = availableName(off, name, key);
        if (output.title !== title) {
          const renamed = await fn(conn, 'SetInputName', { Input: key, Value: title }, until);
          if (!renamed.ok) return { ok: true, value: { warning: renamed.error.detail }, raw: sent.raw };
          const checked = await read(conn, until, scope);
          if (!checked.ok || ownBrowser(checked.value, key)?.title !== title) {
            return { ok: true, value: { warning: 'The output is off, but the Bridge could not confirm the new vMix input name.' }, raw: sent.raw };
          }
        }
      }
      return { ok: true, value: {}, raw: sent.raw };
    }

    if (output) {
      const problem = browserPortProblem(kept.bridgePorts?.[id], bridgePort);
      if (problem) return refused(problem);
    }
    const alreadyOn = (channel: number) => refused(`Unload the output from vMix overlay ${channel} before loading it on overlay ${overlay}.`);
    const existingOverlay = output && otherOverlay(before, output, overlay);
    if (existingOverlay !== undefined) return alreadyOn(existingOverlay);
    let namingState = before;
    if (!output) {
      if (!bridgePort) return refused('Start NoaCG Bridge before adding a vMix Browser input.');
      if (Date.now() + ADDED_WAIT_MS + ADDED_FINISH_MS >= until) {
        return refused('There was not enough time to add a new vMix Browser input. Try Load again.');
      }
      const browser = newVmixBrowser(address, bridgePort);
      const { alias, digest } = browser.binding;
      adding.set(alias, digest);
      try {
        const added = await fn(conn, 'AddInput', { Value: 'Browser|' + browser.address }, until);
        if (!added.ok) return added;
        const known = new Set([...before.inputs.map(input => input.key), ...Object.values(kept.keys).map(key => key.toLowerCase())]);
        const found = await observeAdded(conn, until, scope, known, 'Browser ' + alias);
        if (!found) {
          return uncertain('vMix accepted adding a Browser, but the Bridge could not identify one new output input. Nothing was put on air. Look at vMix.');
        }
        output = found.input;
        namingState = found.xml;
        try {
          await outputs.save(port, {
            keys: { ...kept.keys, [id]: output.key },
            bridgePorts: { ...kept.bridgePorts, [id]: bridgePort },
          }, browser.binding);
        } catch {
          return uncertain('vMix added a Browser input, but the Bridge could not keep its key. Nothing was put on air. Look at vMix.');
        }
      } finally {
        adding.delete(alias);
      }
    }

    const title = availableName(namingState, name, output.key);
    if (output.title !== title) {
      const renamed = await fn(conn, 'SetInputName', { Input: output.key, Value: title }, until);
      if (!renamed.ok) return renamed;
    }
    const fresh = await read(conn, until, scope);
    if (!fresh.ok) return fresh;
    if (channelKey(fresh.value, overlay) !== original) return changed();
    const confirmed = ownBrowser(fresh.value, output.key);
    if (confirmed?.title !== title) {
      return uncertain('vMix did not confirm the name of the output Browser input. Nothing was put on air.');
    }
    const moved = otherOverlay(fresh.value, confirmed, overlay);
    if (moved !== undefined) return alreadyOn(moved);
    if (original === output.key) return { ok: true, value: {}, raw: 'already on: overlay ' + overlay + ' holds the output' };
    const shown = await fn(conn, 'OverlayInput' + overlay + 'In', { Input: output.key }, until);
    if (!shown.ok) return shown;
    const after = await read(conn, until, scope);
    if (!after.ok || channelKey(after.value, overlay) !== output.key || !ownBrowser(after.value, output.key)) {
      return uncertain('vMix accepted putting the output on overlay ' + overlay + ', but the Bridge could not confirm it. Look at vMix.');
    }
    return { ok: true, value: {}, raw: shown.raw + '; overlay ' + overlay + ' holds the output' };
  }
}
