# Community packs: the creator's flow (low-fidelity sketch, 2026-10-07)

Proposed, not built. The reasoning is in [`README.md`](README.md). [B] marks a step that is built
today, [P] a proposed one.

```
 MAKE (private, no mention of sharing anywhere)
 ------------------------------------------------
 wizard / editor / agent  --->  production page  --->  run the show
   [B]                            [B]                    [B]
                                   |
                                   |  the creator decides to offer it (nothing prompts this)
                                   |  found via: the shelf's last line, the help page,
                                   |  or the CLI's one-line "this package is complete" [P]
                                   v
 SUBMIT                     Setup menu > "Submit to Community packs..."  [P]
 ------                     (signed in, own production, not one installed from the shelf)
                                   |
                                   v
                    +---------------------------------------------+
                    | name | one-line description | category      |
                    | preview frame (first cue; pick another)     |
                    | check results (pass / fix before sending)   |
                    | "Submitting publishes this under CC BY 4.0. |
                    |  Anyone may use it in any show, with your   |
                    |  name on it."                               |
                    |                  [ Send for review ]        |
                    +---------------------------------------------+
                                   |
 CHECK (automatic)                 v
 -----            checking: gate + bench per graphic [B, client and CLI]
                  no outside requests, pack rules, cue dry run, completeness [P]
                     | fail -> "not accepted" with graphic + reason; never reaches an admin
                     v pass
 REVIEW           in review: admin sees preview, checks, live play  [P]
 ------              | reject -> "not accepted" with the admin's reason
                     v approve
 LIVE             on the shelf beside the NoaCG seeds, maker's name on the card  [P]
 ----                |
                     +-- author: "Submit an update" -> new version -> CHECK -> REVIEW
                     |     (the shelf keeps the live version until the update is approved;
                     |      installed copies never change by themselves)
                     +-- author: "Withdraw" -> off the shelf at once, installs stay
                     +-- admin:  "Take down" with a reason the author reads, installs stay
                     +-- anyone: "Report" on the card -> admin queue  [B in Era 5.5, reuse]

 AGENT: noacg pack ... --save                    [B]  -> waits on Home > Productions
        noacg pack ... --share --license cc-by-4.0 [P] -> enters at CHECK, only when the user asked
```
