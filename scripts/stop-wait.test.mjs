// The stop-on-a-wait hook's guard: which last words count as waiting on something that cannot
// wake a stopped session, which do not, and when a declared wait is still fine because the branch
// is already the queue's. A false positive here interrupts every session's ordinary turn end, so
// the negatives are the half that earns the hook its place.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { decide, declaresWait, finishedProperly, isCloudSession, lastAssistantText, MAX_REFUSALS } from './stop-wait.mjs';

test('declaresWait catches the four observed shapes', () => {
  assert.ok(declaresWait('Pushed. I am now waiting for the CI run to finish before writing the handoff and queueing.'));
  assert.ok(declaresWait("I'll check back once the run completes and then queue the branch."));
  assert.ok(declaresWait('Set up a background watcher that will wake me when the landing job finishes.'));
  assert.ok(declaresWait('Checking back in 20 minutes on the shards.'));
  assert.ok(declaresWait('Waiting on the landing (j-0301) before handing off.'));
  assert.ok(declaresWait('Will resume when CI is green.'));
});

test('declaresWait stays silent on ordinary turn ends', () => {
  assert.ok(!declaresWait('Done. The build is green and the handoff is written.'));
  assert.ok(!declaresWait('I will wait for your answer before touching the migration.'));
  assert.ok(!declaresWait('Waiting for you to confirm the design picture.'));
  assert.ok(!declaresWait('The CI run 33559810135 is green with all nine shards; queued as j-0304.'));
  assert.ok(!declaresWait('Next I will land the fix and then check the docs page.'));
  assert.ok(!declaresWait('Nothing else I can do here - check again once you have the recording.'));
  assert.ok(!declaresWait('Done. Needs you: nothing. Next: the catalog sweep runs nightly, so worth a check again once it has.'));
  assert.ok(!declaresWait('The dashboard numbers look off; worth checking back later.'));
  assert.ok(!declaresWait(''));
  assert.ok(!declaresWait(null));
});

test('declaresWait catches every observer a session believes will wake it, not only "watcher"', () => {
  // The sentence below is the one that stalled a row twice on 2026-09-04, for about forty minutes
  // of that night's rehearsal. "watcher" was listed and its four ordinary synonyms were not.
  assert.ok(declaresWait("I'll wait for the monitor rather than polling."));
  assert.ok(declaresWait("I'll wait for the poller to report."));
  assert.ok(declaresWait('Waiting on the background task to finish.'));
  assert.ok(declaresWait('Holding until the tick picks it up.'));
  assert.ok(declaresWait('Waiting for the wave tick.'));
  assert.ok(declaresWait('Checking back in 20 minutes on the monitor.'));
});

test('declaresWait catches the observer handed the subject of the sentence', () => {
  // SC's exact last words on 2026-09-16 at 13:31:30Z. The row then sat with its handoff and
  // /queue-merge undone until a person happened to notice, which is the whole failure.
  assert.ok(
    declaresWait(
      'Nothing else can start before the build answers: the commit needs the green, `/check` needs the commit, the handoff needs `/check`\'s findings, and `/queue-merge` is last. The waiter will wake me when the exit line lands.',
    ),
  );
  assert.ok(declaresWait('The watcher will notify me when the shards finish.'));
  assert.ok(declaresWait('The background task I armed will ping me.'));
  assert.ok(declaresWait("The monitor I set up will tell me when it's done."));
});

test('the observer-as-subject shape does not fire on a person or on the hook\'s own words', () => {
  assert.ok(!declaresWait('The owner will tell me when he has looked at the picture.'));
  assert.ok(!declaresWait('You will tell me whether the palette is right; stopping here.'));
  // A row that takes the hook's advice quotes the hook's nouns back. It must still be able to stop.
  assert.ok(
    !declaresWait(
      'Noted: nothing can wake a stopped session, not a CI run, not a landing job, not a background watcher. So I stopped the background task, took what it was holding into the handoff, and queued.',
    ),
  );
  assert.ok(!declaresWait('The build is green, the handoff is written, and I am queueing now.'));
  assert.ok(!declaresWait('The waiter script is the one I would delete; it has no callers.'));
});

