// The Downloads page's one enhancement: say WHICH version each download is, and point each
// download button at the exact file.
//
// Each product has its own version and channel (downloads.html says why), so each card asks ITS
// OWN channel and shows what that channel really serves:
//
//   NoaCG Bridge      the newest non-prerelease GitHub Release tagged `bridge-v*`, and its
//                     NoaCG-Bridge exe asset. Filtering by tag rather than trusting "latest" means
//                     a `cli-v*` or `companion-v*` Release on the same page is never offered as
//                     the Bridge.
//   Companion module  the same for `companion-v*` and its noacg-studio .tgz asset.
//   NoaCG CLI         npm's `latest` for @noacg/cli.
//
// Progressive, like src/docs/docs.ts: the page is complete without this module. The Bridge button
// already links GitHub's releases/latest download, the Companion button the Releases page searched
// for its name, and the versions read "latest", so a network that blocks either API, a rate limit
// or a slow answer leaves a working page. Nothing here throws. When GitHub does answer and has no
// module release, the card says so rather than offering an empty search.

const REPO = 'NoaCG/NoaCG-Studio';
const RELEASES_PAGE = 100;
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=${RELEASES_PAGE}`;
const NPM_LATEST = 'https://registry.npmjs.org/@noacg/cli/latest';
interface Product {
  /** What the card's `data-*` attributes name it. */
  card: string;
  tagPrefix: string;
  asset: RegExp;
}

const BRIDGE: Product = {
  card: 'bridge',
  tagPrefix: 'bridge-v',
  // 0.4.0 to 0.6.0 shipped a fixed name; later releases carry their version in it.
  asset: /^NoaCG-Bridge(-\d+\.\d+\.\d+)?\.exe$/,
};
const COMPANION: Product = { card: 'companion', tagPrefix: 'companion-v', asset: /^noacg-studio-\d+\.\d+\.\d+\.tgz$/ };
/** A lookup that has not answered by now is left as "latest"; the page already works. */
const TIMEOUT_MS = 6000;

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { name: string; browser_download_url: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** The product's newest published release that actually carries its file, or null. */
function newestRelease(releases: GitHubRelease[], product: Product): GitHubRelease | null {
  const own = releases.filter(
    (r) =>
      r.tag_name.startsWith(product.tagPrefix) &&
      !r.draft &&
      !r.prerelease &&
      r.assets.some((a) => product.asset.test(a.name)),
  );
  own.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  return own[0] ?? null;
}

function setText(selector: string, text: string): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) el.textContent = text;
}

function setHref(selector: string, href: string): void {
  for (const el of Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))) el.href = href;
}

/** Point a product's card at its release's file. */
function showRelease(release: GitHubRelease, { card, tagPrefix, asset }: Product): void {
  const file = release.assets.find((a) => asset.test(a.name));
  const checksum = release.assets.find((a) => a.name === `${file?.name}.sha256`);
  setText(`[data-version="${card}"]`, release.tag_name.slice(tagPrefix.length));
  if (file) setHref(`[data-download="${card}"]`, file.browser_download_url);
  if (checksum) setHref(`[data-checksum="${card}"]`, checksum.browser_download_url);
  setHref(`[data-release-notes="${card}"]`, release.html_url);
}

async function resolveReleases(): Promise<void> {
  const releases = await getJson<GitHubRelease[]>(RELEASES_API);
  if (!Array.isArray(releases)) return;
  const bridge = newestRelease(releases, BRIDGE);
  if (bridge) showRelease(bridge, BRIDGE);
  const companion = newestRelease(releases, COMPANION);
  if (companion) showRelease(companion, COMPANION);
  // A full page proves nothing: the module's release may be on the next one, and the card's own
  // links find it. Only a page that holds every release can say there is none.
  else if (releases.length < RELEASES_PAGE) {
    setText('[data-version="companion"]', 'not released yet');
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-needs-release="companion"]'))) el.hidden = true;
  }
}

async function resolveCli(): Promise<void> {
  const latest = await getJson<{ version?: string }>(NPM_LATEST);
  if (typeof latest?.version === 'string') setText('[data-version="cli"]', latest.version);
}

void resolveReleases();
void resolveCli();
