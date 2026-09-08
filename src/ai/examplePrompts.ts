// Curated example briefs for the Describe-it step. Two jobs: show the RANGE (most of
// these have no starting template in the catalog) and teach what a good brief looks like:
// what it is, what the operator fills in, and how it should feel.

export interface ExamplePrompt {
  label: string;
  prompt: string;
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    label: 'Election results',
    prompt:
      'Election results panel: three candidates as horizontal bars that grow to their percentage ' +
      'on play. Fields: three candidate names, three party names, three percentages. Bars in party ' +
      'colors from the accent, counted-up numbers at the bar ends. Serious, newsroom-clean, ' +
      'bottom-center.',
  },
  {
    label: 'Weather now',
    prompt:
      'A "weather now" side panel: big temperature, a condition line ("Partly cloudy"), wind and ' +
      'humidity as small rows, and the city name as a caps kicker on top. Fields for all values. ' +
      'Calm and airy, mid-right, gentle slide-in.',
  },
  {
    label: 'Race timing tower',
    prompt:
      'A motorsport timing tower, top-left: positions 1–5 as compact rows (position number on an ' +
      'accent chip, driver three-letter code, gap time). One textarea field, one line per driver ' +
      '"VER +0.000". Rows cascade in quickly on play. Condensed, high-contrast, sport energy.',
  },
  {
    label: 'Breaking news stinger',
    prompt:
      'A full-width BREAKING NEWS stinger: a red band slams in across the lower third with the ' +
      'word BREAKING, then a headline field slides up under it. Urgent but controlled - fast ' +
      'snap in, no bounce. Fields: label (default BREAKING) and headline.',
  },
  {
    label: 'Recipe card',
    prompt:
      'A cooking-show ingredient card, mid-left: dish name as heading, then a textarea of ' +
      'ingredients (one per line) rendered as a tidy checklist with accent bullets. Warm, ' +
      'friendly, soft corners; ingredients cascade in one by one.',
  },
  {
    label: 'Donation counter',
    prompt:
      'A charity telethon total counter, bottom-center: a big euro amount that counts up to the ' +
      'field value on every update while on air, with a small "TOTAL RAISED" kicker and a ' +
      'progress bar toward a goal field. Celebratory but tasteful.',
  },
  {
    label: 'Karaoke line',
    prompt:
      'A karaoke-style lyric line, bottom-center: one field with the current line, one with the ' +
      'next line smaller and dimmed below it. The current line wipes to the accent color left to ' +
      'right over 4 seconds after play. Playful, rounded, high readability.',
  },
  {
    label: 'Versus card',
    prompt:
      'A fullscreen match-up card: two team names and logos (image fields) facing off around a ' +
      'big VS, with a small event/date line underneath. Both sides slide in from their edges and ' +
      'meet in the middle. Dark arena mood, sharp accents.',
  },
];

// ── The managed tiers' banks ─────────────────────────────────────────────────────────────────
//
// THE TIER PROMISES (recorded in docs/GOALS.md and src/ai/AGENTS.md - change them there first):
//
//   LITE: a proven catalog design, carrying your brand and your words - reliably, every time.
//   PRO:  an on-air look designed for your channel - a palette, type voice, accent form and
//         motion character no shipped design carries - rendered by the platform, so the layout
//         is always sound.
//
// The two banks below hold the same standard as EXAMPLE_PROMPTS above - what it is, what the
// operator fills in, how it should look and move, where it sits - because a brief that does not
// describe a look cannot produce one. They differ where the tiers differ:
//
//   - Every LITE brief has a catalog starting point (a lower third the retrieval can anchor
//     on), because Lite ADAPTS a proven design and never invents a layout. Lite briefs name NO
//     colours and NO zone: a model-invented palette is dropped by design (colour belongs to the
//     brand input - `ai/assemble-catalog-fit-values-through-clamp`) and placement follows the
//     chassis,
//     so a colour or position word here is a promise the render will break - measured, not
//     assumed (the first draft asked for a navy panel and got the house dark). And a Lite
//     brief states its two lines as an explicit STACK ("name over a smaller role line", "tag
//     with the team line under it"): in the same test, every brief that listed its fields
//     abstractly ("name and department") lost the second line to a one-line chassis.
//   - Every PRO brief asks for a LOOK no shipped design carries - the general bank's
//     "no starting point" property moved into the dimension Pro actually owns. Pro's model
//     decides the design language (palette, type, accent, density, motion); the platform owns
//     structure, so a Pro brief that asked for a novel STRUCTURE would read well and render as
//     something else - the exact defect example briefs must not teach.
//
// Both banks were generated and read as frames before landing (2026-08-15); a brief that reads
// well and renders badly does not belong here.

export const LITE_EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    label: 'News reporter',
    prompt:
      'A public-news lower third for a reporter’s name and role. Dark editorial panel with ' +
      'one thin accent rule on the leading edge, a strong name over a smaller tracked caps ' +
      'role line, generous side padding. Calm slide-in, no bounce.',
  },
  {
    label: 'University lecture',
    prompt:
      'A university lecture lower third for a speaker’s name with their academic role in a ' +
      'smaller line under it. Clean quiet panel, roomy spacing, nothing decorative. Gentle ' +
      'rise, settles quickly.',
  },
  {
    label: 'Esports player',
    prompt:
      'An esports lower third for a player tag and team. Near-black panel with one electric ' +
      'accent edge, sharp hierarchy - condensed caps tag with the team line under it - tight ' +
      'spacing. Fast snap in, no wobble.',
  },
  {
    label: 'Documentary subject',
    prompt:
      'A documentary lower third for an interview subject’s name and location. Barely-there ' +
      'translucent strip, small tracked caps for the location, light text over the shot. Sits ' +
      'low and quiet, slow fade in and out.',
  },
];

// PRO BRIEFS DESCRIBE THE SHOW'S LOOK, not one graphic: a Pro generation buys a design LANGUAGE
// and the platform composes the whole package in it, so a brief that asks for "a lower third"
// describes a tenth of what the user gets. Each still speaks the language contract's own
// dimensions (palette, accent form, type voice, corner, density, motion character), which is the
// PRO_EXAMPLE rule the section header above states.
export const PRO_EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    label: 'Late-night arts',
    prompt:
      'The on-air look for a late-night arts show, with guest straps naming the guest and their ' +
      'work. Deep plum, warm gold underline accent, serif bold headings against airy tracked ' +
      'caps, soft corners, an unhurried reveal that follows the reading order.',
  },
  {
    label: 'Esports channel',
    prompt:
      'The on-air look for a youth esports channel: player tags, an on-air mark, a match ' +
      'countdown. Acid green on near-black, a heavy accent block behind supporting lines, ' +
      'black-weight condensed caps, tight tracking, compact spacing, fast snap.',
  },
  {
    label: 'Morning community',
    prompt:
      'The on-air look for a community morning show: host straps and segment graphics. Warm ' +
      'cream panels, terracotta bar on the leading edge, deep brown text, rounded corners, airy ' +
      'spacing, a gentle glide in.',
  },
  {
    label: 'Markets desk',
    prompt:
      'The on-air look for an evening markets desk: analyst straps and the countdown to the ' +
      'open. Ink-dark translucent panels, steel-blue hairline rule across the top, medium-weight ' +
      'headings with wide-tracked caps, compact density, a measured fade.',
  },
];
