// The probe's whole job is reading the three shapes a transcript records an instruction load in,
// so each shape is pinned here with a line of the form the harness writes.
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadsIn } from './instruction-load-probe.mjs';

const line = (attachment) => JSON.stringify({ type: 'attachment', attachment });

test('loadsIn reads start-up files, reads pulled in on a Read, and hook-injected contents', () => {
  const transcript = [
    line({ type: 'instructions', files: [{ path: 'C:\\repo\\CLAUDE.md', type: 'Project' }, { path: 'C:\\repo\\AGENTS.md', type: 'Project' }] }),
    JSON.stringify({ type: 'user', message: { content: 'no attachment here' } }),
    line({ type: 'nested_memory', path: 'C:\\repo\\.claude\\rules\\src-model.md' }),
    line({ type: 'hook_additional_context', hookName: 'tool.call', content: ['Contents of C:\\repo\\src\\AGENTS.md:\n\n# src\n...'] }),
  ].join('\n');
  assert.deepEqual(loadsIn(transcript), [
    { path: 'C:\\repo\\CLAUDE.md', how: 'start' },
    { path: 'C:\\repo\\AGENTS.md', how: 'start' },
    { path: 'C:\\repo\\.claude\\rules\\src-model.md', how: 'on read' },
    { path: 'C:\\repo\\src\\AGENTS.md', how: 'hook tool.call' },
  ]);
});
