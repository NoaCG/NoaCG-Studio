// The audience catalog: the graphics that put the AUDIENCE on screen — the viewer question, the
// Q&A card, the chat highlight, the moderator's question queue, and the community or prayer
// request. Family-consistent with the rest of the package (docs/DESIGN_LANGUAGE.md §8).
//
// Twenty-two designs: five forms in four style families each, the one Join card and the one word
// cloud. Every one of them is fully usable by
// hand: an operator types the message, the name and the source into ordinary SPX fields. No
// chat integration exists, and none is assumed.

import type { TemplateVariant } from '../../model/wizard';
import { aq01, aq02, aq03, aq04 } from './viewerQuestion';
import { qa01, qa02, qa03, qa04 } from './qaCard';
import { ch01, ch02, ch03, ch04 } from './chatHighlight';
import { qq01, qq02, qq03, qq04 } from './questionQueue';
import { rq01, rq02, rq03, rq04 } from './communityRequest';
import { jc01 } from './joinCard';
import { wc01 } from './wordCloud';

export const AUDIENCE: TemplateVariant[] = [
  // Viewer questions — the workhorse.
  aq01, aq02, aq03, aq04,
  // Q&A cards — the question now, the answer on Continue.
  qa01, qa02, qa03, qa04,
  // Chat highlights — a comment, self-dismissing unless held.
  ch01, ch02, ch03, ch04,
  // Question queues — the moderator's running order.
  qq01, qq02, qq03, qq04,
  // Community and prayer requests.
  rq01, rq02, rq03, rq04,
  // The Join card: how viewers join, a QR code drawn from the production's link.
  jc01,
  // The word cloud: a Word question's words, sized by how many sent each.
  wc01,
];

export function audienceById(id: string): TemplateVariant | undefined {
  return AUDIENCE.find((v) => v.id === id);
}
