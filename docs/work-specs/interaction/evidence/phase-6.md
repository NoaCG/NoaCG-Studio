# Phase 6 evidence: Word questions

Spec: `docs/work-specs/interaction/spec.md`, phase 6 (AC-14, AC-15 repeated). Base:
`7c16e66a89942d7020d19004603d091a56e4f635`. Rules W1 to W9 are in the spec's phase 6 notes.

| Criterion | Changed behaviour | Proof |
| --- | --- | --- |
| AC-14 | "+ Question" offers Word. Live, a phone sends one word of at most 25 characters, once; Interaction lists the words by frequency with Hide; "Add word cloud to rundown" writes a snapshot of the shown words onto one word cloud cue (House Word Cloud, `wc01`, new); hidden words never reach it; it airs only through Take. Migration 0114 holds the server half. | `scripts/word-cloud.test.mjs` (13 tests); journey `e2e/production-audience.spec.ts` "a Word question takes one word per phone ..."; blank page `e2e/audience-pack.spec.ts` "the word cloud draws its Words by count ..."; 0114's self-check run on the local stack |
| AC-15 | The walk's third question is a Word question: a phone sends a word, a second phone's word is hidden, the word cloud airs through Take with the shown word only, then Stop. | Rehearsal walk below |

## AC-14

Node (`scripts/word-cloud.test.mjs`, written from the Rules):

- W2: trimmed; 25 characters taken, 26 refused, counted in characters (25 emoji pass); empty,
  spaces, a tab, a line break and `|` refused.
- W1: by frequency, case does not split a word, the most used spelling shows, ties alphabetical.
- W6: a hidden word stays listed and is never in the cue's Words; at most 30 words, the most sent.
- The question model: Word is made, read back with its hidden words (junk dropped), put live as a
  word; hiding is not locked; Duplicate starts with none.
- Local provider (R15 for words): one word per phone, a second refused; two words, 26 characters
  and `|` refused; filed under its round with the phone's own view naming the round (W5); a word
  to a stopped question refused as closed and filed nowhere; going live again continues the same
  result; Clear results removes the words; Simulate files one word per simulated phone.
- Staging (W7, W8): a word cloud takes Question and Words and is neither a vote board nor a
  message destination; the first press asks, a pick adds one cue and is remembered as
  `wordTarget` (not `resultTarget`); a second press updates the same cue with a new snapshot
  without the hidden word; a deleted cue gets a new one with a note; a refused write records
  nothing; the staging modules import nothing that sends.
- Mutations: letting hidden words into `wordLines` fails two tests; dropping the one-word-per-phone
  check in the local provider fails one.

Server: 0114's self-check (a throwaway production walked through a Word question) was run with
`psql` on the local stack with a throwaway `auth.users` row (it skips on a stack with no account):
a word trimmed and filed with no name; a second word from one phone refused as "you have already
sent your word"; two words, 26 characters and `a|b` refused; 25 characters taken; the join resolve
gives the phone's own word its round; 30 words in a burst taken past the message throttle; an Open
question going live then takes a message at once; the closed Word round refuses as closed; an Open
question still takes a sentence; Clear results removes the words. 0111's and 0113's self-checks
were run again on the same stack and pass.

Journey (offline, local provider, rehearsal phone): a Word question; the phone refuses two words
and 26 characters before sending, sends " Brilliant ", then shows the word instead of the box,
also after a reload; Simulate words; the list reads Exciting 2, Brilliant, Loud, Tense; no word is
in the inbox; Loud hidden; Add word cloud to rundown asks, House Word Cloud is added with one cue
carrying `Exciting | 2`, `Brilliant | 1`, `Tense | 1`; the action log gains no row; Take airs
exactly those three words; a second press after more words updates the same cue; Stop and the
press add no row and leave Program as it was; Update airs the new snapshot.

Graphic (blank page): the fields are Label, Question, Words; ordinary words all drawn, more-sent
never smaller, the most-sent in the accent, all inside the cloud's box and the box inside the
frame; the worst case Interaction can send (30 words of 25 characters, the widest letters) stays
inside the box with no word under 34 px and the drawn words the most-sent ones; empty Words draws
no cloud. Catalog gates scoped to `wc01`: emit (only the new row recorded in
`e2e/catalog-baseline.json`), type floor, overflow sweep (no baseline row needed), field coverage,
numerals and the factory gates pass. The catalog layer count in `e2e/editor-transforms.spec.ts`
grows by the word cloud's one layer, as it did for the Join card.

## Rehearsal walk (AC-15, phase 6)

