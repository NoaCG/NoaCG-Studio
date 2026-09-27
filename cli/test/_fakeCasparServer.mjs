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
//   - `LOADBG … AUTO` plays the background when the foreground ends, `MIX n` frames early (at
//     least one frame), and onto an EMPTY layer it plays at once;
//   - the AUTO check runs before the pause check: a paused clip already inside its last `n`
//     frames still switches, and the switch clears the pause;
//   - a `PLAY` whose file is missing answers 404 and leaves the layer, its background and its
//     AUTO exactly as they were;
//   - `LOADBG` without AUTO switches AUTO off; `STOP` empties the foreground and switches AUTO off
//     but keeps the background; `CLEAR c-l` removes both;
//   - a looping clip never ends, so AUTO behind it never fires.
// Anything the model does not know is answered `400 ERROR`, never guessed.
//
// TIME IS INJECTED. `clock.now()` is milliseconds; the fake reads it and never schedules
// anything, so nothing happens between two readings except what the arithmetic says happened.
// Every command and every `layer()` read first SETTLES the model up to `clock.now()`, and an
// automatic switch is placed at the instant it was due, not at the instant it was noticed - so a
// test that jumps the clock by a minute sees the same state as one that crept up on it.
//
// `INFO <channel>` is answered from the model as XML, on one line. Its field names follow the
// server's `state_` keys as §4 describes them (`file/name`, `file/path`, `file/time`,
// `file/clip`, `paused`, `loop`, `producer`), but it is THIS FAKE'S rendering, not a capture: the
// real 2.5.0 answers are recorded separately as fixtures (§12, item 1), and a parser is pinned
// against those, never against this.

import { createServer } from 'node:net';

/** A clock that moves only when told. Share one between the fake and the code under test. */
export function manualClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
      return t;
    },
    set(ms) {
      t = ms;
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
 *   intercept - `(line, { tokens }) => string | undefined | Promise<…>`: FAULT INJECTION. A string
 *               is sent as the whole reply and the command is NOT applied; undefined lets it
 *               through. It may await first, which is how a test delays a reply.
 */
export async function fakeCasparServer(options = {}) {
  const clock = options.clock ?? manualClock();
  const media = new Map(Object.entries(options.media ?? {}).map(([name, m]) => [name.toUpperCase(), { name, ...m }]));
  const templates = options.templates ?? [];
  const channels = options.channels ?? { 1: { fps: 25 } };
  const version = options.version ?? '2.5.0 fake Stable';
  /** `"<channel>-<layer>"` -> the layer's state. */
  const layers = new Map();
  /** Every line received, with the clock reading it arrived at. */
  const commands = [];

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
    if (fg.loop || !Number.isFinite(fg.length)) return null;
    // The transition starts `n` frames before the end so it finishes on the last one; a cut
    // switches when the last frame has been shown. At least one frame either way.
    const lead = Math.max(1, bg.mix ?? 0) / fpsOf(l.channel);
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
    if (!first) return { error: 'no file' };
    const rest = tokens.slice(1).map((t) => t.text.toUpperCase());
    const flag = (word) => rest.includes(word);
    const arg = (word) => {
      const i = rest.indexOf(word);
      return i >= 0 && i + 1 < rest.length ? Number(rest[i + 1]) : undefined;
    };
    const mix = flag('MIX') ? arg('MIX') ?? 0 : undefined;
    if (!first.quoted && first.text.toUpperCase() === 'EMPTY') {
      return { producer: 'colour', file: '#00000000', start: 0, length: Infinity, loop: false, mix };
    }
    if (!first.quoted && first.text.toUpperCase() === '[HTML]') {
      return { producer: 'html', file: tokens[1]?.text ?? '', start: 0, length: Infinity, loop: false, mix };
    }
    const m = media.get(first.text.toUpperCase());
    if (!m) return null;
    const fps = m.fps ?? fpsOf(channel);
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
        l.foreground = { ...p, loadedAt: now, startedAt: now, pausedAt: null, playedAt: now };
        l.background = null;
        l.auto = false;
        return reply.ok(cmd);
      }
      case 'LOADBG': {
        const p = producerFor(args, channel);
        if (!p) return reply.notFound(cmd);
        l.background = { ...p, loadedAt: now, startedAt: now, pausedAt: null };
        l.auto = args.slice(1).some((t) => t.text.toUpperCase() === 'AUTO');
        return reply.ok(cmd);
      }
      case 'LOAD': {
        // The first frame, paused, on the foreground.
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

  /** One producer as INFO's XML - see the head of this file for what this is and is not. */
  function producerXml(p, at, running) {
    if (!p) return '<producer>empty</producer>';
    if (p.producer === 'colour') return `<producer>color</producer><color>${xmlEscape(p.file)}</color>`;
    if (p.producer === 'html') return `<producer>html</producer><url>${xmlEscape(p.file)}</url>`;
    if (p.producer === 'still') return `<producer>image</producer><file><path>${xmlEscape(p.file)}</path></file>`;
    const pos = running ? position(p, at) : 0;
    return (
      `<producer>ffmpeg</producer><file><name>${xmlEscape(p.file)}</name>` +
      `<time>${num(p.start + pos)}</time><time>${num(p.whole)}</time>` +
      `<clip>${num(p.start)}</clip><clip>${num(p.length)}</clip></file>` +
      `<loop>${p.loop}</loop><paused>${running && p.pausedAt !== null}</paused>`
    );
  }

  function infoXml(channel) {
    const at = clock.now();
    const rows = [...layers.values()]
      .filter((l) => l.channel === channel)
      .sort((a, b) => a.layer - b.layer)
      .map(
        (l) =>
          `<layer_${l.layer}><foreground>${producerXml(l.foreground, at, true)}</foreground>` +
          `<background>${producerXml(l.background, at, false)}<auto>${l.auto}</auto></background></layer_${l.layer}>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="utf-8"?><channel><framerate>${fpsOf(channel)}</framerate><stage><layer>${rows}</layer></stage></channel>`;
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
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        // One line at a time per connection, in order, even when an intercept awaits.
        queue = queue.then(async () => {
          commands.push({ line, at: clock.now() });
          const tokens = tokenize(line);
          const injected = options.intercept ? await options.intercept(line, { tokens }) : undefined;
          let answer = injected;
          if (answer === undefined) {
            settle();
            answer = apply(line, tokens);
          }
          if (!socket.destroyed) socket.write(answer, 'utf8');
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
    /** Just the lines. */
    get seen() {
      return commands.map((c) => c.line);
    },
    layer,
    /** Move a manual clock and settle the model to it. */
    advance(ms) {
      clock.advance(ms);
      settle();
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
