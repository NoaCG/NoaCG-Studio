# V6 independent review and routing reassessment

The full fresh independent review from /root/v6_audio_exact_so found corrections on 5cdfda91ba0db1ad9d4b0d56f865a7d18a42f933 against accepted V5 base 6da76c942cc19136b67ed0235d8074733b129257. This was a product-defect finding in the same Audio route and temporary mute ownership family as the preceding exact review.

- A known external mute after full XML can start a silent faded Audio Take, let either Resume form send Play before returning uncertain, or let a trimmed Loop rewind and restart.
- A cached cover can reverse an operator mute after AudioOff was unproved or its once-valid proof was displaced by recent exact unmuted evidence. This occurs when repeating a Take and after explicit Out sees the input empty. A later Clips Take can also keep the route muted after the operator reopened it.
- The independent reviewer checked the exact successful native and Windows evidence. The native trace has 114 GUID-keyed writes and zero Program, Preview or transition commands. Both saved settings match their backup hashes. Shared queue j-5267 finished with exit zero and all 24 tests passed. CLI typecheck and diff check passed.

Fresh read-only /root/v6_mute_authority_reassess agreed with corrections. NoaCG Audio requires the exact unmuted route at release. Clips preserve a fresh verified route. Only acknowledged AudioOff followed by an exact muted read grants temporary mute ownership. Positive unmuted evidence, a foreign occurrence or a changed connection invalidates it. Carry proof only across observed Bridge-owned successor changes. AudioOn requires verified current ownership, and final exact same-occurrence evidence is required before success or timers. Empty retirement restores only an exact, still-owned mute. Preserve V5 one-time setup and existing transfer and polling bounds.

One grouped repair authorized on the existing draft and worker. New exact independent review must pass before pushing, normal CI and merge queue. V7 remains unadmitted.
