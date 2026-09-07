// "Analyze graphic with AI" - the OPTIONAL, PROPOSAL-ONLY assistant on the Import
// Graphic flow (docs/AI_PLATFORM_PLAN.md §6). One server-owned vision call proposes
// text regions, fonts, and an animation; the user reviews each suggestion with a
// checkbox and applies the accepted ones as ordinary draft field specs - the SAME
// DesignFieldSpec -> addPlacedLine path manual placement uses. The manual flow never
// regresses: this panel renders nothing when the server flag is off, in offline
// builds (the status endpoint answers 404), and it never blocks anything.

import { useEffect, useMemo, useState } from 'react';
import type { DesignArt } from '../../../model/wizard';
import { uuid } from '../../../model/id';
import { fontById } from '../../../model/fonts';
import type { DraftPatch, WizardDraft } from '../draft/core';
import {
  downscaleForAnalysis,
  loadImportAnalysisStatus,
  recordImportAnalysisOutcome,
  requestImportAnalysis,
} from '../../../ai/importAnalysis/client';
import { normalizeAnalysis, type AnalysisProposal } from '../../../ai/importAnalysis/normalize';
import type { ImportAnalysisStatusResponse } from '../../../ai/importAnalysis/contract';
import { useAiConsent } from '../../AiConsentDialog';
import { useAuthUi } from '../../auth/authUi';

interface Props {
  art: DesignArt;
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
}

export default function AnalyzeProposalPanel({ art, draft, onDraft }: Props) {
  const [status, setStatus] = useState<ImportAnalysisStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [proposal, setProposal] = useState<AnalysisProposal | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [animChecked, setAnimChecked] = useState(false);
  const { ensureAiConsent, consentDialog } = useAiConsent();
  const openSignIn = useAuthUi((s) => s.openSignIn);

  useEffect(() => {
    let alive = true;
    void loadImportAnalysisStatus()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => {
        // Offline build / no backend / flag off at the route level: no AI UI at all.
        if (alive) setStatus(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // The artwork to analyze: the untouched upload, so baked-in text the user may later
  // erase is still visible to the analyst. (Erased pixels carry no text to transcribe.)
  const artworkDataUrl = typeof draft.designOriginal?.data === 'string' ? draft.designOriginal.data : null;

  const remaining = status?.allowance?.dailySuccessesRemaining;

  const analyze = async () => {
    if (!status || busy || !artworkDataUrl) return;
    if (status.requiresSignIn) {
      openSignIn('Sign in to analyze a graphic with AI.');
      return;
    }
    // This surface has no offline path - an analysis always leaves the machine, so the
    // disclosure gate is unconditional here.
    if (!(await ensureAiConsent())) return;
    setBusy(true);
    setError(null);
    try {
      const image = await downscaleForAnalysis(artworkDataUrl);
      const result = await requestImportAnalysis(image, instructions);
      const normalized = normalizeAnalysis(result.analysis, art, uuid);
      setProposal(normalized);
      setAnalysisId(result.analysisId);
      // Confident suggestions arrive pre-checked; hesitant ones ask for the user's eye.
      setChecked(new Set(normalized.fields.filter((f) => f.confidence >= 0.5).map((f) => f.id)));
      setAnimChecked(Boolean(normalized.animation));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applySelected = () => {
    if (!proposal) return;
    const specs = proposal.fields
      .filter((field) => checked.has(field.id))
      .map(({ confidence: _confidence, ...spec }) => spec);
    const patch: DraftPatch = {};
    if (specs.length) patch.designFields = [...draft.designFields, ...specs];
    if (animChecked && proposal.animation) {
      patch.animation = {
        presetId: proposal.animation.presetId,
        direction: proposal.animation.direction,
        speed: proposal.animation.speed,
      };
    }
    if (patch.designFields || patch.animation) onDraft(patch);
    if (analysisId) {
      void recordImportAnalysisOutcome({
        analysisId,
        action: 'accepted',
        acceptedRegions: specs.length + (animChecked && proposal.animation ? 1 : 0),
      }).catch(() => undefined);
    }
    setProposal(null);
    setAnalysisId(null);
  };

  const dismiss = () => {
    if (analysisId) {
      void recordImportAnalysisOutcome({
        analysisId,
        action: 'dismissed',
        dismissReason: 'other',
      }).catch(() => undefined);
    }
    setProposal(null);
    setAnalysisId(null);
  };

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fontLabel = useMemo(
    () => (fontId: string | null) => (fontId ? fontById(fontId).family : 'Design typeface'),
    [],
  );

  // Server flag off, offline build, or no artwork yet: the manual flow stands alone.
  if (!status?.enabled || !artworkDataUrl) return null;

  return (
    <div className="ana-panel" data-testid="import-analysis-panel">
      {!proposal && (
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <button data-testid="import-analyze" disabled={busy} onClick={() => void analyze()}>
            {busy ? 'Analyzing…' : '✨ Analyze graphic with AI'}
          </button>
          <span className="hint">
            For artwork with text drawn INTO it: reads what it says, proposes a field per line
            and a matching typeface. An empty panel needs none of this - ✨ Suggest fields
            already measures that for free. You review every suggestion.
            {typeof remaining === 'number' ? ` ${remaining} analysis(es) left today.` : ''}
          </span>
        </div>
      )}
      {error && <p className="ana-error" role="alert">{error}</p>}

      {proposal && (
        <div className="ana-result">
          <p className="ana-head">
            Looks like a <strong>{proposal.graphicType}</strong>
            {' '}<span className="ana-conf">{Math.round(proposal.graphicTypeConfidence * 100)}%</span>
            {proposal.skipped.nonText > 0 && (
              <span className="hint"> · {proposal.skipped.nonText} non-text region(s) noted, not proposed</span>
            )}
          </p>
          {proposal.fields.length === 0 && (
            <p className="hint">No editable-looking text was found on the artwork.</p>
          )}
          {proposal.fields.map((field) => (
            <label key={field.id} className="ana-field" data-testid="import-analysis-field">
              <input
                type="checkbox"
                checked={checked.has(field.id)}
                onChange={() => toggle(field.id)}
              />
              <span className="ana-field-main">
                <strong>{field.title}</strong> - “{field.text}”
                <span className="hint">
                  {' '}{fontLabel(field.fontId)}, {field.fontSize}px, {field.align}
                </span>
              </span>
              <span className="ana-conf">{Math.round(field.confidence * 100)}%</span>
            </label>
          ))}
          {proposal.animation && (
            <label className="ana-field" data-testid="import-analysis-animation">
              <input
                type="checkbox"
                checked={animChecked}
                onChange={() => setAnimChecked((prev) => !prev)}
              />
              <span className="ana-field-main">
                <strong>Animation</strong> - {proposal.animation.presetId.replace('design-', '')},{' '}
                {proposal.animation.direction}, ×{proposal.animation.speed}
              </span>
            </label>
          )}
          {proposal.warnings.length > 0 && (
            <ul className="ana-warnings">
              {proposal.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button
              className="primary"
              data-testid="import-analysis-apply"
              onClick={applySelected}
              disabled={checked.size === 0 && !(animChecked && proposal.animation)}
            >
              Apply selected
            </button>
            <button onClick={dismiss}>Dismiss</button>
            <input
              className="ana-instructions"
              placeholder="Re-run with instructions…"
              value={instructions}
              maxLength={status.limits.instructionChars}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <button disabled={busy || !instructions.trim()} onClick={() => void analyze()}>
              {busy ? '…' : 'Re-run'}
            </button>
          </div>
        </div>
      )}

      {consentDialog}
    </div>
  );
}
