// The bridge client: opens `${NOACG_URL}/bridge` in the contained context, checks the protocol
// version, and wraps every bridge function (src/bridge/bridgeApi.ts) as a typed call through
// page.evaluate. ONE bridge page per process - the MCP server keeps it warm across tool calls.
//
// Binary crosses the boundary as base64 strings (the package zip in, the package zip out, PNG
// thumbnails); everything else is plain JSON - an SpxTemplate is JSON (its assets are data URLs).

import type { Page } from 'playwright-core';
import { noacgUrl, SUPPORTED_BRIDGE_V } from './config.js';
import { launchBrowser, newBenchContext, withTimeout, type BenchContext } from './browser.js';

// ── The bridge's shapes (mirrors src/bridge/bridgeApi.ts; kept loose where the CLI only prints) ──

export interface BridgeHello {
  channel: string;
  v: number;
  app: { commit: string; ref: string } | null;
  origin: string;
}

export interface ValidationIssue {
  rule: string;
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
export interface ReadinessRow {
  id: string;
  label: string;
  state: 'pass' | 'warn' | 'fail' | 'untested';
  messages: ValidationIssue[];
}
export interface BridgeValidation {
  ok: boolean;
  gate: ValidationResult;
  bench: ValidationResult | null;
  benchSkipped: string | null;
  merged: ValidationResult;
  readiness: ReadinessRow[];
  unclaimed: ValidationIssue[];
  engines: Array<{ id: string; name: string; verdict: string; findings?: unknown[] }>;
  engineHeadline: string;
  text: string;
}

export interface SpxTemplate {
  name: string;
  type: string;
  resolution: { width: number; height: number; label?: string };
  fps: number;
  html: string;
  css: string;
  js: string;
  fields: Array<{ field: string; ftype: string; title: string; value: string; items?: Array<{ text: string; value: string }> }>;
  settings: Record<string, string>;
  assets: Array<{ path: string; data: string }>;
  layers: unknown[];
}

export interface FieldDescriptor {
  key: string;
  label: string;
  kind: string;
  defaultValue: string | number;
  options?: Array<{ label: string; value: string }>;
}
export interface ControlButton {
  event: string;
  label: string;
  section?: string;
  payload?: string[];
  /** Field ids whose current value, moved by the delta, rides the event (a goal's +1). */
  adjust?: Record<string, number>;
  /** Field ids set to the figure the control declares (a "New game" back to 0). */
  set?: Record<string, string>;
  /** List field id -> source field id whose value is added as a line / taken out. */
  add?: Record<string, string>;
  remove?: Record<string, string>;
  destructive?: boolean;
}
export interface BridgeInspection {
  descriptors: FieldDescriptor[];
  buttons: ControlButton[];
  stateGroups: Array<{ id: string; states: Array<{ id: string; name: string }> }>;
  steps: { count: number; stepped: boolean };
  notes: string[];
}

export interface ScaffoldStyle {
  palette?: string;
  fontId?: string;
  zone?: string;
  sizeScale?: number;
  typeScale?: number;
  resolution?: { width: number; height: number };
  fps?: number;
}
export interface NeutralFieldSpec {
  label: string;
  kind: string;
  value?: string;
  options?: Array<{ label: string; value: string }>;
}
export type ScaffoldRequest =
  | { type: string; design?: string; name?: string; values?: Record<string, string>; style?: ScaffoldStyle }
  | { fields: NeutralFieldSpec[]; name?: string; style?: ScaffoldStyle };
export interface ScaffoldResult {
  template: SpxTemplate;
  notes: string[];
}

export interface OgrafPackageRead {
  manifestPath: string;
  manifest: Record<string, unknown>;
  errors: string[];
  noacg: { type: string; source?: { html: string; css: string; js: string }; sourceHash: string } | null;
  stale: boolean;
  files: string[];
  contract: { descriptors: FieldDescriptor[]; buttons: ControlButton[]; steps: { count: number; stepped: boolean }; notes: string[] };
}
export interface PackageRead {
  kind: 'noacg' | 'spx' | 'ograf';
  imported: { template: SpxTemplate; noacg?: { type: string | null; sourceHash: string | null; stale: boolean } | null } | null;
  ograf: OgrafPackageRead | null;
}

export interface NormalizeResult {
  template: SpxTemplate;
  converted: boolean;
  dataRegion: boolean;
  note: string;
  /** The SPX `steps` normalize re-derived from the default path, when it differed from the
   *  author's. Absent from a deployment older than the re-sync. */
  stepsRewritten?: { from: string; to: string };
}

export interface BridgeTypeSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  prefix: string;
  fields: Array<{ key: string; label: string; kind: string; value: string; role: string; ftype: string; options?: Array<{ label: string; value: string }> }>;
  events: Array<{ event: string; label: string; section?: string; payload?: string[]; adjust?: Record<string, number> }>;
  designs: Array<{ id: string; name: string; description: string; styleTag: string }>;
  neutral: boolean;
  capabilities: { maxLines: number; logo: string; defaultZone: string; defaultSteps: boolean };
}

