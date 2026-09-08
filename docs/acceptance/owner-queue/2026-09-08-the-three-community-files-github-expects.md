---
kind: walk-p
date: 2026-09-08
---
# The three files GitHub expects from an open source project, and what they promise in your name

You said again tonight that NoaCG is free and open source. GitHub has a fixed idea of what that
looks like from the outside: a code of conduct, a contributing guide and a security policy, all
three read from the repository root. We had none of them. They were written two days ago and then
sat unlanded, because the gate that guards the repository root refused three filenames it had
never been told about. That allowlist entry landed tonight in `37a7e2d4`; this is the same three
files, re-gated against a root that now expects them.

## The route, in under a minute

On your phone, open <https://github.com/NoaCG/NoaCG-Studio> after this lands.

**What to look at.** The **Security** tab now exists and carries the policy. Start a new issue and
GitHub shows a contributing prompt above the box; that is `CONTRIBUTING.md` doing its job.

Then Insights, "Community Standards". That checklist goes from five missing to two: an issue
template and a pull request template are still absent, and this change deliberately does not add
them. Templates shape how strangers file things, which is worth deciding on its own rather than
smuggling in behind three files that only state policy.

## The sentence I need from you

**Both files publish `contact.noacg@gmail.com` as the address a stranger writes to** - the security
report address in `SECURITY.md` and the conduct-report address in `CODE_OF_CONDUCT.md`. That is
the address already on the site, so it is not a new one, but it is now the address a vulnerability
report lands in and the one a person mails when somebody behaves badly in an issue thread. If you
would rather either of those went somewhere else, say which and I will change it.

## What I decided rather than asking

`CODE_OF_CONDUCT.md` is the Contributor Covenant 2.1 unmodified, because a code of conduct people
already recognise is worth more than a better-worded original nobody has read before.

`SECURITY.md` names the parts worth attacking - accounts and cloud sync, exported templates that
run inside a customer's playout server, the SVG and HTML import path - and says plainly that the
absent login wall is a design decision and not a hole, so nobody files it as one.

`CONTRIBUTING.md` says a maintainer queues an outside pull request once it is reviewed, so a
contributor never goes looking for a merge button that is not theirs.

I also cut a spec count out of `CONTRIBUTING.md`. It said "you do not have to run all 149", which
was exactly right today and would have been quietly wrong the first time anybody added a spec.
Nothing gates a number like that, so it now says "the whole suite".
