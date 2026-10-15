// The coding-agent prompt is one short text, on the reviewed CLI version, rendered where it is shown.
// guards: scripts/agent-prompt.mjs, downloads.html, docs.html, cli/package.json, vite.config.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AGENT_PROMPT, AGENT_PROMPT_MARKER, CLI_VERSION, renderAgentPrompt } from './agent-prompt.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

test('the prompt is at most 80 words and runs the reviewed CLI version through npx', () => {
  assert.ok(AGENT_PROMPT.split(/\s+/).length <= 80, `${AGENT_PROMPT.split(/\s+/).length} words`);
  assert.equal(CLI_VERSION, JSON.parse(read('cli/package.json')).version);
  assert.match(AGENT_PROMPT, new RegExp(`^Use npx -y @noacg/cli@${CLI_VERSION.replace(/\./g, '\\.')} `));
  // Exactly one command form, so a reader cannot pick an unpinned one out of it.
  assert.equal(count(AGENT_PROMPT, '@noacg/cli'), 1);
});

test('the prompt connects before the brief and asks for every graphic in the library', () => {
  // Preflight once, reuse a valid login or ask for one, then the brief (AC-3).
  const order = ['doctor', 'docs skill', 'whoami', 'login', 'decline', 'ask what to make'].map((word) =>
    AGENT_PROMPT.indexOf(word),
  );
  assert.ok(order.every((at) => at >= 0), `every step is named: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.match(AGENT_PROMPT, /work locally and say nothing was saved/);
  assert.match(AGENT_PROMPT, /save every graphic to my library, and return the direct links/);
  assert.match(AGENT_PROMPT, /anything still pending or unconfirmed/);
  // Public copy: no em dash (scripts/check-copy.mjs does not read this file).
  assert.doesNotMatch(AGENT_PROMPT, /—/);
});

test('Downloads and the docs each render the one prompt, and carry no copy of their own', () => {
  for (const file of ['downloads.html', 'docs.html']) {
    const html = read(file);
    assert.equal(count(html, AGENT_PROMPT_MARKER), 1, `${file} holds the marker once`);
    assert.ok(!html.includes('npx -y @noacg/cli@'), `${file} has no hand-written versioned command`);
    assert.ok(!html.includes('Set up NoaCG Studio so you can build'), `${file} has no old setup prompt`);
  }
  assert.ok(read('vite.config.ts').includes('[AGENT_PROMPT_MARKER]: () => renderAgentPrompt()'));
});

test('on Downloads the prompt leads the CLI card, the requirements beside it and the plugin after it', () => {
  const html = read('downloads.html');
  const card = html.slice(html.indexOf('id="cli"'), html.indexOf('</section>', html.indexOf('id="cli"')));
  const at = (needle) => {
    const i = card.indexOf(needle);
    assert.ok(i >= 0, `the CLI card holds ${needle}`);
    return i;
  };
  assert.ok(at('Node.js 20 or newer, and Chrome or Edge') < at(AGENT_PROMPT_MARKER));
  assert.ok(at(AGENT_PROMPT_MARKER) < at('Optional: install the plugin'));
  assert.ok(at(AGENT_PROMPT_MARKER) < at('/plugin install noacg'));
});

test('the rendered block is a wrapping prompt whose markup carries the exact text', () => {
  const block = renderAgentPrompt();
  assert.match(block, /^<pre class="prompt" data-testid="agent-prompt"><code>/);
  const text = block.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.equal(text, AGENT_PROMPT);
});
