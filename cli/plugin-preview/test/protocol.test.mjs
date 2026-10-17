import '../../../scripts/codex-preview-trial.test.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIMessageParamsSchema } from '@openai/mcp-extensions/app';
import { buildChangeMessage } from '../protocol.mjs';

test('request conforms to the pinned OpenAI extension SDK schema', () => {
  const snapshot = { revision: 'files-sha256:test', size: { width: 1920, height: 1080 }, targets: [{ id: 'f0' }], image: 'iVBORw0KGgo=' };
  const message = buildChangeMessage(snapshot, { revision: snapshot.revision, selection: { kind: 'element', id: 'f0' }, request: 'Larger name' });
  assert.doesNotThrow(() => OpenAIMessageParamsSchema.parse(message));
});
