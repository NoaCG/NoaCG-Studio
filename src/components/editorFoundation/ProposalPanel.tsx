import { useCallback, useEffect, useRef, useState } from 'react';
import { aiConfigured, refreshAiConfiguration } from '../../ai/settings';
import { useAiConsent } from '../AiConsentDialog';
import { useAuthState } from '../auth/useAuthState';
import SignInPrompt from '../auth/SignInPrompt';
import { activeEditorCommands } from './commandAdapter';
import { proposeEditorEdits, type ReviewedProposal } from './proposals';
import type { EditorCommands, EditorProposal } from './commands';

function describeCommand(command: EditorProposal['commands'][number]) {
  const args = command.args;
  if (command.id === 'layer.create' && 'geometry' in args) {
    const g = args.geometry;
    return `Create ${g.shape} at (${g.x}, ${g.y}), ${g.width} by ${g.height} pixels${g.box ? ', with text box' : ''}.`;
  }
  if (command.id === 'text.set' && 'text' in args) return `Set ${args.targetId} wording to "${args.text}".`;
  if (command.id === 'base.set' && 'values' in args) return `Position ${args.targetId}: ${Object.entries(args.values).map(([axis, value]) => `${axis} = ${value} pixels`).join(', ')}. Motion is preserved.`;
  if (command.id === 'animation.key' && 'property' in args) return `Animate ${args.targetId}: ${args.property} offset ${args.value} pixels at ${args.time}s within cue ${args.step}.`;
  if ('time' in args) return `${command.id === 'step.add' ? 'Add Next cue' : 'Set Out cue'} at ${args.time}s.`;
  return command.id;
}

type Receipt = Extract<ReturnType<EditorCommands['apply']>, { ok: true }>;
export default function ProposalPanel({ close }: { close(): void }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ReviewedProposal | null>(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [previewStatus, setPreviewStatus] = useState('');
  const [configured, setConfigured] = useState(aiConfigured);
  const requestGeneration = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const invalidateRequest = useCallback(() => { requestGeneration.current++; }, []);
  const { needsSignIn } = useAuthState();
  const { ensureAiConsent, consentDialog } = useAiConsent();
  useEffect(() => {
    input.current?.focus();
    let alive = true;
    void refreshAiConfiguration()
      .then(() => { if (alive) setConfigured(aiConfigured()); }).catch(() => undefined);
    return () => { alive = false; invalidateRequest(); };
  }, [invalidateRequest]);
  useEffect(() => {
    if (!receipt) return;
    if (receipt.state === 'unchanged') { setPreviewStatus('No source changes.'); return; }
    const commands = activeEditorCommands();
    const update = () => {
      const inspection = commands.inspect({ limit: 1 });
      if (!inspection.ok) { setPreviewStatus('Applied. Preview unavailable.'); return true; }
      if (inspection.expected.revision.source !== receipt.expected.revision.source || inspection.expected.revision.assets !== receipt.expected.revision.assets) {
        setPreviewStatus('Applied. The graphic has newer edits.'); return true;
      }
      const state = inspection.preview.state;
      setPreviewStatus(state === 'ready' ? 'Applied. Preview ready.' : state === 'failed' || state === 'unavailable'
        ? 'Applied. Preview unavailable.' : 'Applied. Preview updating.');
      return state === 'ready' || state === 'failed' || state === 'unavailable';
    };
    if (update()) return;
    const timer = window.setInterval(() => { if (update()) window.clearInterval(timer); }, 200);
    return () => window.clearInterval(timer);
  }, [receipt]);
  const cancel = () => { invalidateRequest(); setBusy(false); setPending(null); setError(''); };
  const propose = async () => {
    const generation = ++requestGeneration.current;
    setBusy(true); setPending(null); setReceipt(null); setPreviewStatus(''); setError('');
    try {
      if (!(await ensureAiConsent()) || generation !== requestGeneration.current) return;
      const reviewed = await proposeEditorEdits(activeEditorCommands(), prompt);
      if (generation === requestGeneration.current) setPending(reviewed);
    } catch (cause) {
      if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : 'The proposal could not be loaded.');
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  };
  const apply = () => {
    if (!pending) return;
    const result = activeEditorCommands().apply({ expected: pending.expected, transactionId: pending.transactionId, commands: pending.proposal.commands });
    setPending(null);
    if (!result.ok) { setError(result.refusal.message); return; }
    setError(''); setReceipt(result);
    setPreviewStatus(result.state === 'unchanged' ? 'No source changes.' : 'Applied. Preview updating.');
  };
  return <aside className="ef-inspector ef-proposal-panel" aria-label="Editor assistant" data-testid="editor-proposals"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancel(); } }}>
    <div className="ef-toolbar"><strong>Assistant</strong><span className="ef-spacer" /><button aria-label="Close assistant" onClick={close}>×</button></div>
    {needsSignIn ? <SignInPrompt feature="Editor assistant" reason="Sign in to use the editor assistant." /> : <div className="ef-inspector-body">
      <label className="ef-proposal-input">Describe an edit<textarea ref={input} value={prompt} maxLength={4000} rows={3}
        onChange={event => setPrompt(event.target.value)} placeholder="Change the selected text" /></label>
      {!configured && <p className="ef-muted">Configure AI in New graphic → AI settings. Manual editing is available.</p>}
      <div className="ef-edit-actions"><button disabled={busy || !configured || !prompt.trim()} onClick={() => void propose()}>Propose edits</button>
        {(busy || pending) && <button onClick={cancel}>Cancel</button>}</div>
      {busy && <p role="status">Preparing proposal…</p>}
      {error && <p role="alert">{error}</p>}
      {pending && <section aria-label="Proposed edits">
        <p>{pending.proposal.summary}</p>
        <ol className="ef-proposal-commands">{pending.proposal.commands.map((command, index) => <li key={index}>
          <p>{describeCommand(command)}</p></li>)}</ol>
        {!!pending.proposal.commands.length && <>
          <p>Affected: {pending.changedIds.length ? pending.changedIds.join(', ') : 'Composition cues'}</p>
          <button className="primary" onClick={apply}>Apply edits</button>
        </>}
      </section>}
      {previewStatus && <p role="status" data-testid="proposal-commit-status">{previewStatus}</p>}
    </div>}
    {consentDialog}
  </aside>;
}
