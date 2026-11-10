// covers: src/templates/**
// covers: src/blocks/**, src/export/**
//
// The quiz runtime is also the exported control panel's recovery subject and the audience
// pack's answer boards.
// covers: src/templates/quiz/**

import { readFileSync } from 'node:fs';
import { test, expect, type Frame, type Page } from '@playwright/test';
import { toApp } from './_bench';
import { qrReader } from './_qr';

// THE AUDIENCE PACK — viewer questions, Q&A cards, chat highlights, question queues, community
// requests, live votes, and the two- and three-answer boards.
//
// What these check is the stuff a catalog sweep cannot: what happens when the AUDIENCE, rather
// than the production, decides the content. A viewer writes 400 characters, submits anonymously,
// gives no platform; a moderator pastes a bare list with no names; a poll has no votes yet, or a
// dead heat; an operator locks an answer and then replays. Every one of those is ordinary on
// air, and every one of them is a way for a graphic to render something untrue.

/** Build a variant, load it in an iframe, play it, and hand back the window + document. */
const HARNESS = `
  async function boot(id, opts) {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const variant = variantById(id);
    if (!variant) throw new Error('no variant ' + id);
    const tpl = variant.create(opts || {});
    const f = document.createElement('iframe');
    f.className = 'pack-frame';
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await waitFor(function () {
      return f.contentDocument && f.contentDocument.readyState === 'complete' &&
        typeof f.contentWindow.play === 'function' &&
        typeof f.contentWindow.noacgDispatch === 'function';
    }, id + ' runtime readiness');
    return { win: f.contentWindow, doc: f.contentDocument, tpl: tpl, frame: f };
  }
  /** Poll real observable state instead of guessing how quickly a loaded CI runner will react. */
  async function waitFor(check, label, timeout) {
    timeout = timeout || 3000;
    const started = performance.now();
    while (!check()) {
      if (performance.now() - started >= timeout) throw new Error('Timed out waiting for ' + label);
      await new Promise(requestAnimationFrame);
    }
  }
  /** Complete exactly the transition returned by the serial event queue. */
  function finish(timeline) {
    if (!timeline) return false;
    timeline.progress(1);
    return true;
  }
  /** Play and let every timeline settle, without waiting out real seconds. */
  function settle(win) {
    win.play();
    win.gsap.globalTimeline.getChildren(true, true, true).forEach(function (t) {
      try { t.progress(1); } catch (e) { void e; }
    });
  }
  function text(doc, sel) {
    const el = doc.querySelector(sel);
    return el ? el.textContent.trim() : null;
  }
  function shown(win, doc, sel) {
    const el = doc.querySelector(sel);
    if (!el) return false;
    const cs = win.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
`;

// ── Long messages ────────────────────────────────────────────────────────────

test('a very long message is clamped inside the frame, never spilled out of it', async ({ page }) => {
  test.setTimeout(120_000);
  await toApp(page);
  // Every message-shaped design, at the length a real viewer question reaches when somebody
  // decides to explain themselves.
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const LONG = 'I have been watching the programme since the very first series and I have always ' +
      'wondered how the running order actually gets decided on the day, especially when a big story ' +
      'breaks late in the afternoon and everything that was planned has to move, so could somebody ' +
      'on the team please walk us through what that afternoon actually looks like from the inside?';
    const ids = ['aq01','aq02','aq03','aq04','qa01','qa02','qa03','qa04','ch01','ch02','ch03','ch04','rq01','rq02','rq03','rq04'];
    const out = [];
    for (const id of ids) {
      const { win, doc, tpl, frame } = await boot(id);
      // The message field differs per form; write the long text into every text field, which is
      // the honest worst case anyway.
      const payload = {};
      for (const f of tpl.fields) if (f.ftype === 'textfield') payload[f.field] = LONG;
      win.update(JSON.stringify(payload));
      settle(win);
      await new Promise((r) => setTimeout(r, 60));
      const box = doc.querySelector('.audience-box').getBoundingClientRect();
      const msg = doc.querySelector('.audience-question');
      const msgBox = msg ? msg.getBoundingClientRect() : null;
      out.push({
        id,
        // The card must stay inside the 1920x1080 frame it was authored for.
        insideFrame: box.top >= -1 && box.left >= -1 && box.bottom <= 1081 && box.right <= 1921,
        // …and the message must be clamped rather than allowed to grow the card without limit.
        clamped: msg ? win.getComputedStyle(msg).webkitLineClamp !== 'none' : false,
        // The clamp must actually bite: the rendered height cannot exceed the lines it allows.
        withinClamp: msgBox && msg
          ? msgBox.height <= parseFloat(win.getComputedStyle(msg).lineHeight) *
              (parseInt(win.getComputedStyle(msg).webkitLineClamp, 10) || 99) + 2
          : false,
      });
      frame.remove();
    }
    return out;
  })()`);
  const bad = (report as Array<{ id: string; insideFrame: boolean; clamped: boolean; withinClamp: boolean }>).filter(
    (r) => !r.insideFrame || !r.clamped || !r.withinClamp,
  );
  expect(bad).toEqual([]);
});

// ── Missing attribution ──────────────────────────────────────────────────────

test('a question with no name reads as anonymous, and no separator is left dangling', async ({ page }) => {
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const out = [];
    // aq* put the name in f2 and the source in f3; ch* lead with f0/f1; rq* match aq*.
    const cases = [
      { id: 'aq01', asker: 'f2', source: 'f3' },
      { id: 'aq04', asker: 'f2', source: 'f3' },
      { id: 'ch01', asker: 'f0', source: 'f1' },
      { id: 'ch03', asker: 'f0', source: 'f1' },
      { id: 'rq01', asker: 'f2', source: 'f3' },
      { id: 'qa02', asker: 'f3', source: 'f4' },
    ];
    for (const c of cases) {
      const { win, doc, frame } = await boot(c.id);
      settle(win);

      // 1. Both present — the ordinary case.
      const both = {
        asker: shown(win, doc, '.audience-asker'),
        anon: shown(win, doc, '.audience-anon'),
        sep: shown(win, doc, '.audience-sep'),
      };

      // 2. No name at all (an anonymous submission).
      const noName = {}; noName[c.asker] = '';
      win.update(JSON.stringify(noName));
      await new Promise((r) => setTimeout(r, 30));
      const anon = {
        asker: shown(win, doc, '.audience-asker'),
        anon: shown(win, doc, '.audience-anon'),
        anonText: text(doc, '.audience-anon'),
      };

      // 3. No source either — the separator has to go with it.
      const noSource = {}; noSource[c.source] = '';
      win.update(JSON.stringify(noSource));
      await new Promise((r) => setTimeout(r, 30));
      const bare = { sep: shown(win, doc, '.audience-sep'), source: shown(win, doc, '.audience-source') };

      // 4. …and typing a name back restores it, so the fallback is not sticky.
      const back = {}; back[c.asker] = 'Priya N.';
      win.update(JSON.stringify(back));
      await new Promise((r) => setTimeout(r, 30));
      const restored = { asker: shown(win, doc, '.audience-asker'), anon: shown(win, doc, '.audience-anon') };

      out.push({ id: c.id, both, anon, bare, restored });
      frame.remove();
    }
    return out;
  })()`);

  for (const r of report as Array<Record<string, Record<string, unknown>> & { id: string }>) {
    expect(r.both, `${r.id}: with a name, the real name shows and the stand-in does not`).toMatchObject({
      asker: true,
      anon: false,
      sep: true,
    });
    expect(r.anon, `${r.id}: with no name, the stand-in takes over`).toMatchObject({ asker: false, anon: true });
    expect(String(r.anon.anonText), `${r.id}: the stand-in carries real text`).not.toEqual('');
    expect(r.bare, `${r.id}: with no source, the separator goes too`).toMatchObject({ sep: false, source: false });
    expect(r.restored, `${r.id}: a name typed back wins the byline back`).toMatchObject({ asker: true, anon: false });
  }
});

