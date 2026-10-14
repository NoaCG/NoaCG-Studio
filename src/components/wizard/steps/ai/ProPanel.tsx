// THE PRO TIER'S SCREEN, QUARANTINED (docs/work-specs/wizard-ai/spec.md, D4).
//
// Hosted Pro's door is closed pending https://github.com/NoaCG/NoaCG-Studio/issues/771, so the
// step's `proMode` is always false and nothing here renders. The code is preserved, not deleted
// (owner, 2026-10-13): it moved here from the step as it was, and keeps compiling, so reopening
// the tier is what the door note in the step says and nothing more. The step renders each piece
// behind the guard it always had; its run is the 'pro' route of src/ai/creation.ts.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadAiSettings, saveAiSettings } from '../../../../ai/settings';
import type { ProGenerateResult } from '../../../../ai/pro/language/pipeline';
import {
  PRO_GRAPHICS,
  PRO_PACKAGE_LIST,
  type ProGraphicId,
  type ProPackageMember,
} from '../../../../ai/pro/language/graphics';
import { loadProStatus } from '../../../../ai/pro/session';
import type { ProStatusResponse } from '../../../../ai/pro/types';
import { PRO_SUPPORTED_CATEGORIES } from '../../../../ai/pro/brief';
import type { GenerationSpec } from '../../../../model/generationSpec';
import type { SpxTemplate } from '../../../../model/types';
import MiniPreview from '../../MiniPreview';

