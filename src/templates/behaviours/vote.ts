// THE LIVE VOTE, as a recipe: the room votes at the join link and the bars the designer drew
// move (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12 records the module this replaces).
//
// NOTHING HERE IS A FIELD THE OPERATOR TYPES. A quiz's answers are typed, so they are fields; a
// vote's question, options and figures come from the round the operator opened, so the artwork's
// layers are WRITE targets and gauges, and the content rides five recipe-owned fields whose
// TITLES are the join to the audience plane: `pollFieldMap` (ProductionAudienceWorkspace) finds a
// board by exactly these words, so they are a contract rather than copy. A layer the vote drives
// stops being an operator field (draftToOptions), and the mapping step says which.
//
// BARS MOVE ON DATA, NOT ON STATE. A vote landing is a write, and data never causes a transition,
// so the bars travel inside whatever state the board is in. Only Close voting, Show result and
// Call the winner are transitions; the TAKE opens the vote, so there is no Open vote button.
//
// EVERYTHING A CONTROLLER NEEDS IS IN A FIELD (docs/OGRAF_STATE_IN_FIELDS.md). Whether the vote
// is still open rides `Vote status` as a token - the runtime's `vote-status` kind obeys it, and
// falls back to the human count line only when the token is unstated; whether the figures run
// live while voting rides `Live figures`. A foreign controller that can only send data can put the
// board in either mode.

import { LIVE_POLL_CONTROLS, LIVE_POLL_MACHINE } from '../types/livePoll';
import type { TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe } from './recipe';
import { withRepaint } from './recipe';

/** The status field's title and vocabulary. Exported because the production dashboard writes
 *  this field and has to find it by title (`pollFieldMap` / `tallyValues`). An EMPTY value means
 *  "not stated" - what a board saved before this field existed reports. */
export const POLL_STATUS_TITLE = 'Vote status';
export const POLL_STATUS_OPEN = 'open';
export const POLL_STATUS_CLOSED = 'closed';

const POLL_STATUS_CHOICES = [
  { label: 'Not stated (follow the count line)', value: '' },
  { label: 'Voting open', value: POLL_STATUS_OPEN },
  { label: 'Voting closed', value: POLL_STATUS_CLOSED },
];

/** When the percentage figures appear (owner ruling, 2026-08-30): the RESULT's beat unless a
 *  production ticks the box, which rides this field as the one exact token. */
export const POLL_LIVE_TITLE = 'Live figures';
export const POLL_LIVE_ON = 'live';

const POLL_LIVE_CHOICES = [
  { label: 'Wait for Show result', value: '' },
  { label: 'Update live while voting', value: POLL_LIVE_ON },
];

/**
 * The live vote's arc, with one change to the catalog's: NO AUTOMATIC VOTING WINDOW. The catalog
 * board arms a 20-second timer as a safety net behind the presenter; on a board fed by a real
 * audience that timer is a hazard - votes arrive over minutes, and an arrow nobody drew would
 * close the vote under the operator. Closing is a repaint here rather than keyframes on a part we
 * did not draw; `compileControls` drops nothing, because every arrow survives.
 */
const VOTE_MACHINE: TypeMachine = withRepaint({
  main: {
    ...LIVE_POLL_MACHINE.main,
    branches: (LIVE_POLL_MACHINE.main?.branches ?? []).map((b) =>
      b.id === 'closed' ? { ...b, edges: b.edges.filter((e) => e.trigger !== 'timer') } : b,
    ),
  },
});

export const voteRecipe: BehaviourRecipe = {
  id: 'vote',
  name: 'Live vote',
  description: 'The audience votes at the join link; the bars you drew move, and the operator decides when the result shows.',
  category: 'poll',
  defaultZone: 'mid-center',
  rows: { role: 'option', keys: 'numbers', min: 2, max: 8 },
  roles: [
    { id: 'question', label: 'Question', kind: 'layer', paint: ['write'], words: /question|prompt|kysymys/i },
    { id: 'option', label: 'Option', kind: 'layer', paint: ['write'], perRow: true, required: true, words: /^(?:option|choice|answer|vaihtoehto)\b/i },
    // A BAR is what a vote board has and a quiz board does not, so it is the evidence.
    { id: 'bar', label: 'Bar', kind: 'layer', paint: ['gauge'], perRow: true, distinctive: true, words: /\bbar\b|palkki/i },
    // The figure is written AND waits for the result, so it is a readout and a look at once.
    { id: 'percent', label: 'Percent', kind: 'layer', paint: ['write', 'look'], perRow: true, words: /%|percent|share|osuus/i },
    { id: 'winner', label: 'Winner', kind: 'layer', paint: ['look'], perRow: true, words: /winner|voittaja/i },
    { id: 'total', label: 'Total votes', kind: 'layer', paint: ['write'], words: /total|votes|ääntä/i },
    { id: 'badge', label: 'Vote badge', kind: 'layer', paint: ['look'], words: /badge|vote now|äänestä/i },
  ],
  // THE FIVE FIELDS THAT ARE THE WIRE, in the order they were appended: a control's payload key
  // resolves by INDEX, so a field added LAST moves nothing already saved or exported.
  fields: () => [
    { key: 'voteQuestion', label: 'Question', kind: 'text', value: '' },
    // The options arrive as LINES - "Label | count", one per option - the same box a rehearsing
    // operator types into by hand and an audience round fills automatically.
    { key: 'options', label: 'Options', kind: 'lines', value: '', spec: { kind: 'share', rows: 'option' } },
    // A sentence a human reads, written into the designer's own total layer; localisable, so
    // nothing machine-readable may depend on its wording. The status below is the machine's half.
    { key: 'voteCount', label: 'Vote count', kind: 'text', value: '' },
    { key: 'voteStatus', label: POLL_STATUS_TITLE, kind: 'select', value: '', options: POLL_STATUS_CHOICES },
    { key: 'liveFigures', label: POLL_LIVE_TITLE, kind: 'select', value: '', options: POLL_LIVE_CHOICES, spec: { kind: 'select' } },
  ],
  // The result is a real STEP on the default path, so Continue on a bare playout server reaches
  // it; the entrance is the VOTING state, which is why the take opens the vote.
  path: () => ({ entrance: 'Voting', steps: [{ name: 'Result', duration: 0.45 }] }),
  machine: () => VOTE_MACHINE,
  controls: () => LIVE_POLL_CONTROLS,
  paint: () => [
    { write: 'question', from: 'voteQuestion:text' },
    { write: 'total', from: 'voteCount:text' },
    { write: 'option', rows: 'option', from: 'options:label' },
    { gauge: 'bar', rows: 'option', from: 'options:share' },
    { write: 'percent', rows: 'option', from: 'options:percent' },
    // Two rules for one look: the figures show with the result, OR while the vote runs when the
    // production asked for them live.
    { look: 'percent', rows: 'option', when: { state: ['main/result', 'main/called'] } },
    { look: 'percent', rows: 'option', when: { facts: ['liveFigures:is:live'] } },
    { look: 'winner', rows: 'option', when: { state: ['main/called'], facts: ['options:leader'] }, enter: 'pop' },
    // The badge says a vote is open, and EITHER source can end that: the machine's Close voting
    // (the state), or the status field saying closed (the fact).
    { look: 'badge', when: { state: ['main/voting'], facts: ['voteStatus:open'] } },
  ],
  artworkKinds: (ctx) => {
    const status = ctx.fieldId('voteStatus');
    const count = ctx.fieldId('voteCount');
    return status ? { [status]: { kind: 'vote-status', fallback: count ?? undefined } } : {};
  },
};
