// vMix's TCP API, precisely: the wire on 127.0.0.1:8099 (docs/work-specs/bridge-vmix-adapter).
//
// Every shape here came off vMix 29.0.0.49 (Trial) on 2026-10-12:
//   on connect                     VERSION OK 29.0.0.49\r\n            (about 20 ms after the socket opens)
//   XML\r\n                        XML 1890\r\n<1890 bytes: <vmix>…</vmix>\r\n>
//   FUNCTION <name> <query>\r\n    FUNCTION OK Completed\r\n           (for ANY name and ANY Input=, even
//                                                                       ones vMix does not have: an OK
//                                                                       proves nothing was done)
//   SUBSCRIBE ACTS\r\n             SUBSCRIBE OK ACTS Subscribed\r\n, then ACTS OK <activator> <args>\r\n
//   an unknown command             HELLO ER Unknown Command\r\n
// The query's values are URL-decoded by vMix (`Value=NoaCG%3A%20A%20%26%20co` named an input
// `NoaCG: A & co`). ACTS lines arrive between replies, before or after the FUNCTION OK of the call
// that caused them, never inside an XML body, so a reply is matched by its first word and an XML
// body read by its length.
//
// ONE connection per port, kept open and shared by every request: the overlay-press subscription
// needs it held, and vMix answers in order, so commands go one at a time. A reply that never comes
// closes the connection - the next reply could no longer be told from this one's - and the next
// request opens a new one. Nothing is ever sent twice.

import { isUtf8 } from 'node:buffer';
import { connect, type Socket } from 'node:net';
import { SaxesParser } from 'saxes';
import { isNCNameStartChar } from 'xmlchars/xmlns/1.0/ed3.js';
import { VMIX_INPUT_KEY, VMIX_VERSION, type VmixInput } from './protocol.js';

/** vMix's TCP API port, documented and fixed unless somebody changed vMix's own setting. */
export const DEFAULT_VMIX_PORT = 8099;
/** The wait for `VERSION OK` after the socket opens: vMix greets in tens of milliseconds. */
const VMIX_GREETING_MS = 3000;
/** The wait for one command's answer. */
const VMIX_REPLY_MS = 3000;
/** The longest line and the largest XML body taken in before the connection is dropped. */
const MAX_LINE_BYTES = 64 * 1024;
const MAX_XML_BYTES = 16 * 1024 * 1024;

export type VmixOpen = { ok: true } | { ok: false; setup?: 'not-running' | 'not-vmix'; why: string };

/** One command's answer: its status line (and an XML body), or why there is none. `not-sent` (no
 *  connection) and `late` (its turn came with the verb's time spent) never left, so nothing can have
 *  happened. `timeout`, `closed` and `invalid-reply` left without a usable answer, so they may have.
 */
export type VmixReply = { ok: true; status: string; line: string; body?: string } | { ok: false; lost: 'not-sent' | 'late' | 'timeout' | 'closed' | 'invalid-reply' };

interface Pending {
  word: string;
  done: (r: VmixReply) => void;
  timer: NodeJS.Timeout;
}

export class VmixConnection {
  private readonly port: number;
  private readonly greetingMs: number;
  private readonly replyMs: number;
  private socket?: Socket;
  private version?: string;
  private opening?: Promise<VmixOpen>;
  private buf: Buffer = Buffer.alloc(0);
  private body?: { line: string; status: string; data: Buffer; got: number };
  private pending?: Pending;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(port: number, options: { greetingMs?: number; replyMs?: number } = {}) {
    this.port = port;
    this.greetingMs = options.greetingMs ?? VMIX_GREETING_MS;
    this.replyMs = options.replyMs ?? VMIX_REPLY_MS;
  }

