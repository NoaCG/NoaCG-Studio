// globalSetup for every configured run (playwright.live.config.ts, and the instrument config that
// spreads it): refuse to start unless the backend is one this run owns.
//
// WHY HERE. Playwright runs `globalSetup` before the first test and before any spec module is
// imported, which is earlier than any write - including the service-key writes several specs make
// in `beforeAll`. It is also the one place every entry point passes through, whatever started it:
// `npm run test:e2e:live`, a CI step, `scripts/configured-trial.mjs`, a bare `npx playwright test
// --config=playwright.live.config.ts`. `e2e/_offline-guard.ts` closes the offline suite's
// equivalent hole from the same seam, for the same reason.
//
// WHY NOT AT CONFIG SCOPE, one line earlier. The config module is imported by things that are not
// runs - `scripts/dev-port-readonly.test.mjs` imports all three configs to prove loading one
// reserves no port - and those imports happen on machines whose `.env` legitimately points at
// production. A refusal there would fail a unit test for having a production `.env`, which is not
// the fault being fixed. `webServer` starts between the two points; it is a Vite dev server, it
// writes nothing, and the run dies before a single test.
//
// The rules themselves, and the incident that bought them, are in scripts/configured-target.mjs.
import { assertConfiguredTarget, DECLARATION, DEPLOYED_SITE, describeTarget } from '../scripts/configured-target.mjs';

export default async function configuredGuard(): Promise<void> {
  const target = assertConfiguredTarget(process.env, 'the configured suite');
  // The deployed-site declaration belongs to playwright.production.config.ts, whose suite writes
  // nothing. This one signs in and writes, so it is the local stack or a declared staging project
  // and nothing else - otherwise a shell could set that word and point this suite anywhere.
  if (target.kind === DEPLOYED_SITE) {
    throw new Error(
      `Refusing to start the configured suite: ${DECLARATION}=${DEPLOYED_SITE} is the deployed site's anonymous suite (playwright.production.config.ts). This suite signs in and writes rows, so it needs a local stack.`,
    );
  }
  console.log(`Configured backend - ${describeTarget(target)}`);
}
