// A STATEFUL fake CasparCG for the Bridge tests: layers that hold what was played on them, clips
// with lengths, and time that moves only when the test moves it (docs/CLIP_PLAYBACK_PLAN.md §10).
//
// `_fakeCaspar.mjs` answers one command however a test says, which is what the AMCP parser tests
// need. The clip work needs the other thing: a server that REMEMBERS - what is on a layer, what is
// queued behind it, when a clip ends and what happens then - so a sequence runner can be tested
// against the real Bridge code with the page gone, and a guard can be broken on purpose.
//
// THE MODEL IS §4 OF THE PLAN, read from the server's source (v2.3.3 and v2.5.0), and nothing else:
//   - a clip that ends without LOOP holds its last frame;
//   - a still, and the EMPTY colour, never end (unless a LENGTH is given);
//   - `LOADBG … AUTO` plays the background once the foreground's last frame has been shown, or
//     `MIX n` frames before it (at least one frame), and onto an EMPTY layer it plays at once;
//   - the AUTO check runs before the pause check: a paused clip already inside its last `n`
//     frames still switches, and the switch clears the pause;
//   - a `PLAY` whose file is missing answers 404 and leaves the layer, its background and its
//     AUTO exactly as they were;
//   - `LOADBG` without AUTO switches AUTO off; `STOP` empties the foreground and switches AUTO off
//     but keeps the background; `CLEAR c-l` removes both;
//   - a looping clip never ends, so AUTO behind it never fires;
//   - `IN`, `SEEK`, `OUT` and `LENGTH` count frames at the CHANNEL's rate, not the file's: on the
//     real 2.5.0 a 25 fps file on a 50p channel took `SEEK 250 LENGTH 375` as 5 s in and 7.5 s
//     long (measured 2026-09-28, cli/test/fixtures/info/video-trimmed.json);
//   - a clip PLAYed from part way in (`IN` or `SEEK`) has not reached its segment for its first
//     STARTING_MS: INFO shows the file at 0, and a `LOADBG … AUTO` queued then fires at once, so the
//     follower airs and the trimmed clip never does (measured on 2.5.0 and 2.3, 2026-09-28).
// Anything the model does not know is answered `400 ERROR`, never guessed.
//
// TIME IS INJECTED. `clock.now()` is milliseconds; the fake reads it and never schedules
// anything, so nothing happens between two readings except what the arithmetic says happened.
// Every command and every `layer()` read first SETTLES the model up to `clock.now()`, and an
// automatic switch is placed at the instant it was due, not at the instant it was noticed - so a
// test that jumps the clock by a minute sees the same state as one that crept up on it.
//
// `INFO <channel>` is answered from the model as XML, on one line, in the SHAPE the real 2.5.0
// answered on 2026-09-28 (cli/test/fixtures/info/): `ffmpeg` for a clip or an audio file with
// `file/clip`, `file/time` and `file/name`; `image` with `file/path`; `color`; `html` with
// `file/path`; `empty` after a STOP; a queued background as a `transition` wrapping its file; and
// `frames_left` on the foreground only while the background waits with AUTO. It is still this
// fake's rendering, not a capture - the parser is pinned against the captures themselves, and this
// shape only has to be one the parser reads the same way.

import { createServer } from 'node:net';
import { StringDecoder } from 'node:string_decoder';

/** A clock that moves only when told. Share one between the fake and the code under test. */
export function manualClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
      return t;
    },
  };
}

/** Split an AMCP line the way the server's tokenizer does: whitespace between tokens, and a
 *  double-quoted token with `\\`, `\"` and `\n` as its only escapes. */
export function tokenize(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    while (line[i] === ' ' || line[i] === '\t') i += 1;
    if (i >= line.length) break;
    if (line[i] === '"') {
      let s = '';
      i += 1;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) {
          const c = line[i + 1];
          s += c === 'n' ? '\n' : c === '\\' || c === '"' ? c : '';
          i += 2;
        } else {
          s += line[i];
          i += 1;
        }
      }
      i += 1;
      out.push({ text: s, quoted: true });
    } else {
      let s = '';
      while (i < line.length && line[i] !== ' ' && line[i] !== '\t') s += line[i++];
      out.push({ text: s, quoted: false });
    }
  }
  return out;
}