test('a sentence that takes the wait back is not a wait', () => {
  // This hook TELLS a row to stop its background task and take what it was holding into the
  // handoff. A row reporting exactly that writes the same clause and then cancels it, and these
  // three sentences all refused the review of this change on 2026-09-16 before the lookahead
  // existed. Refusing a row for complying is the expensive direction, three times over.
  assert.ok(!declaresWait('That monitor should alert me, but it cannot reach a stopped session, so I read the log myself.'));
  assert.ok(!declaresWait('The background task will ping me only after the branch lands, which is why I stopped it.'));
  assert.ok(!declaresWait('The notification I set up will tell me nothing useful, so I stopped it and read the run directly.'));
  assert.ok(!declaresWait('The watcher would have told me instead of my reading the run, so I killed it and read the run.'));
  // And the wait that means it still fires, cancelling clause or not elsewhere in the message.
  assert.ok(declaresWait('The build is committed. The waiter will wake me when the exit line lands.'));
});

test('declaresWait leaves a wait on a PERSON alone, even when it names a machine', () => {
  assert.ok(!declaresWait('Waiting for you to land the fix.'));
  assert.ok(!declaresWait('I will wait for your decision on the gate.'));
  assert.ok(!declaresWait('Waiting for you to run CI.'));
  assert.ok(!declaresWait("I'll continue when you confirm the gate is fine."));
  assert.ok(!declaresWait('I will resume once you have read the run.'));
  assert.ok(!declaresWait('Blocked: waiting for the owner to answer whether the landing may go ahead.'));
});

test('declaresWait reads prose, not quoted machine output', () => {
  // The queue's own sentence for a capped landing. Quoting it is reporting a wait, not declaring
  // one - and it fired on a session reviewing this file on 2026-09-04.
  const quoted = 'j-0545 says: `killed at its 45 min cap - probably still waiting on CI`. Handoff written, queued.';
  assert.ok(!declaresWait(quoted));
  assert.ok(!declaresWait('The log said:\n\n> Waiting for the CI run to finish.\n\nSo I re-queued it and stopped.'));
  assert.ok(!declaresWait('```\n- claude/a: killed at its 45 min cap - probably still waiting on CI\n```\nThat is the whole report.'));
  // And an unterminated fence swallows the rest rather than reopening the hole at the end.
  assert.ok(!declaresWait('Report:\n```\nwaiting for the CI run'));
  // The prose around a quote is still read.
  assert.ok(declaresWait('The log says `nothing`. I am waiting for the CI run before I queue.'));
});

test('declaresWait still fires when a person and a machine appear in the same message', () => {
  assert.ok(declaresWait('Needs you: nothing. Waiting for the CI run before I queue.'));
  assert.ok(declaresWait('I will wait for the landing job, then ask you about the palette.'));
});

test('finishedProperly recognises a branch already handed to the queue', () => {
  assert.ok(finishedProperly('Queued as j-0304; the queue lands it. Waiting for the landing is not needed.'));
  assert.ok(finishedProperly('/queue-merge ran as the last action and returned j-0299.'));
  assert.ok(!finishedProperly('Waiting for CI before I queue.'));
});

test('decide blocks a declared wait on an unqueued branch and nothing else', () => {
  const waiting = 'Pushed and waiting for the CI run to wake me before I queue.';
  assert.match(decide({ text: waiting, landingState: 'not-queued' }), /nothing can wake a stopped session/);
  assert.equal(decide({ text: waiting, landingState: 'queued' }), null);
  assert.equal(decide({ text: waiting, landingState: 'landed' }), null);
  assert.equal(decide({ text: 'All done, handoff written, queued as j-0310.', landingState: 'not-queued' }), null);
  assert.equal(decide({ text: 'Build green. Stopping here; nothing left.', landingState: null }), null);
});