  /** The connection, greeted: the open one, or a new one. */
  open(until = Infinity): Promise<VmixOpen> {
    const wait = Math.min(this.greetingMs, until - Date.now());
    if (wait <= 0) return Promise.resolve({ ok: false, why: 'the request deadline expired' });
    if (this.socket && this.version && !this.socket.destroyed) return Promise.resolve({ ok: true });
    this.opening ??= this.start(wait).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  /** Close it, answering whatever waits as lost. */
  close(): void {
    this.socket?.destroy();
  }

  private start(wait: number): Promise<VmixOpen> {
    return new Promise((resolve) => {
      const s = connect({ host: '127.0.0.1', port: this.port });
      s.setNoDelay(true);
      // The Bridge's HTTP server keeps the process alive; a connection to vMix never does on its own.
      s.unref();
      // A command still waiting on a socket already destroyed has lost its answer.
      this.reset();
      this.socket = s;
      let connected = false;
      let settled = false;
      const settle = (r: VmixOpen) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!r.ok) s.destroy();
        resolve(r);
      };
      const timer = setTimeout(() => settle(wait < this.greetingMs
        ? { ok: false, why: 'the request deadline expired during the greeting' }
        : { ok: false, setup: 'not-vmix', why: `port ${this.port} accepted the connection but sent no VERSION OK greeting within ${this.greetingMs} ms` }), wait);
      s.once('connect', () => {
        connected = true;
      });
      s.on('error', (e: NodeJS.ErrnoException) => {
        // Refused before it connected is nothing listening; anything after is something that is not vMix.
        settle(connected ? { ok: false, setup: 'not-vmix', why: `port ${this.port} dropped the connection (${e.code ?? e.message})` } : { ok: false, setup: 'not-running', why: e.code ?? e.message });
      });
      s.on('close', () => {
        settle({ ok: false, setup: connected ? 'not-vmix' : 'not-running', why: `port ${this.port} closed the connection before greeting` });
        this.closed(s);
      });
      s.on('data', (d: Buffer) => this.data(s, d, settle));
    });
  }

  private closed(s: Socket): void {
    if (this.socket !== s) return;
    this.socket = undefined;
    this.reset();
  }

  /** Nothing of a connection left: no greeting, nothing half read, nothing waiting for an answer. */
  private reset(): void {
    this.version = undefined;
    this.body = undefined;
    this.buf = Buffer.alloc(0);
    this.finish({ ok: false, lost: 'closed' });
  }

  private data(s: Socket, d: Buffer, greeted: (r: VmixOpen) => void): void {
    if (this.socket !== s) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const body = this.body;
      if (body) {
        // Copied once into a buffer of the announced size, so a long XML is never re-joined per chunk.
        const n = this.buf.copy(body.data, body.got);
        body.got += n;
        this.buf = this.buf.subarray(n);
        if (body.got < body.data.length) return;
        this.body = undefined;
        this.finish({ ok: true, status: body.status, line: body.line, body: isUtf8(body.data) ? body.data.toString('utf8') : undefined });
        continue;
      }
      const awaitingFunction = this.pending?.word === 'FUNCTION';
      const nl = this.buf.indexOf(0x0a);
      if (nl < 0) {
        if (this.buf.length > MAX_LINE_BYTES) {
          if (awaitingFunction) this.rejectFunctionReply(s);
          else s.destroy();
        }
        return;
      }
      const lineBytes = this.buf.subarray(0, nl);
      this.buf = this.buf.subarray(nl + 1);
      if (awaitingFunction) {
        if (!this.readFunctionLine(lineBytes)) {
          this.rejectFunctionReply(s);
          return;
        }
        continue;
      }
      const line = lineBytes.toString('utf8').replace(/\r$/, '');
      if (!this.version) {
        const m = /^VERSION OK (\S.*)$/.exec(line);
        if (!m) {
          greeted({ ok: false, setup: 'not-vmix', why: `port ${this.port} greeted with "${line.slice(0, 80)}", not VERSION OK` });
          return;
        }
        this.version = m[1].trim();
        greeted({ ok: true });
        continue;
      }
      const [word, status = ''] = line.split(' ');
      // Only the waiting command's own word answers it: a subscription's `ACTS OK …` lines are no
      // reply to anything (the overlay-press reader takes them).
      if (!this.pending || word !== this.pending.word) continue;
      if (word === 'XML') {
        const size = /^XML (\d+)$/.exec(line)?.[1];
        if (size !== undefined) {
          const length = Number(size);
          if (length > MAX_XML_BYTES) {
            s.destroy();
            return;
          }
          this.body = { line, status, data: Buffer.allocUnsafe(length), got: 0 };
          continue;
        }
        if (status !== 'ER') {
          // A malformed header may be followed by a body we can no longer frame.
          this.finish({ ok: true, status, line });
          s.destroy();
          return;
        }
      }
      this.finish({ ok: true, status, line });
    }
  }

  /** Only a FUNCTION answer or an asynchronous event can arrive during a FUNCTION turn. */
  private readFunctionLine(bytes: Buffer): boolean {
    if (bytes.length > MAX_LINE_BYTES || bytes.at(-1) !== 0x0d || !isUtf8(bytes)) return false;
    const line = bytes.subarray(0, -1).toString('utf8');
    const envelope = /^(FUNCTION|ACTS|TALLY) (OK|ER)(?: [^\r\n]+)?$/.exec(line);
    if (!envelope) return false;
    const [, word, status] = envelope;
    if (word !== 'FUNCTION') return status === 'OK';
    this.finish({ ok: true, status, line });
    return true;
  }

  private rejectFunctionReply(s: Socket): void {
    // Discard the remaining bytes so a later line cannot answer the command.
    s.destroy();
    this.finish({ ok: false, lost: 'invalid-reply' });
    this.closed(s);
  }

  private finish(r: VmixReply): void {
    const p = this.pending;
    if (!p) return;
    this.pending = undefined;
    clearTimeout(p.timer);
    p.done(r);
  }

  /**
   * Send one command line and wait for its answer, after every command sent before it. `until` is
   * the verb's deadline on `Date.now()`: the wait is the shorter of it and the reply timeout, and a
   * command whose turn comes with no time left is never sent.
   */
  command(line: string, until: number): Promise<VmixReply> {
    if (/[\r\n]/.test(line)) throw new Error('A vMix command is one line.');
    const run = this.tail.then(() => this.exchange(line, until));
    // The tail holds no reply, so the last XML body is not kept alive between commands.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private exchange(line: string, until: number): Promise<VmixReply> {
    const s = this.socket;
    const wait = Math.min(this.replyMs, until - Date.now());
    if (!s || s.destroyed || !this.version) return Promise.resolve({ ok: false, lost: 'not-sent' });
    if (wait <= 0) return Promise.resolve({ ok: false, lost: 'late' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.finish({ ok: false, lost: 'timeout' });
        // The answer may still come, and would then read as the next command's.
        s.destroy();
      }, wait);
      this.pending = { word: line.split(' ')[0], done: resolve, timer };
      s.write(`${line}\r\n`);
    });
  }
}