/** The Pro tier's state and its status read. The step calls it where they always ran. */
export function useProTier(needsSignIn: boolean) {
  // undefined = still resolving; null = no hosted Pro on this server.
  const [proStatus, setProStatus] = useState<ProStatusResponse | null | undefined>(undefined);
  /**
   * WHICH GRAPHICS THIS PRO GENERATION MAKES (§15.9). Persisted like every other AI preference,
   * normalized by `loadAiSettings` so it is always in package order and never empty.
   *
   * The FIRST member is the primary: the graphic the live preview shows, the one a refinement
   * would act on, and the one the wizard treats as the project when the package is a set of one.
   */
  const [proPackage, setProPackage] = useState<ProGraphicId[]>(() => loadAiSettings().proPackage);
  const primaryGraphic = proPackage[0] ?? 'lower-third';
  /** Members the platform's own gate refused, named so a short package is never a silent one. */
  const [proDropped, setProDropped] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void loadProStatus()
      .then((status) => {
        if (alive) setProStatus(status);
      })
      .catch(() => {
        if (alive) setProStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [needsSignIn]);
  // HOSTED PRO IS THE ONLY PRO (owner, 2026-08-14). A NoaCG tier runs on NoaCG's own service or
  // it is not offered - it never asks a customer for a key to reach our own models. So the tier
  // appears on exactly two conditions, both of which have to be true at once: the SERVER says
  // hosted Pro is available to this visitor (`AI_PRO_ENABLED` plus their entitlement and
  // allowance), and this deployment actually carries the backend that route is metered through.
  // The second is not belt-and-braces: hosted Pro reserves and settles per account, so a build
  // with no backend cannot run it however the status answers.
  const proHosted = Boolean(proStatus?.available);
  // The Pro concept + editability report behind each pro-path template, keyed by the
  // template OBJECT so an archived then restored result still shows its own concept.
  const proDetails = useRef(new WeakMap<SpxTemplate, ProGenerateResult>());
  /**
   * THE REST OF THE PACKAGE, keyed by the graphic the step previews (§15.9).
   *
   * A WeakMap for the same reason `proDetails` is one: `turns` keeps earlier generations whole
   * and "↩ Bring back" restores them, so a package has to travel with ITS OWN result rather
   * than in a piece of state the next generation overwrites. The entry always LEADS with the
   * previewed graphic, so `pack[0] === result` and a consumer never has to merge two lists.
   */
  const proPack = useRef(new WeakMap<SpxTemplate, ProPackageMember[]>());
  return {
    proStatus,
    setProStatus,
    proHosted,
    proPackage,
    setProPackage,
    primaryGraphic,
    proDropped,
    setProDropped,
    proDetails,
    proPack,
  };
}

export type ProTier = ReturnType<typeof useProTier>;

/**
 * The Pro tier's v1 pipeline compiles lower thirds only - a category it cannot carry
 * resets to 'auto' (the Lite pattern) rather than being silently reinterpreted.
 */
export function useProCategory(
  proMode: boolean,
  category: GenerationSpec['category'],
  setSpec: Dispatch<SetStateAction<GenerationSpec>>,
) {
  useEffect(() => {
    if (!proMode) return;
    if (category !== 'auto' && !(PRO_SUPPORTED_CATEGORIES as readonly string[]).includes(category)) {
      setSpec((current) => ({ ...current, category: 'auto', categoryInferred: false }));
    }
  }, [proMode, category, setSpec]);
}

/** Beside the uploads: what the Pro tier does with them. */
export function ProUploadNote() {
  return (
    <p className="hint" data-testid="pro-upload-note">
      An as-is mark is seated in the design and its shape and ink are measured, so the
      look is chosen around it. Style references do not steer the design yet. Colours
      read from your image can be applied as the exact brand accent below.
    </p>
  );
}

/* Pro has NO chooser at all — no provider, no model, no key. The copy states the
    outcome and stops there, so replacing what runs underneath costs no wording
    and promises nothing about how it is done. */
export function ProSettings({ tier, busy }: { tier: ProTier; busy: string | null }) {
  const { proStatus, proPackage, setProPackage, primaryGraphic } = tier;
  return (
    <div style={{ marginTop: 10 }} data-testid="ai-pro-settings">
      {/* Nothing to choose, know, or supply — no provider, no model, no key. The
          allowance read-back is the only thing worth showing, because it is the one
          limit the user can actually run into. The tier is not offered at all where
          that is not true, so there is no second branch here asking for a key. */}
      <p className="hint" data-testid="ai-pro-hosted-note">
        NoaCG Pro runs on NoaCG&apos;s own service. There is nothing to configure and
        no key to supply. It picks its own model, and the real cost of each
        generation is shown on the result.
        {proStatus?.allowance
          // THE SMALLER OF THE TWO, because the allowance is two counters and a user
          // meets whichever runs out first. Measured 2026-08-15: the panel read
          // "1 generation(s) left today" from the STARTS counter while the SUCCESSES
          // counter was already spent, so Create came back disabled under a sentence
          // promising another go - the exact drift api/_lib/lite/status.ts warns
          // about, arriving on the read-back side instead of the gate side.
          ? ` ${Math.min(
            proStatus.allowance.dailyStartsRemaining,
            proStatus.allowance.dailySuccessesRemaining,
          )} generation(s) left today,
              ${Math.min(
            proStatus.allowance.monthlyStartsRemaining,
            proStatus.allowance.monthlySuccessesRemaining,
          )} this month.`
          : ''}
      </p>
      {/* ── THE PACKAGE (docs/NOACG_PRO_PLAN.md §15.9) ─────────────────────────
          This is the ONE thing a Pro user chooses, and it is here rather than
          beside the prompt because it is a property of the RUN, like the tier
          itself, not part of the brief. Every box is ticked by default: the whole
          package costs exactly one model call, so the only reason to untick one is
          that the show does not need that graphic.
          The LAST tick cannot be removed - a generation that makes nothing is not
          a choice anyone means to express - so the sole remaining box is disabled
          rather than silently re-added on the next load. */}
      <fieldset className="ai-pro-package" data-testid="pro-package">
        <legend className="dlg-caption">What this makes</legend>
        {PRO_PACKAGE_LIST.map((spec) => {
          const on = proPackage.includes(spec.id);
          const onlyOne = on && proPackage.length === 1;
          return (
            <label
              key={spec.id}
              className="dlg-check"
              data-testid={`pro-package-${spec.id}`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!!busy || onlyOne}
                onChange={() => {
                  // Rebuilt from the canonical ORDER rather than by pushing onto the
                  // end: the first member is the graphic the step previews, and a
                  // tick further down the list must not move it.
                  const next = PRO_PACKAGE_LIST
                    .map((s) => s.id)
                    .filter((id) => (id === spec.id ? !on : proPackage.includes(id)));
                  setProPackage(next);
                  saveAiSettings({ proPackage: next });
                }}
              />
              <span>
                <strong>{spec.label}</strong>
                <span className="hint">
                  {spec.id === primaryGraphic
                    ? 'Shown in the preview, and the one a refinement changes.'
                    : 'Composed from the same design language, with no extra generation.'}
                </span>
              </span>
            </label>
          );
        })}
        <p className="hint">
          One generation, {proPackage.length === 1 ? 'one graphic' : `${proPackage.length} graphics`}
          {proPackage.length > 1
            ? ' that belong to each other. Only the design language is generated; the platform composes each graphic from it.'
            : '.'}
        </p>
      </fieldset>
    </div>
  );
}

/* The Pro result's own story: the DESIGN LANGUAGE the model decided, and every
    place the platform decided something for it. There is no concept image to show
    any more - the graphic IS the answer, rendered live above this card, and the
    picture the old engine displayed was the one thing it could not keep (§16). */
export function ProReport({ tier, result }: { tier: ProTier; result: SpxTemplate }) {
  const { proDetails, proPack, proDropped } = tier;
  const pro = proDetails.current.get(result);
  if (!pro) return null;
  const swatches: [string, string][] = [
    ['accent', pro.language.palette.accent],
    ['panel', pro.language.palette.panel],
    ['text', pro.language.palette.text],
    ['supporting', pro.language.palette.textDim],
  ];
  return (
    <div className="wz-pro-concept" style={{ marginTop: 8 }} data-testid="pro-report">
      {/* The RATIONALE is not repeated here: it is already the result summary one
          line above, which is the slot every path writes its reasoning into. */}
      {/* `wrap`, because this row carries a model-chosen NAME beside four swatches
          and three enum words - a long look name on a narrow step would otherwise
          push the palette off the card. */}
      <div className="row wrap" style={{ gap: 6, alignItems: 'center' }} data-testid="pro-palette">
        <strong style={{ marginRight: 2 }}>{pro.language.name}</strong>
        {swatches.map(([role, hex]) => (
          <span
            key={role}
            title={`${role} ${hex}`}
            style={{
              width: 18, height: 18, borderRadius: 4, background: hex,
              border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block',
            }}
          />
        ))}
        <span className="hint">
          {pro.language.typography.fontId} · {pro.language.density} · {pro.language.motion.character}
        </span>
      </div>
      {/* WHAT THE PLATFORM DECIDED, said out loud. A repair the user cannot see is
          a promise nobody can check (the Lite brand rule), and these are the same
          divergences the ledger row now carries as `pro-` codes. */}
      <ul className="hint" data-testid="pro-outcomes">
        {pro.notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
      {/* ── THE PACKAGE, as it actually looks (§15.9) ──────────────────────────
          A list of names cannot answer the only question a package raises - do
          these belong to each other - so the members are rendered, small, beside
          the primary the preview shows large. Same reasoning as the kit Finish
          step's thumbnail grid, one surface earlier: the claim is checkable here,
          before anything is created. */}
      {(() => {
        const pack = proPack.current.get(result) ?? [];
        if (pack.length < 2) return null;
        return (
          <div className="wz-kit-built-wrap" data-testid="pro-package-built">
            <p className="hint">
              The whole package, from this one design language:
            </p>
            <ul className="wz-kit-built">
              {pack.map((member, index) => (
                <li key={`${member.id}-${index}`} className="wz-kit-built-cell">
                  <MiniPreview template={member.template} lazy />
                  <span className="wz-kit-built-name">{PRO_GRAPHICS[member.id].label}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
      {proDropped.length > 0 && (
        // A short package is never a SILENT one. The composer cannot emit invalid
        // code, so a member the gate refused is a platform defect worth naming
        // rather than a graphic to quietly leave out of the set.
        <p className="hint status-bad" data-testid="pro-package-dropped">
          ⚠ {proDropped.join(' and ')} did not pass the platform&apos;s own checks and
          {proDropped.length === 1 ? ' is' : ' are'} not in this set.
        </p>
      )}
      {pro.fallbacks.length > 0 && (
        <p className="hint" data-testid="pro-warning">
          ⚠ {pro.fallbacks.length} design decision(s) came back unreadable and fell
          back to the house look.
        </p>
      )}
      <p className="hint">
        Designed by {pro.model}
        {pro.costUsd > 0 ? ` · $${pro.costUsd.toFixed(4)}` : ''}
      </p>
    </div>
  );
}

/** On a failing Pro result: why no repair call is offered. */
export function ProFailingNote() {
  return (
    <p className="hint" style={{ marginTop: 8 }}>
      NoaCG builds this graphic deterministically, so a failing check here is a NoaCG
      platform defect. Generate a new design rather than spending repair calls.
    </p>
  );
}
