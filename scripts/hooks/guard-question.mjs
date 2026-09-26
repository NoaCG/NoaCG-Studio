// PreToolUse guard for AskUserQuestion. A question to the owner is one of three kinds
// (the retired owner rulings, owner-decisions-2026-09-25):
//
//   1. OPERATIONAL - branch order, sequencing, whether necessary work gets done, a fact the repo
//      can answer. Never asked: the agent decides and keeps working.
//   2. OWNER-LEVEL - intent, product direction, UX or taste, scope, money: his choice changes the
//      result. Asked BEFORE building, Grill-Me style: one question per call, a recommended answer,
//      and a better alternative when there is one.
//   3. Anything inside an orchestrator or night wave. Never asked: nobody is there to answer.
//
// A hook cannot tell kind 1 from kind 2 by reading the words, so the question declares its kind
// with one tag, `needs: decision`: the agent has classified it as something only the owner
// should decide. Writing the tag is the check; an untagged question is refused with the rule so
// the agent sorts it first. (The older reasons - account, money, identity, harness, alignment -
// are all decisions only he can make, so the one tag covers them.) Kind 3 is refused
// outright when the harness says the call comes from a wave-row subagent.
//
// It refuses rather than warns because a PreToolUse warning reaches the user and never the model
// (scripts/hooks/lib.mjs). FAILS OPEN on input it cannot read. Nothing is exported: a hook reads
// stdin at module top level, so guard-question.test.mjs spawns this file with real event JSON.

import * as rules from '../rules.mjs';
import { deny, readHookInput } from './lib.mjs';

const TAG = /\bneeds:\s*decision\b/i;
const RULE = rules.text('root/question-owner-names-reason-own-text');

const input = await readHookInput();
if (!input || input.tool_name !== 'AskUserQuestion') process.exit(0);

const questions = Array.isArray(input.tool_input?.questions) ? input.tool_input.questions : [];
if (questions.length === 0) process.exit(0);

if (/^wave-row/.test(String(input.agent_type ?? ''))) {
  deny([
    'STOP - a wave asks nothing. Nobody is there to answer.',
    '',
    RULE,
  ].join('\n'));
}

if (questions.length > 1) {
  deny([
    `STOP - ${questions.length} questions in one call. Ask ONE, with your recommendation, and let the answer shape the next.`,
    '',
    RULE,
  ].join('\n'));
}

const [question] = questions;
const text = `${question?.header ?? ''} ${question?.question ?? ''}`;
if (!TAG.test(text)) {
  deny([
    'STOP - is this the owner\'s question? Sort it first:',
    `  ? ${String(question?.question ?? '').slice(0, 140)}`,
    '',
    RULE,
    '',
    'If it is his, put `needs: decision` in the question text and ask again.',
  ].join('\n'));
}

const options = Array.isArray(question?.options) ? question.options : [];
if (!options.some((o) => /\(recommended\)/i.test(String(o?.label ?? '')))) {
  deny([
    'STOP - no recommended answer. Put your recommendation first, its label ending in',
    '`(Recommended)`, and say in its description why. Offer a better alternative if you see one.',
  ].join('\n'));
}
