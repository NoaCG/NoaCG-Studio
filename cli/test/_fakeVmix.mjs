// A fake vMix TCP API on 127.0.0.1, answering the way vMix 29.0.0.49 did on 2026-10-12
// (cli/src/playout/vmixTcp.ts has the measured shapes): the `VERSION OK` greeting, `XML <bytes>` and
// its body, `FUNCTION OK Completed` for EVERY function (even unknown ones), the `ACTS OK` lines of
// a subscription, and the overlay rules measured there - `OverlayInput<N>Out` and `Off` ignore an
// `Input=` and take whatever the channel holds.
//
// It records every line it is sent and every function, decoded, so a test can say exactly what
// reached vMix. `hook(line, socket)` may answer a line itself (return true): a dropped connection,
// a refusal or silence.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function startFakeVmix(options = {}) {
  const version = options.version ?? '29.0.0.49';
  const edition = options.edition ?? 'Trial';
  /** Inputs in order (a number is a position); overlays hold KEYS, rendered as numbers. */
  const makeInput = (i) => ({ key: randomUUID(), ...(i.type === 'VideoList' ? { list: [], selectedIndex: 1, state: 'Completed', position: 0, duration: 0, loop: false, autoPlay: true, autoPause: true, autoRestart: true, autoPlayNext: true, audioAuto: true, muted: true, alpha: 255, fader: 100, gain: 0, clockAt: options.now?.() } : {}), ...i });
  const inputs = (options.inputs ?? []).map(makeInput);
  const overlays = new Map();
  const lines = [];
  const functions = [];
  const sockets = new Set();
  let connections = 0;
  let subscribers = new Set();


  function updateClock(input) {
    if (!input.list || !options.now) return;
    const now = options.now();
    const since = now - (input.clockAt ?? now);
    input.clockAt = now;
    if (input.state === 'Running' && input.duration > 0 && since > 0) {
      input.position += since;
      if (input.position >= input.duration) {
        if (input.loop) input.position %= input.duration;
        else {
          input.position = input.duration;
          input.state = 'Completed';
        }
      }
    }
    const ramp = input.volumeRamp;
    if (ramp) {
      const progress = Math.min(1, (now - ramp.at) / ramp.duration);
      input.fader = ramp.from + (ramp.to - ramp.from) * progress;
      if (progress === 1) delete input.volumeRamp;
    }
  }

  const amplitude = (input) => 100 * (input.fader / 100) ** 4;

  function xmlText(line) {
    const selector = line.slice('XMLTEXT '.length);
    const key = /translate\(@key,'ABCDEF','abcdef'\)='([^']+)'/.exec(selector)?.[1];
    const matches = inputs.filter(row => row.key.toLowerCase() === key);
    const input = matches.length === 1 && matches[0].type === 'VideoList' ? matches[0] : undefined;
    if (!input || !selector.includes("[@type='VideoList']")) return;
    updateClock(input);
    const fields = {
      selectedIndex: input.selectedIndex, duration: input.duration, state: input.state,
      position: input.position, volume: amplitude(input), muted: input.muted ? 'True' : 'False',
    };
    for (const [, attr, value] of selector.matchAll(/\[@(selectedIndex|duration|state)='([^']+)'\]/g)) {
      if (String(fields[attr]) !== value) return;
    }
    const count = /\[count\(list\/(?:item|\*)\)=(\d+)\]/.exec(selector)?.[1];
    if (input.list.length !== Number(count)) return;
    const markers = input.selectedMarkers ?? (input.list.length ? [input.selectedIndex] : []);
    if (selector.includes('count(list/item[translate(@selected,') &&
        (input.badSelectedMarker || markers.length > 1 || (markers.length && markers[0] !== input.selectedIndex))) return;
    for (const [, attr, value] of selector.matchAll(/\[translate\(@(loop|muted),[^)]+\)='(true|false)'\]/g)) {
      if (String(input[attr]) !== value) return;
    }
    for (const [, at, single, double] of selector.matchAll(/\[list\/item\[(\d+)\]=(?:'([^']+)'|"([^"]+)")\]/g)) {
      if (input.list[Number(at) - 1] !== (single ?? double)) return;
    }
    if (selector.includes("[@state='Paused' or @state='Completed']") && !['Paused', 'Completed'].includes(input.state)) return;
    const clearBoundary = /\[@position >= (\d+) or \(@state='Completed' and @duration=(\d+)\)\]/.exec(selector);
    if (clearBoundary && input.position < Number(clearBoundary[1]) &&
        (input.state !== 'Completed' || input.duration !== Number(clearBoundary[2]))) return;
    const range = /\[@position >= (\d+) and @position < (\d+)\]/.exec(selector);
    if (range && (input.position < Number(range[1]) || input.position >= Number(range[2]))) return;
    if (selector.includes('[@volume and number(@volume)=0]') && fields.volume !== 0) return;
    const field = /\/@(position|volume|state|muted)$/.exec(selector)?.[1];
    if (field) return fields[field];
  }

  const numberOf = (key) => inputs.findIndex((i) => i.key === key) + 1;
  const xml = () =>
    `<vmix><version>${version}</version><edition>${esc(edition)}</edition><inputs>${inputs
      .map((i, n) => {
        updateClock(i);
        const selected = i.list?.[i.selectedIndex - 1];
        const title = i.type === 'VideoList' && selected ? i.title + ' - ' + path.basename(selected) : i.title;
        const marked = i.selectedMarkers ?? [i.selectedIndex];
        const list = i.list ? '<list>' + i.list.map((file, index) => '<item' + (marked.includes(index + 1) ? ' selected="' + (i.badSelectedMarker ?? 'true') + '"' : '') + '>' + esc(file) + '</item>').join('') + '</list>' : '';
        return '<input key="' + i.key + '" number="' + (n + 1) + '" type="' + i.type + '" title="' + esc(title) + '" shortTitle="' + esc(i.title) + '" state="' + (i.state ?? 'Paused') + '" position="' + (i.position ?? 0) + '" duration="' + (i.duration ?? 0) + '"' + (i.list ? ' volume="' + amplitude(i) + '"' : '') + ' muted="' + (i.muted ? 'True' : 'False') + '" loop="' + (i.loop ? 'True' : 'False') + '"' + (i.list ? ' selectedIndex="' + i.selectedIndex + '"' : '') + '>' + list + esc(i.title) + '</input>';
      })
      .join('')}</inputs><overlays>${Array.from({ length: 16 }, (_, c) => {
      const key = overlays.get(c + 1);
      return key ? `<overlay number="${c + 1}">${numberOf(key)}</overlay>` : `<overlay number="${c + 1}" />`;
    }).join('')}</overlays><preview>1</preview><active>1</active><fadeToBlack>False</fadeToBlack></vmix>\r\n`;

  const acts = (text) => {
    for (const s of subscribers) s.write(`ACTS OK ${text}\r\n`);
  };

  /** One function, as vMix 29 treats it. Returns nothing: vMix answers OK regardless. */
  function apply(name, params) {
    const key = params.Input;
    let m;
    if (name === 'AddInput') {
      const [type, rest] = params.Value.split(/\|(.*)/s);
      const input = makeInput({ type, title: type === 'Browser' ? 'Browser ' + new URL(rest).hostname : type === 'VideoList' ? 'List' : rest.split(/[\\/]/).pop(), url: rest });
      const add = () => {
        if (options.replaceStartupBlanks && type === 'VideoList' && inputs.length === 2 && inputs.every(old => old.type === 'Blank')) {
          inputs.splice(0, 2, input, makeInput({ type: 'Blank', title: 'Blank' }));
        } else inputs.push(input);
      };
      if (options.addDelayMs) setTimeout(add, options.addDelayMs);
      else add();
    } else if (inputs.find(i => i.key === key)?.list && name !== 'SetInputName' && name !== 'RemoveInput') {
      const input = inputs.find(i => i.key === key);
      updateClock(input);
      if (options.ignore?.includes(name)) return;
      const value = Number(params.Value);
      if (name === 'ListAdd') {
        if (!existsSync(params.Value) && !Object.hasOwn(options.files ?? {}, params.Value)) return 'File Not Found: ' + params.Value;
        input.list.push(params.Value);
        if (input.list.length === 1) {
          input.selectedIndex = 1;
          input.state = 'Paused';
          input.position = 0;
          input.duration = options.files?.[params.Value] ?? 4000;
        }
      } else if (name === 'SelectIndex') {
        const choose = () => {
          input.selectedIndex = value;
          input.position = 0;
          input.duration = options.files?.[input.list[value - 1]] ?? 4000;
        };
        if (options.selectDelayMs) setTimeout(choose, options.selectDelayMs);
        else choose();
      } else if (name === 'Play') {
        input.state = 'Running';
      } else if (name === 'Pause') input.state = 'Paused';
      else if (name === 'LoopOn' || name === 'LoopOff') {
        // The native mixer ACKs Loop on an empty list without changing it.
        if (!input.list.length) return;
        const setLoop = () => { input.loop = name === 'LoopOn'; };
        if (options.loopDelayMs) setTimeout(setLoop, options.loopDelayMs);
        else setLoop();
      }
      else if (name === 'ListRemove') {
        input.list.splice(value - 1, 1);
        if (value < input.selectedIndex) input.selectedIndex -= 1;
      } else if (name === 'ListRemoveAll') {
        input.list = [];
        input.selectedIndex = 0;
        input.state = 'Completed';
        input.position = 0;
        input.duration = 0;
      } else if (name === 'SetAlpha') input.alpha = value;
      else if (name === 'SetPosition') input.position = Math.min(value, input.duration);
      else if (name === 'SetVolume' && !input.volumeRamp) input.fader = value;
      else if (name === 'SetGain') input.gain = value;
      else if (name === 'SetVolumeFade') {
        const [to, duration] = params.Value.split(',').map(Number);
        input.volumeRamp = { at: options.now?.() ?? 0, from: input.fader, to, duration };
      } else {
        const flags = { AutoPlayOff: ['autoPlay', false], AutoPauseOff: ['autoPause', false], AutoRestartOff: ['autoRestart', false], AutoPlayNextOff: ['autoPlayNext', false], AudioAutoOff: ['audioAuto', false], AudioOn: ['muted', false], AudioOff: ['muted', true] };
        const setting = flags[name];
        if (setting) input[setting[0]] = setting[1];
      }
    } else if (name === 'SetInputName') {
      const input = inputs.find((i) => i.key === key);
      if (input) input.title = params.Value;
    } else if (name === 'RemoveInput') {
      const n = numberOf(key);
      if (n) inputs.splice(n - 1, 1);
    } else if ((m = /^OverlayInput(\d+)In$/.exec(name))) {
      const channel = Number(m[1]);
      if (!numberOf(key)) return;
      const old = overlays.get(channel);
      if (old === key) return;
      if (old) acts(`Overlay${channel} ${numberOf(old)} 0`);
      overlays.set(channel, key);
      acts(`Overlay${channel} ${numberOf(key)} 1`);
    } else if ((m = /^OverlayInput(\d+)(Out|Off)$/.exec(name))) {
      // `Input=` is ignored: the channel's content goes, whatever it is (measured).
      const channel = Number(m[1]);
      const old = overlays.get(channel);
      if (!old) return;
      const finish = () => {
        if (overlays.get(channel) !== old) return;
        overlays.delete(channel);
        acts(`Overlay${channel} ${numberOf(old)} 0`);
      };
      if (m[2] === 'Out' && options.outDelayMs) setTimeout(finish, options.outDelayMs);
      else finish();
    } else if (name === 'OverlayInputAllOff') {
      for (const [channel, old] of [...overlays]) {
        overlays.delete(channel);
        acts(`Overlay${channel} ${numberOf(old)} 0`);
      }
    }
  }

  const server = createServer((sock) => {
    connections += 1;
    sockets.add(sock);
    sock.on('close', () => {
      sockets.delete(sock);
      subscribers.delete(sock);
    });
    sock.on('error', () => {});
    if (options.greeting !== null) sock.write(`${options.greeting ?? `VERSION OK ${version}`}\r\n`);
    if (options.actsAlways) subscribers.add(sock);
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        if (options.hook?.(line, sock)) continue;
        if (line === 'XML') {
          const body = options.transformXml ? options.transformXml(xml()) : xml();
          const send = () => sock.write(`XML ${Buffer.byteLength(body, 'utf8')}\r\n${body}`);
          if (options.xmlDelayMs) setTimeout(send, options.xmlDelayMs);
          else send();
        } else if (line.startsWith('XMLTEXT ')) {
          const value = xmlText(line);
          sock.write(value === undefined ? 'XMLTEXT ER XML Entry Not Found\r\n' : 'XMLTEXT OK ' + value + '\r\n');
        } else if (line === 'SUBSCRIBE ACTS') {
          subscribers.add(sock);
          sock.write('SUBSCRIBE OK ACTS Subscribed\r\n');
        } else if (line.startsWith('FUNCTION ')) {
          const [, name, query = ''] = /^FUNCTION (\S+)(?: (.*))?$/.exec(line);
          const params = Object.fromEntries(query ? query.split('&').map((p) => p.split(/=(.*)/s)).map(([k, v = '']) => [k, decodeURIComponent(v)]) : []);
          functions.push({ name, params });
          const problem = apply(name, params);
          if (options.afterFunction?.(name, params, sock)) continue;
          sock.write(problem ? 'FUNCTION ER ' + problem + '\r\n' : 'FUNCTION OK Completed\r\n');
        } else sock.write(`${line.split(' ')[0]} ER Unknown Command\r\n`);
      }
    });
  });
  await new Promise((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    port,
    inputs,
    overlays,
    lines,
    functions,
    get connections() {
      return connections;
    },
    /** An input already in vMix, the way the operator made it. */
    add(type, title) {
      const input = makeInput({ type, title });
      inputs.push(input);
      return input;
    },
    onChannel(channel) {
      const key = overlays.get(channel);
      return key ? inputs.find((i) => i.key === key) : undefined;
    },
    /** vMix closing: every connection ends and nothing listens. */
    async stop() {
      for (const s of sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