// --- The state XML ----------------------------------------------------------------------------

/** What the Bridge reads off vMix's state XML. `overlays` maps a channel to the NUMBER of the input
 *  on it, which is a position and moves, so it is resolved through `inputs` at once and never kept. */
export interface VmixXml {
  version: string;
  edition: string;
  inputs: VmixInput[];
  shortTitles: Map<string, string>;
  blanks: Set<string>;
  lists: Map<string, VmixVideoList>;
  overlays: Map<number, number>;
  reportedOverlays: Set<number>;
}

export interface VmixVideoList {
  items: string[];
  /** The XML uses a one-based index. No item may be selected while the list changes. */
  selected: number;
  state: string;
  positionMs: number;
  durationMs: number;
  loop: boolean;
  /** Omitted when this input did not report audio mute state. */
  muted?: boolean;
}

const MAX_XML_DEPTH = 128;
const STATE_SECTIONS = new Set(['version', 'edition', 'inputs', 'overlays']);
const XML_SPACE = /^[ \t\r\n]*$/;
const trimXml = (text: string) => text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
const unqualified = ({ prefix, uri }: { prefix: string; uri: string }) => prefix === '' && uri === '';

function stateInteger(value: string | undefined): number | undefined {
  if (value === '0') return 0;
  return positiveInteger(value);
}

