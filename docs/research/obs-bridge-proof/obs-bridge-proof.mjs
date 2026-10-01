#!/usr/bin/env node
// A standalone proof for docs/work-specs/bridge-obs-adapter/spec.md. It is NOT the Bridge: it
// lives outside cli/ and src/, imports nothing from them, and needs only Node 22 or later (the
// built-in WebSocket).
//
//   node docs/research/obs-bridge-proof/obs-bridge-proof.mjs            probe (read only)
//   node docs/research/obs-bridge-proof/obs-bridge-proof.mjs --plan     every verb's requests
//   node docs/research/obs-bridge-proof/obs-bridge-proof.mjs --live     every verb against OBS
//   ... --obs-config <dir>   read OBS's settings from <dir> (a portable OBS's config/obs-studio)
//
// probe: reads obs-websocket's settings from OBS's own config, says what the Bridge's setup would
//        say, and when the server is listening does the handshake and three read-only requests.
// plan:  runs the adapter's verbs against a small in-memory stand-in and prints each request in
//        order, so the exact calls a live run makes are on record even where OBS cannot be used.
// live:  runs every verb against the real OBS in a scene of its own, which it creates and then
//        removes. It never changes the program or preview scene, never switches scene
//        collections, and never touches obs-websocket's settings. The pages it loads are served
//        by this script on 127.0.0.1 and report what they receive.
//
// The password is read from OBS's config and used for the handshake only. It is never printed,
// logged or written anywhere, and neither is the authentication string derived from it.

import { readFileSync, existsSync, openSync, readSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const MODE = argv.includes('--live') ? 'live' : argv.includes('--plan') ? 'plan' : 'probe';
const configArg = argv.includes('--obs-config') ? argv[argv.indexOf('--obs-config') + 1] : null;

const EVENT_NAME = 'noacg';
const SUBSCRIPTIONS = 1 | 2 | 4 | 128; // General, Config, Scenes, SceneItems (the proof reads more than the Bridge needs)
const REQUEST_TIMEOUT_MS = 3000;

/** Every line goes out with the user's home folder as `~`, plain or JSON-escaped, so a record
 *  can be committed without naming whose machine ran it. */
function say(line = '') {
  const home = homedir();
  process.stdout.write(`${String(line).split(home).join('~').split(home.replace(/\\/g, '\\\\')).join('~')}\n`);
}
function json(value) {
  return JSON.stringify(value);
}

// ── 1. obs-websocket's settings, from OBS's own config ──────────────────────────────────────

/** Where OBS keeps its config for this user, most likely first. */
function obsConfigDirs() {
  if (configArg) return [configArg];
  const home = homedir();
  if (process.platform === 'win32') return [join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'obs-studio')];
  if (process.platform === 'darwin') return [join(home, 'Library', 'Application Support', 'obs-studio')];
  const xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');
  return [join(xdg, 'obs-studio'), join(home, '.var', 'app', 'com.obsproject.Studio', 'config', 'obs-studio')];
}

/** The four settings the Bridge needs. obs-websocket 5 keeps them in
 *  plugin_config/obs-websocket/config.json; older 5.x builds kept them in global.ini under
 *  [OBSWebSocket], which the current build migrates from (its Config.cpp). */
function readObsWebSocketSettings(dirs = obsConfigDirs()) {
  for (const dir of dirs) {
    const file = join(dir, 'plugin_config', 'obs-websocket', 'config.json');
    if (existsSync(file)) {
      let c;
      try {
        c = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        return { file, unreadable: true };
      }
      return {
        file,
        enabled: c.server_enabled === true,
        port: Number.isInteger(c.server_port) ? c.server_port : 4455,
        authRequired: c.auth_required !== false,
        password: typeof c.server_password === 'string' ? c.server_password : '',
      };
    }
    const ini = join(dir, 'global.ini');
    if (existsSync(ini)) {
      const section = /^\[OBSWebSocket\]\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(readFileSync(ini, 'utf8'));
      if (section) {
        const kv = Object.fromEntries(
          section[1].split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
        );
        return {
          file: `${ini} [OBSWebSocket]`,
          enabled: kv.ServerEnabled === 'true',
          port: Number(kv.ServerPort) || 4455,
          authRequired: kv.AuthRequired !== 'false',
          password: kv.ServerPassword || '',
        };
      }
    }
  }
  return null;
}

/** A path as a record may show it: the user's own folders by their variable, not their name. */
function shown(p) {
  if (process.env.APPDATA && p.startsWith(process.env.APPDATA)) return `%APPDATA%${p.slice(process.env.APPDATA.length)}`;
  return p.startsWith(homedir()) ? `~${p.slice(homedir().length)}` : p;
}

function redacted(s) {
  if (!s) return s;
  const { password, file, ...rest } = s;
  return { file: shown(file), ...rest, password: password ? 'present (not shown)' : 'absent' };
}

