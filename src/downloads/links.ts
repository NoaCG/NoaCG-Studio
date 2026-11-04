// WHERE THE INSTALLABLE TOOLS LIVE, named once for every surface that points at them.
//
// NoaCG ships three things you install: NoaCG Bridge (a Windows program that lets NoaCG Playout
// drive CasparCG), the Companion module (runs a production from a Stream Deck) and the NoaCG CLI
// (an npm package for coding agents and terminals). They are described on ONE public page, /downloads (downloads.html), and in-app surfaces link there
// rather than each explaining the tools again. The raw Bridge file stays one click away for the
// operator who already knows what it is. The same page offers the SVG examples package, which is
// not a tool: a zip of layered example graphics, linked under them.

/** The public page that explains and links the tools. */
export const DOWNLOADS_URL = '/downloads';
/** Its NoaCG Bridge section - what Playout settings points a new operator at. */
export const DOWNLOADS_BRIDGE_URL = '/downloads#bridge';
/** Its Companion module section - what the Stream Deck panel dialog points an operator at. */
export const DOWNLOADS_COMPANION_URL = '/downloads#companion';
/** The module's short setup steps, on the same card. */
export const COMPANION_SETUP_URL = '/downloads#companion-setup';
/** Its NoaCG CLI section. */
export const DOWNLOADS_CLI_URL = '/downloads#cli';
/** Its SVG examples section: layered Illustrator examples named to the one layer-naming system,
 *  for anyone learning to import their own SVG. The Import step can point here. */
export const SVG_EXAMPLES_URL = '/downloads#svg-examples';
/** The examples zip itself (scripts/illustrator/pack-svg-examples.mjs writes it). */
export const SVG_EXAMPLES_ZIP_URL = '/downloads/NoaCG-SVG-examples.zip';
