---
kind: walk-p
date: 2026-09-07
---
# The landing page says free and open source

"Premium" is gone from the marketing copy, and the page now states the licence.

**Route, under a minute.** Open <https://noacg.studio>. The hero kicker should read
**"Free & open source · Browser-based · No sign-up"**. Scroll to the **No lock-in**
section ("Stop using NoaCG, and your graphics keep working"): its last sentence now names
the AGPL, and there is a fifth fact chip reading **Open source, AGPL-3.0**.

**What to look at.** Whether "free and open source" belongs in the kicker at all, or whether
it crowds the first thing a stranger reads. It is the only claim there that is about the
licence rather than about using the product, and it made the line two lines on a phone. The
alternative is to leave the kicker as it was and let the No lock-in section carry it alone.

Also check the **Create with AI** card. It used to read "NoaCG Lite is included free; NoaCG
Pro..." which implied Pro was the paid one. It now says both generators are free. The names
Lite and Pro survive as quality levels.

**What was deliberately NOT changed.** "Premium" still appears 51 times in `src/`, in the AI
prompts, the design vocabulary and the template comments, where it means high production
value rather than the paid edition. Removing it there would degrade what the generator
produces. `docs/GOALS_ARCHIVE.md` also keeps its original paid-surface wording, because an
archive records what was true at the time.
