# b3-gala-D builder report (condensed)

Opus subagent, 159k tokens, 37 tool calls, 7.5 min. Package `gala-title` from
`scaffold --fields`, Playfair Display copied out of catalog designs scaffolded only for the font.

- Look, by its account: centred low in frame, no boxed panel; gold tracked caps line above, the
  title in Playfair ivory, a gold hairline with a small diamond, "HOSTED BY" and the host in the
  serif, over a full-width midnight-plum fade from the bottom. 2.3 s entrance, 0.9 s fade out.
- Fields: Event name, Line above the title (empty hides it), Host name (empty by default, the
  host row stays hidden until typed). "Hosted by" is a hidden word source.
- Validate: 0 errors, 0 warnings (one 22px line raised to 24px for the validator).
- Friction it reported: `scaffold --fields` rejects a `hidden` kind the skill and contract
  recommend; moving the field to a `noacg-data-source` holder was manual; no route to one of the
  bundled serif fonts from a `--fields` scaffold (scaffolded catalog designs to copy a woff2);
  `--at` units undocumented. Setup friction: the machine's command guard refused non-ASCII
  arguments, so it could not render a Finnish-letter frame (the studio walk did).
