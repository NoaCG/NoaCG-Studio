import { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { EXPORT_TARGETS, type GraphicUsage } from '../export/registry';
import { validateOgrafOfflineCompatibility } from '../export/targets/ograf';
import { slug } from '../model/slug';
import { loadPrefs, savePrefs } from '../model/prefs';
import { isRenderConfigured } from '../render/config';
import RenderPanel from './render/RenderPanel';
import PlayoutCompatibility from './PlayoutCompatibility';
import { graphicById } from '../model/library';
import { trackEvent } from '../backend/events';
import type { SpxTemplate } from '../model/types';
import type { ProjectLegibility } from '../model/designRules';
import { validateTemplate, type ValidationIssue, type ValidationResult } from '../validation/validateTemplate';
import { checkTemplateLegibility } from '../validation/designRulesWarnings';

interface Props {
  /** The graphic being exported. The EXPORT SURFACE never reads the store: the same targets,
   *  the same gate and the same packages have to work for a template that is not the open
   *  project — a saved graphic exported from Home, or one the wizard has just built and not
   *  applied to anything yet. */
  template: SpxTemplate;
  /** Field values baked in by the targets that have no playout server (the HTML overlay). */
  sampleData: Record<string, string>;
  /** The library record this template belongs to, if any. Its control-panel ENTRIES are read
   *  FRESH at export time (never held in state) and bundled into the targets that ship an
   *  operator page. A graphic that was never saved simply has none, which is the honest
   *  answer: entries are authored on the record, not on the code. */
  graphicId: string | null;
  /** A runtime error observed in a live preview of this template, folded into validation.
   *  The wizard's window has no such preview and passes null. */
  runtimeError?: string | null;
  /** Publishes each validation result. The dock panel feeds the store with it (the render
   *  section and the export gate share one verdict); the standalone window does not, so
   *  exporting a saved graphic never overwrites the open project's status. */
  onValidation?: (result: ValidationResult) => void;
  /** The project's legibility settings the design-rules WARNINGS are computed under
   *  (model/designRules.ts). Absent = read them off the library record (`graphicId`), else
   *  the defaults (TV viewing, standard floors). Warnings only — export never blocks on them
   *  (the ratified R4 severity policy). */
  legibility?: ProjectLegibility | null;
}

/**
 * The export surface — target list, the validate-and-download gate, the inline validation
 * report, and (where a render backend is configured) the video & image section.
 *
 * Validation lives HERE, not in a separate tab: the checks run automatically whenever the
 * surface is open, results are listed inline, and the download stays gated on zero errors.
 */
export default function ExportSurface({
  template,
  sampleData,
  graphicId,
  runtimeError = null,
  onValidation,
  legibility,
}: Props) {
  // The target preselects from the remembered preference (Settings, or simply the last pick).
  const [targetId, setTargetId] = useState(() => {
    const preferred = loadPrefs().defaultExportTarget;
    return EXPORT_TARGETS.some((t) => t.id === preferred) ? preferred : EXPORT_TARGETS[0].id;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [graphicUsage, setGraphicUsage] = useState<GraphicUsage>('live');

  const pickTarget = (id: string) => {
    setTargetId(id);
    savePrefs({ defaultExportTarget: id }); // remember the choice as the new default
  };

  const target = EXPORT_TARGETS.find((t) => t.id === targetId)!;
  const ografCompatibility = useMemo(
    () => validateOgrafOfflineCompatibility(template),
    [template],
  );
  const offlineRequested =
    targetId === 'ograf' && graphicUsage !== 'live';
  const targetCompatible = !offlineRequested || ografCompatibility.compatible;

  // The design-rules legibility warnings (R4, warn-first): measured on a settled offscreen
  // render, debounced so typing in the editor does not mount a frame per keystroke. Under
  // the project's own viewing settings — the store's for the open project, the saved
  // record's for a Home-card export, the defaults otherwise.
  const [ruleWarnings, setRuleWarnings] = useState<ValidationIssue[]>([]);
  // Serialized so the effect keys on the VALUE — the object is re-derived every render.
  const ruleSettingsKey = JSON.stringify(
    legibility ?? (graphicId ? graphicById(graphicId)?.legibility ?? null : null),
  );
  useEffect(() => {
    let cancelled = false;
    const settings = ruleSettingsKey ? (JSON.parse(ruleSettingsKey) as ProjectLegibility | null) : null;
    const timer = setTimeout(() => {
      void checkTemplateLegibility(template, settings).then((w) => {
        if (!cancelled) setRuleWarnings(w);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, ruleSettingsKey]);

  // Live validation: re-runs when the template (or a preview runtime error) changes. The
  // legibility warnings merge in as WARNINGS — they can never gate the download.
  const validation = useMemo(() => {
    const base = validateTemplate(template, { runtimeError });
    return ruleWarnings.length ? { ...base, warnings: [...base.warnings, ...ruleWarnings] } : base;
  }, [template, runtimeError, ruleWarnings]);
  // Block body on purpose: an arrow returning the callback's result would hand React whatever
  // the host returns as a CLEANUP function.
  useEffect(() => {
    onValidation?.(validation);
  }, [validation, onValidation]);

  const exportZip = async () => {
    setMessage(null);
    if (!validation.ok) return;
    setBusy(true);
    try {
      const entries = graphicId ? graphicById(graphicId)?.entries : undefined;
      const zip = await target.build(template, { sampleData, entries, graphicUsage });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${slug(template.name)}_${target.id}.zip`);
      // The funnel's last step, counted only once the file actually reached the disk - a
      // failed build below is not an export. The target id is the whole payload.
      trackEvent('export', target.id);
      // Each target carries its own success line, so its deploy workflow reads correctly.
      setMessage(target.successMessage);
    } catch (err) {
      setMessage('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="panel-section">
        <h3>Export</h3>
        <p className="hint">
          Pick where this graphic will run. Every package is plug-and-play: relative paths,
          bundled GSAP, no external dependencies.
        </p>
      </div>

      <div className="stack">
        {EXPORT_TARGETS.map((t) => (
          <label
            key={t.id}
            className="issue"
            style={{ display: 'block', cursor: 'pointer', borderColor: targetId === t.id ? 'var(--accent)' : undefined }}
          >
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <input
                type="radio"
                name="export-target"
                style={{ width: 'auto', marginTop: 3 }}
                checked={targetId === t.id}
                onChange={() => pickTarget(t.id)}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div className="hint">{t.description}</div>
              </div>
            </div>
          </label>
        ))}
      </div>

      {targetId === 'ograf' && (
        <div className="panel-section" data-testid="ograf-usage">
          <h3>Usage</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {([
              ['live', 'Live'],
              ['post-production', 'Post-production'],
              ['both', 'Both'],
            ] as const).map(([value, label]) => (
              <label key={value} className="row" style={{ width: 'auto' }}>
                <input
                  type="radio"
                  name="ograf-usage"
                  value={value}
                  checked={graphicUsage === value}
                  onChange={() => setGraphicUsage(value)}
                  style={{ width: 'auto' }}
                />
                {label}
              </label>
            ))}
          </div>
          {offlineRequested && ografCompatibility.errors.map((error) => (
            <div className="issue error" key={error}>
              <span className="rule">OGraf offline</span>
              {error}
            </div>
          ))}
          {offlineRequested && ografCompatibility.warnings.map((warning) => (
            <div className="issue warn" key={warning}>
              <span className="rule">OGraf offline · warning</span>
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* ABOVE the download button on purpose. The acceptance-pass rule is that a user cannot
          export to a playout system without being told the design may not render there, and a
          verdict under the button is a verdict read after the file is already downloading. */}
      <PlayoutCompatibility template={template} />

      <button
        className="primary"
        style={{ marginTop: 12, width: '100%' }}
        disabled={busy || !validation.ok || !targetCompatible}
        onClick={exportZip}
        title={
          !validation.ok
            ? 'Fix the validation errors below first'
            : !targetCompatible
              ? 'This graphic is not compatible with deterministic OGraf rendering'
              : undefined
        }
      >
        {busy ? 'Building…' : `Validate & download (${target.label})`}
      </button>

      {message && (
        <p className={message.startsWith('✓') ? 'status-ok' : 'status-bad'} style={{ marginTop: 10 }}>
          {message}
        </p>
      )}

      {/* Validation results — always visible so problems surface before you reach for export. */}
      <div className="panel-section" style={{ marginTop: 14 }}>
        <p className={validation.ok ? 'status-ok' : 'status-bad'}>
          {validation.ok
            ? '✓ Template is valid and ready to export.'
            : `✗ ${validation.errors.length} error(s) must be fixed before export.`}
        </p>

        {validation.errors.map((issue, i) => (
          <div className="issue error" key={`e${i}`}>
            <span className="rule">{issue.rule}</span>
            {issue.message}
          </div>
        ))}

        {validation.warnings.map((issue, i) => (
          <div className="issue warn" key={`w${i}`}>
            <span className="rule">{issue.rule} · warning</span>
            {issue.message}
          </div>
        ))}
      </div>

      {/* Video/image rendering — only on deployments with a render backend (VITE_RENDER_API).
          Unconfigured (offline/self-host default) builds show nothing here. */}
      {isRenderConfigured() && (
        <RenderPanel template={template} sampleData={sampleData} validation={validation} />
      )}
    </div>
  );
}
