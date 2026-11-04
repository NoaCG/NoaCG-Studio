// covers: none - a timing instrument behind NOACG_INSTRUMENT=1, so every test skips in the suite (expected-run.json allowedSkips); hosted-latency.yml's `spec` dispatch runs it
//
// CONFIGURED: only a real backend relays a press, logs a command and fans it out.

import { test, expect } from '@playwright/test';
import { haveCreds, readyOf, SUPABASE_URL } from './_helpers';
import { answerPanel, ANON_KEY, pairPanel, publishTwoCues, shutStatusPanel } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');
test.skip(!process.env.NOACG_INSTRUMENT, 'NOACG_INSTRUMENT=1 runs this timing instrument (hosted-latency.yml `spec` sets it)');

// ── HOW LONG A PRESS TAKES TO REACH AIR, HOP BY HOP (issue #2089) ───────────────────────────────
//
// The owner, 2026-11-04: from a Stream Deck press a few hundred ms pass before OBS's picture
// changes. This walks the same road a Companion press takes - the module's `panel_press`, the
// relay to the answering page, the page's own dispatcher and `control_send_many`, the log frame to
// the REAL /output page in its own browser context (what OBS and CasparCG load), the output handing
// it to the graphic's frame, the graphic's own play handler, and the first frame after it - and
// stamps every hop on this machine's one clock: `Date.now()` in Node, in both pages and inside the
// graphic's sandboxed frame. The WebSocket stamps come from a listener registered in the socket's
// constructor (as scripts/playout-lag-bench.mjs does), so a frame is stamped before supabase-js
// parses it.
//
// An INSTRUMENT, so it runs only when asked (NOACG_INSTRUMENT=1), as bridge-real-server.spec.ts
// does: it asserts one play per press and nothing about time, and the hosted suite has no minutes
// to spare for it. For the wire a studio sees, dispatch hosted-latency.yml with `spec` set to
// e2e/configured/press-latency.spec.ts; that sets the variable. Locally against a stack, set it yourself. The
// numbers are printed and attached (`press-latency.json`). `graphicPlay` ends when the graphic's
// play listeners return, so work a graphic starts later is not in it, and `graphicFrame` is the
// first frame of an entrance, not the finished picture. A failed first attempt prints its readings
// before the suite's one retry prints again: read the last block per graphic. With 8 presses a p90 is the slowest
// one, so it reports the median and the slowest.

/** In every document of a page: the top one stamps every Realtime frame and the command fetch and,
 *  on the renderer, every play it hands to a graphic; a graphic's own frame stamps the play
 *  message arriving, its handlers having run, and the first frame drawn after them. */
function stampWire() {
  const w = window as unknown as { __hops: { at: number; kind: string; text: string }[] };
  w.__hops = [];
  const put = (kind: string, text: string) => w.__hops.push({ at: Date.now(), kind, text: text.slice(0, 400) });
  if (window.top !== window) {
    // Registered before the graphic's own listener, so it runs first; the timeout runs after
    // every listener of this event has returned.
    window.addEventListener('message', (e) => {
      const d = e.data as { type?: string; cmd?: string } | null;
      if (d?.type !== 'spx-preview-cmd' || d.cmd !== 'play') return;
      put('gfxRx', 'play');
      setTimeout(() => {
        put('gfxPlayed', 'play');
        requestAnimationFrame(() => requestAnimationFrame(() => put('gfxPainted', 'play')));
      }, 0);
    });
    return;
  }
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      // Stamped as the frame arrives; read after. Realtime sends a broadcast as a BINARY frame
      // (its topic, event and JSON payload as UTF-8 bytes), a reply or heartbeat as text.
      this.addEventListener('message', (e) => {
        const at = Date.now();
        const keep = (text: string) => {
          if (/press|batch|"rows"/.test(text)) w.__hops.push({ at, kind: 'ws', text: text.slice(0, 2000) });
        };
        if (typeof e.data === 'string') keep(e.data);
        else if (e.data instanceof ArrayBuffer) keep(new TextDecoder().decode(e.data));
        else if (e.data instanceof Blob) void e.data.text().then(keep);
      });
    }
  } as typeof WebSocket;
  const fetchNative = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!/control_send/.test(url)) return fetchNative(input, init);
    put('send', url);
    const p = fetchNative(input, init);
    void p.then(() => put('sent', url), () => put('sent', url));
    return p;
  };
  const watch = () => {
    let plays = document.body.getAttribute('data-plays');
    new MutationObserver(() => {
      const now = document.body.getAttribute('data-plays');
      if (now === plays) return;
      plays = now;
      put('handed', String(now));
    }).observe(document.body, { attributes: true, attributeFilter: ['data-plays'] });
  };
  if (document.body) watch();
  else document.addEventListener('DOMContentLoaded', watch);
}

