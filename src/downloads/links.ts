// WHERE THE TWO INSTALLABLE TOOLS LIVE, named once for every surface that points at them.
//
// NoaCG ships two things you install: NoaCG Bridge (a Windows program that lets NoaCG Playout
// drive CasparCG) and the NoaCG CLI (an npm package for coding agents and terminals). Both are
// described on ONE public page, /downloads (downloads.html), and in-app surfaces link there
// rather than each explaining the tools again. The raw Bridge file stays one click away for the
// operator who already knows what it is. The same page offers the SVG examples package, which is
// not a tool: a zip of layered example graphics, linked under the two.

/** The public page that explains and links both tools. */
export const DOWNLOADS_URL = '/downloads';
/** Its NoaCG Bridge section - what Playout settings points a new operator at. */
export const DOWNLOADS_BRIDGE_URL = '/downloads#bridge';
/** Its NoaCG CLI section. */
export const DOWNLOADS_CLI_URL = '/downloads#cli';
/** Its SVG examples section: layered Illustrator examples named to the one layer-naming system,
 *  for anyone learning to import their own SVG. The Import step can point here. */
export const SVG_EXAMPLES_URL = '/downloads#svg-examples';
/** The examples zip itself (scripts/illustrator/pack-svg-examples.mjs writes it). */
export const SVG_EXAMPLES_ZIP_URL = '/downloads/NoaCG-SVG-examples.zip';