function tcpProbe(port) {
  return new Promise((resolve) => {
    const sock = tcpConnect({ host: '127.0.0.1', port });
    const done = (r) => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(1000, () => done('timeout'));
    sock.once('connect', () => done('listening'));
    sock.once('error', (e) => done(e.code === 'ECONNREFUSED' ? 'refused' : e.code));
  });
}

// ── 2. The handshake and requests (obs-websocket 5, RPC version 1) ──────────────────────────

const b64sha = (s) => createHash('sha256').update(s).digest('base64');
/** base64(sha256(base64(sha256(password + salt)) + challenge)), docs/generated/protocol.md. */
function authString(password, { salt, challenge }) {
  return b64sha(b64sha(password + salt) + challenge);
}

const CLOSE = {
  4009: 'password',
  4010: 'old',
  4011: 'kicked',
};

class ObsSession {
  constructor(ws, hello, log) {
    this.ws = ws;
    this.hello = hello;
    this.log = log;
    this.next = 1;
    this.pending = new Map();
    this.events = [];
    this.closed = null;
    ws.addEventListener('message', (m) => this.onMessage(JSON.parse(m.data)));
    ws.addEventListener('close', (c) => {
      this.closed = { code: c.code, reason: c.reason };
      for (const p of this.pending.values()) p.reject(new Error(`connection closed (${c.code}) with a request in flight: uncertain`));
      this.pending.clear();
    });
  }

