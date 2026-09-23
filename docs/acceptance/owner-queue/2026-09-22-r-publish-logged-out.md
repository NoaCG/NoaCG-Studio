---
kind: walk
date: 2026-09-22
because: direction
serves: now
---
# Start production, signed out, now asks for an account instead of doing nothing

You pressed Start production on the live site while signed out and nothing happened. The page did
ask for the sign-in window, but that window only existed on Home, in the editor and in the video
studio, so on the production page the request went nowhere. The sign-in window now lives once for
the whole app, so every page that asks for it gets it.

- **Start production, signed out,** opens the sign-in window on the production page. Its first line
  reads "Starting a production puts it online, and that needs a free account. Sign in and it starts
  straight away." Under it is the usual line that making and exporting never needs one, and the
  "New here? Create a free account" link.
- **Signing in from that window finishes the press.** The production goes online without you
  pressing the button a second time. Closing the window instead forgets the press, so signing in
  later from the top bar never publishes anything by surprise.
- **Hovering the button** while signed out already says it needs a free account.
- **Unpublish and changing the audience name,** signed out, now ask you to sign in. Before, they
  reported success while nothing had changed on the server: Unpublish said the links had stopped
  while the output kept running.
- **A control-panel link** for a graphic this browser has not synced showed "Sign in to open this
  panel" with a Sign in button that did nothing. It opens the sign-in window now. That page could
  also get stuck on "Opening..." for good, which is fixed too.
- Nothing else asks for an account. Making, previewing, exporting and running a production on the
  dashboard all work signed out, as before.

## The route, under a minute

1. Open https://noacg.studio/app in a private window, so you are signed out. Close the wizard.
2. Open any production (Home, then a production card; make one with + New production if there is
   none). Hover **Start production** and read the tooltip, then press it.
3. Read the sign-in window's first line. Sign in with your own account.
4. The window closes and the production goes online by itself: the Links panel opens with the
   output and control links, and Start production has become the Links button.

## What to look at

Whether the first line of the sign-in window is the right thing for a student to read at that
moment, and whether you want the press to continue by itself after sign-in (it does now) or would
rather press the button again yourself.