function stateBoolean(value: string | undefined): boolean | undefined {
  if (value?.toLowerCase() === 'true') return true;
  if (value?.toLowerCase() === 'false') return false;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return;
  const number = Number(value);
  if (Number.isSafeInteger(number)) return number;
}

/** Validate the whole document, including content the Bridge does not use. Only direct vMix
 *  state elements count: an input's own layers are nested <overlay index> elements. */
export function parseVmixXml(xml: string): VmixXml | undefined {
  const parser = new SaxesParser({ xmlns: true });
  const seen = new Set<string>();
  const keys = new Set<string>();
  const numbers = new Set<number>();
  const inputs: VmixInput[] = [];
  const shortTitles = new Map<string, string>();
  const blanks = new Set<string>();
  const lists = new Map<string, VmixVideoList>();
  const overlays = new Map<number, number>();
  const reportedOverlays = new Set<number>();
  let depth = 0;
  let section: string | undefined;
  let scalar: string | undefined;
  let channel: number | undefined;
  let version = '';
  let edition = '';
  let videoList: { key: string; value?: VmixVideoList; seen: boolean; invalid: boolean; marked: number[] } | undefined;
  let listDepth: number | undefined;
  let item: { text: string; selected: boolean } | undefined;

  const invalid = (): never => { throw new Error('Invalid vMix state XML.'); };
  parser.on('doctype', invalid);
  parser.on('xmldecl', ({ version, encoding }) => {
    if (version !== '1.0' || (encoding !== undefined && encoding.toLowerCase() !== 'utf-8')) invalid();
  });
  parser.on('opentagstart', () => {
    // Namespace lookup in Saxes walks the ancestors. Bound it even in ignored data.
    if (scalar !== undefined || depth >= MAX_XML_DEPTH) invalid();
  });
  parser.on('attribute', ({ name, prefix, local, value }) => {
    // Saxes 6 checks for misplaced colons, but accepts a QName local part starting with a digit.
    if (!isNCNameStartChar(local.codePointAt(0) ?? -1)) invalid();
    // Saxes trims declarations when resolving names. Don't let whitespace change a namespace.
    if ((prefix === 'xmlns' || name === 'xmlns') && (/[ \t\r\n]/.test(value) || value !== value.trim())) invalid();
  });
  parser.on('opentag', tag => {
    if (!isNCNameStartChar(tag.local.codePointAt(0) ?? -1)) invalid();
    depth += 1;
    if (depth === 1) {
      if (tag.local !== 'vmix' || !unqualified(tag) || Object.keys(tag.attributes).length) invalid();
    } else if (depth === 2 && STATE_SECTIONS.has(tag.local)) {
      section = tag.local;
      if (!unqualified(tag) || Object.keys(tag.attributes).length || seen.has(section)) invalid();
      seen.add(section);
      if (section === 'version' || section === 'edition') scalar = '';
    } else if (depth === 3 && section === 'inputs') {
      if (tag.local !== 'input' || !unqualified(tag)) invalid();
      const attribute = (name: string) => {
        const a = tag.attributes[name];
        return a && unqualified(a) ? a.value : undefined;
      };
      const key = attribute('key')?.toLowerCase();
      const number = positiveInteger(attribute('number'));
      const title = attribute('title');
      const type = attribute('type');
      if (!key || !VMIX_INPUT_KEY.test(key) || number === undefined || title === undefined || !type?.trim() ||
        keys.has(key) || numbers.has(number)) return invalid();
      keys.add(key);
      numbers.add(number);
      inputs.push({ key, number, title, type });
      const shortTitle = attribute('shortTitle');
      if (shortTitle !== undefined) shortTitles.set(key, shortTitle);
      if (type === 'Blank' && title === 'Blank' && shortTitle === 'Blank' && attribute('state') === 'Paused' &&
          attribute('position') === '0' && attribute('duration') === '0' && stateBoolean(attribute('loop')) === false) blanks.add(key);
      if (type === 'VideoList') {
        const selected = stateInteger(attribute('selectedIndex'));
        const positionMs = stateInteger(attribute('position'));
        const durationMs = stateInteger(attribute('duration'));
        const state = attribute('state');
        const loop = stateBoolean(attribute('loop'));
        // An unreadable mute field cannot prove audio readiness. The other list fields still
        // identify the selected occurrence independently of that setting.
        const muted = stateBoolean(attribute('muted'));
        const value = selected !== undefined && positionMs !== undefined && durationMs !== undefined && state && loop !== undefined
          ? { items: [], selected, state, positionMs, durationMs, loop, ...(muted !== undefined ? { muted } : {}) }
          : undefined;
        videoList = { key, value, seen: false, invalid: false, marked: [] };
      }
    } else if (depth === 3 && section === 'overlays') {
      const number = tag.attributes.number;
      channel = number && unqualified(number) ? positiveInteger(number.value) : undefined;
      if (tag.local !== 'overlay' || !unqualified(tag) || Object.keys(tag.attributes).length !== 1 ||
        channel === undefined || reportedOverlays.has(channel)) invalid();
      scalar = '';
    } else if (videoList && depth === 4 && tag.local === 'list') {
      if (!unqualified(tag) || videoList.seen) videoList.invalid = true;
      videoList.seen = true;
      listDepth = depth;
    } else if (videoList && listDepth !== undefined) {
      if (depth !== listDepth + 1 || tag.local !== 'item' || !unqualified(tag)) {
        videoList.invalid = true;
      } else {
        const selected = tag.attributes.selected;
        const flag = selected && unqualified(selected) ? stateBoolean(selected.value) : undefined;
        if (selected && flag === undefined) videoList.invalid = true;
        item = { text: '', selected: flag === true };
      }
    }
  });
  parser.on('text', text => {
    if (scalar !== undefined) scalar += text;
    else if (item) item.text += text;
    else if (videoList && listDepth !== undefined && !XML_SPACE.test(text)) videoList.invalid = true;
    else if ((depth === 1 || (depth === 2 && section !== undefined)) && !XML_SPACE.test(text)) invalid();
  });
  const noMarkup = () => {
    if (scalar !== undefined || (depth === 2 && section === 'overlays')) invalid();
  };
  parser.on('comment', noMarkup);
  parser.on('processinginstruction', noMarkup);
  parser.on('cdata', () => {
    noMarkup();
    if (videoList && listDepth !== undefined) videoList.invalid = true;
    if (depth <= 1 || (depth === 2 && section === 'inputs')) invalid();
  });
  parser.on('closetag', () => {
    if (scalar !== undefined) {
      if (channel !== undefined) {
        const occupant = trimXml(scalar);
        if (occupant) {
          const input = positiveInteger(occupant);
          if (input === undefined) return invalid();
          overlays.set(channel, input);
        }
        // An explicit empty channel is distinct from one vMix omitted.
        reportedOverlays.add(channel);
        channel = undefined;
      } else if (section === 'version') version = trimXml(scalar);
      else edition = scalar.trim();
      scalar = undefined;
    }
    if (videoList && listDepth !== undefined) {
      if (item && depth === listDepth + 1) {
        const items = videoList.value?.items;
        if (!item.text) videoList.invalid = true;
        if (items) {
          items.push(item.text);
          if (item.selected) videoList.marked.push(items.length);
        }
        item = undefined;
      }
      if (depth === listDepth) listDepth = undefined;
    }
    if (videoList && depth === 3) {
      const { value, key, seen, invalid, marked } = videoList;
      if (value && seen && !invalid && value.selected <= Math.max(1, value.items.length) &&
          marked.length <= 1 && (!marked.length || marked[0] === value.selected)) lists.set(key, value);
      videoList = undefined;
    }
    if (depth === 2) section = undefined;
    depth -= 1;
  });

  try {
    parser.write(xml).close();
  } catch {
    return;
  }
  if (!VMIX_VERSION.test(version) || !edition || !seen.has('inputs') || !seen.has('overlays')) return;
  return { version, edition, inputs, shortTitles, blanks, lists, overlays, reportedOverlays };
}
