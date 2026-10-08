import { z } from 'zod';
import { requestEditorProposal } from '../../ai/editorProposals';
import type { ModelResult } from '../../ai/modelTypes';
import { discoverCommands, editorProposalSchema, type EditorCommands, type EditorProposal } from './commands';

type Inspection = Extract<ReturnType<EditorCommands['inspect']>, { ok: true }>;
export interface ReviewedProposal {
  proposal: EditorProposal;
  expected: Inspection['expected'];
  transactionId: string;
  changedIds: string[];
  files: string[];
  model: Pick<ModelResult, 'provider' | 'model' | 'usage' | 'attempts'>;
}
export const proposalOutputSchema = () => z.toJSONSchema(editorProposalSchema);
export function captureProposalContext(commands: EditorCommands) {
  const inspection = commands.inspect({ limit: 50 });
  if (!inspection.ok) throw new Error(inspection.refusal.message);
  if (commands.session.commandState().gestureActive) throw new Error('Finish or cancel the current gesture first.');
  const context = { contractVersion: 1, catalog: discoverCommands(), inspection };
  if (JSON.stringify(context).length > 100000) throw new Error('This graphic is too large for a bounded proposal. Use manual controls.');
  return context;
}
export function reviewProposal(commands: EditorCommands, inspection: Inspection, result: ModelResult): ReviewedProposal {
  const parsed = editorProposalSchema.safeParse(result.output);
  if (!parsed.success) throw new Error('The model returned an invalid edit proposal. Request it again.');
  const proposal = parsed.data;
  for (const command of proposal.commands) {
    const args = command.args;
    const targetId = 'targetId' in args ? args.targetId : null;
    const capability = targetId !== null
      ? inspection.targets.find(t => t.id === targetId)?.capabilities[command.id as 'text.set' | 'base.set' | 'animation.key']
      : command.id === 'layer.create' && 'geometry' in args ? inspection.capabilities['layer.create'][args.geometry.shape]
      : inspection.capabilities[command.id as 'step.add' | 'out.set'];
    if (!capability?.supported) throw new Error(capability && 'reason' in capability ? capability.reason : 'The proposal names a target outside the inspected context.');
  }
  const transactionId = crypto.randomUUID();
  let changedIds: string[] = [], files: string[] = [];
  if (proposal.commands.length) {
    const prepared = commands.prepare({ expected: inspection.expected, transactionId, commands: proposal.commands });
    if (!prepared.ok) throw new Error(prepared.refusal.message);
    changedIds = prepared.changedIds; files = prepared.files;
  } else {
    const current = commands.inspect({ limit: 1 });
    if (!current.ok || JSON.stringify(current.expected) !== JSON.stringify(inspection.expected)) throw new Error('The editor changed while this proposal was loading. Request it again.');
  }
  return { proposal, expected: inspection.expected, transactionId, changedIds, files,
    model: { provider: result.provider, model: result.model, usage: result.usage, attempts: result.attempts } };
}
export async function proposeEditorEdits(commands: EditorCommands, prompt: string) {
  if (!prompt.trim() || prompt.length > 4000) throw new Error('Describe the edit in 1 to 4000 characters.');
  const context = captureProposalContext(commands);
  const result = await requestEditorProposal(context, prompt, proposalOutputSchema());
  return reviewProposal(commands, context.inspection, result);
}