/** How long a clip PLAYed from part way in takes to reach its segment (measured: a follower queued
 *  at 30 and 60 ms fired early, one at 90 ms did not). */
export const STARTING_MS = 80;

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '0');

/**
 * Start the fake. Options:
 *   clock     - `{ now(): ms }`; defaults to a `manualClock()` the result exposes.
 *   media     - `{ NAME: { kind: 'movie' | 'still' | 'audio', seconds?, fps? } }`. Names match
 *               case-insensitively, as the server's do. A movie or audio file needs `seconds`.
 *   templates - template names, for TLS and `CG … ADD`.
 *   channels  - `{ 1: { fps: 25 }, … }`; a command on any other channel is refused.
 *   version   - what VERSION answers.
 *   intercept - `(line, { tokens, answer }) => string | undefined | Promise<…>`: FAULT INJECTION.
 *               A string is sent as the whole reply and the command is NOT applied (unless it came
 *               from `answer()`, which applies it at that moment); undefined lets it through. It
 *               may await first, which is how a test delays a reply.
 */
export async function fakeCasparServer(options = {}) {
  const clock = options.clock ?? manualClock();
  const media = new Map(Object.entries(options.media ?? {}).map(([name, m]) => [name.toUpperCase(), { name, ...m }]));
  const templates = options.templates ?? [];
  // Copied, so `setRate` can change a channel's format mid-test the way `SET <c> MODE` would.
  const channels = Object.fromEntries(Object.entries(options.channels ?? { 1: { fps: 25 } }).map(([c, v]) => [c, { ...v }]));
  const version = options.version ?? '2.5.0 fake Stable';
  /** `"<channel>-<layer>"` -> the layer's state. */
  const layers = new Map();
  /** Every line received, with the clock reading it arrived at. */
  const commands = [];
  /** What a throwing intercept threw: the connection is dropped, and the error kept here. */
  const errors = [];

  const fpsOf = (channel) => channels[channel]?.fps ?? 25;
  const layerAt = (channel, layer) => {
    const key = `${channel}-${layer}`;
    if (!layers.has(key)) layers.set(key, { channel, layer, foreground: null, background: null, auto: false });
    return layers.get(key);
  };

  /** Where a producer is in its segment, in seconds, at `at` ms. */
  function position(p, at) {
    const ran = ((p.pausedAt ?? at) - p.startedAt) / 1000;
    if (!Number.isFinite(p.length)) return Math.max(0, ran);
    if (p.loop) return ((ran % p.length) + p.length) % p.length;
    return Math.min(Math.max(0, ran), p.length);
  }

  /** When the background takes over, in clock ms, or null if it never does on its own. */
  function switchAt(l) {
    const fg = l.foreground;
    const bg = l.background;
    if (!bg || !l.auto) return null;
    // `load()`: AUTO onto an empty layer plays at once.
    if (!fg) return bg.loadedAt;
    // Queued while a clip PLAYed part way in has not reached its segment: it fires at once.
    if (fg.startingUntil !== undefined && bg.loadedAt < fg.startingUntil) return bg.loadedAt;
    if (fg.loop || !Number.isFinite(fg.length)) return null;
    // A `MIX n` starts `n` frames before the end (at least one) so it finishes on the last
    // frame; a cut switches once the last frame has been shown.
    const lead = (bg.mix === undefined ? 0 : Math.max(1, bg.mix)) / fpsOf(l.channel);
    const due = fg.startedAt + (fg.length - lead) * 1000;
    if (fg.pausedAt !== null) {
      // The AUTO check runs before the pause check, and it reads the frozen frame number: paused
      // inside the window, the switch happens; paused before it, never while paused.
      return position(fg, fg.pausedAt) >= fg.length - lead ? Math.max(bg.loadedAt, fg.pausedAt) : null;
    }
    return Math.max(bg.loadedAt, due);
  }

  /** Bring every layer up to `clock.now()`. */
  function settle() {
    const now = clock.now();
    for (const l of layers.values()) {
      const at = switchAt(l);
      if (at === null || at > now) continue;
      const next = l.background;
      l.foreground = { ...next, startedAt: at, pausedAt: null, playedAt: at };
      l.background = null;
      l.auto = false;
    }
  }

  /** A producer for a file name, with its segment - or null when the server has no such file. */
  function producerFor(tokens, channel) {
    const first = tokens[0];
    if (!first) return null;
    const rest = tokens.slice(1).map((t) => t.text.toUpperCase());
    const flag = (word) => rest.includes(word);
    const arg = (word) => {
      const i = rest.indexOf(word);
      return i >= 0 && i + 1 < rest.length ? Number(rest[i + 1]) : undefined;
    };
    const mix = flag('MIX') ? arg('MIX') ?? 0 : undefined;
    if (!first.quoted && first.text.toUpperCase() === 'EMPTY') {
      return { producer: 'colour', file: 'EMPTY', start: 0, length: Infinity, loop: false, mix };
    }
    if (!first.quoted && first.text.toUpperCase() === '[HTML]') {
      return { producer: 'html', file: tokens[1]?.text ?? '', start: 0, length: Infinity, loop: false, mix };
    }
    const m = media.get(first.text.toUpperCase());
    if (!m) return null;
    // The channel's frames, whatever the file's own rate (see the head of this file).
    const fps = fpsOf(channel);
    const lengthFrames = arg('LENGTH');
    if (m.kind === 'still') {
      return {
        producer: 'still',
        file: m.name,
        start: 0,
        length: lengthFrames !== undefined ? lengthFrames / fpsOf(channel) : Infinity,
        loop: false,
        mix,
      };
    }
    const whole = m.seconds ?? 0;
    const inFrames = arg('IN') ?? arg('SEEK') ?? 0;
    const start = Math.min(inFrames / fps, whole);
    const outFrames = arg('OUT');
    const end = outFrames !== undefined ? Math.min(outFrames / fps, whole) : whole;
    const length = lengthFrames !== undefined ? Math.min(lengthFrames / fps, whole - start) : Math.max(0, end - start);
    return { producer: m.kind === 'audio' ? 'audio' : 'video', file: m.name, whole, start, length, loop: flag('LOOP'), mix };
  }

  const reply = {
    ok: (cmd) => `202 ${cmd} OK\r\n`,
    notFound: (cmd) => `404 ${cmd} FAILED\r\n`,
    bad: (line) => `400 ERROR\r\n${line}\r\n`,
    noChannel: (cmd) => `401 ${cmd} ERROR\r\n`,
  };

  /** Apply one command to the model and return its reply. */
  function apply(line, tokens) {
    const cmd = tokens[0]?.text.toUpperCase() ?? '';
    if (cmd === 'VERSION') return `201 VERSION OK\r\n${version}\r\n`;
    if (cmd === 'TLS') return `200 TLS OK\r\n${templates.map((t) => `${t}\r\n`).join('')}\r\n`;
    if (cmd === 'CLS') {
      const rows = [...media.values()].map((m) => {
        const fps = m.fps ?? 25;
        const frames = m.kind === 'still' ? 0 : Math.round((m.seconds ?? 0) * fps);
        const base = m.kind === 'still' ? '0/1' : `1/${fps}`;
        return `"${m.name.toUpperCase()}"  ${m.kind.toUpperCase()}  1024 20260927120000 ${frames} ${base}\r\n`;
      });
      return `200 CLS OK\r\n${rows.join('')}\r\n`;
    }
    const address = tokens[1]?.text ?? '';
    const [channelText, layerText] = address.split('-');
    const channel = Number(channelText);
    if (!channels[channel]) return cmd === 'INFO' || cmd === 'CLEAR' || layerText !== undefined ? reply.noChannel(cmd) : reply.bad(line);
    if (cmd === 'INFO') return `201 INFO OK\r\n${infoXml(channel)}\r\n`;
    if (cmd === 'CLEAR' && layerText === undefined) {
      for (const [key, l] of layers) if (l.channel === channel) layers.delete(key);
      return reply.ok(cmd);
    }
    const layerNo = Number(layerText);
    if (!Number.isInteger(layerNo) || layerNo < 0) return reply.bad(line);
    const l = layerAt(channel, layerNo);
    const now = clock.now();
    const args = tokens.slice(2);

    switch (cmd) {
      case 'PLAY': {
        if (args.length === 0) {
          // PLAY with no file plays the background, if there is one.
          if (l.background) {
            l.foreground = { ...l.background, startedAt: now, pausedAt: null, playedAt: now };
            l.background = null;
          }
          l.auto = false;
          return reply.ok(cmd);
        }
        // `PLAY c-l <file>` is LOADBG then PLAY. A missing file fails in the LOADBG half, so the
        // layer - its background and its AUTO with it - is exactly as it was.
        const p = producerFor(args, channel);
        if (!p) return reply.notFound(cmd);
        l.foreground = { ...p, loadedAt: now, startedAt: now, pausedAt: null, playedAt: now, ...(p.start > 0 ? { startingUntil: now + STARTING_MS } : {}) };
        l.background = null;
        l.auto = false;
        return reply.ok(cmd);
      }
      case 'LOADBG': {
        if (args.length === 0) return reply.bad(line);
        const p = producerFor(args, channel);
        if (!p) return reply.notFound(cmd);
        l.background = { ...p, loadedAt: now, startedAt: now, pausedAt: null };
        l.auto = args.slice(1).some((t) => t.text.toUpperCase() === 'AUTO');
        return reply.ok(cmd);
      }
      case 'LOAD': {
        // The first frame, paused, on the foreground.
        if (args.length === 0) return reply.bad(line);
        const p = producerFor(args, channel);
        if (!p) return reply.notFound(cmd);
        l.foreground = { ...p, loadedAt: now, startedAt: now, pausedAt: now, playedAt: now };
        return reply.ok(cmd);
      }
      case 'STOP':
        l.foreground = null;
        l.auto = false;
        return reply.ok(cmd);
      case 'PAUSE':
        if (l.foreground && l.foreground.pausedAt === null) l.foreground.pausedAt = now;
        return reply.ok(cmd);
      case 'RESUME':
        if (l.foreground && l.foreground.pausedAt !== null) {
          l.foreground.startedAt += now - l.foreground.pausedAt;
          l.foreground.pausedAt = null;
        }
        return reply.ok(cmd);
      case 'CLEAR':
        layers.delete(`${channel}-${layerNo}`);
        return reply.ok(cmd);
      case 'CG': {
        const sub = args[1]?.text.toUpperCase();
        if (sub === 'ADD') {
          const name = args[3]?.text ?? '';
          if (templates.length && !templates.some((t) => t.toUpperCase() === name.toUpperCase())) return reply.notFound(cmd);
          l.foreground = { producer: 'html', file: name, start: 0, length: Infinity, loop: false, loadedAt: now, startedAt: now, pausedAt: null, playedAt: now };
          return reply.ok(cmd);
        }
        if (['UPDATE', 'NEXT', 'STOP', 'PLAY', 'INVOKE', 'REMOVE', 'CLEAR'].includes(sub)) return reply.ok(cmd);
        return reply.bad(line);
      }
      case 'MIXER':
        // Recorded in `commands`, and otherwise not modelled: the plan sends no MIXER line.
        return `202 MIXER OK\r\n`;
      default:
        return reply.bad(line);
    }
  }

  /** A foreground as INFO's XML - see the head of this file for what this is and is not. */
  function foregroundXml(l, at) {
    const p = l.foreground;
    if (!p) return '<paused>false</paused><producer>empty</producer>';
    const paused = `<paused>${p.pausedAt !== null}</paused>`;
    if (p.producer === 'colour') return `<color>${xmlEscape(p.file)}</color>${paused}<producer>color</producer>`;
    if (p.producer === 'html') return `<file><path>${xmlEscape(p.file)}</path></file>${paused}<producer>html</producer>`;
    if (p.producer === 'still') return `<file><path>media\\${xmlEscape(p.file)}.png</path></file>${paused}<producer>image</producer>`;
    const framesLeft = l.background && l.auto ? `<frames_left>${Math.max(0, Math.round((p.length - position(p, at)) * fpsOf(l.channel)))}</frames_left>` : '';
    // Not in its segment yet: the file reads at 0 (see STARTING_MS).
    const time = p.startingUntil !== undefined && at < p.startingUntil ? 0 : p.start + position(p, at);
    return (
      `<file><clip>${num(p.start)}</clip><clip>${num(p.length)}</clip><name>${xmlEscape(p.file)}</name>` +
      `<path>media/${xmlEscape(p.file)}.mp4</path><time>${num(time)}</time><time>${num(p.whole)}</time></file>` +
      `${framesLeft}<loop>${p.loop}</loop>${paused}<producer>ffmpeg</producer>`
    );
  }

  /** A background as INFO's XML: a queued file sits inside a `transition` producer, as on 2.5.0. */
  function backgroundXml(l) {
    const p = l.background;
    if (!p) return '<producer>empty</producer>';
    const file =
      p.producer === 'video' || p.producer === 'audio'
        ? `<file><clip>${num(p.start)}</clip><clip>0</clip><name>${xmlEscape(p.file)}</name><time>0</time><time>0</time></file>`
        : `<file><path>${xmlEscape(p.file)}</path></file>`;
    const inner = p.producer === 'still' ? 'image' : p.producer === 'colour' ? 'color' : p.producer === 'html' ? 'html' : 'ffmpeg';
    const frames = p.mix === undefined ? 0 : p.mix;
    return (
      `${file}<loop>${p.loop}</loop><producer>transition</producer>` +
      `<transition><frame>0</frame><frame>${frames}</frame><producer>${inner}</producer><type>${p.mix === undefined ? 'cut' : 'mix'}</type></transition>`
    );
  }

  function infoXml(channel) {
    const at = clock.now();
    const rows = [...layers.values()]
      .filter((l) => l.channel === channel)
      .sort((a, b) => a.layer - b.layer)
      .map((l) => `<layer_${l.layer}><background>${backgroundXml(l)}</background><foreground>${foregroundXml(l, at)}</foreground></layer_${l.layer}>`)
      .join('');
    // A whole rate is `n/1`; 29.97 is written the way the server does, `30000/1001`.
    const fps = fpsOf(channel);
    const [num, den] = Number.isInteger(fps) ? [fps, 1] : [Math.round(fps * 1001), 1001];
    return `<?xml version="1.0" encoding="utf-8"?><channel><format>fake</format><framerate>${num}</framerate><framerate>${den}</framerate><stage><layer>${rows}</layer></stage></channel>`;
  }

  /** What a layer holds right now, as the model sees it - what tests assert on. */
  function layer(channel, layerNo) {
    settle();
    const l = layers.get(`${channel}-${layerNo}`);
    const at = clock.now();
    const view = (p, running) =>
      p && {
        producer: p.producer,
        file: p.file,
        segment: { start: p.start, length: p.length },
        // A background has not started, so it sits at its first frame.
        position: running ? position(p, at) : 0,
        paused: running && p.pausedAt !== null,
        loop: p.loop,
        ended: running && Number.isFinite(p.length) && !p.loop && position(p, at) >= p.length,
        ...(running ? { playedAt: p.playedAt } : {}),
      };
    return {
      foreground: l ? view(l.foreground, true) : null,
      background: l ? view(l.background, false) : null,
      auto: l ? l.auto : false,
    };
  }

  const server = createServer((socket) => {
    let buffer = '';
    let queue = Promise.resolve();
    // A name like `Jääkiekko` can split across two chunks; the decoder holds the half character.
    const decoder = new StringDecoder('utf8');
    socket.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        commands.push({ line, at: clock.now() });
        // One line at a time per connection, in order, even when an intercept awaits. An
        // intercept that throws drops the connection at once, so the client fails there rather
        // than waiting out its timeout, and the error is kept for the test to read.
        queue = queue.then(async () => {
          const tokens = tokenize(line);
          // `answer()` applies the command NOW and hands back its reply, so an intercept can take a
          // reading at one moment and deliver it later - a slow answer from before something else.
          const applyNow = () => {
            settle();
            return apply(line, tokens);
          };
          const injected = options.intercept ? await options.intercept(line, { tokens, answer: applyNow }) : undefined;
          const sent = injected === undefined ? applyNow() : injected;
          if (!socket.destroyed) socket.write(sent, 'utf8');
        }).catch((error) => {
          errors.push(error);
          socket.destroy();
        });
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    port: server.address().port,
    clock,
    /** Every line received, `{ line, at }`, oldest first. */
    commands,
    errors,
    /** Just the lines. */
    get seen() {
      return commands.map((c) => c.line);
    },
    layer,
    /** Change a channel's frame rate, as a format change would: every frame count after it is in
     *  the new rate, and INFO says so. */
    setRate(channel, fps) {
      settle();
      channels[channel] = { ...channels[channel], fps };
    },
    /** Move a manual clock and settle the model to it. */
    advance(ms) {
      clock.advance(ms);
      settle();
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