`e2e/configured/audience-live.spec.ts` "the rehearsal walk" now makes its third question a Word
question. On a local Supabase stack (CLI 2.111.0, all 114 migrations applied from scratch): the
phone joins by the link decoded from the studio's QR, answers the Open question, votes, chat adds
votes, the vote airs on Result Donut Lower through Take; then the Word question goes live, the
phone sends "Sparkling" and shows it in place of the box, a second phone (its own device) sends
"Boring", Interaction lists both, Boring is hidden, Add word cloud to rundown adds House Word Cloud
with one word, Program still shows only the cloud's off-air sample, Take airs exactly
["Sparkling"], and Stop leaves phones the waiting text. Passed (queue job j-0015, 47 s; again after each review fix below: j-0018, j-0021, j-0023, j-0025, j-0029, j-0031, about 50 s each).

Two earlier runs failed on the walk's own steps, not the product: the second phone shared the first
phone's browser and so was the same device (it rightly showed the word already sent), and the
first word was one the cloud's sample also holds. Both fixed in the spec.

Phone screens read on a blank page (390 x 844, the local provider): "two words" shows "One word
only" with Send disabled; after sending, the card reads "Your word / Brilliant" and "Thanks, your
word is in."

Findings: none blocking. None filed.

## Review of `88cc688` (PR review bot)

One finding, a product defect: the panel and staging counted words off the operator's message
list, which PostgREST caps at 1000 rows (`max_rows`), oldest first, so in a big room the later
words, or a whole later question's, were missing from the cloud. Fixed: 0114 adds
`audience_word_counts(slug, round)`, one jsonb value of counts per spelling over every word of the
round; both providers implement `wordCounts`, and the panel and staging use it. The advisor
baseline records its two intended grants (the same door as `audience_tally`), checked by
`scripts/advisor-baseline-grants.test.mjs`. Proof: 0114's self-check now calls it (32 words, three
spellings); two Node tests (counts per spelling read as the words one by one; the local provider
counts a round's words only); the journey and the walk pass on the fix.

## Review of `88cc688` (`/so`, fresh read-only session)

AGREE, grade A. Three low findings: the cue editor's Pick a message refresh read the message list
and the rounds together, so one failed rounds read stalled it (fixed: the last Word rounds read
are kept and the list still refreshes); the server's one-word check used `[:space:]`, whose
coverage depends on the database locale, where the phone refuses JavaScript's `\s` (fixed: the
code points are listed, and the self-check now refuses a no-break space and an ideographic space);
a phone's earlier word shows under "What you sent" once another question is live (kept: it is what
that phone sent).

## Review of `ad7ec51` (`/so`, fresh read-only session)

AGREE, grade A. Its standalone probe of the new space check on Postgres 16 (C.UTF-8) refused a
space, tab, NEL, NBSP, U+2003, U+2008, U+3000, U+FEFF and `|`, and accepted `a-b`, accented letters
and U+200B, as `cleanWord` does. Three low findings, answered in the notes: the run of 0114's
self-check at its final text was not recorded (it was run: `audience_submit` at `ad7ec51` and the
whole DO block, with a throwaway account, on the local stack, and passed, including the
no-break and ideographic spaces); W9 holds in the page, not at the operator door (stated in W9);
a blocklisted word is filed masked and the operator hides it (stated in W6).

## Review of `ad7ec51` (PR review bot)

