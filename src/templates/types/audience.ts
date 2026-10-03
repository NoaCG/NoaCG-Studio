// THE AUDIENCE TYPES — five graphics that put what the audience sent on screen.
//
// Together they are the clearest demonstration in the registry of the rule the model is built
// on: *persist a machine only when the derived one is wrong.* Two of the five carry no machine
// at all, because a viewer-question card and a prayer request genuinely do nothing but come on
// and go off — inventing states for them would be modelling for its own sake. The other three
// carry one because they really do have beats an operator drives:
//
//   · the Q&A card    — the answer arrives on a second press (a real step on the walk)
//   · the chat strap  — it takes ITSELF off after a few seconds, unless the operator holds it
//   · the queue       — the live question moves up and down a list the moderator typed
//
// And what none of them has is a state per message, a state per platform, or a state per queue
// position. The message is data, the source is data, the queue index is data.

import { paletteById } from '../../model/wizard';
import { aq01, aq02, aq03, aq04 } from '../audience/viewerQuestion';
import { qa01, qa02, qa03, qa04 } from '../audience/qaCard';
import { ch01, ch02, ch03, ch04 } from '../audience/chatHighlight';
import { qq01, qq02, qq03, qq04 } from '../audience/questionQueue';
import { rq01, rq02, rq03, rq04 } from '../audience/communityRequest';
import {
  CHAT_FORM,
  QA_FORM,
  QUESTION_FORM,
  QUEUE_FORM,
  REQUEST_FORM,
} from '../audience/shared';
import type { GraphicType, TypeDesign, TypeField, TypeStructure } from './graphicType';

/** How long a chat highlight sits on air before taking itself off, in speed-relative seconds.
 *  A real `gsap.delayedCall` armed by the interpreter when the entrance settles — so the bench's
 *  timeScale and the render pipeline's virtual clock drive it, and a scrubbed or settled graphic
 *  never arms one. Editable on the arrow in the node editor. */
const CHAT_DWELL = 8;

/** The parts every audience graphic promises. `box` is the only universal one — the category is
 *  one contract worn five ways, so each type adds the parts its own form actually draws. */
function structure(extra: TypeStructure['parts']): TypeStructure {
  return {
    prefix: 'audience',
    category: 'audience',
    parts: [{ id: 'box', selector: '.audience-box', kind: 'panel', required: true }, ...extra],
  };
}

/** A form's declared lines compiled to type fields — one place, so a field the assembler emits
 *  and a field the control page renders can never fall out of step. */
function fieldsOf(lines: { title: string; sample: string; ftype?: string }[]): TypeField[] {
  return lines.map((line) => ({
    key: line.title.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (c) => c.toLowerCase()),
    label: line.title,
    kind: line.ftype === 'textarea' ? 'lines' : 'text',
    value: line.sample,
    role: 'line',
  }));
}

/** The four style families, in the catalog's usual order. */
function designs(
  entries: { id: string; name: string; family: TypeDesign['styleTag']; palette: string; fontId: string; blurb: string; create: TypeDesign['create'] }[],
): TypeDesign[] {
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.blurb,
    styleTag: e.family,
    palette: paletteById(e.palette),
    fontId: e.fontId,
    create: e.create,
  }));
}

// ── Viewer question ──────────────────────────────────────────────────────────

/** VIEWER QUESTION — one question on screen, with who asked it and where it came from.
 *
 *  NO MACHINE, on purpose. It comes on, it goes off; the derived one-group linear machine is
 *  already exactly right, so this type persists nothing and emits byte-identical output to a
 *  template with no `machine` key at all. */
