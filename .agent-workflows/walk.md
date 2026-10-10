# walk - go through what is waiting on the owner

Shared canonical procedure, invoked as `/walk` (or its alias `/ask`) in Claude Code and `$walk`
in Codex.

**The question this answers: is there anything the owner should look at or decide?** What waits on
him comes from two places: the items in the prompt that started this session (a wave's morning
prompt lists its decisions and looks), and GitHub issues labelled `needs owner`, a decision only he
can make or a step only he can take (an account, a console, a permission).

Optional argument: a filter, either a subject (walk only the items about it) or an area label.

## 1. Read the list

The prompt's items first, in its order. Then:

```bash
gh issue list --label "needs owner" --json number,title,labels,url
```

Order the issues by priority (`P1`, `P2`, `P3`), oldest first within one, and keep only what the
filter matches. Read an issue's body only when you are about to walk it. Re-check each item's
current state before asking (a decision may already be made, a check may have gone green). If
nothing is open, or nothing matches, say so in one line and stop. An empty list is a real answer.

## 2. Walk them one at a time

1. Say in a few plain sentences what it is, what you recommend and why, and whether he can do it
   from his phone or needs the computer. Give the link. If it needs a place (a URL,
   a console, the product on screen), get him in front of it once; for a local route, start this
   checkout's server with `npm run dev:worktree` if none is up.
2. Wait for his answer. For a look, do not tell him what he will see: his eyes are the point.
3. Record his answer in his words on the issue or pull request the item is about
   (`gh issue comment`, `gh pr comment`):
   - **Done or decided**: write a decision where the work that depends on it will read it (the
     issue that waits on it, the plan doc or the commit), then close the issue, unless the work the
     decision starts is tracked there: then drop its `needs owner` label. Work larger than a small
     fix gets a prompt for a fresh session, in one code block in the chat, ready to copy.
   - **Feedback**: turn it into work, a fix now if it is small and in scope, otherwise a new issue
     linked from this one. Say which. The issue stays open until that work lands.
   - **Not now**: leave the issue as it is.

Then the next item.

## 3. Finish

One short report: which items were settled and closed, what is left, and where each piece of
feedback went (the fix, the issue or the prompt). Then the ordinary wrap-up.
