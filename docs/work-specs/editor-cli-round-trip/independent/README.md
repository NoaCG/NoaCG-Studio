# Independent R1.3b receipt

The independent checker passed the post-merge VectorCraft repeat, the landed
NoaCG task and the anonymous production task. Checked main and production were
both `2e164047f30ac1594144e82a55dcc91a6e727bda`.

Read [post-landing-check.md](post-landing-check.md) for the comparison, exact job
verdicts, two harness corrections, inspected viewport limits and phase
note. [reproduce.md](reproduce.md) retains the authored task, public native command
recipe, NoaCG steps, assertion excerpts and scheduler/config details.

The original [reference-input.svg](reference-input.svg) and compact
[reference results](reference-task.json) are included. The
[provenance](reference-provenance.json) and
[archive verification](reference-archive-verification.json) identify the exact
upstream release, source blobs and executed binary. No upstream runtime or code
is included.

[Main results](main-task.json), [production results](production-task.json),
[production version](production-version.json), [job verdicts](jobs.json) and
[render comparison](output-render-comparison.json) record actual evidence.
[captures.json](captures.json) indexes all eleven inspected PNGs with SHA-256.

SPX/CasparCG pixels match; OGraf pixels match after its measured 8px test-host
margin. Small viewports require timeline scrolling and clip the artboard in the
zoom proxy. The production consent prompt occludes the lower-right timeline.
Broadcast features have no reference equivalent and were checked against the
NoaCG contract. This receipt makes no receiving-host or whole-editor parity claim.

[Landing workflow evidence](landing.json) records the exact reviewed and merged
commits, successful PR/merge-group CI, post-landing and real production checks.
Main/configured runs still pending at curation are labelled honestly; their final
verdicts are followed on the phase and receipt pull requests.
