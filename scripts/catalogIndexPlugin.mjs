// /catalog-index.json - the catalog as the remote MCP connector reads it (docs/REMOTE_MCP_PLAN.md,
// key decision 7; the shape and why it exists: src/templates/catalogIndex.ts).
//
// Generated from the live type registry through Vite's SSR loader - the same loader the build's
// prerender uses, because the registry is TypeScript that only Vite resolves. The dev server
// answers it from the module graph it already holds (so an edited design is in the next answer),
// the preview server serves the built file, and `vite build` writes it into dist/ with a
// middleware-mode server of its own, which binds no port.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX_PATH = '/catalog-index.json';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The index as JSON text, from a Vite server's SSR loader. */
export async function catalogIndexJson(server) {
  const [{ buildCatalogIndex }, { TYPES }, { CATEGORIES, PALETTES }, { FONTS }] = await Promise.all([
    server.ssrLoadModule('/src/templates/catalogIndexBuild.ts'),
    server.ssrLoadModule('/src/templates/types/registry.ts'),
    server.ssrLoadModule('/src/templates/contract.ts'),
    server.ssrLoadModule('/src/model/fonts.ts'),
  ]);
  const index = buildCatalogIndex({ types: TYPES, categories: CATEGORIES, palettes: PALETTES, fonts: FONTS });
  if (index.types.length === 0) throw new Error('catalog index: the type registry resolved to zero types');
  return JSON.stringify(index);
}

/** @returns {import('vite').Plugin} */
export function catalogIndexPlugin() {
  /** Set only by `vite build`: Vite also calls closeBundle when a dev server closes. */
  let outDir = null;
  return {
    name: 'noacg-catalog-index',
    configureServer(server) {
      server.middlewares.use(INDEX_PATH, (req, res, next) => {
        const rest = (req.url ?? '').split('?')[0];
        if (rest !== '/' && rest !== '') return next();
        catalogIndexJson(server).then(
          (body) => {
            res.setHeader('content-type', 'application/json');
            res.setHeader('cache-control', 'no-store');
            res.end(body);
          },
          (error) => next(error),
        );
      });
    },
    configResolved(config) {
      if (config.command === 'build') outDir = path.resolve(config.root, config.build.outDir);
    },
    // After the bundle, not inside it: the registry loads in its own server, which is not part of
    // the bundle's work (and would be reported as a slow bundling plugin there).
    async closeBundle() {
      if (!outDir) return;
      const { createServer } = await import('vite');
      const server = await createServer({
        root: projectRoot,
        configFile: path.join(projectRoot, 'vite.config.ts'),
        server: { middlewareMode: true },
        appType: 'custom',
        logLevel: 'warn',
      });
      try {
        await writeFile(path.join(outDir, INDEX_PATH.slice(1)), await catalogIndexJson(server));
      } finally {
        await server.close();
      }
    },
  };
}
