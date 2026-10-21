// Let Node load the app's TypeScript the way Vite and the functions' emit do. Import it for its
// effect, before any dynamic `import()` of a module under src/ or api/.
//
// Node strips types but resolves a specifier as written. Modules the server tick shares with the
// browser (src/control/sheetSource.ts, contentFormats.ts) name each other by `.js`, as the emit
// needs, and most of src/ names its imports with no extension, as Vite allows. Either resolves to
// the `.ts` beside it when that file exists; anything else is left to Node.

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL && /\/(src|api)\//.test(ctx.parentURL) && /^\.\.?\//.test(spec)) {
      const ts = /\.js$/.test(spec) ? spec.replace(/\.js$/, '.ts') : /\.[a-z]+$/.test(spec) ? null : `${spec}.ts`;
      if (ts) {
        const url = new URL(ts, ctx.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
      }
    }
    return next(spec, ctx);
  },
});
