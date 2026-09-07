# What three migrated areas say about the method

**The byte win is real and it is concentrated.** `versus` cost 121 bytes MORE, `src/templates` saved
26 KB, the wizard saved 53 KB. The fixed overhead of a generated contract is about 200 bytes, so the
question is only ever how much prose an area has to amortise it - and the answer is not worth
guessing per area, because the two big ones together took the corpus from 574,356 to 521,467 while
the small one moved it the wrong way.

**Extraction is cheap; verifying the prose is not.** Both large areas contained claims that were
FALSE when they were migrated: a wizard toggle replaced months earlier by the brand chooser, a
"starts at None" that a production overrides, a "resets on any result change" that brand context
does not trigger. Prose nobody treats as binding can carry a false sentence for months; a rule
cannot, because a rule is read as authoritative the moment it exists. **Checking each paragraph
against the code is the expensive half of this work and it is not optional.**

**A rule in somebody else's words loses the symbol names.** Writing rules from scratch dropped 206
of the 293 backticked tokens the wizard contract carried - the CSS class you would grep for, the
helper the mechanism lives in. Two answers, and both are needed: the record for an area keeps the
replaced prose verbatim, and a rule names the symbol a reader would search for rather than
describing it. `npm run contract:migrate -- audit` is what makes the loss visible - and it was itself
reading only TRACKED files, so on a row whose rules were still unstaged it reported the whole store
as missing. Fixed in the same change; an audit that is wrong in the alarming direction still costs
an hour finding out.
