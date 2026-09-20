---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# The link `noacg save` prints opens the graphic, and survives not being signed in

What `noacg save` promises is "it puts it in the library and prints a link that opens at once".
The boot used to throw that address away: a `#/graphic/<id>` it could not resolve in the first
moment was replaced with `#/home`, and the only copy of the link the reader had went with it.
Measured on `noacg.studio` this morning: a browser with no session lost the link **846 ms** after
the click, every time, for a graphic that was sitting perfectly well in the account.

Two things changed. The boot now WAITS for the cloud pull it asks for instead of reading the
library it had before it asked. And when nobody is signed in it keeps the address and asks who you
are, because the record almost always exists - in the account this browser has not signed into.

## Route, in the studio, about two minutes

Needs the deployment that carries this change: `https://noacg.studio/version.json` should name a
commit at or after the one this landed on.

1. Signed in on `https://noacg.studio/app`, open any graphic from **Home › Graphics**. Copy the
   whole address out of the address bar - it ends `#/graphic/<id>`. That is the same address
   `noacg save` prints.
2. Open a **private window** and paste it there.
3. Sign in, in that private window, with the same account.
4. Back in your ordinary window, put `#/control/<id>` in place of `#/graphic/<id>` for a graphic
   you have never opened on this machine (a second browser profile, or one an agent saved), and
   load it.

## What to look at

- **The address bar still says `#/graphic/<id>`** in the private window, with the sign-in card over
  the studio. Before this it said `#/home` within a second and the link was unrecoverable.
- **The card's line names what it is for**: "Sign in to open this graphic. It is saved in an
  account." It says AN account rather than yours, because the app does not know whose it is until
  somebody signs in.
- **The graphic opens by itself** once the sign-in completes, with no second click and no second
  paste of the link. It arrives when the pull that carries it arrives, which on a quiet network is
  a second or two.
- **The control panel says "Opening…"** rather than "Graphic not found" while the record is being
  fetched, and turns into the panel when it lands. The "Graphic not found" card is now reserved for
  a graphic that really is gone.
- **A browser with unsaved work still asks first.** Opening a graphic replaces the working
  document, so the "Unsaved changes" dialog can come up before any of the above - that guard is
  older than this change and was deliberately left alone. Answer it and the link carries on.

## The numbers

Measured 2026-09-16 against `https://noacg.studio` (commit `43fb9e66`) and then against a
production bundle of this branch served locally with the same live backend.

- **846 ms** for production to replace a good link with `#/home` for a signed-out reader. Four
  signed-in runs did not lose the link; the account's library now pulls in about **300 ms**, where
  the 2026-09-10 report measured **5.0 s**, and that window is the race.
- **On this branch, signed out: the address survived** the whole 4 s watched afterwards, with the
  sign-in card up.
- **Signed in with every cloud read held back 8 s** - a classroom's WiFi, applied on purpose - the
  graphic opened on its link and the address never moved.

## What this does not cover

`e2e/configured/deep-link-boot.spec.ts` now holds all three answers, and its signed-out case runs
against the deployed site itself four times a day and on every production deployment
(`deploy-verify.yml`, `playwright.production.config.ts`). What no check covers is the SIGNED-IN
walk against production, because the account it would need is not a secret this repository holds -
that one is this route, by hand.
