// Where a join page finds its production, and the one link an operator hands out.
//
// Pure text in, text out, and no imports, so scripts/join-path.test.mjs runs the real file.
//
// THREE DOORS, one page (interaction spec D2):
//   /j/<name>        the short link a QR code and an on-air card carry
//   /join/<name>     the readable form links already in circulation use
//   /join?p=<slug>   the random form a production is published with
// A query `p` wins over a path, as before.

/** A slug is URL-safe base64 or a claimed name; anything else never reaches the server. */
const SLUG = /^[A-Za-z0-9_-]{3,40}$/;

/** Whether a value has a slug's shape (a join slug or the presenter's). */
export const isSlug = (value: string | null): value is string => !!value && SLUG.test(value);

/** The path prefixes that carry a name. `/j` first: `/join` must not match it as `/j` + `oin`. */
const PATH_FORMS = [/^\/j\/(.*)$/, /^\/join\/(.*)$/];

/** The join slug in a page address, or null when there is none or it is not a slug's shape. */
export function joinSlugFrom(pathname: string, search: string): string | null {
  const fromQuery = new URLSearchParams(search).get('p');
  let fromPath = '';
  for (const form of PATH_FORMS) {
    const match = form.exec(pathname);
    if (!match) continue;
    try {
      fromPath = decodeURIComponent(match[1].replace(/\/$/, ''));
    } catch {
      fromPath = '';
    }
    break;
  }
  const slug = fromQuery || fromPath || null;
  return isSlug(slug) ? slug : null;
}

/** The link phones open: `<origin>/j/<name>`. On noacg.studio that is `https://noacg.studio/j/<name>`;
 *  a self-hosted or local build hands out its own origin, so the link opens the page that made it. */
export function joinShortUrl(origin: string, name: string): string {
  return `${origin.replace(/\/+$/, '')}/j/${encodeURIComponent(name)}`;
}
