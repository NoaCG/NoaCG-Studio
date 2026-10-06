// Reading `INFO <channel>` - what a CasparCG channel holds, layer by layer (plan §6.7).
//
// Measured on 2.5.0 (69e8ad5 Stable) on 2026-09-28: `INFO 2` answers `201 INFO OK` and ONE
// line of XML whose own line breaks are bare LF, so the reply parser reads the whole document as
// the 201's single data line. `INFO 2-10` answers the same whole-channel document: the layer is
// ignored, so the Bridge asks for the channel and picks layers out itself. The fixtures are in
// cli/test/fixtures/info/, one file per case, each with the commands that made it.
//
// The shape, per layer (`stage/layer/layer_<n>`), for the producers that matter:
//   ffmpeg      a clip or an audio file: `file/name` (what PLAY named), `file/clip` [start,
//               length] of the SEGMENT in seconds, `file/time` [position in the WHOLE FILE,
//               the whole file's length], `loop`, `paused`
//   image       a still: `file/path` only (`media\giorno.jpg`), no clip and no time - it never ends
//   color       `color` (`EMPTY` after `PLAY c-l EMPTY`)
//   html        a web page or a CG template: `file/path`
//   empty       nothing (after STOP)
//   transition  a MIX under way (foreground: `transition/type` mix, `transition/frame` [done,
//               total], the INCOMING file's fields beside it) or a queued background (type cut)
// and `frames_left` on the FOREGROUND only while the background is queued with AUTO.

import { UsageError } from '../output.js';

/** One element: its text and its children in document order. */
interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

/**
 * The XML CasparCG writes: elements, text, a prolog. No attributes are read (the state tree
 * carries none), no namespaces, no CDATA. Anything else is refused rather than half-read, so a
 * future server that changes the shape says so instead of reporting an empty channel.
 */
function parseXml(src: string): XmlNode {
  let i = 0;
  const root: XmlNode = { name: '#root', text: '', children: [] };
  const stack: XmlNode[] = [root];
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    const text = src.slice(i, lt);
    if (text.trim()) stack[stack.length - 1].text += decode(text);
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt);
      if (end < 0) throw new UsageError('INFO answered with an unfinished XML prolog.');
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      if (end < 0) throw new UsageError('INFO answered with an unfinished XML comment.');
      i = end + 3;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) throw new UsageError('INFO answered with an unfinished XML tag.');
    const tag = src.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) throw new UsageError(`INFO answered with mismatched XML: </${name}>.`);
      continue;
    }
    const selfClosing = tag.endsWith('/');
    const name = (selfClosing ? tag.slice(0, -1) : tag).trim().split(/\s+/)[0];
    if (!name || name.startsWith('!')) throw new UsageError(`INFO answered with XML this Bridge cannot read: <${tag}>.`);
    const node: XmlNode = { name, text: '', children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new UsageError('INFO answered with unclosed XML.');
  return root;
}

const kids = (n: XmlNode | undefined, name: string): XmlNode[] => n?.children.filter((c) => c.name === name) ?? [];
const kid = (n: XmlNode | undefined, name: string): XmlNode | undefined => kids(n, name)[0];
const text = (n: XmlNode | undefined, name: string): string | undefined => {
  const k = kid(n, name);
  return k ? k.text.trim() : undefined;
};
const nums = (n: XmlNode | undefined, name: string): number[] => kids(n, name).map((k) => Number(k.text.trim()));
const bool = (n: XmlNode | undefined, name: string): boolean | undefined => {
  const t = text(n, name);
  return t === undefined ? undefined : t === 'true';
};

/** One side of a layer (foreground or background) as the server wrote it, before any reading. */
export interface InfoProducer {
  /** The server's own producer name: `ffmpeg`, `image`, `color`, `html`, `empty`, `transition`... */
  producer: string;
  name?: string;
  path?: string;
  /** [start, length] of the segment, seconds. */
  clip?: [number, number];
  /** [position in the whole file, the whole file's length], seconds. */
  time?: [number, number];
  loop?: boolean;
  paused?: boolean;
  framesLeft?: number;
  color?: string;
  transition?: { type: string; frame: [number, number]; producer: string };
}

export interface InfoLayer {
  layer: number;
  foreground: InfoProducer;
  background: InfoProducer;
}

export interface InfoChannel {
  format?: string;
  /** Frames per second, from `framerate` [num, den]. */
  fps?: number;
  layers: InfoLayer[];
}

function pair(values: number[]): [number, number] | undefined {
  return values.length >= 2 && values.every((v) => Number.isFinite(v)) ? [values[0], values[1]] : undefined;
}

function producerOf(n: XmlNode | undefined): InfoProducer {
  if (!n) return { producer: 'empty' };
  const file = kid(n, 'file');
  const tr = kid(n, 'transition');
  const frame = pair(nums(tr, 'frame'));
  const framesLeft = text(n, 'frames_left');
  return {
    producer: text(n, 'producer') ?? 'empty',
    // File identity is literal: `insert 2 .mp4` reads back as `INSERT 2 `.
    // Trimming it loses this Bridge's cue ownership, timer and Out controls.
    name: kid(file, 'name')?.text,
    path: kid(file, 'path')?.text,
    clip: pair(nums(file, 'clip')),
    time: pair(nums(file, 'time')),
    loop: bool(n, 'loop'),
    paused: bool(n, 'paused'),
    framesLeft: framesLeft === undefined ? undefined : Number(framesLeft),
    color: text(n, 'color'),
    transition: tr && frame ? { type: text(tr, 'type') ?? '', frame, producer: text(tr, 'producer') ?? '' } : undefined,
  };
}

/** The one data line of a `201 INFO OK` for a channel, read into its layers. */
export function parseInfo(xml: string): InfoChannel {
  const channel = kid(parseXml(xml), 'channel');
  if (!channel) throw new UsageError('INFO answered without a <channel> document.');
  const rate = nums(channel, 'framerate');
  const layers: InfoLayer[] = [];
  for (const l of kid(kid(channel, 'stage'), 'layer')?.children ?? []) {
    const m = /^layer_(\d+)$/.exec(l.name);
    if (!m) continue;
    layers.push({ layer: Number(m[1]), foreground: producerOf(kid(l, 'foreground')), background: producerOf(kid(l, 'background')) });
  }
  layers.sort((a, b) => a.layer - b.layer);
  return {
    format: text(channel, 'format'),
    fps: rate.length >= 2 && rate[1] > 0 ? rate[0] / rate[1] : undefined,
    layers,
  };
}

/** INFO PATHS is read only when the native image producer reports a relative file path. */
export function parseInitialPath(xml: string): string | undefined {
  const paths = kid(parseXml(xml), 'paths');
  if (!paths) throw new UsageError('INFO PATHS answered without a <paths> document.');
  return kid(paths, 'initial-path')?.text;
}