// ── The queue's content edge cases ───────────────────────────────────────────

test('the queue survives a bare list, a single entry, and an index past the end', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc, frame } = await boot('qq01');
    settle(win);
    const rows = () => doc.querySelectorAll('.audience-queue-row').length;
    const readout = () => text(doc, '.audience-queue-at') + '/' + text(doc, '.audience-queue-of');

    // 1. A bare list: questions only, no names, no sources. The meta line must not render as
    //    a row of stray separators.
    win.update(JSON.stringify({ f0: 'First question?\\nSecond question?\\nThird question?' }));
    await new Promise((r) => setTimeout(r, 30));
    const bare = {
      rows: rows(),
      metaShown: shown(win, doc, '.audience-queue-meta'),
      readout: readout(),
    };

    // 2. Walk to the end, then keep pressing: the highlight clamps instead of wrapping round
    //    to question one (which is how a host re-reads a question they already answered).
    //    Spaced like real presses — the engine finishes an interrupted state timeline with its
    //    callbacks SUPPRESSED (docs/STATE_MACHINE_SCHEMA.md §3), so four dispatches inside one
    //    JS turn are not four presses and were never meant to be.
    for (let i = 0; i < 4; i++) {
      win.noacgDispatch('advance');
      await new Promise((r) => setTimeout(r, 80));
    }
    const clampedEnd = readout();

    // 3. Shrink the list under the live index — the highlight must come back into range.
    win.update(JSON.stringify({ f0: 'Only one left?' }));
    await new Promise((r) => setTimeout(r, 30));
    const shrunk = { rows: rows(), readout: readout(), live: doc.querySelectorAll('.audience-queue-live').length };

    // 4. An empty queue renders nothing and says so, rather than showing "1 of 0".
    win.update(JSON.stringify({ f0: '' }));
    await new Promise((r) => setTimeout(r, 30));
    const empty = { rows: rows(), readout: readout() };

    // 5. Going back from the first row is a no-op, not a negative index.
    win.update(JSON.stringify({ f0: 'A?\\nB?' }));
    await new Promise((r) => setTimeout(r, 30));
    win.noacgDispatch('rewind');
    await new Promise((r) => setTimeout(r, 60));
    const floor = readout();

    frame.remove();
    return { bare, clampedEnd, shrunk, empty, floor };
  })()`);

  const r = result as {
    bare: { rows: number; metaShown: boolean; readout: string };
    clampedEnd: string;
    shrunk: { rows: number; readout: string; live: number };
    empty: { rows: number; readout: string };
    floor: string;
  };
  expect(r.bare.rows, 'three questions make three rows').toBe(3);
  expect(r.bare.metaShown, 'a row with no name and no source shows no attribution line at all').toBe(false);
  expect(r.bare.readout).toBe('1/3');
  expect(r.clampedEnd, 'the highlight stops at the last question instead of wrapping').toBe('3/3');
  expect(r.shrunk, 'a shorter list pulls the highlight back into range').toMatchObject({ rows: 1, readout: '1/1', live: 1 });
  expect(r.empty, 'an empty queue reports nothing rather than a phantom first question').toMatchObject({ rows: 0, readout: '0/0' });
  expect(r.floor, 'there is no question zero').toBe('1/2');
});

// ── The vote board's content edge cases ──────────────────────────────────────

test('the vote board handles no votes, uneven options, and a dead heat', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc, frame } = await boot('pl01');
    const shares = () => Array.from(doc.querySelectorAll('.poll-bar-fill')).map((f) => f.getAttribute('data-value'));
    const figures = () => Array.from(doc.querySelectorAll('.poll-row-value')).map((v) => v.textContent.trim());

    // 1. NO VOTES YET. Every share is zero — never an even split nobody voted for, and never a
    //    division by zero.
    win.update(JSON.stringify({ f1: 'Yes | 0\\nNo | 0\\nNot sure | 0' }));
    settle(win);
    const noVotes = { shares: shares(), rows: doc.querySelectorAll('.poll-row').length };

    // 2. OPTIONS WITH NO COUNT AT ALL — the operator typed the choices before the votes came
    //    in. The option still appears; hiding it would misreport the poll.
    win.update(JSON.stringify({ f1: 'Yes\\nNo | 12' }));
    const noCounts = { rows: doc.querySelectorAll('.poll-row').length, shares: shares() };

    // 3. SIX OPTIONS, WILDLY UNEVEN. The shares must still total 100.
    win.update(JSON.stringify({ f1: 'A | 1\\nB | 2\\nC | 3\\nD | 4\\nE | 5\\nF | 985' }));
    const many = shares().map(Number);
    const total = Math.round(many.reduce((a, b) => a + b, 0));

    // 4. THE CALL. Show the result, then call the leader.
    finish(win.next());
    finish(win.noacgDispatch('call'));
    const called = {
      winners: doc.querySelectorAll('.poll-winner').length,
      lastIsWinner: doc.querySelectorAll('.poll-row')[5].classList.contains('poll-winner'),
      tied: doc.querySelector('.poll').classList.contains('poll-tied'),
    };

    // 5. A DEAD HEAT. Two rows share the lead, so NOTHING is called — a projected winner
    //    picked out of a tie is simply untrue.
    win.update(JSON.stringify({ f1: 'A | 500\\nB | 500' }));
    finish(win.noacgDispatch('call'));
    const heat = {
      winners: doc.querySelectorAll('.poll-winner').length,
      tied: doc.querySelector('.poll').classList.contains('poll-tied'),
    };

    // 6. Figures survive a data update DURING the result: a live vote ticks up, it does not blank.
    win.update(JSON.stringify({ f1: 'A | 900\\nB | 100' }));
    const live = { shares: shares(), figures: figures(), widths: Array.from(doc.querySelectorAll('.poll-bar-fill')).map((f) => f.style.width) };

    frame.remove();
    return { noVotes, noCounts, many, total, called, heat, live };
  })()`);

  const r = result as {
    noVotes: { shares: string[]; rows: number };
    noCounts: { rows: number; shares: string[] };
    total: number;
    called: { winners: number; lastIsWinner: boolean; tied: boolean };
    heat: { winners: number; tied: boolean };
    live: { shares: string[]; figures: string[]; widths: string[] };
  };
  expect(r.noVotes.rows).toBe(3);
  expect(r.noVotes.shares, 'no votes means no shares, not an even split').toEqual(['0', '0', '0']);
  expect(r.noCounts.rows, 'an option with no count is still an option').toBe(2);
  expect(r.noCounts.shares[0]).toBe('0');
  expect(r.total, 'six uneven options still total 100%').toBe(100);
  expect(r.called, 'the leader is called, and only the leader').toMatchObject({ winners: 1, lastIsWinner: true, tied: false });
  expect(r.heat, 'a dead heat calls nobody and says so').toMatchObject({ winners: 0, tied: true });
  expect(r.live.figures.join(''), 'the figures stay on screen through a live count update').not.toContain('%%');
  expect(r.live.widths[0], 'and the bars move to the new share instead of blanking').toBe('90%');
});

