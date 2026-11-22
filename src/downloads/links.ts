// WHERE THE INSTALLABLE TOOLS LIVE, named once for every surface that points at them.
//
// NoaCG ships three things you install: NoaCG Bridge (a Windows program that lets NoaCG Playout
// drive CasparCG), the Companion module (runs a production from a Stream Deck) and the NoaCG CLI
// (an npm package for coding agents and terminals). They are described on ONE public page,
// /downloads (downloads.html), and in-app surfaces link there rather than each explaining the
// tools again. The raw Bridge file stays one click away for the
// operator who already knows what it is. The same page has one SVG templates card, which is not a
// tool: the Template Library's zip, and a link to /svg-templates, which previews every file.

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
/** The Template Library page: every SVG template by package, previewed, each SVG one click away
 *  (svg-templates.html, built by scripts/svg-files.mjs). The Import step's "SVG templates" link
 *  points here. */
export const SVG_TEMPLATES_URL = '/svg-templates';
/** The Downloads card that holds the library's zip. */
export const SVG_TEMPLATES_CARD_URL = '/downloads#svg-templates';
/** The whole library's zip, which the build makes (scripts/svg-files.mjs LIBRARY_ZIP_URL). */
export const TEMPLATE_LIBRARY_ZIP_URL = '/downloads/NoaCG-Template-Library.zip';
