# walk - go through what is waiting on the owner

Shared canonical procedure, invoked as `/walk` in Claude Code and `$walk` in Codex.

**The question this answers: is there anything the owner should look at or decide?** What waits on
him is a GitHub issue labelled `needs owner`: a decision only he can make, or a step only he can
take (an account, a console, a permission). A look at shipped work is a comment on its pull request
(`.agent-workflows/verify.md`, step 5), and GitHub already puts that in front of him.

Optional argument: a filter, either a subject (walk only the issues about it) or an area label.

## 1. Read the list

```bash
gh issue list --label "needs owner" --json number,title,labels,url
```

Order it by priority (`P1`, `P2`, `P3`), oldest first within one, and keep only what the filter
matches. Read an issue's body only when you are about to walk it. If nothing is open, or nothing
matches, say so in one line and stop. An empty list is a real answer.

## 2. Walk them one at a time

1. Say in one sentence what he has to do or decide, and give the link. If it needs a place (a URL,
   a console, the product on screen), get him in front of it once; for a local route, start this
   checkout's server with `npm run dev:worktree` if none is up.
2. Wait. Do not narrate what he should see or judge it for him. His judgment is the point.
3. Record his answer on the issue in his words (`gh issue comment`):
   - **Done or decided**: write a decision where the work that depends on it will read it (the
     issue that waits on it, the plan doc or the commit), then close the issue.
   - **Feedback**: turn it into work, a fix now if it is small and in scope, otherwise a new issue
     linked from this one. Say which. The issue stays open until that work lands.
   - **Not now**: leave the issue as it is.

Then the next issue.

## 3. Finish

One short report: which issues were settled and closed, what is left, and where each piece of
feedback went (the fix or the issue). Then the ordinary wrap-up.