export const viewerQuestionType: GraphicType = {
  id: 'viewer-question',
  name: 'Viewer question',
  description: 'One audience question on screen, with who asked it and where it came from.',
  structure: structure([
    { id: 'kicker', selector: '.audience-kicker', kind: 'block', required: true },
    { id: 'question', selector: '#f1', kind: 'line', required: true },
    { id: 'byline', selector: '.audience-by', kind: 'block', required: true },
  ]),
  fields: fieldsOf(QUESTION_FORM.lines),
  machine: {},
  controls: [],
  capabilities: {
    maxLines: QUESTION_FORM.lines.length,
    logo: 'none',
    animationPresets: ['audience-rise', 'audience-slide'],
    defaultZone: 'bottom-left',
  },
  designs: designs([
    { id: 'aq01', name: 'House Question', family: 'noacg', palette: 'noacg', fontId: 'space-grotesk', blurb: 'The house viewer-question card: a void panel with an amber edge, a mono label, and the asker under the question.', create: (_t, o) => aq01.create(o) },
    { id: 'aq02', name: 'Volt Question', family: 'sport', palette: 'volt', fontId: 'oswald', blurb: 'A leaning sport slab: a filled accent label over the question in condensed caps, with the asker beneath.', create: (_t, o) => aq02.create(o) },
    { id: 'aq03', name: 'Frost Question', family: 'glass', palette: 'frost', fontId: 'manrope', blurb: 'A frosted card with a soft pill label, a hanging quote mark, and the asker under the question.', create: (_t, o) => aq03.create(o) },
    { id: 'aq04', name: 'Clean Question', family: 'minimal', palette: 'ivory', fontId: 'inter', blurb: 'A quiet card: a small accent label, a hanging quote mark, and the asker in a hairline-quiet byline.', create: (_t, o) => aq04.create(o) },
  ]),
};

// ── Q&A card ─────────────────────────────────────────────────────────────────

/** Q&A CARD — the question now, the answer on Continue. The answer is a real WAYPOINT on the
 *  default path, not a branch, which is why `next()` alone drives the whole card in a playout
 *  server that has never heard of a control page. */
export const qaCardType: GraphicType = {
  id: 'qa-card',
  name: 'Q&A card',
  description: 'A question on screen, and the answer revealed when the speaker has given it.',
  structure: structure([
    { id: 'question', selector: '#f1', kind: 'line', required: true },
    { id: 'answer', selector: '.audience-answer', kind: 'block', required: true },
    { id: 'byline', selector: '.audience-by', kind: 'block', required: true },
  ]),
  fields: fieldsOf(QA_FORM.lines),
  machine: {
    // The walk is question -> answer -> out. Renaming the first arrow is the whole machine:
    // there are no branches, because there is nothing here an operator can do out of order.
    main: { pathEvents: ['answer'] },
  },
  controls: [{ event: 'answer', label: 'Show answer', section: 'Q&A', order: 1 }],
  capabilities: {
    maxLines: QA_FORM.lines.length,
    logo: 'none',
    animationPresets: ['audience-rise', 'audience-slide'],
    defaultZone: 'mid-center',
  },
  designs: designs([
    { id: 'qa01', name: 'House Q&A', family: 'noacg', palette: 'noacg', fontId: 'space-grotesk', blurb: 'The house Q&A card: a void panel with an amber edge, the question above, the answer revealed on Continue.', create: (_t, o) => qa01.create(o) },
    { id: 'qa02', name: 'Volt Q&A', family: 'sport', palette: 'volt', fontId: 'oswald', blurb: 'A leaning sport slab: the question in condensed caps, the answer arriving behind a solid accent edge.', create: (_t, o) => qa02.create(o) },
    { id: 'qa03', name: 'Frost Q&A', family: 'glass', palette: 'frost', fontId: 'manrope', blurb: 'A frosted card: the question above, the answer landing in its own softly-rounded glass block.', create: (_t, o) => qa03.create(o) },
    { id: 'qa04', name: 'Clean Q&A', family: 'minimal', palette: 'ivory', fontId: 'inter', blurb: 'A quiet card: the question over a dim keyline, with the answer arriving beneath it on Continue.', create: (_t, o) => qa04.create(o) },
  ]),
};

// ── Chat highlight ───────────────────────────────────────────────────────────

/** CHAT HIGHLIGHT — a comment that takes ITSELF off air.
 *
 *  The auto-dismiss is a genuine `timer` transition from the on-air waypoint to the exit, so
 *  the strap behaves the way a chat overlay is expected to: it appears, it is readable, it goes.
 *  Holding it is a POSE state — entering it cancels the armed timer and nothing re-arms one,
 *  which is the whole implementation. The ticker's `paused` state works exactly this way. */