// ── The answer boards, at every row count ────────────────────────────────────

test('two-, three- and four-answer boards all select, lock, and refuse a late change', async ({ page }) => {
  test.setTimeout(120_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const out = [];
    // One design per row count, plus the flagship four-answer board for the comparison.
    for (const [id, rows, correct] of [['qz05', 2, 'A'], ['qz09', 3, 'B'], ['qz01', 4, 'B']]) {
      const { win, doc, frame } = await boot(id);
      settle(win);
      const sel = () => doc.querySelectorAll('.quiz-sel').length;
      const at = () => {
        const rows = Array.from(doc.querySelectorAll('.quiz-option'));
        return rows.findIndex((r) => r.classList.contains('quiz-sel'));
      };

      // The board draws exactly as many rows as it has answers.
      const drawn = doc.querySelectorAll('.quiz-option').length;

      // Pick, then change the pick freely — one Selected state, the letter is data.
      const firstAccepted = finish(win.noacgDispatch('select', { ['f' + (rows + 2)]: 'A' }));
      const first = at();
      const changedAccepted = finish(win.noacgDispatch('select', { ['f' + (rows + 2)]: rows >= 3 ? 'C' : 'B' }));
      const changed = at();

      // Lock it in. After this a late change is STRUCTURALLY impossible — there is no select
      // arrow out of locked, so the event is dropped along with its payload.
      const lockAccepted = finish(win.noacgDispatch('lock'));
      const latePickAccepted = finish(win.noacgDispatch('select', { ['f' + (rows + 2)]: 'A' }));
      const afterLock = at();

      // Reveal. The correct row lights up; a wrong pick is marked differently.
      const judgeAccepted = finish(win.noacgDispatch('judge'));
      const revealed = {
        correct: doc.querySelectorAll('.quiz-correct').length,
        wrong: doc.querySelectorAll('.quiz-wrong').length,
        dim: doc.querySelectorAll('.quiz-dim').length,
        correctIsRight: Array.from(doc.querySelectorAll('.quiz-option')).findIndex((r) => r.classList.contains('quiz-correct')) === 'ABCD'.indexOf(correct),
      };

      // A REPLAY starts clean: no selection, no lock, no reveal left standing. Played for real
      // rather than settled — forcing every live timeline to its end would also fire the reveal
      // step's own call again, which is the harness talking, not the graphic.
      win.play();
      await waitFor(function () {
        return sel() === 0 &&
          doc.querySelectorAll('.quiz-correct').length === 0 &&
          !doc.querySelector('.quiz').classList.contains('quiz-locked');
      }, id + ' replay reset');
      const afterReplay = {
        sel: sel(),
        correct: doc.querySelectorAll('.quiz-correct').length,
        locked: doc.querySelector('.quiz').classList.contains('quiz-locked'),
      };

      out.push({
        id, rows, drawn, first, changed, afterLock, revealed, afterReplay,
        firstAccepted, changedAccepted, lockAccepted, latePickAccepted, judgeAccepted,
      });
      frame.remove();
    }
    return out;
  })()`);

  for (const r of report as Array<{
    id: string; rows: number; drawn: number; first: number; changed: number; afterLock: number;
    firstAccepted: boolean; changedAccepted: boolean; lockAccepted: boolean;
    latePickAccepted: boolean; judgeAccepted: boolean;
    revealed: { correct: number; wrong: number; dim: number; correctIsRight: boolean };
    afterReplay: { sel: number; correct: number; locked: boolean };
  }>) {
    expect(r.drawn, `${r.id}: draws one row per answer`).toBe(r.rows);
    expect(r.firstAccepted, `${r.id}: accepts the first pick`).toBe(true);
    expect(r.changedAccepted, `${r.id}: accepts a changed pick`).toBe(true);
    expect(r.first, `${r.id}: the first pick lands on A`).toBe(0);
    expect(r.changed, `${r.id}: the pick can be changed freely`).not.toBe(r.first);
    expect(r.lockAccepted, `${r.id}: accepts the lock`).toBe(true);
    expect(r.latePickAccepted, `${r.id}: structurally rejects a pick after lock`).toBe(false);
    expect(r.afterLock, `${r.id}: a late change after the lock is refused`).toBe(r.changed);
    expect(r.judgeAccepted, `${r.id}: accepts the reveal`).toBe(true);
    expect(r.revealed.correct, `${r.id}: exactly one row is marked correct`).toBe(1);
    expect(r.revealed.correctIsRight, `${r.id}: and it is the one the operator chose as correct`).toBe(true);
    expect(r.revealed.wrong, `${r.id}: the losing pick is told apart from the winner`).toBe(1);
    expect(r.afterReplay, `${r.id}: a replay starts un-picked, un-locked and un-revealed`).toMatchObject({
      sel: 0,
      correct: 0,
      locked: false,
    });
  }
});

// ── The states themselves ────────────────────────────────────────────────────

test('every state of every new type is reachable, and snapping to it lands its pose', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { canonicalPath } = await import('/src/blocks/animMachine.ts');
    const NEW_TYPES = ['viewer-question','qa-card','chat-highlight','question-queue','community-request','live-poll','answer-board-2','answer-board-3'];
    const { TYPES } = await import('/src/templates/types/registry.ts');
    const out = [];
    for (const type of TYPES.filter((t) => NEW_TYPES.includes(t.id))) {
      const design = type.designs[0];
      const { win, doc, frame } = await boot(design.id);
      const data = parseAnimData((await import('/src/templates/catalog.ts')).variantById(design.id).create({}).js);
      const problems = [];
      const machine = data.machine;
      if (machine) {
        for (const group of machine.groups) {
          for (const state of group.states) {
            if (state.id === group.initial) continue;
            if (canonicalPath(group, group === machine.groups[0], state.id) === null) {
              problems.push('state "' + state.id + '" is unreachable');
              continue;
            }
            // Snapping must not throw and must leave the graphic visible and on that state.
            try {
              const assign = {}; assign[group.id] = state.id;
              win.noacgSnap(assign, { timers: false });
              await new Promise((r) => setTimeout(r, 30));
              const now = win.noacgMachineState();
              if (now.groups[group.id] !== state.id) problems.push('snap to "' + state.id + '" landed on "' + now.groups[group.id] + '"');
            } catch (e) {
              problems.push('snap to "' + state.id + '" threw: ' + e);
            }
          }
        }
        // …and reset-visual-state puts every group back to its initial without throwing.
        try {
          win.noacgSnap(null, { timers: false });
          const now = win.noacgMachineState();
          for (const group of machine.groups) {
            if (now.groups[group.id] !== group.initial) problems.push('reset left "' + group.id + '" at "' + now.groups[group.id] + '"');
          }
        } catch (e) { problems.push('reset threw: ' + e); }
      }
      out.push({ type: type.id, design: design.id, hasMachine: !!machine, problems });
      frame.remove();
    }
    return out;
  })()`);
  const broken = (report as Array<{ type: string; problems: string[] }>).filter((r) => r.problems.length);
  expect(broken).toEqual([]);
  // Two of the five audience types deliberately carry no machine — the rule is that a derived
  // machine that is already right is not persisted. Pin it, so a later edit that quietly adds
  // one has to say why.
  const machineless = (report as Array<{ type: string; hasMachine: boolean }>)
    .filter((r) => !r.hasMachine)
    .map((r) => r.type)
    .sort();
  expect(machineless).toEqual(['community-request', 'viewer-question']);
});

