---
kind: agent
date: 2026-09-05
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Which of the name and the avatar survives a narrow bar is a design default and the item argues it:
the avatar is the door. The half that was genuinely his - whether there is a good reason to sign
in at all - is parked with his words on docs/backlog/signed-in-looks-identical-to-signed-out.md,
which is where a parked ask belongs.

Re-kinding and deleting are separate commits by rule, so this item stays here until an
agent drives the route below and records what it saw. The original text follows,
unchanged.

# YOU CAN SEE WHETHER YOU ARE SIGNED IN - AND IT NO LONGER SHOVES YOUR AVATAR OFF THE BAR

Your note from the reset-link walk: *"it looks exactly like you would be logged in. It's like
there's no difference between being logged in or not."* The topbar says which it is now. That part
landed on the 4th, inside the password-recovery change, so you may not have seen it announced. What
this item is really for is the bug that was hiding underneath it.

**Route (under a minute), on the hosted build:**

1. Open `/app` signed OUT. Look at the right end of the topbar.
2. Sign in. Look at the same place.
3. Now drag the window narrower and wider across roughly 1400-1500px, watching the right end.

**What to look at:**

- **Signed out** the bar ends `Feedback · Not signed in · Sign in`. Hover "Not signed in" and it
  says where your work is: on this computer only. That is deliberately the quietest thing on the
  bar - a status, not an advertisement. Nothing new asks you to sign in, and nothing is gated.
- **Signed in** it ends `● Synced · <your name> · <your avatar>`, and hovering the name gives the
  address. On a shared machine that answers the more useful question, which is *which* account.
- **The drag is the fix.** Between about 1401 and 1460 the bar used to run past its own right
  edge - up to 30px over for any signed-in user, 56px for anyone whose name is long - and the
  thing that fell off the end was the account avatar, the one control that is a door. It happened
  because the name was given the same width step as the `1920×1080 · 25 fps` line, and nobody had
  measured the widths where the name is actually drawn: the ladder was measured before the name
  existed. Now the name steps out at 1480 and the bar holds one row at every width. Watch the name
  disappear as you narrow past ~1480 and the avatar stay put.

**The judgement I would like your read on:** below 1480 the signed-in bar has no word on it, so
what tells you a session exists is the avatar and the `● Synced` chip. I think that is right - the
avatar is the door, it is the thing worth the space, and the signed-out bar has no avatar so the
two can never be confused. The alternative was to keep the word and drop the resolution line
instead. Say if you would rather have it the other way round on a 1440 laptop.

**What is NOT done, and it is the half you actually raised:** *"I don't have a really good reason
for people to be logged in."* The sign-in dialog does list cloud sync, community and AI. Whether
those are worth an account to a student two weeks before a show is a call I did not make - and if
the answer is no, the fix is to ask less often rather than to signal harder. Parked with your words
on it in `docs/backlog/signed-in-looks-identical-to-signed-out.md`.