  /** Open, answer Hello with Identify, wait for Identified. Resolves the session or rejects with
   *  the setup state the Bridge would report. */
  static open({ port, password, log = () => {} }) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, 'obswebsocket.json');
      let session = null;
      let identified = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(Object.assign(new Error('no Hello within 3 s'), { state: 'not-obs' }));
      }, REQUEST_TIMEOUT_MS);
      ws.addEventListener('error', () => {});
      ws.addEventListener('close', (c) => {
        clearTimeout(timer);
        if (!identified) reject(Object.assign(new Error(`closed during the handshake: ${c.code} ${c.reason}`), { state: CLOSE[c.code] || (session ? 'unreachable' : 'not-obs'), code: c.code }));
      });
      ws.addEventListener('message', function first(m) {
        const msg = JSON.parse(m.data);
        if (msg.op === 0) {
          const d = msg.d;
          log(`<- Hello ${json({ obsStudioVersion: d.obsStudioVersion, obsWebSocketVersion: d.obsWebSocketVersion, rpcVersion: d.rpcVersion, authentication: d.authentication ? '{challenge, salt}' : undefined })}`);
          const identify = { rpcVersion: 1, eventSubscriptions: SUBSCRIPTIONS };
          if (d.authentication) identify.authentication = authString(password, d.authentication);
          log(`-> Identify ${json({ ...identify, authentication: identify.authentication ? '<derived, not shown>' : undefined })}`);
          ws.send(json({ op: 1, d: identify }));
          session = { hello: d };
        } else if (msg.op === 2) {
          identified = true;
          clearTimeout(timer);
          ws.removeEventListener('message', first);
          log(`<- Identified ${json(msg.d)}`);
          resolve(new ObsSession(ws, session.hello, log));
        }
      });
    });
  }

  onMessage(msg) {
    if (msg.op === 7) {
      const p = this.pending.get(msg.d.requestId);
      if (!p) return;
      this.pending.delete(msg.d.requestId);
      clearTimeout(p.timer);
      const st = msg.d.requestStatus;
      this.log(`<- ${msg.d.requestType} ${st.code}${st.comment ? ` "${st.comment}"` : ''}${msg.d.responseData ? ` ${json(trimReply(msg.d.requestType, msg.d.responseData))}` : ''}`);
      p.resolve({ ok: st.result, code: st.code, comment: st.comment, data: msg.d.responseData || {} });
    } else if (msg.op === 5) {
      this.events.push(msg.d);
      this.log(`<- event ${msg.d.eventType} ${json(msg.d.eventData || {})}`);
    }
  }

  request(requestType, requestData) {
    if (this.closed) return Promise.reject(new Error(`connection closed (${this.closed.code})`));
    const requestId = String(this.next++);
    this.log(`-> ${requestType}${requestData ? ` ${json(requestData)}` : ''}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${requestType}: no answer in ${REQUEST_TIMEOUT_MS} ms: uncertain`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(json({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  close() {
    this.ws.close(1000);
  }
}

/** Keep the log readable: a long list is summarised, a screenshot never printed. */
function trimReply(type, data) {
  if (type === 'GetVersion') return { obsVersion: data.obsVersion, obsWebSocketVersion: data.obsWebSocketVersion, rpcVersion: data.rpcVersion, platform: data.platform, availableRequests: `${data.availableRequests?.length} names` };
  return data;
}

// ── 3. The adapter's verbs, as the spec maps them ───────────────────────────────────────────
// Each takes a session (real, or the stand-in below) and returns what the Bridge would answer.
// `read` reads a page for its marker: readPage below for OBS, a fixture for the stand-in.

async function must(s, type, data) {
  const r = await s.request(type, data);
  if (!r.ok) throw Object.assign(new Error(`${type} refused: ${r.code}${r.comment ? ` ${r.comment}` : ''}`), { obsCode: r.code });
  return r.data;
}

async function status(s) {
  const v = await must(s, 'GetVersion');
  const video = await must(s, 'GetVideoSettings');
  const scenes = await must(s, 'GetSceneList');
  return {
    version: `OBS ${v.obsVersion}, obs-websocket ${v.obsWebSocketVersion}`,
    canvas: { width: video.baseWidth, height: video.baseHeight },
    programScene: scenes.currentProgramSceneName,
    previewScene: scenes.currentPreviewSceneName,
    scenes: scenes.scenes.map((x) => x.sceneName),
  };
}

/** Every slot verb starts here: a scene that is not there is not-found, and nothing more is sent. */
async function sceneThere(s, scene) {
  const list = await must(s, 'GetSceneList');
  return list.scenes.some((x) => x.sceneName === scene);
}

/** The scene item that shows `source` in `scene`, or null. */
async function itemOf(s, scene, source) {
  const r = await s.request('GetSceneItemId', { sceneName: scene, sourceName: source });
  if (r.ok) return r.data.sceneItemId;
  if (r.code === 600) return null;
  throw new Error(`GetSceneItemId refused: ${r.code}`);
}

async function showItem(s, scene, id, enabled) {
  await must(s, 'SetSceneItemEnabled', { sceneName: scene, sceneItemId: id, sceneItemEnabled: enabled });
}

/** Put on air: the page at `url` as a browser source named `source` in `scene`, shown, at the
 *  canvas size. Creates what is missing, changes the URL only when it differs, and never reloads a
 *  page already showing that URL. Never changes which scene is on program. */
async function takeUrl(s, { scene, source, url }) {
  if (!(await sceneThere(s, scene))) return { notFound: `OBS has no scene "${scene}"` };
  const { baseWidth: width, baseHeight: height } = await must(s, 'GetVideoSettings');
  const existing = await s.request('GetInputSettings', { inputName: source });
  if (existing.code === 602) return { refused: `"${source}" is the name of a scene in OBS, not of a source` };
  if (existing.ok && existing.data.inputKind !== 'browser_source') {
    return { refused: `OBS already has a source named "${source}" that is a ${existing.data.inputKind}, not a browser source` };
  }
  if (!existing.ok) {
    if (existing.code !== 600) throw new Error(`GetInputSettings refused: ${existing.code}`);
    await must(s, 'CreateInput', {
      sceneName: scene,
      inputName: source,
      inputKind: 'browser_source',
      inputSettings: { url, width, height, shutdown: false, restart_when_active: false },
      sceneItemEnabled: true,
    });
    return { created: true };
  }
  const changed = existing.data.inputSettings.url !== url || existing.data.inputSettings.is_local_file === true;
  if (changed) await must(s, 'SetInputSettings', { inputName: source, inputSettings: { is_local_file: false, url, width, height } });
  const id = await itemOf(s, scene, source);
  if (id === null) await must(s, 'CreateSceneItem', { sceneName: scene, sourceName: source, sceneItemEnabled: true });
  else await showItem(s, scene, id, true);
  return { created: false, urlChanged: changed, addedToScene: id === null };
}

const MARKER = /<meta\s+name=["']noacg-graphic["']\s+content=(?:"([^"]*)"|'([^']*)')/i;
const ENTITY = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };
const PAGE_HEAD_BYTES = 64 * 1024;

/** The graphic a page names, from the head only: a self-contained export inlines its scripts and
 *  fonts after the meta. */
function markerOf(html) {
  if (!html) return null;
  const end = html.search(/<\/head>/i);
  const m = MARKER.exec(end >= 0 ? html.slice(0, end) : html.slice(0, PAGE_HEAD_BYTES));
  return m ? (m[1] ?? m[2]).replace(/&(amp|quot|#39|lt|gt);/g, (e) => ENTITY[e]) : null;
}

/** The page a source shows, and the graphic it names if it is a NoaCG graphic. The marker is
 *  cached per page address for the session. */
const markers = new Map();
async function pageOf(s, source, read) {
  const r = await s.request('GetInputSettings', { inputName: source });
  if (!r.ok || r.data.inputKind !== 'browser_source') return null;
  const st = r.data.inputSettings;
  const page = st.is_local_file ? st.local_file : st.url;
  if (!markers.has(page)) markers.set(page, page ? markerOf(await read(page, !!st.is_local_file)) : null);
  return { page, graphic: markers.get(page) };
}

/** One obs-browser emit_event carrying NoaCG's envelope. Every browser source hears it. */
async function emit(s, graphic, msgs) {
  await must(s, 'CallVendorRequest', {
    vendorName: 'obs-browser',
    requestType: 'emit_event',
    requestData: { event_name: EVENT_NAME, event_data: { v: 1, graphic, msgs } },
  });
}

/** Take a template: the data and the play in ONE event, then show the item if it was hidden.
 *  Emitting first means a page coming on program is already under the operator's command. */
async function takeTemplate(s, { scene, source, graphic, data }) {
  if (!(await sceneThere(s, scene))) return { notFound: `OBS has no scene "${scene}"` };
  const id = await itemOf(s, scene, source);
  if (id === null) return { notFound: `no source "${source}" in scene "${scene}"` };
  const shown = (await must(s, 'GetSceneItemEnabled', { sceneName: scene, sceneItemId: id })).sceneItemEnabled;
  await emit(s, graphic, [{ t: 'update', data }, { t: 'play' }]);
  if (!shown) await showItem(s, scene, id, true);
  return { shownBefore: shown };
}

/** update, next, out and clear, with or without an item: the source's own page says whether the
 *  slot holds a NoaCG graphic (emit) or a page such as the production output (show and hide). */
async function slotVerb(s, verb, { scene, source, data }, read) {
  if (!(await sceneThere(s, scene))) return { notFound: `OBS has no scene "${scene}"` };
  const p = await pageOf(s, source, read);
  if (!p) return { notFound: `no browser source "${source}"` };
  const hide = async () => {
    const id = await itemOf(s, scene, source);
    if (id === null) return { alreadyOff: true };
    await showItem(s, scene, id, false);
    return { hidden: true };
  };
  if (!p.graphic) {
    if (verb === 'out' || verb === 'clear') return { slot: 'url', ...(await hide()) };
    return { refused: `${verb} needs a NoaCG graphic; "${source}" shows a page` };
  }
  const msgs = { update: [{ t: 'update', data }], next: [{ t: 'next' }], out: [{ t: 'stop' }], clear: [{ t: 'stop' }] }[verb];
  await emit(s, p.graphic, msgs);
  return verb === 'clear' ? { slot: 'template', ...(await hide()) } : { slot: 'template', emitted: p.graphic };
}

/** /state for one scene: whether it is on program or preview, and each browser source in it with
 *  the page it shows. */
async function stateOf(s, scene) {
  const scenes = await must(s, 'GetSceneList');
  const items = await must(s, 'GetSceneItemList', { sceneName: scene });
  const slots = [];
  for (const i of items.sceneItems.filter((x) => x.inputKind === 'browser_source')) {
    const st = (await must(s, 'GetInputSettings', { inputName: i.sourceName })).inputSettings;
    slots.push({ source: i.sourceName, shown: i.sceneItemEnabled, producer: i.sceneItemEnabled ? 'html' : 'empty', page: st.is_local_file ? st.local_file : st.url });
  }
  return {
    scene,
    onProgram: scenes.currentProgramSceneName === scene,
    onPreview: scenes.currentPreviewSceneName === scene,
    slots,
  };
}

/** /list template: every browser source whose page names a NoaCG graphic. */
async function listTemplates(s, read) {
  const inputs = (await must(s, 'GetInputList', { inputKind: 'browser_source' })).inputs;
  const found = [];
  for (const input of inputs) {
    const p = await pageOf(s, input.inputName, read);
    if (p?.graphic) found.push({ name: p.graphic, label: input.inputName, kind: 'graphic' });
  }
  return found;
}

/** A page's head: a local file OBS names, or an address on this machine; 64 KB and 1 s at most. */
async function readPage(where, isLocal) {
  try {
    if (isLocal) {
      const fd = openSync(where, 'r');
      const buf = Buffer.alloc(PAGE_HEAD_BYTES);
      const n = readSync(fd, buf, 0, PAGE_HEAD_BYTES, 0);
      closeSync(fd);
      return buf.subarray(0, n).toString('utf8');
    }
    const u = new URL(where);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return null;
    const r = await fetch(u, { signal: AbortSignal.timeout(1000) });
    return r.ok ? (await r.text()).slice(0, PAGE_HEAD_BYTES) : null;
  } catch {
    return null;
  }
}

// ── 4. probe ────────────────────────────────────────────────────────────────────────────────

async function probe() {
  const settings = readObsWebSocketSettings();
  say(`OBS config dirs looked at: ${json(obsConfigDirs().map(shown))}`);
  if (!settings) {
    say('settings: none found');
    say('Bridge would say (not-found): No OBS settings were found for this user on this computer.');
    return;
  }
  if (settings.unreadable) {
    say(`settings: ${shown(settings.file)} could not be read as JSON`);
    say('Bridge would say (not-found): the OBS settings could not be read.');
    return;
  }
  say(`settings: ${json(redacted(settings))}`);
  const port = await tcpProbe(settings.port);
  say(`tcp 127.0.0.1:${settings.port}: ${port}`);
  if (port !== 'listening') {
    if (!settings.enabled) say("Bridge would say (server-off): OBS's WebSocket server is off. In OBS, open Tools > WebSocket Server Settings, tick Enable WebSocket server, press OK, then Try again.");
    else say(`Bridge would say (not-running): OBS is not answering on port ${settings.port}. Start OBS, then Try again.`);
    say('handshake: not attempted, nothing is listening');
    return;
  }
  const t0 = Date.now();
  let s;
  try {
    s = await ObsSession.open({ port: settings.port, password: settings.password, log: (l) => say(`  ${l}`) });
  } catch (e) {
    say(`handshake: failed, state ${e.state} (${e.message})`);
    return;
  }
  say(`handshake: identified in ${Date.now() - t0} ms`);
  say(`status: ${json(await status(s))}`);
  s.close();
}

// ── 5. plan: the verbs against an in-memory stand-in ─────────────────────────────────────────

/** Answers the requests the verbs use, with a minimal model of scenes, inputs and items, so the
 *  plan shows each verb's real request order including its branches. It is not OBS. */
function standIn(log) {
  const inputs = new Map([['Webcam', { kind: 'dshow_input', settings: {} }]]);
  const scenes = new Map([['Scene', []]]);
  let nextId = 1;
  const ok = (data = {}) => ({ ok: true, code: 100, data });
  const nf = () => ({ ok: false, code: 600, data: {} });
  const item = (sceneName, sceneItemId) => scenes.get(sceneName).find((i) => i.sceneItemId === sceneItemId);
  const handlers = {
    GetVersion: () => ok({ obsVersion: '32.2.1', obsWebSocketVersion: '5.7.4', rpcVersion: 1 }),
    GetVideoSettings: () => ok({ baseWidth: 1920, baseHeight: 1080 }),
    GetSceneList: () => ok({ currentProgramSceneName: 'Scene', currentPreviewSceneName: null, scenes: [...scenes.keys()].map((sceneName) => ({ sceneName })) }),
    GetInputSettings: ({ inputName }) => {
      if (scenes.has(inputName)) return { ok: false, code: 602, data: {} };
      return inputs.has(inputName) ? ok({ inputKind: inputs.get(inputName).kind, inputSettings: inputs.get(inputName).settings }) : nf();
    },
    CreateInput: ({ sceneName, inputName, inputKind, inputSettings, sceneItemEnabled }) => {
      inputs.set(inputName, { kind: inputKind, settings: { ...inputSettings } });
      const sceneItemId = nextId++;
      scenes.get(sceneName).push({ sceneItemId, sourceName: inputName, inputKind, sceneItemEnabled });
      return ok({ inputUuid: '…', sceneItemId });
    },
    SetInputSettings: ({ inputName, inputSettings }) => (Object.assign(inputs.get(inputName).settings, inputSettings), ok()),
    GetSceneItemId: ({ sceneName, sourceName }) => {
      const it = scenes.get(sceneName)?.find((i) => i.sourceName === sourceName);
      return it ? ok({ sceneItemId: it.sceneItemId }) : nf();
    },
    CreateSceneItem: ({ sceneName, sourceName, sceneItemEnabled }) => {
      const sceneItemId = nextId++;
      scenes.get(sceneName).push({ sceneItemId, sourceName, inputKind: inputs.get(sourceName).kind, sceneItemEnabled });
      return ok({ sceneItemId });
    },
    GetSceneItemEnabled: ({ sceneName, sceneItemId }) => ok({ sceneItemEnabled: item(sceneName, sceneItemId).sceneItemEnabled }),
    SetSceneItemEnabled: ({ sceneName, sceneItemId, sceneItemEnabled }) => ((item(sceneName, sceneItemId).sceneItemEnabled = sceneItemEnabled), ok()),
    GetSceneItemList: ({ sceneName }) => ok({ sceneItems: scenes.get(sceneName) }),
    GetInputList: ({ inputKind }) => ok({ inputs: [...inputs].filter(([, v]) => v.kind === inputKind).map(([inputName]) => ({ inputName })) }),
    CallVendorRequest: () => ok({ vendorName: 'obs-browser', requestType: 'emit_event', responseData: {} }),
  };
  return {
    request(type, data) {
      log(`-> ${type}${data ? ` ${json(data)}` : ''}`);
      const r = handlers[type](data || {});
      log(`<- ${r.code}`);
      return Promise.resolve(r);
    },
  };
}

async function plan() {
  const s = standIn((l) => say(`  ${l}`));
  const out = { scene: 'Scene', source: 'NoaCG my-show' };
  const url = 'https://noacg.studio/output?production=my-show';
  const file = 'C:/shows/house_strap/house_strap.html';
  const read = async (where) => (where === file ? '<head><meta name="noacg-graphic" content="House Strap"></head>' : '<head></head>');
  const tpl = { scene: 'Scene', source: 'House Strap' };
  const step = async (title, fn) => {
    say(`\n${title}`);
    say(`  = ${json(await fn())}`);
  };
  await step('status (connect, then read)', () => status(s));
  await step('take url, first time (Put on air creates the source)', () => takeUrl(s, { ...out, url }));
  await step('out url (Take off, a bare out: the page carries no marker, so it hides)', () => slotVerb(s, 'out', out, read));
  await step('take url, again (shown again, the page is not reloaded)', () => takeUrl(s, { ...out, url }));
  await step('take url, another production (the URL changes)', () => takeUrl(s, { ...out, url: `${url}-2` }));
  await step('take url, a name held by another kind of source (refused, nothing sent after the read)', () => takeUrl(s, { scene: 'Scene', source: 'Webcam', url }));
  await step('take url, a name held by a scene (refused)', () => takeUrl(s, { scene: 'Scene', source: 'Scene', url }));
  await step('take url, a scene that is not there (not-found, nothing else sent)', () => takeUrl(s, { scene: 'Gone', source: 'NoaCG my-show', url }));
  say('\n(the operator adds an exported overlay as a hidden local-file source)');
  await s.request('CreateInput', { sceneName: 'Scene', inputName: 'House Strap', inputKind: 'browser_source', inputSettings: { is_local_file: true, local_file: file }, sceneItemEnabled: false });
  await step('list template (the marker is read once per page and cached)', () => listTemplates(s, read));
  await step('take template (hidden source: emit first, then show)', () => takeTemplate(s, { ...tpl, graphic: 'House Strap', data: { f0: 'Anna', f1: 'Host' } }));
  await step('update (no item: the marker says template)', () => slotVerb(s, 'update', { ...tpl, data: { f0: 'Ben' } }, read));
  await step('next', () => slotVerb(s, 'next', tpl, read));
  await step('out (a bare out on a template slot emits stop, it does not hide)', () => slotVerb(s, 'out', tpl, read));
  await step('clear (stop, then hide)', () => slotVerb(s, 'clear', tpl, read));
  await step('state', () => stateOf(s, 'Scene'));
  say('\npause, resume, media, sequence, thumbnail: refused by the adapter before anything is sent.');
}

// ── 6. live: every verb against the real OBS, in a scene of its own ─────────────────────────

function probeServer() {
  const reports = [];
  const page = (graphic, marked) => `<!doctype html><html><head><meta charset="utf-8">${marked ? `
<meta name="noacg-graphic" content="${graphic}">` : ''}
<style>html,body{margin:0;background:transparent}</style></head><body><script>
var GRAPHIC = ${json(graphic)};
function report(o) { o.page = GRAPHIC; o.at = Date.now(); fetch('/report', { method: 'POST', body: JSON.stringify(o) }); }
report({ t: 'load', href: location.href, visibility: document.visibilityState, obs: !!window.obsstudio });
window.addEventListener(${json(EVENT_NAME)}, function (e) { var d = e.detail || {}; report({ t: 'noacg', mine: d.graphic === GRAPHIC, detail: d }); });
window.addEventListener('obsSourceActiveChanged', function (e) { report({ t: 'active', active: e.detail.active }); });
window.addEventListener('obsSourceVisibleChanged', function (e) { report({ t: 'visible', visible: e.detail.visible }); });
</script></body></html>`;
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && u.pathname === '/report') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          reports.push(JSON.parse(body));
        } catch {}
        res.end('ok');
      });
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    // Only /graphic carries the marker: the production output is not a graphic of its own.
    res.end(page(u.searchParams.get('graphic') || 'output', u.pathname === '/graphic'));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, reports, base: `http://127.0.0.1:${server.address().port}` })));
}

