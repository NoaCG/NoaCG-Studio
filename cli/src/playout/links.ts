// THE BRIDGE'S LINK TO EACH CASPARCG SERVER (issue #2252): one idle AMCP connection per server a page
// reads, held open only to notice it closing. CasparCG keeps no count of its own starts, and every
// command goes over a connection of its own (./amcp.ts), so this is how the Bridge knows the server
// went away between two requests: a restart closes the connection at once.
//
// A link id names one unbroken stretch of that connection. It changes the moment the connection is
// lost, not when it comes back, so a reading taken right after a restart, before the link is up
// again, already carries a new id. A page that saw its output on the slot under one id and reads it
// empty under another knows the server restarted, even if no poll of its own saw it down; under the
// same id an empty slot was emptied on purpose (a CLEAR). Nothing is ever sent on the connection.

import { connect, type Socket } from 'node:net';

/** How long a lost link waits before it tries again, and how long one nobody reads is kept. */
export const LINK_RETRY_MS = 1000;
export const LINK_IDLE_MS = 10 * 60_000;

interface Watch {
  id: string;
  socket: Socket | null;
  up: boolean;
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
      w = { id: this.#next(), socket: null, up: false, timer: null, asked: 0 };
      this.#watches.set(key, w);
      if (!this.#stopped) {
        this.#open(key, w, host, port);
        this.#startSweep();
      }
    }
    w.asked = this.#now();
    return w.id;
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

  /** A watch nobody has read for a while is let go, connected or not, so a server the page no
   *  longer uses does not keep a connection. A later read starts a new watch with a new id. */
  #startSweep(): void {
    if (this.#sweep) return;
    this.#sweep = setInterval(() => {
      for (const [key, w] of this.#watches) {
        if (this.#now() - w.asked <= this.#idleMs) continue;
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
    });
    // CasparCG says nothing unasked; anything that comes is dropped.
    socket.on('data', () => {});
    socket.on('error', () => {});
    socket.on('close', () => {
      if (w.socket !== socket) return;
      w.socket = null;
      if (w.up) w.id = this.#next();
      w.up = false;
      if (this.#stopped || this.#watches.get(key) !== w) return;
      w.timer = setTimeout(() => this.#open(key, w, host, port), this.#retryMs);
      w.timer.unref?.();
    });
    // The watch never keeps the Bridge running by itself.
    socket.unref();
  }
}
