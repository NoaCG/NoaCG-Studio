---
v: 1
source: review
raised: 2026-09-03
state: unstarted
asked: "coming back from Google sign-in or a password-reset link boots the canvas editor, not Home"
---
# An auth return boots the editor instead of Home

**Filed:** 2026-09-03, from the code review on `claude/g-route-transition-flash` (its handoff has
since been drained; the branch is in the log). Deliberately not fixed there: it is a
question about which surface a boot lands on, and that branch was blocked on a different defect.

## What happens

Supabase runs the implicit flow with `detectSessionInUrl` on, and `OAUTH_REDIRECT` is
`origin + pathname`, so Google sign-in and every password-reset link come back to
`/app#access_token=…` (`src/backend/auth.ts`, `src/backend/supabase.ts`). `parseRoute` reads any
fragment it does not recognise as `{ view: 'editor' }`.

`decideBootRoute` in `src/App.tsx` refuses to rewrite a hash the app does not own - that guard is
load-bearing and must stay, because rewriting it destroys the token before the Supabase client is
constructed. But refusing to rewrite the URL also means refusing to move off the editor, so a
default-mode reader finishing a sign-in lands in the canvas editor: the surface the student
release deliberately hides.

## Why it is not simply a regression to revert

The old effect DID land that boot on Home - by rewriting the hash to `#/home`, which destroyed
the token. So the flow was already broken, in the other direction and more expensively. What this
is, precisely, is the second half of the same fix.

## The shape of the fix

The URL and the SURFACE are separate decisions, and only the URL is untouchable. Where
`decideBootRoute` currently returns the parsed route unchanged, it can set the router store
directly - `useRouter.setState({ route: { view: 'home', section: null } })`, the same call the
`popstate` listener in `src/app/router.ts` makes - which moves the surface without writing the
hash. Advanced mode keeps the editor, as it does for every other boot, and a page owned by a
query capability (`?control=`, `?chat=`, `?agent=`) renders that capability anyway and should be
left alone.

Two things to check while doing it, neither of which is obvious from the diff:

- With the route reading `home`, the routed-wizard effect's stranded-startup-wizard rule fires,
  so a FIRST-EVER visit arriving on a reset link gets Home with no wizard rather than Home under
  one. That is consistent with the deep-link rule, but it is a behaviour change and wants
  saying out loud.
- `e2e/route-transition-flash.spec.ts`'s two fragment tests assert `.topbar`, which BOTH Home
  and the editor shell render - so they will not notice the surface either way. Pin the surface
  explicitly (`home-page`) as part of the change, or it lands untested.
