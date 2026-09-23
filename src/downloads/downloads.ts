// The Downloads page's one enhancement: say WHICH version each download is, and point the Bridge
// button at the exact file.
//
// One version number, two channels (downloads.html says why). A version may reach npm without a
// new Bridge exe, or the other way round, so each card asks ITS OWN channel and shows what that
// channel really serves:
//
//   NoaCG Bridge  the newest non-prerelease GitHub Release tagged `bridge-v*`, and its
//                 NoaCG-Bridge.exe asset. Filtering by tag rather than trusting "latest" means an
//                 old `cli-v*` Release on the same page can never be offered as the Bridge.
//   NoaCG CLI     npm's `latest` for @noacg/cli.
//
// Progressive, like src/docs/docs.ts: the page is complete without this module. The Bridge button
// already links GitHub's releases/latest download and the versions read "latest", so a network
// that blocks either API, a rate limit or a slow answer leaves a working page. Nothing here throws.

const REPO = 'NoaCG/NoaCG-Studio';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const NPM_LATEST = 'https://registry.npmjs.org/@noacg/cli/latest';
const BRIDGE_TAG_PREFIX = 'bridge-v';
const BRIDGE_ASSET = 'NoaCG-Bridge.exe';
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

/** The newest published Bridge release that actually carries the exe, or null. */
export function newestBridgeRelease(releases: GitHubRelease[]): GitHubRelease | null {
  const bridges = releases.filter(
    (r) =>
      r.tag_name.startsWith(BRIDGE_TAG_PREFIX) &&
      !r.draft &&
      !r.prerelease &&
      r.assets.some((a) => a.name === BRIDGE_ASSET),
  );
  bridges.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  return bridges[0] ?? null;
}

function setText(selector: string, text: string): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) el.textContent = text;
}

function setHref(selector: string, href: string): void {
  for (const el of Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))) el.href = href;
}

async function resolveBridge(): Promise<void> {
  const releases = await getJson<GitHubRelease[]>(RELEASES_API);
  if (!Array.isArray(releases)) return;
  const release = newestBridgeRelease(releases);
  if (!release) return;
  const exe = release.assets.find((a) => a.name === BRIDGE_ASSET);
  const checksum = release.assets.find((a) => a.name === `${BRIDGE_ASSET}.sha256`);
  setText('[data-version="bridge"]', release.tag_name.slice(BRIDGE_TAG_PREFIX.length));
  if (exe) setHref('[data-download="bridge"]', exe.browser_download_url);
  if (checksum) setHref('[data-checksum="bridge"]', checksum.browser_download_url);
  setHref('[data-release-notes="bridge"]', release.html_url);
}

async function resolveCli(): Promise<void> {
  const latest = await getJson<{ version?: string }>(NPM_LATEST);
  if (typeof latest?.version === 'string') setText('[data-version="cli"]', latest.version);
}

void resolveBridge();
void resolveCli();
