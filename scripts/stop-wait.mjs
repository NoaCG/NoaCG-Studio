// THE STOP-ON-A-WAIT DECISION - the pure half of scripts/hooks/stop-wait.mjs, kept importable so
// the patterns can be tested without a hook event.
//
// THE FAILURE. A session finishes its work, pushes, and ends its turn saying it is waiting for a
// CI run, a landing job or a background watcher to wake it. Nothing can: a stopped session is
// woken by a person's message and by nothing else, so the "wait" is a session that has quietly
// ended with its branch unqueued. Three sessions did this on 2026-08-30 and one more on
// 2026-09-01, each with a prompt that already said "queue as your LAST action". The trap is that
// waiting looks like diligence from the inside, which is why the prompt line did not hold.
//
// THE MECHANISM. Claude Code runs a Stop hook when a turn ends, hands it the last assistant
// message, and treats exit 2 as "do not stop - here is why". So the check happens at the one
// moment the mistake is made, by reading the words the session chose. It fires only when the
// message DECLARES a wait on something that cannot wake it, and never when the session has already
// handed its branch to the queue - after `/queue-merge`, ending is exactly right.
//
// A WAVE ROW IS A SUBAGENT, and the delivery to one was measured on 2026-09-16 rather than assumed:
// the SubagentStop event carries `last_assistant_message` set to the ROW's own words (not the
// orchestrator's), exit 2 blocks that row's stop, and the row is handed another turn with this
// file's message in it. So the refusal reaches the row that made the mistake, and the two ways it
// can still miss are both in this file - a phrasing the patterns do not match, and the refusal
// budget below.
//
// A Stop hook was considered and rejected for the neighbouring "green but unqueued" shape, because
// that one fires at every turn end (docs/ORCHESTRATION_NEXT.md section 3, item 5). This hook is
// different: an ordinary turn end says nothing about waiting, so it stays silent on every mid-work
// pause, and `wave-tick.mjs` still covers the crashed session this cannot see.

// WHAT the session is waiting on, in two halves, because a session names either one.
//
// THE WORK is the thing that has to finish: a run, a landing, a queued job, the shards, the gate.
//
// THE OBSERVER is what the session believes will carry that finish back to it. This half is where
// the list failed on 2026-09-04: it named `watcher` and none of the ordinary synonyms for the same
// thing, so a row that wrote "I'll wait for the monitor rather than polling" was not caught, and
// stalled twice on that one sentence - about forty minutes of that night's rehearsal. A class with
// one member spelled out is a list, and a list of words loses to whichever word the session picks.
// So the observer is enumerated as a class: the watchers, the pollers, the ticks, the background
// tasks, and the notification or wake-up they are believed to deliver.
//
// Bare "poll" is deliberately absent - this product has poll graphics, and "waiting on the poll to
// render" is a wait on work a person is doing, not on an observer.
const THE_WORK =
  '\\bci\\b|the run\\b|(?:workflow|ci) run\\b|run \\d{6,}\\b|the landing\\b|\\bland(?:s|ed|ing)?\\b|merge job\\b|\\bjob j-\\d+|the queue\\b|the (?:merge|landing) queue\\b|the shards?\\b|the gate\\b';

// The observer NOUNS on their own, because the second shape below needs the thing and not the verb.
// `waiter` joined the list on 2026-09-16: row SC ended its turn on "The waiter will wake me when the
// exit line lands", and that one word was the whole reason nothing fired.
const THE_OBSERVER_NOUN =
  'waiter\\b|watcher\\b|monitor\\b|poller\\b|background (?:task|job|agent|run)\\b|\\btick\\b|notification\\b|wake-?up\\b';
const THE_OBSERVER = `${THE_OBSERVER_NOUN}|monitor(?:s|ing)\\b|polling\\b|wake(?:s|d)?\\b`;
const NOTHING_WAKES_YOU = `(?:${THE_WORK}|${THE_OBSERVER})`;

// A PERSON is the one thing that CAN wake a stopped session, so a wait whose object is the owner
// is a correct stop - the hook's own message ends by asking for exactly that. Without this the
// widened list argues with the sessions doing the right thing: "waiting for you to land the fix"
// fired on `land`, and "I will resume once you have read the run" on `the run`. The object of the
// wait, immediately after the preposition, is what decides it.
const NOT_A_PERSON = '(?!(?:you|your|the owner|a human|a person|someone|somebody)\\b)';

