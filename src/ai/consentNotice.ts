// The AI external-provider disclosure notice (docs/AI_PLATFORM_PLAN.md §9, ratified
// decision 2). Dependency-light on purpose: both the browser tree and the API tree
// import it, so the version string and the wording can never drift between the dialog
// the user accepts and the record the server stores.
//
// Bumping AI_NOTICE_VERSION forces renewed acceptance everywhere (client-side for
// anonymous users, server-side for signed-in users) - bump it whenever the wording
// changes in a way the user must re-read.

export const AI_NOTICE_VERSION = 'ai-disclosure-v1';

export const AI_NOTICE_TITLE = 'Before you use AI features';

/** The ratified wording - rendered verbatim by the consent dialog. */
export const AI_NOTICE_LINES: readonly string[] = [
  'Your prompts and any uploaded images may be sent to an external AI provider to generate the result.',
  'Do not upload sensitive or confidential material.',
  'NoaCG prefers zero-data-retention routes where available, but cannot guarantee identical retention or training policies across providers - "open model" does not mean "private".',
];

export const AI_NOTICE_ACCEPT_LABEL = 'I understand - continue';
export const AI_NOTICE_DECLINE_LABEL = 'Not now';

// Shown where a user asks AI to prepare an imported SVG, beside the request itself. The notice
// above covers sending content to a provider; this says exactly what this request sends. The
// text goes only when the box is ticked, and the box starts unticked.
export const AI_SVG_DISCLOSURE = 'AI sees the layer names, positions and text lengths of this graphic.';
export const AI_SVG_INCLUDE_TEXT_LABEL = 'Also send the text';