export const chatHighlightType: GraphicType = {
  id: 'chat-highlight',
  name: 'Chat highlight',
  description: 'A comment from the chat, on screen and gone again — held if the operator wants it.',
  structure: structure([
    { id: 'byline', selector: '.audience-by', kind: 'block', required: true },
    { id: 'comment', selector: '#f2', kind: 'line', required: true },
  ]),
  fields: fieldsOf(CHAT_FORM.lines),
  machine: {
    main: {
      edges: [
        // The dwell: armed when the entrance settles, cancelled the moment the strap leaves
        // this state by any other arrow.
        { from: { waypoint: 0 }, to: { waypoint: -1 }, trigger: 'timer', after: CHAT_DWELL },
        // …and the operator's own "take it now", which is the same arrow drawn by hand.
        { from: { waypoint: 0 }, to: { waypoint: -1 }, trigger: 'operator', event: 'dismiss' },
      ],
      branches: [
        {
          id: 'held',
          name: 'Held on air',
          // Pose-only: entering it plays nothing. Holding IS entering it — the machine cancels
          // the armed dwell on the way out of the on-air state, and nothing re-arms it.
          timeline: null,
          edges: [
            { from: { waypoint: 0 }, to: 'held', trigger: 'operator', event: 'hold' },
            { from: 'held', to: { waypoint: -1 }, trigger: 'operator', event: 'dismiss' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'hold', label: 'Hold on air', section: 'Comment', order: 1 },
    { event: 'dismiss', label: 'Take it off', section: 'Comment', order: 2 },
  ],
  capabilities: {
    maxLines: CHAT_FORM.lines.length,
    logo: 'none',
    animationPresets: ['audience-slide', 'audience-rise'],
    defaultZone: 'bottom-left',
  },
  designs: designs([
    { id: 'ch01', name: 'House Comment', family: 'noacg', palette: 'noacg', fontId: 'space-grotesk', blurb: 'The house chat strap: a void panel with an amber edge, the handle and source above the comment.', create: (_t, o) => ch01.create(o) },
    { id: 'ch02', name: 'Volt Comment', family: 'sport', palette: 'volt', fontId: 'oswald', blurb: 'A leaning sport strap: the handle and source in caps above the comment, with an accent edge.', create: (_t, o) => ch02.create(o) },
    { id: 'ch03', name: 'Frost Comment', family: 'glass', palette: 'frost', fontId: 'manrope', blurb: 'A frosted chat strap: the handle and source above a soft, readable comment.', create: (_t, o) => ch03.create(o) },
    { id: 'ch04', name: 'Clean Comment', family: 'minimal', palette: 'ivory', fontId: 'inter', blurb: 'A quiet chat strap: the handle and source in a hairline byline above the comment.', create: (_t, o) => ch04.create(o) },
  ]),
};

// ── Question queue ───────────────────────────────────────────────────────────

/** QUESTION QUEUE — the moderator's running order, with one question live.
 *
 *  Two branch states, one per DIRECTION, because the two do different things when entered. Not
 *  one state per question: which row is live is an index in runtime data, so a twelve-question
 *  queue and a two-question one have exactly these two states. */
export const questionQueueType: GraphicType = {
  id: 'question-queue',
  name: 'Question queue',
  description: 'The pending questions, with the one being answered marked live.',
  structure: structure([
    { id: 'heading', selector: '.audience-kicker', kind: 'block', required: true },
    { id: 'queue', selector: '#audience-queue', kind: 'block', required: true },
  ]),
  fields: fieldsOf(QUEUE_FORM.lines),
  machine: {
    main: {
      branches: [
        {
          id: 'forward',
          name: 'Next question',
          timeline: {
            name: 'Next',
            duration: 0.3,
            ease: 'in',
            calls: [{ time: 0, call: 'audienceQueueNext' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'forward', trigger: 'operator', event: 'advance' },
            // A self-transition replays the state, which is how "next, next, next" walks the
            // list without a state per row.
            { from: 'forward', to: 'forward', trigger: 'operator', event: 'advance' },
            { from: 'back', to: 'forward', trigger: 'operator', event: 'advance' },
          ],
        },
        {
          id: 'back',
          name: 'Previous question',
          timeline: {
            name: 'Back',
            duration: 0.3,
            ease: 'in',
            calls: [{ time: 0, call: 'audienceQueuePrev' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'back', trigger: 'operator', event: 'rewind' },
            { from: 'forward', to: 'back', trigger: 'operator', event: 'rewind' },
            { from: 'back', to: 'back', trigger: 'operator', event: 'rewind' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'advance', label: 'Next question', section: 'Queue', order: 1 },
    { event: 'rewind', label: 'Previous', section: 'Queue', order: 2 },
  ],
  capabilities: {
    maxLines: QUEUE_FORM.lines.length,
    logo: 'none',
    animationPresets: ['audience-rise', 'audience-slide'],
    defaultZone: 'mid-right',
  },
  designs: designs([
    { id: 'qq01', name: 'House Queue', family: 'noacg', palette: 'noacg', fontId: 'space-grotesk', blurb: 'The house question queue: a void panel with an amber edge marking the question being answered now.', create: (_t, o) => qq01.create(o) },
    { id: 'qq02', name: 'Volt Queue', family: 'sport', palette: 'volt', fontId: 'oswald', blurb: 'A leaning sport running order: condensed caps questions with a solid accent edge on the live one.', create: (_t, o) => qq02.create(o) },
    { id: 'qq03', name: 'Frost Queue', family: 'glass', palette: 'frost', fontId: 'manrope', blurb: 'A frosted question queue: soft rows with an accent dot against the one being answered.', create: (_t, o) => qq03.create(o) },
    { id: 'qq04', name: 'Clean Queue', family: 'minimal', palette: 'ivory', fontId: 'inter', blurb: 'A quiet question queue: hairline-quiet rows with an accent dot against the live one.', create: (_t, o) => qq04.create(o) },
  ]),
};

// ── Community request ────────────────────────────────────────────────────────

/** COMMUNITY REQUEST — a prayer or community request, with who sent it and from where.
 *
 *  NO MACHINE, for the same reason the viewer question has none. It is a different GRAPHIC from
 *  the question card — different fields, different meaning, a different control page — but its
 *  behaviour on air is genuinely the same two beats, and the derived machine already says so. */
export const communityRequestType: GraphicType = {
  id: 'community-request',
  name: 'Community request',
  description: 'A prayer or community request, with who sent it and where from.',
  structure: structure([
    { id: 'kicker', selector: '.audience-kicker', kind: 'block', required: true },
    { id: 'request', selector: '#f1', kind: 'line', required: true },
    { id: 'byline', selector: '.audience-by', kind: 'block', required: true },
  ]),
  fields: fieldsOf(REQUEST_FORM.lines),
  machine: {},
  controls: [],
  capabilities: {
    maxLines: REQUEST_FORM.lines.length,
    logo: 'none',
    animationPresets: ['audience-rise', 'audience-slide'],
    defaultZone: 'bottom-left',
  },
  designs: designs([
    { id: 'rq01', name: 'House Request', family: 'noacg', palette: 'noacg', fontId: 'space-grotesk', blurb: 'The house request card: a void panel with an amber edge, the request, and who sent it.', create: (_t, o) => rq01.create(o) },
    { id: 'rq02', name: 'Volt Request', family: 'sport', palette: 'volt', fontId: 'oswald', blurb: 'A bold leaning request card for high-contrast community brands, with an accent label and edge.', create: (_t, o) => rq02.create(o) },
    { id: 'rq03', name: 'Frost Request', family: 'glass', palette: 'frost', fontId: 'manrope', blurb: 'A frosted request card: a soft pill label over a generously led request, with the sender beneath.', create: (_t, o) => rq03.create(o) },
    { id: 'rq04', name: 'Clean Request', family: 'minimal', palette: 'ivory', fontId: 'inter', blurb: 'A quiet request card: a small accent label, a calmly led request, and the sender and place beneath.', create: (_t, o) => rq04.create(o) },
  ]),
};
