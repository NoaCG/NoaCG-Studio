import { fileToDataUrl, inlineAssetRefs } from '../../assets/assetUtils';
import { composeDocument } from '../../preview/composeDocument';
import { locateAnimData, parseAnimData } from '../../blocks/animData';
import type { SpxTemplate } from '../../model/types';
import { foundationRuntime } from './runtime';
import { acceptsReply, EDITOR_MESSAGE, type Envelope, type PreviewReply } from './protocol';
import type { Revision } from './session';
import { readTimeline, segmentAt } from './timelineView';
import { artworkLayerNode } from '../../blocks/artworkLayers';
import { svgInspectionSelector } from '../../model/structure';
import { baseValues, creationParent } from '../../blocks/baseEdits';

export interface LatencySample { kind: string; inputAt: number; presentedAt: number; ms: number; revision: Revision; requestId: number }
export interface PreviewMetrics { samples: LatencySample[]; frameIntervals: number[]; longTasks: number[]; parentLongTasks: number[]; parentFrameIntervals: number[]; rejected: number }
function withoutAnimation(js: string) {
  const range = locateAnimData(js);
  return range ? js.slice(0, range.start) + js.slice(range.end) : js;
}
export async function assetDigest(template: SpxTemplate): Promise<string> {
  const entries = await Promise.all(template.assets.map(async asset => {
    const bytes = typeof asset.data === 'string' ? new TextEncoder().encode(asset.data) : await asset.data.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [asset.path, [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('')];
  }));
  return JSON.stringify(entries);
}
/** The sole owner of sandbox identity and readiness. Rapid loads and seeks coalesce to
 * the newest request; a reply never becomes evidence merely because it came last. */
export class PreviewController {
  private generation = 0;
  private sequence = 0;
  private loadEpoch = 0;
  private expected: Envelope | null = null;
  private template: SpxTemplate | null = null;
  private digest = '';
  private timeline: ReturnType<typeof readTimeline> | null = null;
  private inputStamps = new Map<string, number>();
  private ready = false;
  private acknowledgement: PreviewReply | null = null;
  private previewError: string | null = null;
  private transient = false;
  private targetTime = 0;
  private targetCue: number | undefined;
  private exitMode: 'start' | 'running' | null = null;
  private inputAt = 0;
  private kind = 'load';
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private pendingFrame = 0;
  private inFlight = false;
  private queued = false;
  private queuedInputAt = 0;
  private queuedKind = 'scrub';
  private pendingCss: string | null = null;
  private pendingTemplate: SpxTemplate | null = null;
  private draftMotion = false;
  private resolvedAssets: SpxTemplate['assets'] = [];
  private monitoringFrame = 0;
  private lastFrame = 0;
  private observer: PerformanceObserver | null = null;
  readonly metrics: PreviewMetrics = { samples: [], frameIntervals: [], longTasks: [], parentLongTasks: [], parentFrameIntervals: [], rejected: 0 };
  constructor(readonly documentId: string, private iframe: HTMLIFrameElement,
    private report: (reply: PreviewReply | null, pending: boolean) => void) {
    window.addEventListener('message', this.receive);
    window.addEventListener('noacg-editor-read-metrics', this.readMetrics);
    window.addEventListener('noacg-editor-reset-metrics', this.resetFromEvent);
    this.monitoringFrame = requestAnimationFrame(this.monitorFrames);
    if (typeof PerformanceObserver !== 'undefined') {
      this.observer = new PerformanceObserver(list => {
        this.metrics.parentLongTasks.push(...list.getEntries().map(entry => entry.duration));
      });
      try { this.observer.observe({ type: 'longtask' }); } catch { this.observer = null; }
    }
  }
  dispose() {
    ++this.loadEpoch;
    clearTimeout(this.timeout);
    cancelAnimationFrame(this.pendingFrame);
    window.removeEventListener('message', this.receive);
    window.removeEventListener('noacg-editor-read-metrics', this.readMetrics);
    window.removeEventListener('noacg-editor-reset-metrics', this.resetFromEvent);
    cancelAnimationFrame(this.monitoringFrame);
    this.observer?.disconnect();
  }
  private readMetrics = () => window.dispatchEvent(new CustomEvent('noacg-editor-metrics', { detail: this.metrics }));
  private resetFromEvent = () => this.resetMetrics();
  private monitorFrames = (time: number) => {
    if (this.lastFrame) this.metrics.parentFrameIntervals.push(time - this.lastFrame);
    this.metrics.parentFrameIntervals = this.metrics.parentFrameIntervals.slice(-3000);
    this.lastFrame = time;
    this.monitoringFrame = requestAnimationFrame(this.monitorFrames);
  };
  private receive = (event: MessageEvent) => {
    const message = event.data as PreviewReply;
    if (message?.type !== EDITOR_MESSAGE) return;
    if (!this.expected || !acceptsReply(message, event.source, this.iframe.contentWindow, this.expected)) {
      this.metrics.rejected++;
      return;
    }
    this.acknowledgement = message; this.previewError = message.kind === 'error' ? message.message ?? 'Preview failed.' : null;
    if (message.kind === 'error') { clearTimeout(this.timeout); this.inFlight = false; this.queued = false; this.ready = false; this.report(message, false); return; }
    if (message.kind !== 'ready' && message.kind !== 'pose') return;
    clearTimeout(this.timeout);
    const now = performance.timeOrigin + performance.now();
    this.metrics.samples.push({ kind: this.kind, inputAt: this.inputAt, presentedAt: now,
      ms: now - this.inputAt, revision: { ...message.revision }, requestId: message.requestId });
    this.metrics.samples = this.metrics.samples.slice(-1000);
    this.metrics.frameIntervals.push(...(message.frameIntervals ?? []));
    this.metrics.frameIntervals = this.metrics.frameIntervals.slice(-3000);
    this.metrics.longTasks.push(...(message.longTasks ?? []));
    const wasReady = this.ready;
    this.inFlight = false;
    this.ready = true;
    this.report(message, false);
    // Source update / undo waits for matching readiness, then restores the latest pose.
    if (!wasReady) this.seek(this.targetTime, 'restore', this.targetCue);
    else if (this.queued) this.flush();
  };
  private envelope(revision: Revision): Envelope {
    return { type: EDITOR_MESSAGE, documentId: this.documentId, revision,
      generation: this.generation, requestId: ++this.sequence };
  }
  private watch() {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      if (this.expected) this.report({ ...this.expected, kind: 'error',
        message: 'Preview did not answer. Reload the preview or return to the existing editor.' }, false);
      this.previewError = 'Preview did not answer.';
      this.ready = false;
    }, 10000);
  }
  async load(template: SpxTemplate, revision: Revision, sampleData: Record<string, string>, time: number, cue?: number) {
    this.previewError = null; this.transient = false;
    this.exitMode = null;
    this.targetCue = cue;
    cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = 0;
    this.queued = false;
    this.inFlight = true;
    this.pendingCss = null;
    this.pendingTemplate = null;
    this.draftMotion = false;
    const epoch = ++this.loadEpoch;
    const previousEnvelope = this.expected;
    const previousTemplate = this.template;
    const previouslyReady = this.ready;
    this.ready = false;
    this.expected = null; // refuse old acks even while hashing new bytes
    this.targetTime = time;
    this.report(null, true);
    this.inputAt = this.inputStamps.get('commit') ?? performance.timeOrigin + performance.now();
    this.kind = this.inputStamps.has('commit') ? 'commit' : 'load';
    this.inputStamps.delete('commit');
    const digest = await assetDigest(template);
    if (epoch !== this.loadEpoch) return;
    const view = readTimeline(template);
    this.timeline = view;
    const keyOnly = previouslyReady && previousEnvelope && previousTemplate &&
      previousTemplate.html === template.html && previousTemplate.css === template.css &&
      JSON.stringify(previousTemplate.resolution) === JSON.stringify(template.resolution) &&
      previousTemplate.fps === template.fps && digest === this.digest &&
      withoutAnimation(previousTemplate.js) === withoutAnimation(template.js) && !view.reason &&
      previousTemplate.js !== template.js;
    const cssOnly = previouslyReady && previousEnvelope && previousTemplate &&
      previousTemplate.html === template.html && previousTemplate.js === template.js &&
      previousTemplate.css !== template.css && digest === this.digest &&
      JSON.stringify(previousTemplate.resolution) === JSON.stringify(template.resolution);
    this.template = template;
    this.digest = digest;
    const position = { ...segmentAt(view.segments, time, cue), inspect: cue !== undefined };
    if (cssOnly) {
      this.expected = this.envelope(revision);
      this.iframe.contentWindow?.postMessage({ ...this.expected, kind: 'apply-css',
        previous: previousEnvelope.revision, css: inlineAssetRefs(template.css, this.resolvedAssets), ...position }, '*');
    } else if (keyOnly) {
      this.expected = this.envelope(revision);
      this.iframe.contentWindow?.postMessage({ ...this.expected, kind: 'apply',
        previous: previousEnvelope.revision, animation: parseAnimData(template.js), ...position }, '*');
    } else {
      ++this.generation;
      this.expected = this.envelope(revision);
      const adapters = Object.fromEntries(view.parts.flatMap(p => {
        try {
          const adapter = baseValues(template, p.selector);
          let groupParent: string | null = null;
          try {
            const parent = artworkLayerNode(template, p.selector).parentElement;
            if (parent) groupParent = svgInspectionSelector(parent);
          } catch { /* Containers keep their existing adapter. */ }
          return [[p.selector, { ...adapter, groupParent }]];
        } catch { return []; }
      }));
      let parent = '';
      try { parent = creationParent(template); } catch { /* Source without drawing support. */ }
      const config = JSON.stringify({ ...this.expected, selectors: view.parts.map(p => p.selector), adapters, creationParent: parent,
        sampleData, scrubbable: !view.reason, ...position }).replace(/</g, '\\u003c');
      const bridge = '<script>window.__NOACG_EDITOR_CONFIG = ' + config + ';\n' + foundationRuntime + '<' + '/script>';
      const assets = await Promise.all(template.assets.map(async asset => ({ ...asset,
        data: asset.data instanceof Blob ? await fileToDataUrl(new File([asset.data], asset.path, { type: asset.data.type })) : asset.data,
      })));
      if (epoch !== this.loadEpoch) return;
      this.resolvedAssets = assets;
      const document = composeDocument({ ...template, assets });
      // Install before template JS so startup faults also carry this frame's identity.
      this.iframe.srcdoc = document.replace('<script id="spx-error-capture">', () => bridge + '<script id="spx-error-capture">');
    }
    this.watch();
  }
  noteInput(kind: string) { this.inputStamps.set(kind, performance.timeOrigin + performance.now()); }
  /** A transient stylesheet never becomes the document or a history entry. */
  previewCss(css: string, kind = 'drag') {
    this.transient = css !== this.template?.css;
    this.pendingCss = inlineAssetRefs(css, this.resolvedAssets);
    this.seek(this.targetTime, kind, this.targetCue);
  }
  previewTemplate(template: SpxTemplate, kind = 'drag') {
    this.transient = template.html !== this.template?.html || template.css !== this.template?.css || template.js !== this.template?.js;
    if (!this.draftMotion && template.js === this.template?.js && template.html === this.template?.html) { this.previewCss(template.css, kind); return; }
    this.draftMotion = template.js !== this.template?.js || template.html !== this.template?.html;
    this.pendingTemplate = template;
    this.seek(this.targetTime, kind, this.targetCue);
  }
  startExit() {
    if (this.exitMode || !this.ready || !this.expected) return false;
    this.exitMode = 'start';
    return true;
  }
  isExiting() { return this.exitMode !== null; }
  stopExit() { this.exitMode = null; }
  seek(time: number, kind = 'scrub', cue?: number) {
    this.targetCue = cue;
    this.targetTime = time;
    if (!this.ready || !this.template || !this.expected) return;
    this.queuedInputAt = this.inputStamps.get(kind) ?? performance.timeOrigin + performance.now();
    this.inputStamps.delete(kind);
    this.queuedKind = kind;
    this.queued = true;
    // Keep one request in flight. Sending every parent frame can invalidate every child
    // acknowledgement at native pointer rates, starving the visible selection forever.
    // Pending input replaces only the unsent pose; a matching reply releases it promptly.
    if (this.pendingFrame || this.inFlight) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.flush();
    });
  }
  private flush() {
    if (!this.queued || this.inFlight || !this.expected || !this.template || !this.ready) return;
    this.queued = false;
    this.inFlight = true;
    this.inputAt = this.queuedInputAt;
    this.kind = this.queuedKind;
    const position = { ...segmentAt(this.timeline!.segments, this.targetTime, this.targetCue), inspect: this.targetCue !== undefined };
    const exitKind = this.exitMode === 'start' ? 'exit-start' : this.exitMode === 'running' ? 'exit-time' : null;
    if (exitKind) { position.time = Math.max(0, this.targetTime - this.timeline!.out); this.exitMode = 'running'; }
    this.expected = this.envelope(this.expected.revision);
    const css = this.pendingCss;
    this.pendingCss = null;
    const draft = this.pendingTemplate;
    this.pendingTemplate = null;
    const document = draft ? new DOMParser().parseFromString(draft.html, 'text/html') : null;
    const geometry = document ? this.timeline!.parts.flatMap(part => {
      const node = document.querySelector(part.selector);
      return node?.namespaceURI === 'http://www.w3.org/2000/svg' ? [{ selector: part.selector,
        attributes: Object.fromEntries(['x', 'y', 'cx', 'cy'].map(name => [name, node.getAttribute(name)])) }] : [];
    }) : [];
    this.iframe.contentWindow?.postMessage({ ...this.expected, kind: exitKind ?? (draft ? 'preview-template' : css === null ? 'seek' : 'preview-css'),
      css: draft ? inlineAssetRefs(draft.css, this.resolvedAssets) : css, ...(draft ? { animation: parseAnimData(draft.js), geometry } : {}), ...position }, '*');
  }
  /** Source acceptance and correlated rendered-pose acknowledgement are separate receipts. */
  receipt(revision: Revision, view: { time: number; cue?: number }) {
    const ack = this.acknowledgement, expected = this.expected;
    if (!expected || expected.revision.source !== revision.source || expected.revision.assets !== revision.assets || this.transient) return { state: 'pending' as const };
    if (this.previewError) return { state: 'failed' as const, message: this.previewError };
    if (!ack || !this.ready || this.inFlight || this.queued || this.pendingFrame ||
      ack.kind !== 'pose' || ack.requestId !== expected.requestId || ack.generation !== expected.generation ||
      ack.revision.source !== revision.source || ack.revision.assets !== revision.assets ||
      this.targetTime !== view.time || this.targetCue !== view.cue) return { state: 'pending' as const };
    return { state: 'ready' as const, documentId: ack.documentId, revision: { ...ack.revision },
      generation: ack.generation, requestId: ack.requestId, renderedAt: ack.renderedAt,
      time: this.targetTime, cue: this.targetCue ?? null, drawingSpace: ack.drawingSpace ?? null };
  }
  resetMetrics() {
    this.metrics.samples = []; this.metrics.frameIntervals = []; this.metrics.longTasks = [];
    this.metrics.parentLongTasks = []; this.metrics.parentFrameIntervals = [];
    if (this.ready && this.expected) {
      this.inFlight = true;
      this.expected = this.envelope(this.expected.revision);
      this.inputAt = performance.timeOrigin + performance.now(); this.kind = 'reset-metrics';
      this.iframe.contentWindow?.postMessage({ ...this.expected, kind: 'reset-metrics' }, '*');
    }
  }
}