// ── The chat strap's dwell ───────────────────────────────────────────────────

test('a chat highlight takes itself off air, and holding it stops the clock', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc, frame } = await boot('ch01');
    // Run the graphic's own clock fast rather than waiting out the real dwell: the timer is a
    // gsap.delayedCall, so timeScale drives it exactly as the bench and the renderer do.
    win.play();
    await new Promise((r) => setTimeout(r, 120));
    const armed = win.noacgMachineState();
    win.gsap.globalTimeline.timeScale(40);
    await new Promise((r) => setTimeout(r, 700));
    const afterDwell = win.noacgMachineState();

    // Now hold it: entering the pose cancels the armed dwell, and nothing re-arms it.
    win.gsap.globalTimeline.timeScale(1);
    win.play();
    await new Promise((r) => setTimeout(r, 120));
    win.noacgDispatch('hold');
    const held = win.noacgMachineState();
    win.gsap.globalTimeline.timeScale(40);
    await new Promise((r) => setTimeout(r, 700));
    const stillHeld = win.noacgMachineState();
    win.gsap.globalTimeline.timeScale(1);

    // …and the operator can always take it now.
    win.noacgDispatch('dismiss');
    await new Promise((r) => setTimeout(r, 60));
    const dismissed = win.noacgMachineState();
    frame.remove();
    return { armed, afterDwell, held, stillHeld, dismissed };
  })()`);
  const r = result as Record<string, { groups: Record<string, string> }>;
  const main = (s: { groups: Record<string, string> }) => s.groups[Object.keys(s.groups)[0]];
  expect(main(r.armed), 'it arrives on air').not.toEqual(main(r.afterDwell));
  expect(main(r.held), 'holding it enters the held pose').toBe('held');
  expect(main(r.stillHeld), 'and the dwell never fires from there').toBe('held');
  expect(main(r.dismissed), 'the operator can still take it off').not.toBe('held');
});

// ── Save / load ──────────────────────────────────────────────────────────────

test('a pack graphic survives a save and load round trip with its machine intact', async ({ page }) => {
  test.setTimeout(120_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData, serializeAnimData } = await import('/src/blocks/animData.ts');
    const { parseDefinition } = await import('/src/model/spxDefinition.ts');
    const out = [];
    for (const id of ['aq01','qa01','ch01','qq01','rq01','pl01','qz05','qz09']) {
      const tpl = variantById(id).create({});
      // The library stores a graphic as JSON; a round trip through it must change nothing.
      const revived = JSON.parse(JSON.stringify(tpl));
      const before = parseAnimData(tpl.js);
      const after = parseAnimData(revived.js);
      // …and the definition parsed back out of the saved HTML must match the fields we shipped.
      const parsed = parseDefinition(revived.html);
      out.push({
        id,
        sameCode: revived.html === tpl.html && revived.css === tpl.css && revived.js === tpl.js,
        sameData: !!before && !!after && serializeAnimData(before) === serializeAnimData(after),
        // The canonical serializer is a fixed point — the proof a save cannot drift the data.
        fixedPoint: !!before && serializeAnimData(parseAnimData('var NOACG_ANIM = ' + serializeAnimData(before) + ';')) === serializeAnimData(before),
        fieldsMatch: parsed.fields.length === tpl.fields.length &&
          parsed.fields.every((f, i) => f.field === tpl.fields[i].field && f.title === tpl.fields[i].title),
        stepsMatch: parsed.settings.steps === tpl.settings.steps,
      });
    }
    return out;
  })()`);
  for (const r of report as Array<Record<string, unknown> & { id: string }>) {
    expect(r, `${r.id} survived the round trip`).toMatchObject({
      sameCode: true,
      sameData: true,
      fixedPoint: true,
      fieldsMatch: true,
      stepsMatch: true,
    });
  }
});

// ── Every export target ──────────────────────────────────────────────────────

