---
v: 2
source: owner
kind: ask
raised: 2026-09-10
state: advanced
asked: "it is actually quite confusing to use NoaCG when you're not logged in because it looks exactly like you would be logged in. It's like there's no difference between being logged in or not. If it works, it's fine. I don't have a really good reason for people to be logged in, but just a note for us that we should keep that in mind."
note: >-
  PROMOTED FROM FINDING TO ASK on 2026-09-10. It was raised on 2026-09-04 as an observation he
  made in passing, and the two lists exist so an observation is never quoted back at him as a
  requirement. Walking the receipts he made it one in his own words: "that is a problem. I don't
  think that's a bug. It's just something that we haven't thought about but we need to have a
  clear indication when we are logged in and when we are not." So it stands as an ask from
  2026-09-10, and the original observation is kept above as the quote that started it. What
  landed: the header states which state it is in, and the widths it renders at are measured and
  pinned in both directions. What is untouched: what an account is FOR, said at the moment we ask
  for one, and now also the clear indication he just asked for, which the header alone may not be.
---
# What is an account FOR? The state is visible now; the reason to want one is not

**Filed:** 2026-09-04. **Source:** owner, after the reset-link walk. **Halved:** 2026-09-05.

## Where it stands

The owner's finding had two halves pointing in opposite directions, which is why it was filed as a
note rather than a task.

**The half about state is done.** The topbar states which state it is in rather than only offering
the action - the account's name signed in, "Not signed in" signed out, each with the cost or the
identity in its title (`src/components/auth/AuthStatus.tsx`, landed in bbac256b). Measured in the
running app on 2026-09-05: signed out at 1366px the bar ends `Feedback · Not signed in · Sign in`;
signed in at 1520px it ends `Feedback · ● Synced · <name> · <avatar>`. The two widths are not a slip
- `auth.css` hides the signed-in NAME below 1480px, because the bar cannot carry it and the
resolution line at once, so under that step the states are told apart by the avatar and the sync
chip rather than by the word. Nothing was gated to get there and an offline build still grows zero
auth UI.

That step is 1480 rather than the 1400 it shipped with because measuring the widths where the name
is actually drawn found the bar running past its own right edge from 1401 to 1430 for every
signed-in user, and to 1459 for anyone whose name reaches the 12ch cap - hanging the account avatar
off the edge. Nobody had looked: the ladder in `app-shell.css` was measured before the name
existed. Both directions are pinned now, and the signed-in one is read above the step, where the
name is the only thing that could fail.

**The half about the reason is untouched, and it is the owner's.** He said it himself: *"I don't
have a really good reason for people to be logged in."* The sign-in dialog does already answer the
literal question - "Sign in to save your work across devices, share to the community, and use AI",
with "Creating and exporting graphics never needs an account" under it
(`src/components/auth/SignInDialog.tsx`). So the sentence exists. What does not exist is a decision
that those three things are worth an account to a student two weeks before a show, and that is not
something a session can settle by writing better copy.

## Why this is still open

The question survives its first half. If the honest answer is that cloud sync, community and AI do
not earn an account for the student audience, the move is to ask LESS often rather than to signal
harder - and that would change the sign-in dialog, the gates in `needsSignIn`/`SignInPrompt`, and
possibly the community surfaces. That is a direction, and it belongs to the owner.

## What it would take

An owner decision, in one sitting: what an account buys, said in one sentence he believes, and
where we are willing to ask for one. Everything downstream of that is small.

## Evidence

- Owner, 2026-09-04, verbatim in the receipt above.
- `AGENTS.md`, "Auth posture (the open studio)" - the pillar neither half may break.
- `e2e/auth.spec.ts` pins zero auth UI offline, both halves of the state word included.
- `e2e/configured/anonymous.spec.ts` pins the signed-out word and its width ladder;
  `e2e/configured/signed-in-ux.spec.ts` pins the signed-in one, read at 1520 - above the 1480
  step, and with the name forced to its cap so the fit is measured against the rule rather than
  against whatever the test account is called.
- `src/styles/auth.css` carries the measurement table behind the 1480 step.
