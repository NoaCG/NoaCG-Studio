// `noacg login` - obtain a scoped agent key for this machine, without ever holding the user's
// session (docs/AGENT_SAVE.md).
//
// The handoff: invent a PKCE verifier; listen on 127.0.0.1:<random port>; open
// `${NOACG_URL}/app?agent=<state>&port=<port>&name=<host>&challenge=sha256(verifier)` in the
// user's browser; the consent page (signed in) mints a ONE-TIME CODE and redirects to
// `http://127.0.0.1:<port>/callback#code=…&state=…`; the tiny page this listener serves reads
// the fragment and POSTs it back to the listener; the CLI redeems code + verifier against the
// deployment and stores the key it gets. The key never transits the browser; the code is
// single use, bound to the verifier, and dead in 120 s. `--key <noacg_ak_…>` is the paste
// fallback for a machine with no browser (a key minted elsewhere); `--no-browser` prints the
// URL instead of opening it.

import { execFile } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { noacgUrl } from '../config.js';
import { EXIT_FINDINGS, EXIT_OK, flagBool, flagNumber, flagString, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { ApiError, challengeFor, displayPrefix, explainFailure, isAgentKey, newState, newVerifier, redeemCode, storeKey } from '../auth.js';

/** How long the listener waits for the browser before giving up. */
const DEFAULT_WAIT_SEC = 300;

/** The page the loopback listener serves at /callback: it forwards the fragment to the listener
 *  (the server never sees a fragment in the request line) and tells the person what happened. */
const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>noacg login</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b0d11;color:#e8e6e1;display:grid;place-items:center;height:100vh;margin:0}main{max-width:420px;padding:24px;border:1px solid #2a2e36;border-radius:12px;background:#13161c}h1{font-size:18px;margin:0 0 8px}code{font-size:13px}</style>
<main><h1 id="h">Finishing noacg login…</h1><p id="p">Handing the code to the noacg command on this computer.</p></main>
<script>
(function(){
  var h=document.getElementById('h'),p=document.getElementById('p');
  var frag=location.hash.replace(/^#/,'');
  if(!frag){h.textContent='Nothing to finish';p.textContent='This page expects a code from NoaCG. Run noacg login again.';return;}
  fetch('/complete',{method:'POST',headers:{'content-type':'text/plain'},body:frag}).then(function(r){return r.text().then(function(t){return {ok:r.ok,text:t};});}).then(function(r){
    if(r.ok){h.textContent='Done - you can close this tab';p.textContent='noacg is logged in on this computer. The key is stored locally and can only save graphics to your library.';}
    else{h.textContent='That did not work';p.textContent=r.text||'Run noacg login again.';}
    history.replaceState(null,'',location.pathname);
  }).catch(function(){h.textContent='The noacg command is no longer waiting';p.textContent='Run noacg login again.';});
})();
</script>`;

function openInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => resolve(ok);
    try {
      if (process.platform === 'win32') {
        // `start` is a cmd builtin; the empty first argument is the window title it would
        // otherwise mistake the URL for.
        execFile('cmd', ['/c', 'start', '', url], { windowsHide: true }, (e) => done(!e));
      } else if (process.platform === 'darwin') {
        execFile('open', [url], (e) => done(!e));
      } else {
        execFile('xdg-open', [url], (e) => done(!e));
      }
    } catch {
      done(false);
    }
  });
}

interface Handoff {
  code: string;
}

/** Listen on a loopback port and resolve with the code the consent page hands over. */
function listenForCode(state: string, waitMs: number): Promise<{ port: number; handoff: Promise<Handoff> }> {
  return new Promise((resolvePort, rejectPort) => {
    let settle: ((h: Handoff) => void) | null = null;
    let fail: ((e: Error) => void) | null = null;
    const handoff = new Promise<Handoff>((res, rej) => {
      settle = res;
      fail = rej;
    });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/callback') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(CALLBACK_PAGE);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/complete') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 4096) req.destroy();
        });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const code = params.get('code') ?? '';
          const got = params.get('state') ?? '';
          if (!code || got !== state) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('This reply does not belong to the login that is waiting. Run noacg login again.');
            return;
          }
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('ok');
          settle?.({ code });
          setTimeout(() => server.close(), 200);
        });
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('noacg login listener');
    });
    server.on('error', (e) => rejectPort(e));
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const timer = setTimeout(() => {
        server.close();
        fail?.(new Error(`No reply from the browser within ${Math.round(waitMs / 1000)} s - run \`noacg login\` again.`));
      }, waitMs);
      handoff.finally(() => clearTimeout(timer)).catch(() => undefined);
      resolvePort({ port, handoff });
    });
  });
}