test('every pack graphic exports to every target with no dangling references', async ({ page }) => {
  test.setTimeout(240_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const out = [];
    const ids = ['aq01','aq02','qa01','qa03','ch01','ch04','qq01','qq02','rq01','rq04','pl01','pl02','pl03','pl04','qz05','qz08','qz09','qz12'];
    for (const id of ids) {
      const tpl = variantById(id).create({});
      for (const target of EXPORT_TARGETS) {
        const problems = [];
        try {
          const zip = await target.build(tpl);
          const entries = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
          const names = new Set(entries);
          if (!entries.length) problems.push(target.id + ': produced no files');
          // Every RELATIVE reference a produced text file makes must resolve to a file the
          // same export produced. This is the dangling-reference defect class: the graphic
          // still loads, so nothing complains — it just misses its font, its script or its
          // image, on air, once.
          for (const path of entries) {
            if (!/\\.(html|css|js|json)$/.test(path)) continue;
            const content = await zip.files[path].async('string');
            const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
            const refs = [
              ...content.matchAll(/(?:src|href)="([^"#?:]+)"/g),
              ...content.matchAll(/url\\(["']?([^"')#?:]+)["']?\\)/g),
            ].map((m) => m[1]);
            for (const ref of refs) {
              if (!ref || ref.startsWith('/') || ref.startsWith('data:') || ref.startsWith('#')) continue;
              let resolved = dir + ref;
              // Normalise the packaged-SPX bucket hop ("../css/template.css").
              while (/[^/]+\\/\\.\\.\\//.test(resolved)) resolved = resolved.replace(/[^/]+\\/\\.\\.\\//, '');
              if (!names.has(resolved) && !names.has(ref)) {
                problems.push(target.id + ': dangling "' + ref + '" from ' + path);
              }
            }
          }
        } catch (e) {
          problems.push(target.id + ' threw: ' + e);
        }
        if (problems.length) out.push({ id, target: target.id, problems });
      }
    }
    return out;
  })()`);
  expect(report).toEqual([]);
});

// THE JOIN CARD (interaction spec, phase 2, AC-11): it draws a QR that decodes to its Join link,
// live and exported with no network. Each QR is read from PIXELS by e2e/_qr.ts.
const LINK = 'https://noacg.studio/j/friday-night-live';

/** A blank page on the app's origin. */
async function phonePage(page: Page): Promise<void> {
  await page.route('**/join-card-probe', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' }),
  );
  await page.goto('/join-card-probe');
}

test.describe('the Join card draws its QR from its Join link (AC-11)', () => {
  /** Build the Join card with this link, as Add Join card to rundown does. */
  const template = (page: Page, link: string) =>
    page.evaluate(async (l) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const variant = variantById('jc01')!;
      const lines = variant.suggestedLines.map((line) => (line.title === 'Join link' ? { ...line, sample: l } : line));
      return variant.create({ lines });
    }, link);

  /** Play the card in this document and wait for its entrance to land. Play is queued in the
   *  graphic's own event queue, so the wait is on what the page shows, not on a timeline handle. */
  const settle = async (frame: Page | Frame) => {
    await frame.evaluate(() => (window as unknown as { play(): void }).play());
    await frame.waitForFunction(() => {
      const box = document.querySelector('.audience-box');
      const root = document.querySelector('.audience');
      const g = (window as unknown as { gsap: { globalTimeline: { getChildren(a: boolean, b: boolean, c: boolean): { isActive(): boolean }[] } } }).gsap;
      return !!box && !!root && getComputedStyle(root).opacity === '1' && getComputedStyle(box).opacity === '1'
        && g.globalTimeline.getChildren(true, true, false).every((t) => !t.isActive());
    });
  };

  test('live: the rendered card decodes to its link, follows an update, and an empty link draws nothing', async ({ page, browser }) => {
    const reader = await qrReader(browser);
    try {
      await phonePage(page);
      await page.setViewportSize({ width: 1920, height: 1080 });
      const tpl = await template(page, LINK);
      // As the studio's monitors load it: the preview document in an iframe on the app's origin.
      await page.evaluate(async (t) => {
        const { composeDocument } = await import('/src/preview/composeDocument.ts');
        const f = document.createElement('iframe');
        f.id = 'card';
        f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0';
        document.body.appendChild(f);
        await new Promise((res) => {
          f.onload = res;
          f.srcdoc = composeDocument(t as never);
        });
      }, tpl);
      const card = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
      await card.waitForFunction(() => typeof (window as unknown as { play?: unknown }).play === 'function');
      await settle(card);
      const qr = page.frameLocator('#card').locator('#audience-join-qr');
      await expect(qr.locator('path')).toHaveAttribute('d', /^M/);
      expect(await reader.read(await qr.screenshot())).toBe(LINK);
      await expect(page.frameLocator('#card').locator('.audience-join-url')).toHaveText('noacg.studio/j/friday-night-live');

      // A new link is data: update() redraws the code, nothing else moves.
      const other = 'https://noacg.studio/j/quiz-2026';
      await card.evaluate((l) => (window as unknown as { update(d: unknown): void }).update({ f2: l }), other);
      expect(await reader.read(await qr.screenshot())).toBe(other);

      await card.evaluate(() => (window as unknown as { update(d: unknown): void }).update({ f2: '' }));
      await expect(qr).toBeHidden();
      await expect(qr.locator('path')).toHaveAttribute('d', '');
      await expect(page.frameLocator('#card').locator('.audience-join-url')).toBeHidden();
    } finally {
      await reader.close();
    }
  });

  test('exported: the single-file card, opened with no network, still draws the same code', async ({ page, browser }) => {
    const reader = await qrReader(browser);
    try {
      await phonePage(page);
      const tpl = await template(page, LINK);
      const html = await page.evaluate(async (t) => {
        const { composeSelfContainedHtml } = await import('/src/export/selfContained.ts');
        return composeSelfContainedHtml(t as never);
      }, tpl);
      expect(html).not.toMatch(/<script[^>]+src=/i);
      const offline = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
      const card = await offline.newPage();
      const requests: string[] = [];
      card.on('request', (r) => {
        if (!r.url().startsWith('data:')) requests.push(r.url());
      });
      await card.route('**/*', (route) => route.abort());
      await card.setContent(html);
      await card.waitForFunction(() => typeof (window as unknown as { play?: unknown }).play === 'function');
      await settle(card);
      expect(await reader.read(await card.locator('#audience-join-qr').screenshot())).toBe(LINK);
      expect(requests, 'nothing was fetched').toEqual([]);
      await offline.close();
    } finally {
      await reader.close();
    }
  });
});

// A LAYER NAMED `QR` in imported artwork (interaction spec, AC-13): the graphic gains a Join link
// field and draws that link as a code over the layer's box, from its own encoder.
test('an imported SVG with a layer named QR draws its Join link as a code that decodes', async ({ page, browser }) => {
  const reader = await qrReader(browser);
  try {
    await phonePage(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Artwork outside every sample set: a plate, a title and a placeholder square named QR, the
    // way Illustrator writes a layer name into `id`, moved by a transform of its own.
    // The root declares a white stroke every shape inherits: the code must not take it.
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400" viewBox="0 0 900 400" stroke="#ffffff" stroke-width="2">
  <rect id="Plate" width="900" height="400" fill="#14213d"/>
  <text id="Title" x="380" y="120" font-family="Arial" font-size="48" fill="#ffffff">Scan to join</text>
  <text id="QR " x="380" y="200" font-family="Arial" font-size="32" fill="#ffffff">QR</text>
  <g id="Draft" display="none"><rect id="QR  " x="500" y="300" width="60" height="60"/></g>
  <g id="QR" transform="translate(40 40)"><rect width="320" height="320" fill="#888888"/></g>
</svg>`;
    const built = await page.evaluate(async (m) => {
      const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
      const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
      const imported = importSvgMarkup(m);
      const fields = imported.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
      const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
      const template = IMPORTED_SVG.create({
        designSvg: { markup: imported.markup, width: imported.width, height: imported.height, fields, images: [], outlines: [], fonts: [] },
      });
      return { template, errors: validateTemplate(template).errors.map((e) => e.message) };
    }, markup);
    expect(built.errors, 'the export gate passes the graphic').toEqual([]);
    const tpl = built.template;
    const join = tpl.fields.find((f) => f.title === 'Join link');
    expect(join, 'the QR layer adds a Join link field').toBeTruthy();
    expect(tpl.fields.at(-1)!.field, 'the Join link field comes last').toBe(join!.field);
    await page.evaluate(async (t) => {
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const f = document.createElement('iframe');
      f.id = 'art';
      f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0';
      document.body.appendChild(f);
      await new Promise((res) => {
        f.onload = res;
        f.srcdoc = composeDocument(t as never);
      });
    }, tpl);
    const art = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
    await art.waitForFunction(() => typeof (window as unknown as { update?: unknown }).update === 'function');
    const frame = page.frameLocator('#art');
    // Empty, it draws nothing, and the stand-in square stays hidden.
    await expect(frame.locator('.imported-design-qr-code')).toHaveCount(0);
    await expect(frame.locator('.imported-design-qr')).toBeHidden();
    await art.evaluate(({ f, l }) => (window as unknown as { update(d: unknown): void }).update({ [f]: l }), { f: join!.field, l: LINK });
    await art.evaluate(() => (window as unknown as { play(): void }).play());
    await art.waitForFunction(() => {
      const root = document.querySelector('.imported-design');
      return !!root && getComputedStyle(root).opacity === '1';
    });
    // Inside the QR layer, so whatever animates that layer moves the code with it.
    const code = frame.locator('.imported-design-qr > .imported-design-qr-code');
    await expect(code).toHaveCount(1);
    // Over the layer's own box: 320 drawn units at the 900-unit artwork's on-screen scale.
    const [codeBox, artBox] = [await code.boundingBox(), await frame.locator('svg.imported-design-art').boundingBox()];
    const unit = artBox!.width / 900;
    expect(Math.abs(codeBox!.x - (artBox!.x + 40 * unit)), 'the code starts where the layer was drawn').toBeLessThanOrEqual(1);
    expect(Math.abs(codeBox!.width - 320 * unit), 'the code fills the layer').toBeLessThanOrEqual(1);
    expect(await reader.read(await code.screenshot())).toBe(LINK);
    // A new link is data: the code is redrawn once, not stacked.
    const other = 'https://noacg.studio/j/quiz-2026';
    await art.evaluate(({ f, l }) => (window as unknown as { update(d: unknown): void }).update({ [f]: l }), { f: join!.field, l: other });
    await expect(code).toHaveCount(1);
    expect(await reader.read(await code.screenshot())).toBe(other);
    await art.evaluate(({ f }) => (window as unknown as { update(d: unknown): void }).update({ [f]: '' }), { f: join!.field });
    await expect(code).toHaveCount(0);
  } finally {
    await reader.close();
  }
});

