// The server modules the bench shares with the product, compiled the way Vercel compiles them
// (scripts/api-runtime-build.mjs): the Managed Agents client and its stub, and the save door's
// shape check, so what the bench measures is what H9's server will run.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from '../../../scripts/api-runtime-build.mjs';

export const API_SOURCES = ['api/_lib/harness/client.ts', 'api/_lib/harness/managedAgentsStub.ts', 'api/_lib/me/graphicShape.ts'];

export async function loadHarnessApi() {
  const runtime = await buildApiRuntime(API_SOURCES);
  const load = (relative) => import(pathToFileURL(path.join(runtime.outputDir, relative)).href);
  try {
    return {
      client: await load('api/_lib/harness/client.js'),
      stub: await load('api/_lib/harness/managedAgentsStub.js'),
      shape: await load('api/_lib/me/graphicShape.js'),
      graphicDoc: await load('src/model/graphicDoc.js'),
      cleanup: () => runtime.cleanup(),
    };
  } catch (e) {
    await runtime.cleanup();
    throw e;
  }
}
