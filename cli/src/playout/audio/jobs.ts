// THE BRIDGE'S AUDIO JOBS (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.1): a waveform or a loudness
// measurement of one server file, read through the linked media folder. Long reads never sit on the
// Take, Out and state calls: the page starts a job, asks how it stands, and can cancel it.
//
// One file is read at a time, because the reads load the playout computer's disk while it plays out.
// The same request asked again while it waits or runs is the same job. A finished job is kept for a
// while for the page to collect, then forgotten.
//
// The file is checked before and after the read: the size the server lists, and the size and
// modified time on the share. A file that changed while it was read gives no result.

import { randomUUID } from 'node:crypto';
import type { AudioJobProblem, AudioJobReply, AudioJobRequest } from '../protocol.js';
import { AudioJobError, measure as measureFile, waveform as waveformFile, type JobOptions, type MeasureResult, type WaveformResult } from './analyse.js';
import { MediaFileError, unchanged, type ResolvedFile } from './mediaFiles.js';
import type { AudioTools } from './tools.js';

/** How long a finished job waits for the page to collect it. */
export const KEEP_FINISHED_MS = 10 * 60_000;
/** The most jobs kept at once, finished ones dropped oldest first. */
export const MAX_JOBS = 200;

export interface PreparedFile {
  file: ResolvedFile;
  fileKey?: string;
}

export interface AudioJobDeps {
  tools: () => Promise<AudioTools | null>;
  measure?: (tools: AudioTools, file: string, part: { trimIn?: number; trimOut?: number }, opts: JobOptions) => Promise<MeasureResult>;
  waveform?: (tools: AudioTools, file: string, bins: number, opts: JobOptions) => Promise<WaveformResult>;
  now?: () => number;
}

interface Job {
  key: string;
  reply: AudioJobReply;
  finishedAt?: number;
  controller: AbortController;
  run: () => Promise<void>;
}

const problem = (code: AudioJobProblem, detail: string) => ({ code, detail });

export class AudioJobs {
  private readonly jobs = new Map<string, Job>();
  private readonly waiting: Job[] = [];
  private running: Job | null = null;
  private readonly measure: NonNullable<AudioJobDeps['measure']>;
  private readonly waveform: NonNullable<AudioJobDeps['waveform']>;
  private readonly now: () => number;

  constructor(private readonly deps: AudioJobDeps) {
    this.measure = deps.measure ?? measureFile;
    this.waveform = deps.waveform ?? waveformFile;
    this.now = deps.now ?? Date.now;
  }

  /**
   * Queue a job for one target's file. `prepare` finds the file (the server's listing and the linked
   * folder) when the job's turn comes, so a long queue never reads a stale listing.
   */
  start(target: string, request: AudioJobRequest, prepare: () => Promise<PreparedFile>): AudioJobReply {
    this.forgetOld();
    const key = JSON.stringify([target, request.kind, request.name, request.trimIn ?? null, request.trimOut ?? null, request.bins ?? null]);
    for (const job of this.jobs.values()) {
      if (job.key === key && (job.reply.state === 'queued' || job.reply.state === 'running')) return { ...job.reply };
    }
    const id = randomUUID();
    const controller = new AbortController();
    const job: Job = {
      key,
      controller,
      reply: { ok: true, id, state: 'queued', progress: 0 },
      run: async () => {
        job.reply = { ...job.reply, state: 'running' };
        try {
          const tools = await this.deps.tools();
          if (!tools) throw new MediaFileError('no-reader', 'This Bridge carries no audio reader. Use the NoaCG Bridge download for Windows.');
          const prepared = await prepare();
          if (controller.signal.aborted) throw new AudioJobError('The job was cancelled.', 'cancelled');
          const opts: JobOptions = { signal: controller.signal, onProgress: (p) => (job.reply = { ...job.reply, progress: p }) };
          const result =
            request.kind === 'measure'
              ? { measure: await this.measure(tools, prepared.file.file, { trimIn: request.trimIn, trimOut: request.trimOut }, opts) }
              : { waveform: await this.waveform(tools, prepared.file.file, request.bins ?? 2000, opts) };
          if (!(await unchanged(prepared.file))) throw new MediaFileError('changed', `${request.name} changed while it was read. Try again when it is finished copying.`);
          job.reply = { ...job.reply, state: 'done', progress: 1, ...(prepared.fileKey ? { fileKey: prepared.fileKey } : {}), ...result };
        } catch (e) {
          if (e instanceof AudioJobError && e.code === 'cancelled') job.reply = { ...job.reply, state: 'cancelled' };
          else if (e instanceof MediaFileError) job.reply = { ...job.reply, state: 'failed', problem: problem(e.code, e.message) };
          else job.reply = { ...job.reply, state: 'failed', problem: problem('unreadable', e instanceof Error ? e.message : String(e)) };
        }
        job.finishedAt = this.now();
      },
    };
    this.jobs.set(id, job);
    this.waiting.push(job);
    void this.pump();
    return { ...job.reply };
  }

  get(id: string): AudioJobReply | null {
    const job = this.jobs.get(id);
    return job ? { ...job.reply } : null;
  }

  cancel(id: string): AudioJobReply | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.reply.state === 'queued') {
      this.waiting.splice(this.waiting.indexOf(job), 1);
      job.reply = { ...job.reply, state: 'cancelled' };
      job.finishedAt = this.now();
    } else if (job.reply.state === 'running') job.controller.abort();
    return { ...job.reply };
  }

  /** Resolves when nothing is queued or running. For tests and an orderly stop. */
  async idle(): Promise<void> {
    while (this.running || this.waiting.length) await new Promise((r) => setTimeout(r, 5));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const next = this.waiting.shift();
    if (!next) return;
    this.running = next;
    try {
      await next.run();
    } finally {
      this.running = null;
      void this.pump();
    }
  }

  private forgetOld(): void {
    const now = this.now();
    for (const [id, job] of this.jobs) if (job.finishedAt !== undefined && now - job.finishedAt > KEEP_FINISHED_MS) this.jobs.delete(id);
    if (this.jobs.size < MAX_JOBS) return;
    const finished = [...this.jobs.entries()].filter(([, j]) => j.finishedAt !== undefined).sort((a, b) => a[1].finishedAt! - b[1].finishedAt!);
    for (const [id] of finished.slice(0, this.jobs.size - MAX_JOBS + 1)) this.jobs.delete(id);
  }
}
