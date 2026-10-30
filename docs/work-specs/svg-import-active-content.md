# Keep imported SVG artwork inert

The SVG reader measures imported markup in the live Studio document. Later surfaces parse its
serialized XML as HTML. Active content must be removed before either parser boundary, including
namespace aliases and URL forms the browser recognizes as executable.

Keep genuine artwork, text inventory, local references, embedded raster images, gradients and
class styling. This does not redesign SVG geometry or change the authored template code editor.

Acceptance criteria:

- Prefixed scripts, embedded HTML and native animation cannot enter the live measurement DOM.
- Serialized SVG remains inert when inserted through the mapping view's HTML parser boundary.
- Executable URL references cannot survive namespace aliases or encoded URL whitespace.
- References are limited to local fragments and embedded images; a safe primary SVG2 reference
  survives removal of an unsafe fallback.
- Uploaded layer titles remain text when clock and credits holders are generated for export.
- Imported field metadata cannot terminate its generated SPX definition script; values still
  round-trip through the definition reader unchanged.
- Ordinary text, paths, definitions, use/textPath references and data images still import.
- Existing SVG corpus and affected browser checks pass without weakening their expectations.

Reproduce with local sentinel payloads in a real browser using the existing blank-page harness.
Local execution is owner-authorized, but the browser slot is shared; use the queue or authoritative
CI when that slot is held. A test-only draft establishes the failure before implementation.
