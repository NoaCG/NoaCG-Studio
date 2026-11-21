// WHERE THE INSTALLABLE TOOLS LIVE, named once for every surface that points at them.
//
// NoaCG ships three things you install: NoaCG Bridge (a Windows program that lets NoaCG Playout
// drive CasparCG), the Companion module (runs a production from a Stream Deck) and the NoaCG CLI
// (an npm package for coding agents and terminals). They are described on ONE public page,
// /downloads (downloads.html), and in-app surfaces link there rather than each explaining the
// tools again. The raw Bridge file stays one click away for the
// operator who already knows what it is. The same page has one SVG templates card, which is not a
// tool: two zips of layered graphics, and a link to /svg-templates, which previews every file.

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
/** The SVG templates page: every template and example previewed, each SVG one click away
 *  (svg-templates.html, built by scripts/svg-files.mjs). */
export const SVG_TEMPLATES_URL = '/svg-templates';
/** Its examples set: one per SVG import behaviour, layers named to the one naming system. The
 *  Import step's "Example files" link points here. */
export const SVG_EXAMPLES_URL = '/svg-templates#examples';
/** The Downloads card that holds both zips. */
export const SVG_TEMPLATES_CARD_URL = '/downloads#svg-templates';
/** The examples zip (scripts/illustrator/pack-svg-examples.mjs writes it). */
export const SVG_EXAMPLES_ZIP_URL = '/downloads/NoaCG-SVG-examples.zip';
/** The templates zip (`pack-svg-examples.mjs --set templates` writes it). */
export const SVG_TEMPLATES_ZIP_URL = '/downloads/NoaCG-SVG-templates.zip';