export async function runLogin(args: ParsedArgs, out: Out): Promise<number> {
  // Before the listener opens, because the fault this catches is silent and permanent: an
  // unquoted `--name My Laptop` gave the flag "My" and left "Laptop" in `_`, so the key went to
  // the deployment called "My" and sat in Settings -> Account -> Agent access under that name.
  // The name is the only thing distinguishing one machine's key from another's when the user
  // comes to revoke one, so dropping half of it is worse than it looks.
  refuseStrayArgs(args, 0, '--name "My Laptop"');
  const origin = noacgUrl();

  // The paste fallback: a key minted elsewhere (another machine, a CI secret) stored here.
  const pasted = flagString(args, 'key');
  if (pasted !== undefined) {
    if (!isAgentKey(pasted)) throw new UsageError('--key expects a NoaCG agent key (noacg_ak_…).');
    await storeKey(origin, { key: pasted, prefix: displayPrefix(pasted), name: 'pasted key', createdAt: new Date().toISOString() });
    out.result({ ok: true, url: origin, prefix: displayPrefix(pasted), source: 'paste' });
    out.say(`Stored ${displayPrefix(pasted)} for ${origin}.`);
    return EXIT_OK;
  }

  const verifier = newVerifier();
  const state = newState();
  const waitSec = flagNumber(args, 'wait') ?? DEFAULT_WAIT_SEC;
  const { port, handoff } = await listenForCode(state, waitSec * 1000);
  const name = flagString(args, 'name') ?? `${process.env.NOACG_AGENT_NAME?.trim() || 'noacg CLI'} on ${os.hostname()}`;
  const consent = new URL(`${origin}/app`);
  consent.searchParams.set('agent', state);
  consent.searchParams.set('port', String(port));
  consent.searchParams.set('name', name);
  consent.searchParams.set('challenge', challengeFor(verifier));

  out.log(`Open this page in your browser to allow "${name}" to save graphics to your NoaCG library:\n\n  ${consent.href}\n`);
  if (flagBool(args, 'browser', true)) {
    const opened = await openInBrowser(consent.href);
    out.log(opened ? 'Opened your browser. Waiting for you to allow access…' : 'Could not open a browser here - paste the URL into one. Waiting…');
  } else {
    out.log('Waiting for you to allow access…');
  }

  let code: string;
  try {
    ({ code } = await handoff);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    out.result({ ok: false, error: message });
    out.say(message);
    return EXIT_FINDINGS;
  }

  try {
    const stored = await redeemCode(origin, code, verifier);
    await storeKey(origin, stored);
    out.result({ ok: true, url: origin, id: stored.id, name: stored.name, prefix: stored.prefix, createdAt: stored.createdAt });
    out.say(`Logged in to ${origin} as "${stored.name}" (${stored.prefix}). The key can only save graphics to your library; revoke it any time in Settings → Account → Agent access, or with \`noacg logout\`.`);
    return EXIT_OK;
  } catch (e) {
    const message = e instanceof ApiError ? explainFailure(e.failure) : e instanceof Error ? e.message : String(e);
    out.result({ ok: false, error: message });
    out.say(`Login failed: ${message}`);
    return EXIT_FINDINGS;
  }
}
