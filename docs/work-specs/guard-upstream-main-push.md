# Prevent implicit pushes to main

An explicit source branch can still push to its upstream when `push.default=upstream`.
The shell guard checked only explicit main destinations or the current branch name, and
the Codex adapter did not run the push guard at all.

Goal: both shell adapters refuse pushes that can update main, including a feature branch
tracking origin/main. Resolve local Git configuration without contacting any remote.
Unknown implicit destinations must require an explicit safe destination. Preserve dry
runs, tag pushes, explicit feature destinations, and the merge queue.

Non-goals: changing Git configuration, remote permissions, or the merge process.

Acceptance:
- A disposable local bare repository reproduces the source-only and default push to main.
- Both adapters refuse those commands, explicit main pushes, and unresolved destinations.
- Explicit feature-to-feature pushes, safe ordinary upstreams, tags, and dry runs pass.
- Targeted matcher, resolver, and hook tests pass; full checks run in GitHub Actions.