Two findings, product defects, family W9/W6 (words reach a cue only as the shown snapshot): Pick a
message showed words while the rounds were unread (a first failed read, or a round not yet read),
and staging could revive this page's hidden list after another tab had shown the last hidden word.
The first is the second round on the same filter, so the rule moved to its source rather than
being patched again: `audience_list` (0114) and the local provider's `list()` never return a Word
round's words, and the page's filters are gone. Staging now takes the hidden list from the stored
question whenever it exists. Proof: 0114's self-check asserts the operator list holds no word
(run on the local stack at this text, passed); Node tests assert `list()` holds no word after
phones and Simulate (mutation: dropping the provider's filter fails them); the Word, Fill from and
question-list journeys pass (j-0020); the walk passes (j-0021, 51 s).

## Review of `428ff47` (`/so`, fresh read-only session, also the W9 reassessment)

AGREE WITH CORRECTIONS, A-. It confirmed the W9 correction holds on both providers and every path
it traced (paste, chat, the Sheet, presenter pointers, the word count door). Two product defects
in W6 and approval, fixed:

- A word hidden after the press stayed on the cue and aired with the next Take. Hiding now removes
  it from the question's word cloud cue in the same record write. Proof: the journey hides Tense
  after the Take, the stored cue loses its line at once, the action log gains no row, and the next
  Update airs the cloud without it; `wordsWithout` has its Node test.
- A press could stage words that arrived after the panel last read (W10). Staging now counts afresh
  only the words the panel was listing; newer ones wait for the next press and the note counts them.

And one doc correction: the revert note now says what an older build does with rehearsal words.

## Review of `0ccd83e` (`/so`, full, with the approach reassessment)

AGREE WITH CORRECTIONS, B+. The reassessment named one missing rule, W11: a press filtered hidden
words by this tab's reading, so a word hidden in another tab could be written back onto the cue by
the press's rebased pass (F1); a team merge could keep a teammate's cue that still carried it (F2);
and a cue left behind by Change or duplicated kept hidden words (F3). One class, fixed in one
place: `scrubHiddenWords` runs inside the press's write, inside Hide and after a team merge, on the
record each lands on. Proof: Node tests (every cue carrying the question's words loses a hidden
word, another question's cloud and a vote board are untouched; a team merge where ours hid the word
and theirs re-staged it keeps it off the cue; mutation: removing the merge's call fails that test);
the Word, Fill from and second-operator journeys pass (j-0024); the walk below.

## Review of `cafc165` (PR review bot)

One finding, family W11: the text match also scrubbed a Duplicate's own result cue (same text, new
id) with the original's hidden words. Fixed: a mapped cue belongs to its question only, and an
unmapped cue is matched by text only when one Word question has that text. Node test: the
original's cue loses its hidden word, the copy's cue keeps it, an unmapped cue two questions share
is left as it is.

## Review of `cafc165` (`/so`, full)

AGREE WITH CORRECTIONS, A-. Three findings: a cue pasted from a copy made before a Hide brought the
hidden word back (W11 covered only the writers named, not every one); Hide gave no word that a
cloud already on air changes only with Update; and the text match over-reached to a Duplicate's
own cue (already fixed in `a13bb1b`). Fixed: the scrub now runs in every production write
(`saveAll` and the rebased pass), closing the class rather than one writer; Hide says that an
on-air cloud needs Update, and the word list's hint no longer says nothing is on air. Proof: the
Word journey copies the cue, hides Tense, pastes the copy and finds no Tense on it, and sees the
note (j-0027, with the Fill from, second-operator and question-list journeys); mutation: removing
the write-path scrub fails it ("Expected - 1, Received + 2").

## Review of `2e297cd` (`/so`, full)

AGREE WITH CORRECTIONS, A-. Two more writers of the W11 class that bypass the shared write path:
undo and redo (`replaceRundown`) could bring a deleted word cloud cue back with a word hidden since,
and a teammate's record applied from the server could carry one; and a phone listed an earlier
word among its messages once another question was live. Fixed: `replaceRundown` and both team
server-apply paths run the scrub, and the rundown history accepts a restore that lands scrubbed;
the join view marks a phone's words and the phone leaves them out of "What you sent" (0114's
`audience_join_by_slug`, self-check extended, run on the local stack and passed). Proof: Node tests
for delete, Hide, Undo and for a teammate's record (mutations: removing either scrub fails its
test); `production-audience`, `rundown-history` and `rundown-history-storage` whole, 54 passed
(j-0030); the walk below. The production self-check needed a fresh id on this stack: earlier runs
under different throwaway owners left the fixed id refused there; the migration is unchanged.

## Review of `378059c` (PR review bot and `/so`)

PR review bot, family W11: an undo that landed scrubbed left the history holding the unscrubbed
snapshot, so the next step cleared it. Fixed: `RundownHistory.accepted` takes the slice the restore
landed as and replaces every snapshot equal to the restored one. Node test (delete, hide, undo; Redo
and the earlier Undo both expect the stored rundown; mutation: skipping the replacement fails it);
the rundown-history specs and the Word journey pass (j-0032).

`/so`: AGREE WITH CORRECTIONS, A-. Its writer sweep found no remaining writer that can put a
hidden word on a cue. One finding: the hosted control page and Companion run the published copy of
the cues, so a word hidden after publishing stays there until the next publish, as any cue edit
does. Answered in W6 and in the product: on a published production Hide says to publish again. The
configured walk (published) hides the staged word after Take and checks that note.

## Not run, or partly run

- The rendered catalog baseline (`e2e/catalog-render-baseline.json`) is Windows-only; this machine
  is Linux, so it has no row for `wc01` (#2319).
- The full affected browser selection is broad (shared model files) and runs in GitHub Actions; on
  this machine the two files that cover the change ran whole.
