---
kind: walk
date: 2026-09-04
because: taste
---
# A password-reset link now opens something that can reset a password

Branch `claude/d-account-surface`. This is the one you walked on 2026-09-04, twice: the mail
arrived, the link opened the landing page, then after the allow-list fix it dropped you at Home
with no prompt.

## The route, under a minute

1. Hosted studio, top right, signed out. It now says **Not signed in** beside the Sign in button,
   and hovering it says your graphics are saved on this computer only. Signed in it says your
   name instead of only showing the circle. That is the "I cannot tell which state I am in" note.
2. Click **Sign in** -> **Forgot your password?** -> your address -> send.
3. Open the mail and click the link. You should land on a page whose tab reads **NoaCG - reset
   your password**, showing one card: set a new password, twice, save. Set it, click **Continue
   to the studio**, and you are in the studio signed in with the new password.
4. Now click that same link a second time. A used link cannot be reused, so this is the expired
   path: the card should say the link cannot be used, quote Supabase's own sentence ("Email link
   is invalid or has expired"), say nothing about your account has changed, and offer to send a
   new one. There is a **Back to the studio** link on every card.

## What to look at

Whether step 3 is a page you would let a student meet on day one, and whether step 4's wording
is honest without being alarming. Both are my wording, not yours.

## What I could not verify myself

Only one thing, and it shows immediately if it is wrong: the reset mail now asks Supabase to
return you to `/app?recovery=1` rather than bare `/app`. I measured that the allow-list accepts
`https://noacg.studio/app` but could not get a second measurement for the query form. If it were
rejected, Supabase would fall back to the Site URL - the landing page - which is your original
bug. So the landing page now FORWARDS a recovery link into the app instead of swallowing it
(`index.html`, pinned by `e2e/landing.spec.ts`), and every link already in an inbox is covered
too, because the app also recognises the `type=recovery` fragment Supabase appends to all of
them. In other words step 3 should work either way, and if it does, nothing needs changing.
