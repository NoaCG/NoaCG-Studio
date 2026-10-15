// THE ONE PROMPT A PERSON PASTES INTO THEIR CODING AGENT to make NoaCG graphics in the session
// they already have open (docs/work-specs/agent-delivery/spec.md, Phase 1).
//
// Owner, 2026-10-15: one short prompt on Downloads that works without installing the plugin,
// connects the account at the beginning, and ends with the graphics in that account. The plugin
// stays optional, below the prompt. A plugin only loads in the NEXT session, so the prompt has to
// carry the workflow itself: preflight once, reuse or ask for the account connection before the
// brief, save every graphic to the library and return its link, and name what is still pending.
//
// ONE SOURCE, RENDERED WHERE IT IS SHOWN. downloads.html (#cli) and docs.html (#agent-install)
// each hold the marker below, and the generated-pages plugin in vite.config.ts replaces it with
// renderAgentPrompt(), in the dev server and in the build, so the pages are complete without
// JavaScript and cannot carry two different prompts. The studio's Create with AI card links the
// docs copy (AgentRouteCard.tsx). The CLI version is cli/package.json's, the same number
// cli/scripts/build-skill.mjs pins into the skill and the plugin READMEs, so the prompt names the
// reviewed release rather than whatever npm calls latest.

import { readFileSync } from 'node:fs';

/** The reviewed CLI version: the one number a release bumps (cli/package.json). */
export const CLI_VERSION = JSON.parse(readFileSync(new URL('../cli/package.json', import.meta.url), 'utf8')).version;

/** The prompt, as the Copy button puts it on the clipboard. At most 80 words (AC-2). */
export const AGENT_PROMPT = [
  `Use npx -y @noacg/cli@${CLI_VERSION} for every NoaCG command in this session.`,
  'Run its doctor, read docs contract, and check whoami.',
  'If I am not logged in, run login so I can connect my account in the browser;',
  'if I decline, work locally and say nothing was saved.',
  'Then ask what to make.',
  'Build, validate with screenshots, save every graphic to my library, and return the direct links.',
  'Clearly state anything still pending.',
].join(' ');

export const AGENT_PROMPT_MARKER = '<!--agent:prompt-->';

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The prompt block a page shows: a `pre.prompt`, which wraps as prose, and which
 *  src/docs/docs.ts gives the docs' Copy button like every other command block. */
export function renderAgentPrompt() {
  return `<pre class="prompt" data-testid="agent-prompt"><code>${escapeHtml(AGENT_PROMPT)}</code></pre>`;
}
