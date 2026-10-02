# b3-gala-G builder report (condensed)

Opus subagent, 166k tokens, 44 tool calls, 6.7 min. Opened `design-notes.md`, not
`critique.md`. Package `gala-title` from `scaffold --fields`, Playfair Display copied out of
catalog designs scaffolded only for the font.

- What it says the guidelines set: the 1.8-2.2 heading-to-secondary ratio (event name 84px,
  venue 40px, host 42px); kicker 20px with 0.22em tracking; one accent used once (champagne gold
  on the ornament only); eased entrance (power3/expo.out) and an exit 30-60% faster (0.55 s); a
  ceremonial build allowed longer than the strap ceiling (1.9 s); "reason from the brief, not a
  house look" steered it away from the catalog amber to a serif invitation card.
- Look, by its account: a centred dark night-violet card with a fine inner hairline frame; one
  gold four-point star between two thin lines ("Valon" = light); event name and venue line in
  Playfair; a tracked HOSTED BY above the host name.
- Fields: Event name, Venue line, Host name (empty hides the host block); "Hosted by" a hidden
  word source. No buttons.
- Validate: 0 errors, 0 warnings (first run failed `bench-replay`: an Out track on an element the
  Enter never reset).
- Friction it reported: no route to the bundled fonts from `--fields` (probed four catalog
  designs); `--at 0.7` read as about 20 ms; "Hosted by" sits between the skill's hidden-word and
  fixed-label rules; the scaffold root is bottom-left at 120px insets and nothing covers centred
  compositions.
