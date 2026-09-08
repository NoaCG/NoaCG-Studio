# blocks/decides-which-style-controls-exist-all

Rule: `blocks/decides-which-style-controls-exist-all`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

The `:root` block declares all four palette roles whether or not a design paints with them, so their presence proves nothing: measured over the 504-design catalog on 2026-09-02, 11 designs never read --accent, 97 never --panel-bg and 126 never --text-dim. Loosen it and the wizard's Style step goes back to offering packages that cannot change the graphic (the owner's 2026-08-28 bug: nothing happens in the graphic, that's a bug); tighten it and it hides controls that work. The house style writes about variables it deliberately did NOT use, which is why comments are stripped. Pinned by e2e/wizard-setup-fields.spec.ts.
