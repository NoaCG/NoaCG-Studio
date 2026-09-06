import { useEffect, useRef, useState } from 'react';
import type { AssetFile, Resolution } from '../../../model/types';
import type { DesignArt, DesignStretch } from '../../../model/wizard';
import type { DesignEraseState } from './draft';
import {
  eraseRegionFlat,
  proposeEraseRect,
  FLAT_BG_TOLERANCE,
  type EraseProposal,
  type EraseRect,
  type EraseResult,
} from '../../../assets/eraseRegion';
import DesignPrepCanvas, { StretchGuides } from './DesignPrepCanvas';

interface Props {
  art: DesignArt;
  resolution: Resolution;
  /** The current artwork asset (the cleaned file once an erase is applied). */
  images: AssetFile[];
  /** The untouched upload — the erase CHAIN runs from THESE pixels, so re-runs never compound. */
  original: AssetFile | null;
  /** Every applied erase, in the order it was marked. */
  erases: DesignEraseState[];
  /** The user's standing answer that the baked text is intentional / absent (draft.ts
   *  designKeepBakedText) — it must survive leaving the step, so it lives on the draft. */
  keepBaked: boolean;
  onKeepBaked: (keep: boolean) => void;
  /** Replace the whole erase list and the artwork it produced (one draft patch). */
  onErases: (erases: DesignEraseState[], images: AssetFile[]) => void;
  /** Set/clear the artwork's stretch mode (lands on draft.designArt.stretch). */
  onStretch: (stretch: DesignStretch | null) => void;
  /** Preview-only: the content-width slider's demo text, pushed into the live preview. */
  onDemoText: (text: string | null) => void;
}

/** The demo name the content-width slider slices — long enough to force a real stretch. */
const DEMO_NAME = 'Alexandra Konstantinopoulos-Virtanen';

/**
 * "Import graphic", step 2 — prepare the artwork before the editor takes over. Two
 * decisions, both optional (a design that needs neither goes straight to Create):
 *
 * 1. BAKED-IN TEXT: text exported into the image file is pixels, not a field. The user
 *    marks it; the flat-fill erase (assets/eraseRegion) replaces it with the sampled
 *    background, and the erased region seeds the first real text field at create.
 * 2. SCALING: fixed (the image renders exactly as drawn — the default) or horizontal
 *    stretch (a 9-slice whose middle band widens with the operator's text). The guides are
 *    dragged here and verified live with the content-width slider — the preview runs the
 *    same emitted runtime the created template ships.
 */