// A SENTENCE THAT CANCELS ITSELF is not a wait, and this hook's own advice is what makes that shape
// common: it tells a row to stop its background task and take what it was holding into the handoff,
// so a row that complied writes "the background task will ping me only after the branch lands, which
// is why I stopped it". Three sentences of exactly that shape refused the review of this change on
// 2026-09-16. Placed after the promise, it reads the rest of the SENTENCE for the clause that takes
// it back, which is why `[^.\n]` stops at the full stop rather than running into the next sentence.
const NOT_TAKEN_BACK = "(?![^.\\n]*\\b(?:but|instead|rather than|which is why|so i|anyway|cannot|can't|won't|nothing)\\b)";

export const WAIT_PATTERNS = Object.freeze([
  // "waiting for CI", "wait on the landing job", "holding until the run finishes"
  new RegExp(`\\b(?:wait(?:ing|s)?|await(?:ing)?|hold(?:ing)?)\\s+(?:for|on|until)\\s+${NOT_A_PERSON}[^.\\n]{0,100}?${NOTHING_WAKES_YOU}`, 'i'),
  // "I'll check back when the run completes", "will resume once CI is green"
  new RegExp(`\\b(?:will|i'll|i will|going to|plan to)\\s+(?:check|pick|resume|continue|come back|report|follow up|queue|write|finish)\\b[^.\\n]{0,80}?\\b(?:when|once|after|as soon as)\\s+${NOT_A_PERSON}[^.\\n]{0,60}?${NOTHING_WAKES_YOU}`, 'i'),
  // "a background watcher will wake me", "set up a monitor to notify me when it lands"
  new RegExp(
    `\\b(?:background|scheduled|set up an?|armed an?|started an?)\\s+(?:task|watcher|monitor|wakeup|poll(?:er)?|loop)\\b[^.\\n]{0,100}?\\b(?:wake|notify|resume|report back|ping|alert)${NOT_TAKEN_BACK}`,
    'i',
  ),
  // "checking back in 20 minutes on the shards" - the object is what separates a wait on a
  // machine from a wait on a person ("check again once you have the recording" is the latter)
  new RegExp(`\\b(?:check(?:ing)? back|checking in|check again)\\b[^.\\n]{0,60}?\\b(?:in \\d+ ?(?:min|minutes|hours?|h)\\b|later|shortly|when|once)\\b\\s*${NOT_A_PERSON}[^.\\n]{0,60}?${NOTHING_WAKES_YOU}`, 'i'),
  // THE OBSERVER AS SUBJECT: "the waiter will wake me", "the monitor I armed will ping me". The four
  // shapes above all read the session as the subject - it waits, it checks back, it sets something
  // up. Row SC wrote the opposite sentence on 2026-09-16, handing the subject to the machine: "The
  // waiter will wake me when the exit line lands." Nothing matched, nothing fired, and the row sat
  // there with its handoff and /queue-merge undone. The subject must be an observer noun, so a wait
  // on the one thing that CAN wake a session - "the owner will tell me" - is not this shape at all.
  //
  new RegExp(
    `\\b(?:the|an?|my|this|that)\\s+(?:${THE_OBSERVER_NOUN})[^.\\n]{0,30}?\\s+(?:will|should|is going to)\\s+(?:wake|notify|ping|alert|tell|nudge)\\s+me\\b${NOT_TAKEN_BACK}`,
    'i',
  ),
]);

/** The session already handed its branch to the queue, or said it is done - ending is correct. */
export const FINISHED_PATTERNS = Object.freeze([
  /\bqueued\b[^.\n]{0,40}\bj-\d+/i,
  /\bj-\d+\b[^.\n]{0,40}\bqueued\b/i,
  /\/queue-merge\b[^.\n]{0,60}\b(?:ran|done|complete|queued|last action|returned)/i,
  /\bnpm run queue:merge\b[^.\n]{0,60}\b(?:ran|done|queued|returned)/i,
  /\bbranch (?:is|was) (?:now )?queued\b/i,
]);

/**
 * The message with its QUOTED spans removed - fenced blocks, inline code, and blockquotes.
 *
 * A session that quotes machine output is not declaring a wait, it is reporting one. The queue's
 * own sentence for a capped landing is "killed at its 45 min cap - probably still waiting on CI",
 * so a handoff quoting a job log, a review quoting `giveUpReason`, and the night report added in
 * this same change all trip the patterns while saying nothing about what the session will do next.
 * It fired on a reviewer reading this very file on 2026-09-04.
 *
 * Only the unambiguous markers are stripped. A wait a session means is written in prose, and
 * treating every indented line as quoted would start losing the ones that matter.
 */
