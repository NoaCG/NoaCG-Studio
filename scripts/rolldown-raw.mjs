// Vite's `?raw` suffix, taught to Rolldown: import the file's text as the default export.
//
// The app is built by Vite, so a module in the graph may import a file's TEXT (src/model/fonts.ts
// reads the bundled-font licence that way). Any script that bundles part of that graph outside
// Vite has to answer the suffix too, or the build fails to resolve rather than quietly emitting
// something different. It lives here because two of them do: the catalog emit gate and the
// ticker speed test.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @type {import('rolldown').Plugin} */
export const rawSuffix = {
  name: 'noacg-raw-suffix',
  resolveId(source, importer) {
    if (!source.endsWith('?raw') || !importer) return null;
    const target = new URL(source.slice(0, -'?raw'.length), pathToFileURL(importer));
    return `${fileURLToPath(target)}?raw`;
  },
  load(id) {
    if (!id.endsWith('?raw')) return null;
    const text = readFileSync(id.slice(0, -'?raw'.length), 'utf8');
    return { code: `export default ${JSON.stringify(text)};`, moduleType: 'js' };
  },
};
