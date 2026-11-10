// A fake vMix TCP API on 127.0.0.1, answering the way vMix 29.0.0.49 did on 2026-10-12
// (cli/src/playout/vmixTcp.ts has the measured shapes): the `VERSION OK` greeting, `XML <bytes>` and
// its body, `FUNCTION OK Completed` for EVERY function (even unknown ones), the `ACTS OK` lines of
// a subscription, and the overlay rules measured there - `OverlayInput<N>Out` and `Off` ignore an
// `Input=` and take whatever the channel holds.
//
// It records every line it is sent and every function, decoded, so a test can say exactly what
// reached vMix. `hook(line, socket)` may answer a line itself (return true): a dropped connection,
// a refusal or silence.

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function startFakeVmix(options = {}) {
  const version = options.version ?? '29.0.0.49';
  const edition = options.edition ?? 'Trial';
  /** Inputs in order (a number is a position); overlays hold KEYS, rendered as numbers. */
  const inputs = (options.inputs ?? []).map((i) => ({ key: randomUUID(), ...i }));
  const overlays = new Map();
  const lines = [];
  const functions = [];
  const sockets = new Set();
  let connections = 0;
  let subscribers = new Set();

  const numberOf = (key) => inputs.findIndex((i) => i.key === key) + 1;
  const xml = () =>
    `<vmix><version>${version}</version><edition>${esc(edition)}</edition><inputs>${inputs
      .map((i, n) => `<input key="${i.key}" number="${n + 1}" type="${i.type}" title="${esc(i.title)}" shortTitle="${esc(i.title)}" state="Paused" position="0" duration="0" loop="False">${esc(i.title)}</input>`)
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
      const input = { key: randomUUID(), type, title: type === 'Browser' ? 'Browser ' + new URL(rest).hostname : rest.split(/[\\/]/).pop(), url: rest };
      const add = () => inputs.push(input);
      if (options.addDelayMs) setTimeout(add, options.addDelayMs);
      else add();
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
        } else if (line === 'SUBSCRIBE ACTS') {
          subscribers.add(sock);
          sock.write('SUBSCRIBE OK ACTS Subscribed\r\n');
        } else if (line.startsWith('FUNCTION ')) {
          const [, name, query = ''] = /^FUNCTION (\S+)(?: (.*))?$/.exec(line);
          const params = Object.fromEntries(query ? query.split('&').map((p) => p.split(/=(.*)/s)).map(([k, v = '']) => [k, decodeURIComponent(v)]) : []);
          functions.push({ name, params });
          apply(name, params);
          sock.write('FUNCTION OK Completed\r\n');
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
      const input = { key: randomUUID(), type, title };
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
