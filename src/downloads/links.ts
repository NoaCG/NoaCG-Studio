// WHERE THE TWO INSTALLABLE TOOLS LIVE, named once for every surface that points at them.
//
// NoaCG ships two things you install: NoaCG Bridge (a Windows program that lets NoaCG Playout
// drive CasparCG) and the NoaCG CLI (an npm package for coding agents and terminals). Both are
// described on ONE public page, /downloads (downloads.html), and in-app surfaces link there
// rather than each explaining the tools again. The raw Bridge file stays one click away for the
// operator who already knows what it is.

/** The public page that explains and links both tools. */
export const DOWNLOADS_URL = '/downloads';
/** Its NoaCG Bridge section - what Playout settings points a new operator at. */
export const DOWNLOADS_BRIDGE_URL = '/downloads#bridge';
/** Its NoaCG CLI section. */
export const DOWNLOADS_CLI_URL = '/downloads#cli';