async function waitFor(reports, pred, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = reports.find((r, i) => pred(r, i));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function live() {
  const settings = readObsWebSocketSettings();
  if (!settings || settings.unreadable) return say('live: no readable obs-websocket settings; run the probe first');
  say(`settings: ${json(redacted(settings))}`);
  if ((await tcpProbe(settings.port)) !== 'listening') return say(`live: nothing listens on 127.0.0.1:${settings.port}; obs-websocket is off or OBS is closed. Nothing was run.`);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const SCENE = `NoaCG Bridge proof ${stamp}`;
  const OUT = `NoaCG proof output ${stamp}`;
  const TPL = `NoaCG proof graphic ${stamp}`;
  const SCENE2 = `NoaCG Bridge proof 2 ${stamp}`;
  const COLOR = `NoaCG proof colour ${stamp}`;
  const LOCALNAME = `NoaCG proof local ${stamp}`;
  const LOCAL = join(tmpdir(), `noacg-proof-${stamp}.html`);
  const created = [];
  const results = [];
  const check = (name, pass, detail) => {
    results.push({ name, pass, detail });
    say(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  };
  const { server, reports, base } = await probeServer();
  let s = null;
  let before = null;
  try {
    s = await ObsSession.open({ port: settings.port, password: settings.password, log: (l) => say(`  ${l}`) });
    say('\n== status');
    const st = await status(s);
    say(`  = ${json(st)}`);
    before = { program: st.programScene, preview: st.previewScene };
    // Every name this run creates must be new, so cleanup can only ever remove its own.
    for (const name of [SCENE, OUT, TPL, SCENE2, COLOR, LOCALNAME]) {
      if ((await s.request('GetInputSettings', { inputName: name })).code !== 600 || st.scenes.includes(name)) throw new Error(`"${name}" already exists in OBS; nothing was changed`);
    }
    await must(s, 'CreateScene', { sceneName: SCENE });
    created.push(['scene', SCENE]);

    say('\n== take url (Put on air), first time');
    const outUrl = `${base}/output?graphic=output`;
    const t1 = await takeUrl(s, { scene: SCENE, source: OUT, url: outUrl });
    if (t1.created) created.push(['input', OUT]);
    check('take url creates the browser source at the canvas size', t1.created === true, json(t1));
    const loaded = await waitFor(reports, (r) => r.t === 'load' && r.page === 'output');
    check('the page loaded in OBS', !!loaded, loaded && json(loaded));

    say('\n== out url (Take off, a bare out)');
    const o1 = await slotVerb(s, 'out', { scene: SCENE, source: OUT }, readPage);
    let state = await stateOf(s, SCENE);
    check('a bare out on the output hides it', o1.slot === 'url' && state.slots.find((x) => x.source === OUT)?.shown === false, json(state));
    const loadsBefore = reports.filter((r) => r.t === 'load' && r.page === 'output').length;

    say('\n== take url again, same URL');
    const t2 = await takeUrl(s, { scene: SCENE, source: OUT, url: outUrl });
    state = await stateOf(s, SCENE);
    check('take shows it again', state.slots.find((x) => x.source === OUT)?.shown === true && t2.urlChanged === false, json(t2));
    await new Promise((r) => setTimeout(r, 800));
    check('the same URL is not reloaded', reports.filter((r) => r.t === 'load' && r.page === 'output').length === loadsBefore);

    say('\n== take url, a new URL');
    const t3 = await takeUrl(s, { scene: SCENE, source: OUT, url: `${outUrl}&v=2` });
    const reloaded = await waitFor(reports, (r) => r.t === 'load' && r.page === 'output' && /v=2/.test(r.href));
    check('a new URL loads the new page', t3.urlChanged === true && !!reloaded, reloaded && reloaded.href);

    say('\n== a graphic source, hidden, and list template');
    await must(s, 'CreateInput', {
      sceneName: SCENE,
      inputName: TPL,
      inputKind: 'browser_source',
      inputSettings: { url: `${base}/graphic?graphic=${encodeURIComponent(TPL)}`, width: st.canvas.width, height: st.canvas.height },
      sceneItemEnabled: false,
    });
    created.push(['input', TPL]);
    await waitFor(reports, (r) => r.t === 'load' && r.page === TPL);
    const listed = await listTemplates(s, readPage);
    check('list template finds the NoaCG page by its marker, and not the output', listed.some((x) => x.name === TPL && x.label === TPL) && !listed.some((x) => x.label === OUT), json(listed.filter((x) => x.label === TPL || x.label === OUT)));

    const heard = (graphic, t, from) => (r, i) => i >= from && r.t === 'noacg' && r.page === graphic && r.detail.msgs?.some((m) => m.t === t);
    say('\n== take template (hidden: emit, then show)');
    const n0 = reports.length;
    const tt = await takeTemplate(s, { scene: SCENE, source: TPL, graphic: TPL, data: { f0: 'Anna', f1: 'Host' } });
    const got = await waitFor(reports, heard(TPL, 'play', n0));
    check('the page got update then play in one event', !!got && got.mine && json(got.detail.msgs.map((m) => m.t)) === '["update","play"]', got && json(got.detail));
    check('the hidden item was shown after the emit', tt.shownBefore === false && (await stateOf(s, SCENE)).slots.find((x) => x.source === TPL)?.shown === true);
    const other = await waitFor(reports, heard('output', 'play', n0));
    check('the output page heard it too and knows it is not its graphic', !!other && other.mine === false);

    for (const [verb, t, data] of [['update', 'update', { f0: 'Ben' }], ['next', 'next'], ['out', 'stop']]) {
      say(`\n== ${verb} on the graphic's slot, no item`);
      const n = reports.length;
      const r0 = await slotVerb(s, verb, { scene: SCENE, source: TPL, data }, readPage);
      const r = await waitFor(reports, heard(TPL, t, n));
      check(`${verb} is emitted and reaches the page`, r0.slot === 'template' && !!r && r.mine, r && json(r.detail));
    }
    check('out on a graphic does not hide it', (await stateOf(s, SCENE)).slots.find((x) => x.source === TPL)?.shown === true);

    say('\n== clear on the graphic (stop, then hide)');
    await slotVerb(s, 'clear', { scene: SCENE, source: TPL }, readPage);
    check('clear hides the item', (await stateOf(s, SCENE)).slots.find((x) => x.source === TPL)?.shown === false);

    say('\n== state');
    say(`  = ${json(await stateOf(s, SCENE))}`);

    say('\n== take url, the source exists but is not in this scene (CreateSceneItem)');
    await must(s, 'CreateScene', { sceneName: SCENE2 });
    created.push(['scene', SCENE2]);
    const t4 = await takeUrl(s, { scene: SCENE2, source: OUT, url: `${outUrl}&v=2` });
    check('take url adds the existing source to the other scene, shown', t4.addedToScene === true && (await stateOf(s, SCENE2)).slots.find((x) => x.source === OUT)?.shown === true, json(t4));

    say('\n== take url, refused and not-found cases');
    await must(s, 'CreateInput', { sceneName: SCENE, inputName: COLOR, inputKind: 'color_source_v3', inputSettings: {}, sceneItemEnabled: false });
    created.push(['input', COLOR]);
    const r1 = await takeUrl(s, { scene: SCENE, source: COLOR, url: outUrl });
    const colorKind = (await must(s, 'GetInputSettings', { inputName: COLOR })).inputKind;
    check('a name held by another kind of source is refused, the source unchanged', !!r1.refused && colorKind === 'color_source_v3', json(r1));
    const r2 = await takeUrl(s, { scene: SCENE, source: SCENE2, url: outUrl });
    check('a name held by a scene is refused (602)', !!r2.refused, json(r2));
    const r3 = await takeUrl(s, { scene: `${SCENE} missing`, source: OUT, url: outUrl });
    check('a missing scene is not-found', !!r3.notFound, json(r3));

    say('\n== a local-file graphic: the marker read from the file, then take url over it');
    writeFileSync(LOCAL, `<!doctype html><html><head><meta charset="utf-8"><meta name="noacg-graphic" content="${LOCALNAME}"></head><body></body></html>`);
    await must(s, 'CreateInput', { sceneName: SCENE, inputName: LOCALNAME, inputKind: 'browser_source', inputSettings: { is_local_file: true, local_file: LOCAL, width: st.canvas.width, height: st.canvas.height }, sceneItemEnabled: false });
    created.push(['input', LOCALNAME]);
    const listed2 = await listTemplates(s, readPage);
    check('list template reads the marker from a local file', listed2.some((x) => x.name === LOCALNAME && x.label === LOCALNAME), json(listed2.filter((x) => x.label === LOCALNAME)));
    const t5 = await takeUrl(s, { scene: SCENE, source: LOCALNAME, url: `${base}/output?graphic=output&v=3` });
    const after5 = (await must(s, 'GetInputSettings', { inputName: LOCALNAME })).inputSettings;
    check('take url over a local-file source switches it to the URL', t5.urlChanged === true && after5.is_local_file === false && /v=3/.test(after5.url), json({ t5, is_local_file: after5.is_local_file, url: after5.url }));
  } catch (e) {
    check('run', false, e.state ? `handshake failed, state ${e.state} (${e.message})` : e.message);
  } finally {
    if (s) {
      say('\n== cleanup');
      for (const [kind, name] of created.reverse()) {
        if (kind === 'input') await s.request('RemoveInput', { inputName: name }).catch(() => {});
        else await s.request('RemoveScene', { sceneName: name }).catch(() => {});
      }
      // OBS can still hold the local file for a moment after RemoveInput, so try for up to 2 s.
      for (let i = 0; i < 40 && existsSync(LOCAL); i++) {
        try {
          unlinkSync(LOCAL);
        } catch {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      // Measured on OBS 32.2.1: RemoveScene answers 100 and SceneRemoved arrives, yet a
      // GetSceneList sent at once still lists the scene for a moment. So poll, and say how long.
      const removedAt = Date.now();
      let after = null;
      let lagged = 0;
      for (;;) {
        after = await must(s, 'GetSceneList').catch(() => null);
        if (!after || !after.scenes.some((x) => x.sceneName === SCENE || x.sceneName === SCENE2) || Date.now() - removedAt > 3000) break;
        lagged++;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (after && before) {
        check('the proof scenes are gone', !after.scenes.some((x) => x.sceneName === SCENE || x.sceneName === SCENE2), `GetSceneList still listed them ${lagged} time(s), for ${Date.now() - removedAt} ms`);
        check('program and preview are what they were', after.currentProgramSceneName === before.program && after.currentPreviewSceneName === before.preview, json({ before, after: { program: after.currentProgramSceneName, preview: after.currentPreviewSceneName } }));
      }
      say(`events seen: ${json([...new Set(s.events.map((e) => e.eventType))])}`);
      s.close();
    }
    server.close();
    say(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
  }
}

say(`obs-bridge-proof, mode ${MODE}, node ${process.version}, ${new Date().toISOString()}`);
await { probe, plan, live }[MODE]();