// ── The client ───────────────────────────────────────────────────────────────

export class BridgeClient {
  private constructor(
    readonly origin: string,
    readonly bench: BenchContext,
    readonly page: Page,
    readonly hello: BridgeHello,
  ) {}

  /** Open the bridge of the configured deployment and check its protocol version. */
  static async connect(opts: { timeoutMs?: number } = {}): Promise<BridgeClient> {
    const origin = noacgUrl();
    const browser = await launchBrowser();
    const bench = await newBenchContext(browser, origin);
    const page = await bench.newPage();
    const url = `${origin}/bridge`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs ?? 30_000 });
      await page.waitForFunction(() => (window as unknown as { __noacgBridgeReady?: boolean }).__noacgBridgeReady === true, undefined, {
        timeout: opts.timeoutMs ?? 30_000,
      });
    } catch (e) {
      await bench.close();
      throw new Error(
        `No NoaCG bridge at ${url} - is NOACG_URL right? This NoaCG build may predate the bridge. (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`,
      );
    }
    const hello = (await page.evaluate(() => (window as unknown as { noacgBridge: { hello(): Promise<unknown> } }).noacgBridge.hello())) as BridgeHello;
    if (hello.channel !== 'noacg-bridge') {
      await bench.close();
      throw new Error(`${url} answered on channel "${hello.channel}", not "noacg-bridge".`);
    }
    if (!SUPPORTED_BRIDGE_V.includes(hello.v)) {
      await bench.close();
      const newest = Math.max(...SUPPORTED_BRIDGE_V);
      throw new Error(
        hello.v > newest
          ? `This NoaCG speaks bridge v${hello.v} and this noacg speaks v${newest} - update noacg (npm i -g @noacg/cli@latest).`
          : `This noacg speaks bridge v${newest} and the deployment at ${origin} speaks v${hello.v} - update NoaCG, or point NOACG_URL at a newer deployment.`,
      );
    }
    return new BridgeClient(origin, bench, page, hello);
  }

  async close(): Promise<void> {
    await this.bench.close();
  }

  private call<T>(fn: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(
      async ({ fn, args }) => {
        const bridge = (window as unknown as { noacgBridge: Record<string, (...a: unknown[]) => unknown> }).noacgBridge;
        const f = bridge[fn];
        if (typeof f !== 'function') throw new Error(`the bridge has no function "${fn}"`);
        return (await f(...args)) as unknown;
      },
      { fn, args },
    ) as Promise<T>;
  }

  types(): Promise<BridgeTypeSummary[]> {
    return this.call('types');
  }

  scaffold(req: ScaffoldRequest): Promise<ScaffoldResult> {
    return this.call('scaffold', req);
  }

  normalize(template: SpxTemplate): Promise<NormalizeResult> {
    return this.call('normalize', template);
  }

  validate(template: SpxTemplate, opts: { bench?: boolean; houseContract?: boolean; timeoutMs?: number } = {}): Promise<BridgeValidation> {
    const timeoutMs = opts.timeoutMs ?? 20_000;
    // The bench's own race only stops WAITING; the outer deadline closes the context.
    return withTimeout(
      this.call<BridgeValidation>('validate', template, { ...opts, timeoutMs }),
      timeoutMs * 2 + 10_000,
      'the runtime bench',
      () => this.bench.close(),
    );
  }

  /** The studio's Community packs checks over a pack about to be shared: its words, the share
   *  gate per graphic, and each graphic played with outside requests refused. A deployment that
   *  predates the check says so plainly rather than failing late. */
  async communityCheck(candidate: {
    name: string;
    description: string;
    author: string;
    graphics: Array<{ name: string; template: SpxTemplate }>;
  }): Promise<Array<{ graphic?: string; message: string }>> {
    try {
      return await withTimeout(
        this.call<Array<{ graphic?: string; message: string }>>('communityCheck', candidate),
        30_000 + 5_000 * candidate.graphics.length,
        'the Community packs check',
        () => this.bench.close(),
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes('has no function "communityCheck"')) {
        throw new Error(`The NoaCG at ${this.origin} cannot check a pack for Community packs yet - point NOACG_URL at a newer deployment.`);
      }
      throw e;
    }
  }

  inspect(input: { template?: SpxTemplate; manifest?: unknown }): Promise<BridgeInspection> {
    return this.call('inspect', input);
  }

  /** The data a state airs: every field at its default, or the stress recipe. */
  stateData(template: SpxTemplate, state: 'onair' | 'stress'): Promise<Record<string, string>> {
    return this.call(state === 'stress' ? 'stressData' : 'defaultData', template);
  }

  compose(template: SpxTemplate, state: 'off' | 'onair' | 'stress' | Record<string, string>): Promise<string> {
    return this.call('compose', template, state);
  }

  async readPackage(bytes: Uint8Array, fileName: string): Promise<PackageRead> {
    const base64 = Buffer.from(bytes).toString('base64');
    return this.page.evaluate(
      async ({ base64, fileName }) => {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bridge = (window as unknown as { noacgBridge: { readPackage(b: Uint8Array, n: string): Promise<unknown> } }).noacgBridge;
        return bridge.readPackage(bytes, fileName);
      },
      { base64, fileName },
    ) as Promise<PackageRead>;
  }

  async exportPackage(template: SpxTemplate, opts: { thumbnail?: { png: Uint8Array; width: number; height: number } } = {}): Promise<Uint8Array> {
    const thumbnail = opts.thumbnail
      ? { base64: Buffer.from(opts.thumbnail.png).toString('base64'), width: opts.thumbnail.width, height: opts.thumbnail.height }
      : undefined;
    const base64 = (await this.page.evaluate(
      async ({ template, thumbnail }) => {
        const bridge = (window as unknown as { noacgBridge: { exportPackage(t: unknown, o: unknown): Promise<Uint8Array> } }).noacgBridge;
        const bytes = await bridge.exportPackage(template, thumbnail ? { thumbnail } : {});
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        return btoa(bin);
      },
      { template, thumbnail },
    )) as string;
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  packEntry(template: SpxTemplate, opts: { name?: string; layer?: number } = {}): Promise<Record<string, unknown>> {
    return this.call('packEntry', template, opts);
  }

  graphicDoc(template: SpxTemplate, opts: { name: string; folder?: string; origin?: { tool: string; version?: string } }): Promise<Record<string, unknown>> {
    return this.call('graphicDoc', template, opts);
  }

  ografHost(opts: { packageBase: string; main: string; tag: string; width: number; height: number }): Promise<string> {
    return this.call('ografHost', opts);
  }

  hostTagFor(id: string, nonce: string): Promise<string> {
    return this.call('hostTagFor', id, nonce);
  }
}
