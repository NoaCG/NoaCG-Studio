// AN IMPORTED OGRAF PACKAGE'S BASE, for the output that airs it (E3.2a): the output capability and
// the pinned published version ask the server once per package, and are answered a sealed folder
// the package's files are served under (api/_lib/outputOgraf.ts). Null when the server will not
// serve it: the stage then mounts nothing for that package, and says so in its report.
export function publishedOgrafBase(outputSlug: string, version: string) {
  return async (revision: string): Promise<string | null> => {
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 14_000);
    try {
      const response = await fetch('/api/output/assets?ograf', {
        method: 'POST',
        signal: abort.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${outputSlug}` },
        body: JSON.stringify({ version, revision }),
      });
      if (!response.ok) return null;
      const { base } = (await response.json()) as { base?: unknown };
      return typeof base === 'string' && /^\/ograf\/[A-Za-z0-9_-]+\/$/.test(base) ? base : null;
    } catch {
      return null;
    } finally {
      clearTimeout(deadline);
    }
  };
}