test('decide refuses a SECOND wait from the same session, and runs out after the budget', () => {
  // Row SE was caught on its first wait and then ended its turn on a second one ninety-five seconds
  // later, which the old `stop_hook_active` bail made invisible. Every refusal up to the budget
  // fires; the budget is what guarantees a session can always end.
  const waiting = "I've kicked off a bounded background watcher that will notify me when it finishes.";
  for (let refusals = 0; refusals < MAX_REFUSALS; refusals += 1) {
    assert.match(decide({ text: waiting, refusals, landingState: 'not-queued' }), /nothing can wake a stopped session/);
  }
  assert.equal(decide({ text: waiting, refusals: MAX_REFUSALS, landingState: 'not-queued' }), null);
  assert.equal(decide({ text: waiting, refusals: MAX_REFUSALS + 7, landingState: 'not-queued' }), null);
  assert.ok(MAX_REFUSALS >= 2, 'a budget of one is the one-shot bug this replaced');
});

test('decide names the three things to do instead', () => {
  const message = decide({ text: 'Waiting on the run before queueing.', landingState: null });
  assert.match(message, /gh run view/);
  assert.match(message, /jobs\.mjs (log|wait)/);
  assert.match(message, /\/queue-merge as your LAST action/);
});

test('isCloudSession reads CLAUDE_CODE_REMOTE=true and nothing else', () => {
  assert.equal(isCloudSession({ CLAUDE_CODE_REMOTE: 'true' }), true);
  assert.equal(isCloudSession({}), false);
  assert.equal(isCloudSession({ CLAUDE_CODE_REMOTE: 'false' }), false);
  assert.equal(isCloudSession({ CLAUDE_CODE_REMOTE: '' }), false);
});

test('the hook refuses a wait on a laptop and lets a cloud session (CLAUDE_CODE_REMOTE=true) stop', () => {
  // The /plan-run coordinator on 2026-10-11 was refused three times while waiting on a pull request
  // it had a PR subscription and a `send_later` check-in armed for, and both woke it.
  const hook = fileURLToPath(new URL('./hooks/stop-wait.mjs', import.meta.url));
  const scratch = mkdtempSync(join(tmpdir(), 'stop-wait-'));
  try {
    const run = (remote, session) => {
      const env = { ...process.env };
      delete env.CLAUDE_CODE_REMOTE;
      if (remote) env.CLAUDE_CODE_REMOTE = remote;
      const event = {
        hook_event_name: 'Stop',
        session_id: session,
        scratchpad_dir: scratch,
        cwd: scratch, // not a git checkout, so the landing state reads as unknown
        stop_hook_active: false,
        last_assistant_message: 'Pushed and waiting for the CI run to wake me before I queue.',
      };
      return spawnSync(process.execPath, [hook], { input: JSON.stringify(event), env, encoding: 'utf8', windowsHide: true });
    };
    const laptop = run(null, 'laptop');
    assert.equal(laptop.status, 2, laptop.stderr);
    assert.match(laptop.stderr, /nothing can wake a stopped session/);
    const cloud = run('true', 'cloud');
    assert.equal(cloud.status, 0, cloud.stderr);
    assert.equal(cloud.stderr, '');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('lastAssistantText reads the newest assistant text out of a transcript tail', () => {
  const records = [
    JSON.stringify({ type: 'user', message: { content: 'go' } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'first answer' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'waiting for CI to wake me' }] } }),
  ];
  const tail = `{"type":"assistant","message":{"content":[{"type":"text","text":"cut off partial rec\n${records.join('\n')}\n`;
  const text = lastAssistantText('irrelevant', { readTail: () => tail });
  assert.equal(text, 'waiting for CI to wake me');
  assert.equal(lastAssistantText('irrelevant', { readTail: () => { throw new Error('gone'); } }), null);
  assert.equal(lastAssistantText('irrelevant', { readTail: () => '' }), null);
});
