// THE BRIDGE'S LINK TO EACH CASPARCG SERVER (issue #2252): one idle AMCP connection per server a page
// reads, held open only to notice it closing. CasparCG keeps no count of its own starts, and every
// command goes over a connection of its own (./amcp.ts), so this is how the Bridge knows the server
// went away between two requests: a restart closes the connection at once.
//
// A link id names one unbroken stretch of that connection, and each gap between stretches has an id
// of its own: it changes the moment the connection is lost and again when it is made. So a reading
// taken right after a restart, before the watch is connected again, already carries a new id, and no
// id spans a time nobody watched. A page that saw its output on the slot under one id and reads it
// empty under another treats it as a restart, even if no poll of its own saw the server down; under
// the same id an empty slot was emptied on purpose (a CLEAR). Nothing is ever sent on the connection.

import { connect, type Socket } from 'node:net';

/** How long a lost link waits before it tries again. */
export const LINK_RETRY_MS = 1000;
/** How long a lost watch nobody reads keeps trying to connect again (a server switched off, or one
 *  the page no longer uses). A connected watch is never let go for being idle: a new watch has a
 *  new id, which a page that then finds its slot cleared would take for a restart, and one idle
 *  connection per server costs nothing. */
export const LINK_IDLE_MS = 10 * 60_000;

interface Watch {
  id: string;
  socket: Socket | null;
  up: boolean;
  /** Readings waiting for the watch to connect (`ready`). */
  waiting: (() => void)[];
  timer: ReturnType<typeof setTimeout> | null;
  asked: number;
}

export interface LinkOptions {
  retryMs?: number;
  idleMs?: number;
  now?: () => number;
}

export class ServerLinks {
  readonly #session: string;
  readonly #retryMs: number;
  readonly #idleMs: number;
  readonly #now: () => number;
  readonly #watches = new Map<string, Watch>();
  #seq = 0;
  #stopped = false;
  #sweep: ReturnType<typeof setInterval> | null = null;

  /** `session` is the Bridge's own (./slots.ts), so a restarted Bridge gives every link a new id. */
  constructor(session: string, options: LinkOptions = {}) {
    this.#session = session;
    this.#retryMs = options.retryMs ?? LINK_RETRY_MS;
    this.#idleMs = options.idleMs ?? LINK_IDLE_MS;
    this.#now = options.now ?? (() => Date.now());
  }

  /** The link id for this server now. The first ask starts watching it. */
  id(host: string, port: number): string {
    const key = `${host}:${port}`;
    let w = this.#watches.get(key);
    if (!w) {
      w = { id: this.#next(), socket: null, up: false, waiting: [], timer: null, asked: 0 };
      this.#watches.set(key, w);
      if (!this.#stopped) {
        this.#open(key, w, host, port);
        this.#startSweep();
      }
    }
    w.asked = this.#now();
    return w.id;
  }

  /** The link id for this server once its watch is connected, waiting at most `ms` for it: a reading
   *  taken while the watch reconnects would otherwise carry an id the reconnect changes, and the
   *  next reading would look like a restart. Without a connection by then, the id as it stands. */
  async ready(host: string, port: number, ms: number): Promise<string> {
    this.id(host, port);
    const w = this.#watches.get(`${host}:${port}`);
    if (!w || w.up || this.#stopped) return w?.id ?? this.id(host, port);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      timer.unref?.();
      function done() {
        clearTimeout(timer);
        resolve();
      }
      w.waiting.push(done);
    });
    return w.id;
  }

  /** The link id for this server now if it is watched already, without starting a watch. */
  peek(host: string, port: number): string | undefined {
    return this.#watches.get(`${host}:${port}`)?.id;
  }

  /** How many servers are watched now. */
  get size(): number {
    return this.#watches.size;
  }

  stop(): void {
    this.#stopped = true;
    if (this.#sweep) clearInterval(this.#sweep);
    this.#sweep = null;
    for (const w of this.#watches.values()) {
      if (w.timer) clearTimeout(w.timer);
      w.socket?.destroy();
    }
    this.#watches.clear();
  }

  /** A lost watch nobody has read for a while stops trying. A later read starts a new watch. */
  #startSweep(): void {
    if (this.#sweep) return;
    this.#sweep = setInterval(() => {
      for (const [key, w] of this.#watches) {
        if (w.up || this.#now() - w.asked <= this.#idleMs) continue;
        this.#watches.delete(key);
        if (w.timer) clearTimeout(w.timer);
        w.socket?.destroy();
      }
      if (this.#watches.size === 0 && this.#sweep) {
        clearInterval(this.#sweep);
        this.#sweep = null;
      }
    }, Math.max(10, Math.min(this.#idleMs, 60_000)));
    this.#sweep.unref?.();
  }

  #next(): string {
    this.#seq += 1;
    return `${this.#session}.${this.#seq}`;
  }

  #open(key: string, w: Watch, host: string, port: number): void {
    w.timer = null;
    const socket = connect({ host, port });
    w.socket = socket;
    socket.setKeepAlive(true, 5000);
    socket.on('connect', () => {
      w.up = true;
      w.id = this.#next();
      for (const go of w.waiting.splice(0)) go();
    });
    // CasparCG says nothing unasked; anything that comes is dropped.
    socket.on('data', () => {});
    socket.on('error', () => {});
    socket.on('close', () => {
      if (w.socket !== socket) return;
      w.socket = null;
      // Any close is a new stretch, also a first connect that failed: a restart in that moment
      // must not keep the id a reading already carried.
      w.id = this.#next();
      w.up = false;
      if (this.#stopped || this.#watches.get(key) !== w) return;
      w.timer = setTimeout(() => this.#open(key, w, host, port), this.#retryMs);
      w.timer.unref?.();
    });
    // The watch never keeps the Bridge running by itself.
    socket.unref();
  }
}
