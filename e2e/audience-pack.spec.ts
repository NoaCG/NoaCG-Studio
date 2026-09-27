// covers: src/templates/**
//
// The quiz runtime is also the exported control panel's recovery subject and the audience
// pack's answer boards.
// covers: src/templates/quiz/**

import { enableAdvancedMode } from './_create';
import { test, expect, type Page } from '@playwright/test';

// THE AUDIENCE PACK — viewer questions, Q&A cards, chat highlights, question queues, community
// requests, live votes, and the two- and three-answer boards.
//
// What these check is the stuff a catalog sweep cannot: what happens when the AUDIENCE, rather
// than the production, decides the content. A viewer writes 400 characters, submits anonymously,
// gives no platform; a moderator pastes a bare list with no names; a poll has no votes yet, or a
// dead heat; an operator locks an answer and then replays. Every one of those is ordinary on
// air, and every one of them is a way for a graphic to render something untrue.

async function toApp(page: Page) {
  // Editor-subject specs: the Advanced boot keeps '' = the editor under the wizard
  // (the default studio lands on Home - docs/GOALS_ARCHIVE.md "Student release" step 4).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape');
}

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
