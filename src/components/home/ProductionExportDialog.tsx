import { useMemo, useState } from 'react';
import { EXPORT_TARGETS } from '../../export/registry';
import { downloadShowZipFor } from '../../export/showExport';
import { loadGraphics } from '../../model/library';
import { loadPrefs, savePrefs } from '../../model/prefs';
import { buildPack, packFileName } from '../../packs/graphicsPack';
import { productionGateFailures } from '../../validation/productionGate';
import type { Show } from '../../model/shows';
import { useModalGate } from '../spaceKey';

/**
 * The production's TARGET PICKER (acceptance finding: "I wasn't able to choose the
 * platform" — the door shipped exactly one flavor). Same six registry targets as a single
 * graphic's export; the whole pool packages per target through export/showExport.ts
 * buildShowZipFor. Validation stays the gate (non-negotiable 4): every graphic runs
 * validateTemplate and a package with errors does not download.
 */
/** WHAT DRIVES THE GRAPHICS once the package is unzipped — the one flavour that bundles a
 *  double-click local controller, and the host that owns control in each of the others. Only
 *  the overlay package carries the relay + launchers (export/localControl.ts); saying so here
 *  is what stops someone picking CasparCG and then hunting for a "Start controller.cmd" that
 *  was never in it. */
const CONTROL_NOTE: Record<string, string> = {
  spx: ' Controlled by your SPX rundown.',
  'html-overlay': ' Includes the double-click local controller (“Start controller.cmd”) — no other software needed.',
  casparcg: ' Controlled by your CasparCG client (no local controller in this package).',
  h2r: ' Controlled by H2R Graphics.',
  ograf: ' Controlled by your OGraf renderer.',
  liveos: ' Controlled by NetOn.Live.',
};

export default function ProductionExportDialog({ show, onClose }: { show: Show; onClose: () => void }) {
  useModalGate(true);
  const [targetId, setTargetId] = useState(
    () => loadPrefs().defaultExportTarget || EXPORT_TARGETS[0].id,
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The export gate, per pool graphic, over the LIVE library template (what actually ships) -
  // THE SAME gate buildShowZipFor enforces (validation/productionGate.ts), so the dialog's
  // verdict and the builder's refusal can never disagree.
  const blocked = useMemo(() => productionGateFailures(show.graphics, loadGraphics()), [show]);

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      savePrefs({ defaultExportTarget: targetId });
      await downloadShowZipFor(show, targetId);
      const label = EXPORT_TARGETS.find((t) => t.id === targetId)?.label ?? targetId;
      setNote(`✓ Exported the production as ${label}.`);
    } catch (e) {
      setNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // The ROUND-TRIP file (src/packs/graphicsPack.ts): not a playout package - the whole
  // production as one re-importable .noacgpack.json graphics pack, rundown included.
  const downloadPack = async () => {
    setBusy(true);
    setNote(null);
    try {
      const pack = await buildPack(show);
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = packFileName(show.name);
      a.click();
      URL.revokeObjectURL(url);
      setNote('✓ Saved the graphics pack.');
    } catch (e) {
      setNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gallery-backdrop" onClick={onClose}>
      <div className="wz-modal save-dialog prod-export" onClick={(e) => e.stopPropagation()} data-testid="production-export-dialog">
        <div className="wz-header">
          <h2>Export production — {show.name}</h2>
          <button className="gallery-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="prod-export-body">
          {EXPORT_TARGETS.map((t) => (
            <label className="issue prod-export-target" key={t.id}>
              <input
                type="radio"
                name="prod-export-target"
                checked={targetId === t.id}
                onChange={() => setTargetId(t.id)}
                data-testid={`prod-target-${t.id}`}
              />
              <span>
                <strong>{t.label}</strong>
                <span className="hint"> {t.description}</span>
                {/* WHO CONTROLS IT is the question the acceptance round asked out loud ("there
                    is no Start controller.cmd — I don't know how to steer the graphics"), and
                    the answer belongs at the moment of choosing, not only inside the zip. */}
                <span className="hint prod-export-control">{CONTROL_NOTE[t.id] ?? ''}</span>
              </span>
            </label>
          ))}
          <p className="hint">
            Every package also carries <strong>FIELDS.md</strong> — each graphic's fields with the
            ID a playout client sends them under (<code>f0</code>, <code>f1</code>, …).
          </p>
          {/* A package is an OFFLINE copy, and SPX is the target most likely to be picked while
              actually wanting the live production - the two arrive as folders of HTML and look
              alike. Naming the other door here is cheaper than discovering the difference on air. */}
          <p className="hint">
            A package is a self-contained copy, driven by the playout host. To put this
            <strong> live</strong> production into SPX instead - cued from here, from the control
            page or from a phone - use <strong>Template file</strong> in the production's Playout panel.
          </p>
          <p className="hint">
            To <strong>share or back up</strong> this production for NoaCG itself — graphics,
            layers and the cue rundown in one re-importable file — download it as a graphics
            pack. Import it from Home → Productions.
          </p>
          <button
            disabled={busy}
            onClick={() => void downloadPack()}
            data-testid="prod-export-pack"
          >
            ⬇ Graphics pack (.noacgpack.json)
          </button>

          {blocked.length > 0 && (
            <div className="status-bad" data-testid="prod-export-blocked">
              Export is blocked — fix these first (validation is the gate):
              <ul>
                {blocked.map((g, i) => (
                  <li key={`${g.name}-${i}`}>
                    <strong>{g.name}</strong>: {g.errors[0]?.message ?? 'validation error'}
                    {g.errors.length > 1 ? ` (+${g.errors.length - 1} more)` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="prod-export-note">{note}</p>}
        </div>
        <div className="wz-footer">
          <button onClick={onClose}>Close</button>
          <button
            className="primary"
            disabled={busy || blocked.length > 0 || show.graphics.length === 0}
            onClick={() => void download()}
            data-testid="prod-export-download"
          >
            {busy ? 'Packaging…' : 'Validate & download'}
          </button>
        </div>
      </div>
    </div>
  );
}
