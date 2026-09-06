# End credits: the one field

A credit roll is a list of people, and a list of people is not a list of FIELDS. NoaCG's
end-credits designs therefore have exactly **one** field for the whole roll - a multi-line
`textarea` (`f0`) the operator pastes into, in the studio or later in SPX, CasparCG, the
NoaCG control page, or whatever else is driving the graphic. Nothing about a show with five
camera operators adds five fields to the template.

Which means the format has to carry the one distinction a credit roll is made of: **which part
of a line is the ROLE, and which part is the PERSON.**

## The rules

There is one mark to learn. **A colon ends a role. Everything else is a name.**

```
Director: Alex Rivera
```

A role with more than one person puts the colon at the end of its own line, and the people
follow beneath it:

```
Camera Operators:
Jonas Berg
Lena Fors
Petri Salo
```

That is the whole idea. A role heads its names for as long as no new role appears, which is why
"five camera operators" is typed the way you would write it on paper rather than as five lines
each repeating the word *Camera*.

The complete set:

| You type | You get |
|---|---|
| `Director:` | a role; every line under it is one of its names |
| `Director: Alex Rivera` | the same, written inline for a role with one person |
| `Director` `<TAB>` `Alex Rivera` | the same - this is what a paste from a Google Doc table or a spreadsheet column looks like |
| `Director \| Alex Rivera` | the same, using the original separator; older lists keep working |
| `Alex Rivera` | a name: it joins the role above it, or stands on its own if there is none |
| `# PRODUCTION` | a department heading, above a run of roles |
| *(a blank line)* | starts a new section |

A **semicolon works everywhere a colon does** (`Camera;`), because that is the mark some other
template systems use and misremembering which one should not cost anybody an evening.

Three things worth knowing, in the order people hit them:

- **Nothing is required.** Paste a bare list with no marks at all and every line is read as a
  name, which renders as a clean column of names. That floor is deliberate: the first thing
  anyone does is paste.
- **A heading is marked or it is not a heading.** A line is never promoted to a heading because
  of where it sits, which is what lets a roll end on *"Special thanks to everyone who made this
  show possible"* without that sentence being set in accent capitals.
- **A sentence that happens to contain a colon is not a role.** The text before the colon has to
  be short (48 characters) to be read as a job title.

## Example

```
# PRODUCTION
Director: Alex Rivera
Producer: Sam Chen

# CAMERA
Director of Photography: Maria Santos
Camera Operators:
Jonas Berg
Lena Fors
Petri Salo

Special thanks to everyone who made this show possible
```

The second field (`f1`) is the year / copyright line the roll ends on, and designs that take a
logo have a third (`f2`) for the mark above it.

The last field is the **speed** - `Scroll speed (%)` on a roll or a reel, `Crawl speed (%)` on a
crawl, `Page speed (%)` on the one-pager swap - as a percentage of the pace the design ships at.
**100 is exactly the authored pace**, 150 is half again as fast, 60 is a slow ceremonial read;
blank, zero or nonsense all mean 100 rather than "stop", and the value is clamped to 10-400 so a
roll always finishes. It is an operator control because a roll has to fit whatever is under it,
and that is decided at the desk (owner walk 2026-08-28). It applies from the next take: the
travel is measured when `play()` runs, so retyping it does not retime a roll already on air.
The static board has no speed field - nothing there moves.

**The list runs all the way through.** A roll travels until the last name has left the top of the
frame, and only then does the closing mark (logo + year) arrive on its own, centred - the same on a
crawl, along x. That is the default and there is nothing to switch on; a design with no mark simply
runs the list off and ends empty.

## The same text in any design

The format is deliberately **layout-independent**: it says what the content IS, never how it is
arranged. The same pasted list is:

- **cr01 Classic Roll** - centred blocks, the role over its names.
- **cr02 Column Roll** - the role right-aligned in a left column, its names stacked in the right,
  meeting at a central gutter.
- **cr13 Programme Roll** - serif leader rows on paper.

…and so on through the category, which is why switching design never means retyping the credits.

### Emphasis (cr01)

A credit is a role and the people who did it, and only one of the two can be the headline. cr01
hands that decision to you as **Emphasis** in the wizard's Style step:

- **Role** (the default) - the role big and bold, its names quieter beneath it. The department-list
  shape; it stays right when one role credits five people.
- **Name** - the name big, the role a small dim label above it. The film convention, and the better
  read when nearly every role has exactly one person.

In the generated code it is one class on `.credits-box`
(`credits-box--emph-role` / `credits-box--emph-name`), so it can also be flipped by hand later.

## For maintainers

- The parser is `parseCredits` in `src/templates/endCredits/shared.ts`, emitted into every
  generated template. It escapes every value **on the way out**, so a design's own row builders
  are safe to rewrite without remembering the rule.
- It produces `{ type: 'group', role, names[] }`, plus `heading` and `entry`. A design that
  defines `renderCreditGroup(group)` receives the group whole - the only way one role can lay out
  above or beside several names. A design without one is served the group flattened into the
  original `credit` / `entry` row kinds (`creditGroupRows`), so every design in the category keeps
  working unchanged.
- `scripts/credits-parser.test.mjs` (`npm run test:credits-parser`, and part of `npm run build`)
  runs the rules against the **emitted** JavaScript rather than the TypeScript source, because the
  parser is authored inside a template literal where every backslash is doubled.