type Hop = { at: number; kind: string; text: string };
type Page = import('@playwright/test').Page;
/** Every stamp of a page since the last read, from all its documents. */
async function hopsOf(p: Page): Promise<Hop[]> {
  const all: Hop[] = [];
  for (const f of p.frames()) {
    const got = await f.evaluate(() => (window as unknown as { __hops?: Hop[] }).__hops?.splice(0) ?? []).catch(() => [] as Hop[]);
    all.push(...got);
  }
  return all.sort((a, b) => a.at - b.at);
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p50: s[Math.floor((s.length - 1) / 2)], max: s[s.length - 1], all: xs };
}

for (const graphic of ['Hairline', 'League Table', 'Arena Quiz']) {
  test(`a panel Take reaches the real output renderer, timed hop by hop: ${graphic}`, async ({ page, browser }) => {
    test.setTimeout(300_000);
    const ROUNDS = 8;
    const name = `Panel Latency ${graphic} ${Date.now()}`;
    await page.addInitScript(stampWire);
    await publishTwoCues(page, name, graphic === 'Hairline' ? undefined : graphic);
    const op = page;
    await shutStatusPanel(op);
    const outputSlug = await op.evaluate(async (n) => {
      const { loadShows } = await import('/src/model/shows.ts');
      return loadShows().find((x) => x.name === n)?.outputSlug ?? null;
    }, name);
    expect(outputSlug, 'publishing must mint an output slug').toBeTruthy();
    // The renderer in a context of its own, as OBS's and CasparCG's browsers are their own.
    const outCtx = await browser.newContext();
    try {
      const air = await outCtx.newPage();
      await air.addInitScript(stampWire);
      await air.goto(`/output?production=${encodeURIComponent(outputSlug!)}`);
      await expect.poll(async () => { const r = await readyOf(air); return r ? r.n === r.of : false; }, { timeout: 60_000 }).toBe(true);

      const deck = await pairPanel(op);
      await answerPanel(op);
      await op.getByTestId('panel-close').click();
      await deck.hello();
      const anna = (await deck.rows())[0].id;
      const playsOf = async () => Number(await air.evaluate(() => document.body.getAttribute('data-plays')));

      const hops: Record<string, number[]> = { relay: [], pageDispatch: [], sendRpc: [], logToRenderer: [], handToGraphic: [], graphicPlay: [], graphicFrame: [], pressToFrame: [], pressToResult: [], secondWait: [], secondToFrame: [], flipped: [] };
      for (let round = 0; round < ROUNDS; round++) {
        const before = await deck.state((s) => !(s.live as string[]).includes(anna), 'Anna off air');
        const plays = await playsOf();
        await hopsOf(op);
        await hopsOf(air);
        const pressAt = Date.now();
        const take = await deck.press('take-cue', anna, before.ver as number);
        expect(take.outcome).toBe('ran');
        // ONE play per press on the renderer, never two (single effect per press).
        await expect.poll(playsOf, { timeout: 15_000 }).toBe(plays + 1);
        await air.waitForTimeout(300);
        expect(await playsOf()).toBe(plays + 1);
        const o = await hopsOf(op);
        const a = await hopsOf(air);
        // Each stamp is the first of its kind AFTER the one before it, so nothing from an earlier
        // press in the window can pair with this one.
        const after = (list: Hop[], at: number | undefined, test: (h: Hop) => boolean) => (at === undefined ? undefined : list.find((h) => h.at >= at && test(h)));
        const heard = after(o, pressAt, (h) => h.kind === 'ws' && h.text.includes(take.id));
        const send = after(o, heard?.at, (h) => h.kind === 'send');
        const sent = after(o, send?.at, (h) => h.kind === 'sent');
        const frame = after(a, send?.at, (h) => h.kind === 'ws' && /batch/.test(h.text));
        const handed = after(a, frame?.at, (h) => h.kind === 'handed');
        const rx = after(a, frame?.at, (h) => h.kind === 'gfxRx');
        const played = after(a, rx?.at, (h) => h.kind === 'gfxPlayed');
        const painted = after(a, played?.at, (h) => h.kind === 'gfxPainted');
        if (heard && send && sent && frame && handed && rx && played && painted) {
          hops.relay.push(heard.at - pressAt);
          hops.pageDispatch.push(send.at - heard.at);
          hops.sendRpc.push(sent.at - send.at);
          hops.logToRenderer.push(frame.at - send.at);
          hops.handToGraphic.push(rx.at - frame.at);
          hops.graphicPlay.push(played.at - rx.at);
          hops.graphicFrame.push(painted.at - played.at);
          hops.pressToFrame.push(painted.at - pressAt);
          hops.pressToResult.push(take.ms);
        } else {
          console.log(`round ${round}: a stamp is missing`, JSON.stringify({ heard: !!heard, send: !!send, sent: !!sent, frame: !!frame, handed: !!handed, rx: !!rx, played: !!played, painted: !!painted }));
        }
        // Off again, and settled, before the next press.
        const up = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna on air');
        expect((await deck.press('take-cue', anna, up.ver as number)).outcome).toBe('ran');
        // The page sends one payload per graphic at a time (control/seqSend.ts createGraphicFifo),
        // and the log row can bring "off air" back before the Out's own call answers. A press made in
        // that gap waits for the answer by design (a pick pressed straight after a reveal on the same
        // graphic does); this times a press on its own.
        await deck.state((s) => !(s.live as string[]).includes(anna), 'Anna off air');
        await op.waitForTimeout(600);
      }

      // BACK TO BACK, the owner's case (a pick and then a reveal on one quiz board): a second press
      // on the SAME graphic 50 ms after the first. Ben replaces Anna on the one graphic, and Ben's
      // key means the same before and after Anna airs, so it is not stale. The page holds the
      // second send until the first one's call answers (createGraphicFifo, by design for order);
      // `secondWait` is that hold and `secondToFrame` what the operator sees for the second press.
      // Paired by the play count: the second press is the renderer's play number plays + 2.
      const ben = (await deck.rows())[1].id;
      for (let round = 0; round < 4; round++) {
        const before = await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
        const plays = await playsOf();
        await hopsOf(op);
        await hopsOf(air);
        const first = deck.press('take-cue', anna, before.ver as number);
        await op.waitForTimeout(50);
        const pressAt = Date.now();
        const second = await deck.press('take-cue', ben, before.ver as number);
        expect((await first).outcome).toBe('ran');
        expect(second.outcome).toBe('ran');
        await expect.poll(playsOf, { timeout: 15_000 }).toBe(plays + 2);
        await air.waitForTimeout(300);
        expect(await playsOf()).toBe(plays + 2);
        await op.waitForTimeout(50);
        const o = await hopsOf(op);
        const a = await hopsOf(air);
        const after = (list: Hop[], at: number | undefined, test: (h: Hop) => boolean) => (at === undefined ? undefined : list.find((h) => h.at >= at && test(h)));
        const firstId = (await first).id;
        const heardFirst = o.find((h) => h.kind === 'ws' && h.text.includes(firstId));
        const heard = after(o, pressAt, (h) => h.kind === 'ws' && h.text.includes(second.id));
        // The second press's own send is the second send of the round: the first press's may still
        // leave after the second press is heard.
        const send = o.filter((h) => h.kind === 'send')[1];
        // The two presses are two relay calls, so they can reach the page in the other order. Such a
        // round is counted, not timed: its "second" press is the first one the page ran.
        const handed = after(a, pressAt, (h) => h.kind === 'handed' && h.text === String(plays + 2));
        const rx = after(a, handed?.at, (h) => h.kind === 'gfxRx');
        const played = after(a, rx?.at, (h) => h.kind === 'gfxPlayed');
        const painted = after(a, played?.at, (h) => h.kind === 'gfxPainted');
        if (heardFirst && heard && heard.at < heardFirst.at) {
          hops.flipped.push(heardFirst.at - heard.at);
          console.log(`back to back ${round}: the page heard the second press ${heardFirst.at - heard.at} ms before the first`);
        } else if (heard && send && painted) {
          hops.secondWait.push(send.at - heard.at);
          hops.secondToFrame.push(painted.at - pressAt);
        } else {
          console.log(`back to back ${round}: a stamp is missing`, JSON.stringify({ heard: !!heard, send: !!send, handed: !!handed, rx: !!rx, played: !!played, painted: !!painted }));
        }
        // Off again with All out, drawn from what the page publishes now: after two presses in flight
        // a cue key drawn from a passing state is refused stale (the page's own check, kept).
        await op.waitForTimeout(500);
        expect((await deck.press('all-out', '', (await deck.state()).ver as number)).outcome).toBe('ran');
        await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
        await op.waitForTimeout(600);
      }
      const report = Object.fromEntries(Object.entries(hops).map(([k, v]) => [k, stats(v)]));
      console.log(`#2089 press latency, ${graphic}:`);
      for (const [k, s] of Object.entries(report)) console.log(`  ${k.padEnd(14)} n ${s.n}  median ${s.p50} ms  slowest ${s.max} ms`);
      await test.info().attach('press-latency.json', { body: JSON.stringify({ graphic, report }, null, 2), contentType: 'application/json' });
      // Most rounds must have every stamp, or the instrument measured nothing.
      expect(hops.pressToFrame.length).toBeGreaterThanOrEqual(ROUNDS - 2);
      expect(hops.secondToFrame.length + hops.flipped.length).toBeGreaterThanOrEqual(3);
      await deck.close();
    } finally {
      await outCtx.close();
    }
  });
}
