---
kind: decision
date: 2026-09-20
---
# Removed documents are still in the public git history: rewrite it, or leave it?

**What happened.** On 2026-09-20 you asked for some session material to come out of the product and
off GitHub. It is gone from the current tree, the public docs page and the site, and you keep your
own copies outside every checkout. Git history still holds every removed file, so anyone digging
through old commits can read them.

**Why it is yours.** Removing them from history means rewriting the published history of a public
repository and force-pushing it: every clone and fork keeps the old commits, open branches must be
rebased, and it cannot be taken back. That is an irreversible publishing call only you can make.

**The choice.** Leave history as it is (nothing further to do), or ask for a rewrite, and an agent
prepares the exact list of paths and the steps for you to approve before anything is pushed.
