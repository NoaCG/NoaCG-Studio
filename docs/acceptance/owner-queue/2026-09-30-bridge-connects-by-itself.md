---
kind: desktop
date: 2026-09-30
because: taste
serves: now
---
# NoaCG Bridge 0.7.0 connects to the studio's CasparCG by itself, about five minutes

Bridge now remembers the CasparCG servers you connect to, and the pairing page connects to the last
one by itself (docs/work-specs/bridge-casparcg-connect). It was walked here against CasparCG 2.3.2
and 2.5.0 on this laptop; the one thing not walked is your studio, with CasparCG on another computer.

## The route, about five minutes

On the studio laptop, with the CasparCG computer running:

1. Download NoaCG Bridge 0.7.0 from the Downloads page and double-click it.
2. On the page it opens, press **Pair this browser**. The first time, type the CasparCG computer's
   address and press **Connect**.
3. Close the Bridge window, start it again, and pair again. The page should say "Connected to
   CasparCG ... at <that address>" without you typing anything.
4. Open a production, start it, open **Playout** in its header and press **Put on air**.

**What to look at.** Whether the pairing page's next step reads clearly, and whether anything in
it would make you hesitate before a show. Nothing should reach the CasparCG output until step 4.