export function withoutQuotedSpans(text) {
  return String(text)
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

export function declaresWait(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const said = withoutQuotedSpans(text);
  return WAIT_PATTERNS.some((pattern) => pattern.test(said));
}

export function finishedProperly(text) {
  if (typeof text !== 'string') return false;
  return FINISHED_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * How many times one session may be refused before it is allowed to stop anyway.
 *
 * THE ONE-SHOT BUG, measured on 2026-09-16. The hook used to bail on `stop_hook_active`, the flag
 * Claude Code sets while a session is continuing BECAUSE a stop hook blocked it. The flag does not
 * clear when the session goes back to work: row SE was caught on its first wait at 15:31:11Z, ran
 * thirty more records over ninety-five seconds, ended its turn on a second wait at 15:32:46Z, and
 * that stop arrived with `stop_hook_active: true` - so the hook exited on its first line and said
 * nothing. Reproduced with a throwaway subagent the same afternoon: first stop `false` and blocked,
 * second stop `true` and silent. So the guard was a ONE-SHOT, and one nudge is not enough for a row
 * whose habit is to wait.
 *
 * A count replaces the flag, because the flag's real job is only to stop an infinite loop, and a
 * count does that job with a number instead of a cliff. Three is deliberate: the cost of one extra
 * refusal is one turn, and the cost of a row that never lands is the whole branch.
 */
export const MAX_REFUSALS = 3;

/**
 * How long a refusal stays counted. Without this the budget is three refusals per SESSION LIFETIME,
 * and the night orchestrator lives for hours - three waits spread over a night would leave the
 * guard off for every turn after them. A window makes the budget three refusals in a stretch, which
 * is what "do not loop" actually means; an endless loop burns all three inside a minute.
 */
export const REFUSAL_WINDOW_MS = 30 * 60 * 1000;

/**
 * The message the hook returns, or null when the stop is fine. `landingState` is the branch's
 * state from the job store (`queued`, `landed`, `not-queued`, ...): a queued or landed branch
 * needs no session awake for it, whatever the message says. `refusals` is how many times THIS
 * session has already been refused, so the guard always runs out rather than trapping a session
 * that cannot phrase itself out of the patterns.
 */
export function decide({ text, refusals = 0, landingState = null } = {}) {
  if (refusals >= MAX_REFUSALS) return null;
  if (!declaresWait(text)) return null;
  if (finishedProperly(text)) return null;
  if (landingState === 'queued' || landingState === 'landed') return null;
  return [
    'Your turn ends on a wait, and nothing can wake a stopped session - not a CI run, not a landing',
    'job, not a background watcher. The wait is a session that quietly ends with its branch unqueued',
    '(this happened to four sessions on 2026-08-30 and 2026-09-01). Do the rest now instead:',
    '  - a CI run: read it to a verdict - `gh run view <id> --json jobs`, and check WHICH jobs ran;',
    '  - a landing or queued job: read it - `node scripts/jobs.mjs log <id>`, or the bounded',
    '    `node scripts/jobs.mjs wait <id>` (30 minutes, then it tells you what to do);',
    '  - a background task: stop it, and put what it was holding in a backlog item or your report.',
    'Then run /queue-merge as your LAST action - or, if you are a helper agent with no branch of',
    'your own, report the state you found to the session that launched you. If you are genuinely',
    'blocked on a person, say so and stop without a wait.',
  ].join('\n');
}

/**
 * The last assistant text in a Claude Code transcript, read from its tail. Used only when the hook
 * event carries no `last_assistant_message` (a subagent stop). Anything unreadable answers null,
 * and null never blocks - a hook that cannot tell must not refuse.
 */
export function lastAssistantText(transcriptPath, { tailBytes = 256 * 1024, readTail } = {}) {
  try {
    const tail = readTail(transcriptPath, tailBytes);
    if (!tail) return null;
    const lines = tail.split('\n').filter((line) => line.trim().startsWith('{'));
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      let record;
      try {
        record = JSON.parse(lines[index]);
      } catch {
        continue; // the first line of a tail read is usually a partial record
      }
      if (record?.type !== 'assistant') continue;
      const content = record?.message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const texts = content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text);
        if (texts.length) return texts.join('\n');
      }
    }
    return null;
  } catch {
    return null;
  }
}
