# Morning review: is the whole workflow ready?

Prepared for 19 October 2026. Research and recommendations only; no product implementation or plan execution.

**Follow-up:** the owner has now answered these questions. [19 October feedback and proposed run additions](09-owner-feedback-and-run-additions.md) records the answers and narrows the scope recommendation below. Keep the election package and broader authoring work separate from the current run.

**My assessment: the core approach is sound, but completing the agreed production-page run would not yet give us a complete workflow for every graphic and every playout route.** It would give us a much stronger NoaCG-controlled production workflow. A few focused additions are needed for custom graphics, and foreign-package playout remains a separate milestone.

I reviewed the actual run order, the supplied second opinion, the broader authoring/output plans, and current source. The [full assessment](08-whole-plan-assessment.md) separates existing capabilities, promised work, proposed additions and remaining proof.

The most important findings are:

1. **The custom mapper is necessary.** Ordinary producers need to map their own columns and images to their own fields. Existing bindings support this; the agreed run's five convenient data formats do not finish the user journey. The second opinion is right about this gap.
2. **The election example has one more important case to prove.** Two candidate cues using the same graphic currently share its live bindings. Changing Aino's cue to another candidate does not automatically switch the live vote path. For the first rehearsal, use distinctly named graphic instances with fixed candidate bindings, or explicitly use snapshot-only candidate cards. A reusable card that follows whichever candidate the operator selects needs a specified and proven selection workflow.
3. **Retiring the old Sheet connection needs an updated target.** Current main offers it in the new editor, while the plan names a removed file. Existing embedded pollers also need a clear migration boundary so they do not compete with production-level connections.
4. **Exporting a graphic does not export the whole live production.** NoaCG-controlled output retains the production's source/binding workflow. Standalone SPX or local packages have different capabilities. The choice of controller and output route should be clear before a producer commits to a workflow.
5. **Foreign OGraf packages are still separate work.** There is an isolated playback foundation, but the Library → cue → production → output journey is not completed by this run. Similarly, rich repeaters and bracket behavior need bounded authoring qualification.
6. **We need one complete custom-show rehearsal.** Include data acquisition, two live candidate identities, a manual reveal, a bad image, a correction, operator handover, renderer restart and the actual output equipment. The current local election experiment proves a useful part of that chain, not the entire chain.

I recommend keeping the agreed order, adding the bounded custom-graphics amendments, and defining completion around **native custom graphics controlled by NoaCG on qualified output routes**. Then qualify foreign OGraf as its own milestone. There is no evidence here that we need a second binding engine or a wholesale redesign.

For our morning discussion, these are the decisions that would change the recommendation:

- **Must the first completed milestone include third-party OGraf packages in the normal rundown?** My recommendation is to make that an explicit following milestone, unless it is essential for the first production.
- **For the election, do you need one reusable candidate card that changes its live data identity when you select a person?** I expect yes. If so, it deserves a focused mockup and acceptance case before implementation; the current fixed-candidate proof should not stand in for it.
- **Which output setup must pass the first complete rehearsal?** I recommend the production CasparCG/Bridge setup plus the agreed OBS check; retain the existing vMix/SPX regression evidence and qualify those exact routes when they are required.

Your mockup feedback can focus on [02: mapping](screens/02-custom-column-mapper.png), [03: ownership](screens/03-mixed-ownership.png), [09: election connection](screens/09-election-bindings.png), and [10: election operation](screens/10-election-on-air.png). The complete [mockup PDF](NoaCG-election-and-custom-workflow.pdf) is unchanged. The missing candidate-selection case is now recorded explicitly, rather than implied by those screens.