// HOME-MADE RESULT ARTWORK (interaction spec, AC-13): bars drawn at full length, named the way
// docs/SVG_AUTHORING.md teaches, become a live vote whose Question, Options and Vote count fields
// carry the round, and each bar is drawn at its share of the drawn length - made in the studio's
// import (the mapping step's own draft) and from the CLI (`noacg scaffold --svg`, the bridge's
// scaffold), each rendered on a blank page. The CLI-made one also carries a layer named QR.
for (const maker of ['studio import', 'CLI scaffold --svg'] as const) {
  test(`${maker}: a home-made vote board draws each bar at its share within one pixel`, async ({ page, browser }) => {
    const reader = await qrReader(browser);
    try {
      // The studio's import modules load with the app's own React preamble, so that maker runs on
      // the app page; the bridge is plain modules and runs on a blank one.
      if (maker === 'studio import') await page.goto('/app');
      else await phonePage(page);
      await page.setViewportSize({ width: 1920, height: 1080 });
      // Outside every sample set: four rows of bars across, 600 units at full length.
      const options = [1, 2, 3, 4].map((n) => `
    <text id="Option ${n}" x="60" y="${170 + n * 90}" font-family="Arial" font-size="32" fill="#ffffff">Option ${n}</text>`).join('');
      const bars = [1, 2, 3, 4].map((n) => `
    <rect id="Bar ${n}" x="360" y="${140 + n * 90}" width="600" height="40" fill="#f2a900"/>`).join('');
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="700" viewBox="0 0 1300 700">
  <rect id="Plate" width="1300" height="700" fill="#101820"/>
  <g id="Bars">${bars}
  </g>
  <g id="Words">
    <text id="Question" x="60" y="120" font-family="Arial" font-size="48" fill="#ffffff">Which way tonight?</text>${options}
    <text id="Vote count" x="60" y="660" font-family="Arial" font-size="28" fill="#cccccc">0 votes</text>
  </g>
  <rect id="QR" x="1020" y="400" width="240" height="240" fill="#888888"/>
</svg>`;
      const built = await page.evaluate(async ({ m, how }) => {
        const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
        let template;
        if (how === 'CLI scaffold --svg') {
          const { scaffold } = await import('/src/bridge/bridgeApi.ts');
          template = (await scaffold({ svg: m, name: 'Home-made vote' })).template;
        } else {
          const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
          const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
          const { initialDraft, mergeDraft, draftToOptions } = await import('/src/components/wizard/draft/core.ts');
          const D = await import('/src/components/wizard/import/draft.ts');
          const patch = D.svgDraftFromImport(importSvgMarkup(m), { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
          template = IMPORTED_SVG.create(draftToOptions(IMPORTED_SVG, mergeDraft(initialDraft(), patch)));
        }
        return { template, errors: validateTemplate(template).errors.map((e) => e.message) };
      }, { m: markup, how: maker });
      expect(built.errors, 'the export gate passes the graphic').toEqual([]);
      const field = (title: string) => built.template.fields.find((f) => f.title === title)?.field;
      for (const title of ['Question', 'Options', 'Vote count', 'Join link']) expect(field(title), `a ${title} field`).toBeTruthy();
      // The layers the vote writes are not also operator fields: one Question, one Vote count.
      for (const title of ['Question', 'Vote count']) expect(built.template.fields.filter((f) => f.title === title)).toHaveLength(1);

      await page.evaluate(async (t) => {
        const { composeDocument } = await import('/src/preview/composeDocument.ts');
        const f = document.createElement('iframe');
        f.id = 'board';
        f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;z-index:2147483647';
        document.body.appendChild(f);
        await new Promise((res) => {
          f.onload = res;
          f.srcdoc = composeDocument(t as never);
        });
      }, built.template);
      const board = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
      await board.waitForFunction(() => typeof (window as unknown as { update?: unknown }).update === 'function');
      await board.evaluate(() => (window as unknown as { play(): void }).play());
      // Known counts, as the result staging writes them: 10, 20, 30 and 40 of 100.
      const counts = [10, 20, 30, 40];
      await board.evaluate((v) => (window as unknown as { update(d: unknown): void }).update(v), {
        [field('Question')!]: 'Which way tonight?',
        [field('Options')!]: counts.map((c, i) => `Option ${i + 1} | ${c}`).join('\n'),
        [field('Vote count')!]: '100 votes',
        [field('Join link')!]: LINK,
      });
      const frame = page.frameLocator('#board');
      const art = await frame.locator('svg.imported-design-art').boundingBox();
      const unit = art!.width / 1300;
      for (const [i, c] of counts.entries()) {
        const want = 600 * unit * (c / 100);
        const bar = frame.locator(`[data-noacg-role~="bar/${i + 1}"]`);
        const width = async () => (await bar.boundingBox())!.width;
        // The bar tweens to its share; wait until it has stopped, then hold it to one pixel.
        await expect.poll(async () => Math.abs((await width()) - want), { message: `bar ${i + 1} settles near ${want.toFixed(2)} px`, timeout: 10_000 }).toBeLessThanOrEqual(1);
        const w = await width();
        expect(Math.abs(w - want), `bar ${i + 1}: ${w.toFixed(2)} px, want ${c}% of the drawn length = ${want.toFixed(2)} px`).toBeLessThanOrEqual(1);
      }
      await expect(frame.locator('[data-noacg-role~="total"]')).toHaveText('100 votes');
      expect(await reader.read(await frame.locator('.imported-design-qr-code').screenshot())).toBe(LINK);
    } finally {
      await reader.close();
    }
  });
}

// THE RESULT BOARDS (interaction spec, AC-12): every layout in every placement, rendered over a
// studio picture, with two short options and eight long ones, in each Figures mode. Nothing on a
// board leaves the board, the board stays inside the frame, a long name ends rather than
// overflows, the figures say what the Figures field asks, the graphic's own background is
// transparent, and the look's accent paints the chart.
test('result boards: three layouts by three placements take 2 and 8 options and long names without overflow', async ({ page }) => {
  test.setTimeout(120_000);
  await phonePage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  // A stand-in for a studio picture: bright key lights over a dark set, behind the graphic.
  await page.evaluate(() => {
    // The preview document declares a dark color scheme; an embedder that disagrees makes
    // Chromium paint the iframe opaque, which would hide the picture.
    document.documentElement.style.colorScheme = 'dark';
    document.body.style.cssText = 'margin:0;background:radial-gradient(circle at 25% 30%, #fff6d8 0 8%, transparent 30%), radial-gradient(circle at 75% 25%, #d8ecff 0 6%, transparent 28%), linear-gradient(180deg, #3a3f4a, #0d0f14 70%, #2a2016)';
  });
  const ids = ['pl06', 'pl07', 'pl08', 'pl09', 'pl10', 'pl11', 'pl12', 'pl13', 'pl14'];
  // Interaction's result picker offers every vote board by the name the catalog gives it.
  const offered = await page.evaluate(async () => {
    const { RESULT_BOARDS } = await import('/src/control/resultStaging.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    return RESULT_BOARDS.map((b) => ({ ...b, catalog: variantById(b.id)?.name ?? null }));
  });
  for (const id of ids) expect(offered.map((b) => b.id), `${id} is offered for results`).toContain(id);
  for (const b of offered) expect(b.name, `${b.id} is offered under its catalog name`).toBe(b.catalog);
  // Two options that differ in the ways a chart must survive: a short name beside one that wraps,
  // and a count one digit wider than the other.
  const two = 'Yes | 999\nNo, and here is a much longer answer that wraps | 1000';
  const eight = Array.from({ length: 8 }, (_, i) => `Option ${i + 1}: the longest answer anyone could possibly type into this box tonight | ${(8 - i) * 137}`).join('\n');
  for (const id of ids) {
    for (const palette of ['noacg', 'volt'] as const) {
      const tpl = await page.evaluate(async ({ id, palette }) => {
        const { variantById } = await import('/src/templates/catalog.ts');
        const { paletteById } = await import('/src/model/wizard.ts');
        return variantById(id)!.create({ palette: paletteById(palette) });
      }, { id, palette });
      const fields = Object.fromEntries(tpl.fields.map((f) => [f.title, f.field]));
      expect(Object.keys(fields), `${id}: the result fields`).toEqual(['Question', 'Options', 'Vote count', 'Vote badge', 'Figures']);
      await page.evaluate(async (t) => {
        document.getElementById('board')?.remove();
        const { composeDocument } = await import('/src/preview/composeDocument.ts');
        const f = document.createElement('iframe');
        f.id = 'board';
        f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;background:transparent';
        f.style.colorScheme = 'dark';
        document.body.appendChild(f);
        await new Promise((res) => {
          f.onload = res;
          f.srcdoc = composeDocument(t as never);
        });
      }, tpl);
      const board = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
      await board.waitForFunction(() => typeof (window as unknown as { play?: unknown }).play === 'function');
      await board.evaluate(() => (window as unknown as { play(): void }).play());
      // The entrance has landed: the board is in and no tween is still moving anything.
      await board.waitForFunction(() => {
        const g = (window as unknown as { gsap: { globalTimeline: { getChildren(a: boolean, b: boolean, c: boolean): { isActive(): boolean }[] } } }).gsap;
        return getComputedStyle(document.querySelector('.poll')!).opacity === '1' && g.globalTimeline.getChildren(true, true, false).every((t) => !t.isActive());
      }, null, { timeout: 10_000 });
      const look = await board.evaluate(() => ({
        bg: [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor],
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      }));
      for (const bg of look.bg) expect(bg, `${id}: the graphic's own background is transparent`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      for (const [options, n] of [[two, 2], [eight, 8]] as const) {
        for (const mode of ['percent', 'count', 'both'] as const) {
          const where = `${id} ${palette} ${n} options ${mode}`;
          const report = await board.evaluate(async ({ data, n, mode }) => {
            (window as unknown as { update(d: unknown): void }).update(data);
            // Show the result as the Result step leaves it: every bar at its share, every figure in.
            (window as unknown as { pollRevealed: boolean }).pollRevealed = true;
            (window as unknown as { pollPaintState(): void }).pollPaintState();
            // The layout watcher answers the new rows one microtask later; measure after a frame.
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const box = document.querySelector('.poll-box')!.getBoundingClientRect();
            const inside = (r: DOMRect, o: DOMRect) => r.left >= o.left - 1 && r.right <= o.right + 1 && r.top >= o.top - 1 && r.bottom <= o.bottom + 1;
            const out: string[] = [];
            if (!inside(box, new DOMRect(0, 0, 1920, 1080))) out.push(`board leaves the frame: ${JSON.stringify(box)}`);
            // The action-safe area (93% of the frame) is where a board has to stay.
            if (!inside(box, new DOMRect(1920 * 0.035, 1080 * 0.035, 1920 * 0.93, 1080 * 0.93))) out.push(`board leaves the action-safe area: ${Math.round(box.top)}..${Math.round(box.bottom)}`);
            for (const el of Array.from(document.querySelectorAll('.poll-box *'))) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              if (getComputedStyle(el).display === 'none') continue;
              if (!inside(r, box)) out.push(`${el.className || el.tagName} leaves the board`);
            }
            const rows = Array.from(document.querySelectorAll('.poll-row'));
            if (rows.length !== n) out.push(`${rows.length} rows for ${n} options`);
            for (const row of rows) {
              const rr = row.getBoundingClientRect();
              for (const el of Array.from(row.querySelectorAll('.poll-row-label, .poll-row-figures'))) {
                if (!inside(el.getBoundingClientRect(), rr)) out.push(`${el.className} leaves its row`);
              }
              const label = row.querySelector('.poll-row-label') as HTMLElement;
              if (label.scrollWidth > label.clientWidth + 1) out.push('a label runs past its column');
              const figures = Array.from(row.querySelectorAll('.poll-row-value, .poll-row-count')).filter((v) => getComputedStyle(v).display !== 'none');
              if (figures.some((v) => getComputedStyle(v).opacity !== '1')) out.push('a figure is still hidden after the result');
              const shown = figures.map((v) => v.textContent!.trim());
              const want = mode === 'percent' ? /^\d+(\.\d)?%$/ : mode === 'count' ? /^[\d\u202f]+$/ : /^\d+(\.\d)?%\|[\d\u202f]+$/;
              if (!want.test(shown.join('|'))) out.push(`figures "${shown.join('|')}" for ${mode}`);
            }
            // The bars compare: every track across is one length, every column stands on one line.
            const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
            const tracks = Array.from(document.querySelectorAll('.poll-lay-across .poll-bar')).map((b) => b.getBoundingClientRect().width);
            if (tracks.length && spread(tracks) > 1) out.push(`tracks differ in length by ${spread(tracks).toFixed(1)} px`);
            const columns = Array.from(document.querySelectorAll('.poll-col')).map((c) => c.getBoundingClientRect().bottom);
            if (columns.length && spread(columns) > 1) out.push(`columns stand ${spread(columns).toFixed(1)} px apart`);
            const fill = document.querySelector('.poll-swatch, .poll-bar-fill') as HTMLElement;
            return { out, fill: getComputedStyle(fill).backgroundColor };
          }, { data: { [fields.Options]: options, [fields.Figures]: mode, [fields.Question]: n === 8 ? 'Of all the songs played tonight, which one should close the show for everyone at home?' : 'Encore?' }, n, mode });
          expect(report.out, where).toEqual([]);
          // The look: the first option wears the palette's accent.
          const accent = await page.evaluate((c) => {
            const probe = document.createElement('div');
            probe.style.color = c;
            document.body.appendChild(probe);
            const v = getComputedStyle(probe).color;
            probe.remove();
            return v;
          }, look.accent);
          expect(report.fill, `${where}: the chart follows the look's accent`).toBe(accent);
        }
      }
      if (palette === 'noacg') await page.screenshot({ path: test.info().outputPath(`${id}-8.png`) });
    }
  }
});