export default function PrepareDesignStep({
  art,
  resolution,
  images,
  original,
  erases,
  keepBaked,
  onKeepBaked,
  onErases,
  onStretch,
  onDemoText,
}: Props) {
  // Has the user answered "does it have baked-in text?" — starts answered when an erase
  // already exists (coming back to the step keeps the surface open), and answered NO when
  // the draft carries the standing "it's meant to be there" answer, so returning to the
  // step never re-proposes over a decision already made.
  const [marking, setMarking] = useState<boolean | null>(
    erases.length > 0 ? true : keepBaked ? false : null,
  );
  // A run whose background was NOT flat, held for an explicit "use it anyway" instead of
  // silently applying a fill the samples disagreed on.
  const [pending, setPending] = useState<{ rect: EraseRect; result: EraseResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [demoLen, setDemoLen] = useState(DEMO_NAME.length);
  // The scan's OPENING PROPOSAL, and the rectangle as the user has dragged it since. Held
  // apart because the offer's wording reports what was MEASURED (its line count, its
  // confidence) while the rectangle is the user's the moment they touch it.
  const [proposal, setProposal] = useState<EraseProposal | null>(null);
  const [proposedRect, setProposedRect] = useState<EraseRect | null>(null);
  const [scanRefusal, setScanRefusal] = useState<string | null>(null);
  /** The artwork the scan last ran against — a scan is one per artwork, never per render. */
  const scanned = useRef<string | null>(null);

  const current = images[0] ?? null;
  const sourceW = art.sourceWidth ?? art.width;
  const sourceH = art.sourceHeight ?? art.height;
  const hz = art.stretch?.horizontal ?? null;
  // A frame-sized design covers the canvas edge to edge — there is no room to grow into,
  // so stretch mode would only ever hit its cap and shrink anyway.
  const fullFrame = art.width === resolution.width && art.height === resolution.height;
  const cleanedUrl = pending
    ? pending.result.dataUrl
    : erases.length > 0 && typeof current?.data === 'string'
      ? current.data
      : null;
  const downloadName = `${(current?.path ?? 'images/design.png').replace(/^.*\//, '').replace(/\.[^.]+$/, '')}-clean.png`;

  /**
   * SCAN the artwork for baked-in text and open with the rectangle already drawn around it.
   * The erase is the workhorse of this flow (docs/IMPORT_MVP.md's audit: 9 of 10 designs),
   * and it used to run only if the student thought to drag a box.
   *
   * It re-runs on the CLEANED artwork after every applied erase, so a design carrying a name,
   * a title and a scoreline offers them one at a time and stops when nothing is left. Nothing
   * is filled by any of this: the rectangle is an offer the user drags, accepts or dismisses.
   *
   * Guarded by the artwork itself rather than a cancel flag — under StrictMode the first
   * effect's cleanup would otherwise throw away the only scan that ran.
   */
  useEffect(() => {
    const data = typeof current?.data === 'string' ? current.data : null;
    if (!data || scanned.current === data) return;
    scanned.current = data;
    void proposeEraseRect(data).then((result) => {
      if (scanned.current !== data) return; // the artwork moved on under us
      setProposal(result.proposal);
      setProposedRect(result.proposal?.rect ?? null);
      setScanRefusal(result.refusal);
      // A measurement answers the "is there baked-in text?" question better than the user
      // can from memory, so a proposal opens the marking surface instead of asking — but
      // only while the question is still open. A slow scan (a very large upload) can land
      // after the user has already answered it, and it must not reverse them.
      if (result.proposal) setMarking((answered) => (answered === null ? true : answered));
    });
  }, [current?.data]);

  const clearProposal = () => {
    setProposal(null);
    setProposedRect(null);
  };

  const stateOf = (rect: EraseRect, result: EraseResult): DesignEraseState => ({
    rect,
    uniform: result.sampling.uniform,
    maxDeviation: result.sampling.maxDeviation,
    gradient: result.sampling.gradient,
    fill: result.sampling.fill,
    ink: result.ink ?? undefined,
    // Kept, not dropped: a mark holding several text areas records how many filled clean,
    // so the applied mark's row can keep reporting the PARTIAL truth the warning showed.
    segments: result.sampling.segments,
  });

  /** The erase chain needs the untouched upload to re-run from; without it every erase
   *  control would be a silent no-op, so the surface says so instead (unreachable through
   *  the ordinary flow today — both are set by the same drop patch — but a dead button
   *  must never be the failure mode). */
  const canErase = !!original && typeof current?.data === 'string';

  /**
   * Mark ANOTHER region. Each erase runs against the artwork as it stands, so a design with a
   * name and a title takes two marks and keeps both — and each region's ink is measured
   * before its own fill lands, which is what lets every one of them seed a real field.
   */
  const run = async (rect: EraseRect) => {
    if (!original || typeof current?.data !== 'string') return;
    setBusy(true);
    setPending(null);
    clearProposal();
    try {
      const result = await eraseRegionFlat(current.data, rect);
      if (result.sampling.uniform) {
        onErases([...erases, stateOf(rect, result)], [{ ...original, data: result.dataUrl }]);
      } else {
        setPending({ rect, result });
      }
    } finally {
      setBusy(false);
    }
  };

  const applyPending = () => {
    if (!pending || !original) return;
    onErases(
      [...erases, stateOf(pending.rect, pending.result)],
      [{ ...original, data: pending.result.dataUrl }],
    );
    setPending(null);
  };

  /**
   * Drop one mark — which means REPLAYING the rest from the untouched upload. Undoing a fill
   * in place is not possible (its pixels are gone), and re-running the survivors from the
   * original is the only way to get an artwork that carries exactly the marks still standing.
   * The same replay is what has always kept re-runs from compounding.
   */
  const removeErase = async (index: number) => {
    if (!original || typeof original.data !== 'string') return;
    setPending(null);
    clearProposal();
    const keep = erases.filter((_, i) => i !== index);
    if (keep.length === 0) {
      onErases([], [original]);
      return;
    }
    setBusy(true);
    try {
      let data = original.data;
      const next: DesignEraseState[] = [];
      for (const e of keep) {
        const result = await eraseRegionFlat(data, e.rect);
        data = result.dataUrl;
        next.push(stateOf(e.rect, result));
      }
      onErases(next, [{ ...original, data }]);
    } finally {
      setBusy(false);
    }
  };

  /** How many editable fields the marks will produce — one per line of text found. */
  const seedCount = erases.reduce((n, e) => n + Math.max(1, e.ink?.lines.length ?? 1), 0);

  /** Where the guides start when stretch is switched on: the erased text's edges when the
   *  user marked some (the text zone IS the stretch zone), else a middle-third default. */
  const defaultGuides = (): { left: number; right: number } => {
    if (erases.length > 0) {
      // Every marked region together: the band that has to stretch is the one holding all
      // the text, not whichever piece of it was marked first.
      const k = art.width / sourceW;
      const lo = Math.min(...erases.map((e) => e.rect.x));
      const hi = Math.max(...erases.map((e) => e.rect.x + e.rect.width));
      return {
        left: Math.max(8, Math.round(lo * k)),
        right: Math.min(art.width - 8, Math.round(hi * k)),
      };
    }
    return { left: Math.round(art.width * 0.35), right: Math.round(art.width * 0.65) };
  };

  const pickFixed = () => {
    onStretch(null);
    onDemoText(null);
  };
  const pickStretch = () => {
    if (fullFrame) return;
    onStretch({ horizontal: hz ?? defaultGuides() });
    onDemoText(DEMO_NAME.slice(0, demoLen));
  };

  // What the surface shows: the original while the user holds "compare" (which must win even
  // over a pending fill — the pending decision is exactly when the original is needed), then
  // the pending (unconfirmed) fill, otherwise the current (possibly cleaned) artwork.
  const shownSrc =
    comparing && original && typeof original.data === 'string'
      ? original.data
      : pending
        ? pending.result.dataUrl
        : typeof current?.data === 'string'
          ? current.data
          : '';

  return (
    <div>
      <DesignPrepCanvas
        src={shownSrc}
        sourceWidth={sourceW}
        sourceHeight={sourceH}
        rects={pending ? [...erases.map((e) => e.rect), pending.rect] : erases.map((e) => e.rect)}
        onRect={(r) => void run(r)}
        drawEnabled={marking === true && !busy && canErase}
        proposed={marking === false || pending || busy ? null : proposedRect}
        onProposedChange={setProposedRect}
      >
        {hz && (
          <StretchGuides
            left={hz.left}
            right={hz.right}
            artWidth={art.width}
            onChange={(next) => onStretch({ horizontal: next })}
          />
        )}
      </DesignPrepCanvas>
      {busy && <p className="hint">Sampling the background…</p>}
      {proposedRect && proposal && !pending && !busy && marking !== false && (
        <div className="wz-prep-verdict" data-testid="erase-proposal">
          <p>
            This looks like baked-in text, so the box is already drawn around it
            {proposal.lines > 1 ? ` — ${proposal.lines} lines of it` : ''}. Drag the box or its
            corners until it covers the words, then erase — or draw your own box instead.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="primary"
              data-testid="erase-proposal-accept"
              onClick={() => void run(proposedRect)}
            >
              Erase this
            </button>
            <button data-testid="erase-proposal-dismiss" onClick={clearProposal}>
              I'll draw it myself
            </button>
            <span className="hint">
              {Math.round(proposedRect.width)} × {Math.round(proposedRect.height)} px · found by
              measuring the artwork, not by asking an AI
            </span>
          </div>
        </div>
      )}
      {pending && (
        <div className="wz-prep-verdict bad" data-testid="erase-warning">
          <p>
            The background right behind the text isn't flat and no smooth gradient explains it
            (its samples differ by {pending.result.sampling.maxDeviation} — clean is ≤{' '}
            {FLAT_BG_TOLERANCE}
            {pending.result.sampling.segments
              ? `, for ${
                  pending.result.sampling.segments.total - pending.result.sampling.segments.clean
                } of ${pending.result.sampling.segments.total} text areas`
              : ''}
            ), so a clean rebuild isn't possible. Best result: re-export the design without the
            text and import that. You can also use the average-colour fill shown above.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button data-testid="erase-continue-anyway" onClick={applyPending}>
              Use it anyway
            </button>
            <button onClick={() => setPending(null)}>Discard — keep the text</button>
            <button
              data-testid="erase-compare-pending"
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              title="Hold to see the original — the decision is visual, so compare while deciding"
            >
              Hold to compare
            </button>
          </div>
        </div>
      )}
      {erases.length > 0 && !pending && (
        <div className="wz-prep-verdict good" data-testid="erase-done">
          <p>
            {erases.every((e) => e.uniform)
              ? 'The text was erased cleanly — flat backgrounds filled, smooth gradients rebuilt.'
              : 'Filled with the average background colour (some samples were not flat).'}{' '}
            {seedCount === 1
              ? 'A text field will sit in the erased region when the project is created.'
              : `${seedCount} text fields will sit in the erased regions when the project is created.`}{' '}
            Mark more baked-in text any time — each region becomes its own field.
          </p>
          <ul className="wz-prep-marks" data-testid="erase-marks">
            {erases.map((e, i) => (
              <li key={i}>
                <span className="mono">
                  {Math.round(e.rect.width)} × {Math.round(e.rect.height)} at{' '}
                  {Math.round(e.rect.x)}, {Math.round(e.rect.y)}
                </span>
                <span className="hint">
                  {(e.ink?.lines.length ?? 1) > 1
                    ? `${e.ink!.lines.length} lines`
                    : e.ink
                      ? '1 line'
                      : 'no text found'}
                  {e.uniform
                    ? e.gradient
                      ? ' · gradient rebuilt'
                      : ''
                    : // A mark holding several text areas keeps the per-area truth: the clean
                      // ones WERE rebuilt, and the row says which share was not.
                      e.segments && e.segments.clean > 0
                      ? ` · average fill in ${e.segments.total - e.segments.clean} of ${e.segments.total} areas`
                      : ' · average fill'}
                </span>
                <button
                  data-testid={`erase-remove-${i}`}
                  onClick={() => void removeErase(i)}
                  title="Drop this mark — the artwork is rebuilt from your original with the rest"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="row" style={{ gap: 8 }}>
            <button
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              title="Hold to see the original"
            >
              Hold to compare
            </button>
            {cleanedUrl && (
              <a className="btn" data-testid="erase-download" href={cleanedUrl} download={downloadName}>
                Download cleaned artwork
              </a>
            )}
            <button data-testid="erase-remove" onClick={() => { setPending(null); clearProposal(); onErases([], original ? [original] : []); }}>
              {erases.length > 1 ? 'Remove all erases' : 'Remove erase'}
            </button>
          </div>
        </div>
      )}

      <div className="panel-section" style={{ marginTop: 14 }}>
        <h3>Baked-in text</h3>
        <p className="hint">
          Text that is part of the image file can't be edited on air. If your design has a name
          or title baked in, mark it — the box is filled with the surrounding background, and a
          real, editable text field takes its place when the project is created. Erasing only
          works cleanly over a FLAT background, and it says so when it can't: the honest fix
          then is to export the design again with the text left out.
        </p>
        {scanRefusal && !proposedRect && erases.length === 0 && (
          <p className="hint" style={{ marginTop: 8 }} data-testid="erase-scan-refusal">
            Nothing was drawn for you here: {scanRefusal} Mark it yourself if it is there — the
            scan proposes nothing rather than proposing badly.
          </p>
        )}
        {marking === null && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button
              data-testid="baked-no"
              onClick={() => {
                setMarking(false);
                onKeepBaked(true);
              }}
            >
              No baked-in text
            </button>
            <button
              className="primary"
              data-testid="baked-yes"
              onClick={() => {
                setMarking(true);
                onKeepBaked(false);
              }}
            >
              Yes — mark it
            </button>
          </div>
        )}
        {marking === false && (
          <p className="hint" style={{ marginTop: 10 }}>
            Nothing to erase.{' '}
            <button
              className="link-inline"
              data-testid="baked-yes"
              onClick={() => {
                setMarking(true);
                onKeepBaked(false);
              }}
            >
              Actually, there is baked-in text
            </button>
          </p>
        )}
        {marking && !canErase && (
          <p className="hint" style={{ marginTop: 10 }} data-testid="erase-unavailable">
            Erasing is unavailable: the original upload is no longer part of this draft, so a
            fill could not be undone or replayed. Drop the artwork again on the Design step.
          </p>
        )}
        {marking && canErase && erases.length === 0 && !pending && (
          <p className="hint" style={{ marginTop: 10 }}>
            Drag a box over the baked-in text on the artwork above — one box per piece of text,
            so a name and a title each become their own field. Remove a box any time; the
            artwork is always rebuilt from your original file.
          </p>
        )}
      </div>

      <div className="panel-section" style={{ marginTop: 14 }}>
        <h3>How it meets long text</h3>
        <div className="wz-prep-modes">
          <button
            className={`wz-cat ${hz ? '' : 'selected'}`}
            data-testid="mode-fixed"
            onClick={pickFixed}
          >
            <strong>Fixed size</strong>
            <span className="hint">
              The design always renders exactly as drawn. Long values shrink their text to fit.
              Right for title cards, full-frame graphics, scoreboards, panels.
            </span>
          </button>
          <button
            className={`wz-cat ${hz ? 'selected' : ''}`}
            data-testid="mode-stretch"
            disabled={fullFrame}
            title={fullFrame ? 'A frame-sized design covers the canvas — there is no room to stretch into' : undefined}
            onClick={pickStretch}
          >
            <strong>Stretch horizontally</strong>
            <span className="hint">
              The plain middle of the design widens with the longest text field; the ends keep
              their exact shape. Right for lower thirds, straps, name tags.
            </span>
          </button>
        </div>
        {hz && (
          <>
            <p className="hint" style={{ marginTop: 10 }}>
              Drag the two guides on the artwork: left of the first and right of the second stay
              exactly as drawn; the band between them stretches. Then prove it below.
            </p>
            <label className="wz-prep-slider">
              Preview with wider content
              <input
                type="range"
                min={5}
                max={DEMO_NAME.length}
                value={demoLen}
                data-testid="stretch-demo-slider"
                onChange={(e) => {
                  const len = Number(e.target.value);
                  setDemoLen(len);
                  onDemoText(DEMO_NAME.slice(0, len));
                }}
              />
            </label>
          </>
        )}
      </div>

      <div className="panel-section" style={{ marginTop: 14 }}>
        <h3>What happens next</h3>
        <p className="hint">
          The next step places the editable fields on your artwork — text and picture slots —
          and finds the empty panel for you when there is one. Nothing here is required: a
          design with nothing baked in and no long values can go straight on.
        </p>
      </div>
    </div>
  );
}
