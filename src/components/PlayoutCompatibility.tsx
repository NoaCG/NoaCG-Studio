import { useMemo, useState } from 'react';
import type { SpxTemplate } from '../model/types';
import { engineReports, scanEngineSupport, type EngineFeature, type EngineVerdict } from '../validation/engineSupport';

/**
 * WILL THIS GRAPHIC RENDER WHERE YOU ARE TAKING IT?
 *
 * The 2026-08-06 acceptance pass took two catalogue designs to a real CasparCG and found them
 * wrong on air, with nothing anywhere in the product having said they might be. The maintainer's
 * own priority afterwards was explicit: fixing the designs would be nice, but *telling the user*
 * matters more — "we can't be offering broken graphics to our users".
 *
 * So this sits in the export flow, above the download button, and it is never hidden behind a
 * disclosure when it has bad news. What it reports is MEASURED from the graphic's own emitted
 * code (validation/engineSupport.ts), not looked up in a list of design names.
 *
 * It is deliberately not a gate. A graphic that needs Chromium 111 is perfectly correct in SPX, a
 * current OBS (127) and CasparCG 2.4+ — it is only wrong on engines below that, which is what the
 * per-engine list is for. Blocking its export would be wrong, and would also be the third
 * different meaning of a disabled Export button on one screen. The build-time line lives
 * elsewhere: `scripts/engine-floor.mjs --fail` gates the CATALOGUE at SUPPORTED_FLOOR, while this
 * surface reports on whatever the user has actually made, including their own edits.
 */
export default function PlayoutCompatibility({ template }: { template: SpxTemplate }) {
  const support = useMemo(() => scanEngineSupport(template), [template]);
  const reports = useMemo(() => engineReports(support), [support]);
  const [showDetail, setShowDetail] = useState(false);

  const trouble = reports.filter((r) => r.verdict !== 'fine');
  const clean = trouble.length === 0;

  return (
    <div className="panel-section" data-testid="playout-compat" data-clean={clean ? 'yes' : 'no'}>
      <h3>Playout compatibility</h3>
      {/* `engine-ok`, deliberately NOT `.status-ok`: that class names the EXPORT GATE's verdict,
          and two elements answering to it inside one window is exactly the collision the AI
          result card already hit (src/components/AGENTS.md). */}
      <p className={clean ? 'engine-ok' : 'hint'} data-testid="playout-compat-headline">
        {clean
          ? '✓ This graphic uses nothing that an older playout browser would drop. It renders the same everywhere.'
          : `This graphic needs a browser engine of Chromium ${support.minChromium} or newer to render exactly as designed.`}
      </p>

      <ul className="engine-verdicts" data-testid="playout-compat-engines">
        {reports.map((r) => (
          <li key={r.engine.id} data-engine={r.engine.id} data-verdict={r.verdict}>
            <span className={`engine-mark ${r.verdict}`}>{markFor(r.verdict)}</span>
            <span className="engine-name">
              {r.engine.label}
              {r.engine.note && <span className="muted"> · {r.engine.note}</span>}
            </span>
            <span className="engine-say">{sentenceFor(r.verdict, r.missing.length)}</span>
          </li>
        ))}
      </ul>

      {/* The list is offered whenever the scan FOUND something, clean or not: a shimmed
          declaration never changes a verdict, but the promise that it is still listed is kept
          here, so a reader exporting bare html for a host of their own can see it. */}
      {support.findings.length > 0 && (
        <>
          <button
            onClick={() => setShowDetail((s) => !s)}
            data-testid="playout-compat-detail-toggle"
          >
            {showDetail ? 'Hide what it uses' : 'What exactly does it use?'}
          </button>
          {showDetail && (
            <div data-testid="playout-compat-detail">
              {support.findings.map((f) => (
                <div className="issue warn" key={f.feature.id}>
                  <span className="rule">Chromium {f.feature.since}</span>
                  <strong>{f.feature.label}</strong>
                  {/* FOUR effects, four sentences. A cosmetic finding is listed for honesty —
                      the engine really does drop it — but describing it in the same words as a
                      missing panel would claim a design is broken on an engine where it is
                      simply set slightly differently, which is the opposite of what this
                      surface is for. */}
                  {effectSentence(f.feature.effect)}
                  <div className="hint engine-source">
                    {f.feature.where.toUpperCase()} line {f.line}: <code>{f.source}</code>
                  </div>
                </div>
              ))}
              <p className="hint">
                Not sure which CasparCG you run? Load the production’s output URL with{' '}
                <code>&amp;debug=1</code> - the status readout names the browser engine it is
                actually rendering with.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function effectSentence(effect: EngineFeature['effect']): string {
  if (effect === 'kills-the-file') return ' - an engine without it cannot read the file at all, so the layer airs blank.';
  if (effect === 'cosmetic') return ' - a typographic refinement. An engine without it lays the text out slightly differently; nothing goes missing, so it does not decide the verdicts above.';
  if (effect === 'shimmed') return ' - an engine without it ignores the declaration, and a small script every export and the output page carry puts the spacing back there as margins. It does nothing on newer engines and does not decide the verdicts above.';
  return ' - an engine without it drops the whole declaration, so whatever it paints is simply missing.';
}

function markFor(verdict: EngineVerdict): string {
  // Three pictures on air, not three severities: "blank" is not a worse shade of "degraded",
  // it is a layer showing nothing at all.
  return verdict === 'fine' ? '✓' : verdict === 'degraded' ? '!' : '✗';
}

function sentenceFor(verdict: EngineVerdict, missing: number): string {
  if (verdict === 'fine') return 'renders as designed';
  if (verdict === 'blank') return 'cannot read the graphic - the layer airs blank';
  return missing === 1 ? 'one part of the design will be missing' : `${missing} parts of the design will be missing`;
}