// THE CLI PATH TAKES THE STUDIO'S DEFAULTS (interaction spec AC-13, "the same from the CLI"): a
// countdown board from the corpus, whose artwork names bundled faces, scaffolded through the
// bridge and imported through the studio's own draft, gives the same fields, the same ticking
// clock and the same declared faces.
test('CLI scaffold --svg: a countdown board ticks and keeps its bundled faces, as the studio import does', async ({ page }) => {
  await page.goto('/app');
  const markup = readFileSync(new URL('./fixtures/svg-corpus/illustrator-question-timer-board.svg', import.meta.url), 'utf8');
  const both = await page.evaluate(async (m) => {
    const { scaffold } = await import('/src/bridge/bridgeApi.ts');
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
    const { initialDraft, mergeDraft, draftToOptions } = await import('/src/components/wizard/draft/core.ts');
    const D = await import('/src/components/wizard/import/draft.ts');
    const cli = (await scaffold({ svg: m })).template;
    const patch = D.svgDraftFromImport(importSvgMarkup(m), { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
    const studio = IMPORTED_SVG.create(draftToOptions(IMPORTED_SVG, mergeDraft(initialDraft(), patch)));
    const read = (t: { fields: { title: string; ftype: string }[]; css: string; js: string }) => ({
      fields: t.fields.map((f) => `${f.title}:${f.ftype}`),
      clock: /startClock/.test(t.js),
      faces: (t.css.match(/@font-face\s*\{[^}]*\}/g) ?? []).map((f) => f.replace(/\s+/g, ' ')).sort(),
    });
    return { cli: read(cli), studio: read(studio) };
  }, markup);
  expect(both.studio.clock, 'the studio import starts the clock').toBe(true);
  expect(both.studio.faces.length, 'the artwork names bundled faces').toBeGreaterThan(0);
  expect(both.cli).toEqual(both.studio);
});
