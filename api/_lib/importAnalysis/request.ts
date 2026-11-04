// The model request the import-analysis route sends: one place, so the route and the
// owner-approved diagnostic (scripts/import-analysis-diagnostic.mjs, #2022) send the same bytes.

import type { ImportAnalysisProfile } from '../aiImportAnalysisProfile.js';
import {
  IMPORT_ANALYSIS_OUTPUT,
  importAnalysisSystemPrompt,
  type ImportAnalysisRequest,
} from '../../../src/ai/importAnalysis/contract.js';
import type { ModelRequest } from '../../../src/ai/modelTypes.js';

export function importAnalysisModelRequest(
  request: Pick<ImportAnalysisRequest, 'image' | 'instructions'>,
  profile: Pick<ImportAnalysisProfile, 'promptVersion' | 'outputTokens'>,
): ModelRequest {
  return {
    system: importAnalysisSystemPrompt(profile.promptVersion),
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            canvas: { width: request.image.width, height: request.image.height },
            instructions: request.instructions ?? '',
          }),
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: request.image.mediaType, data: request.image.base64 },
        },
      ],
    }],
    maxTokens: profile.outputTokens,
    structuredOutput: IMPORT_ANALYSIS_OUTPUT,
  };
}
