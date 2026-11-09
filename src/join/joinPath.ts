// Where a join page finds its production, and the one link an operator hands out.
//
// Pure text in, text out, and no imports, so scripts/join-path.test.mjs runs the real file.
//
// THREE DOORS, one page (interaction spec D2):
//   /j/<name>        the short link a QR code and an on-air card carry
//   /join/<name>     the readable form links already in circulation use
//   /join?p=<slug>   the random form a production is published with
// A query `p` wins over a path, as before. The link handed out is control/joinName.ts `joinShortUrl`.

/** A slug is URL-safe base64 or a claimed name; anything else never reaches the server. */
const SLUG = /^[A-Za-z0-9_-]{3,40}$/;

/** Whether a value has a slug's shape (a join slug or the presenter's). */
export const isSlug = (value: string | null): value is string => !!value && SLUG.test(value);

/** The path forms that carry a name: `/j/<name>` and `/join/<name>`. */
const PATH_FORM = /^\/j(?:oin)?\/(.*)$/;

/** The join slug in a page address, or null when there is none or it is not a slug's shape. */
export function joinSlugFrom(pathname: string, search: string): string | null {
  const fromQuery = new URLSearchParams(search).get('p');
  let fromPath = '';
  const match = PATH_FORM.exec(pathname);
  if (match) {
    try {
      fromPath = decodeURIComponent(match[1].replace(/\/$/, ''));
    } catch {
      fromPath = '';
    }
  }
  const slug = fromQuery || fromPath || null;
  return isSlug(slug) ? slug : null;
}
