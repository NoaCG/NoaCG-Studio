import { useMemo, useState } from 'react';
import type { AdjustPatch, FontRef } from '../../model/adjust';
import { getCssVariable } from '../../model/cssVars';
import { FONTS } from '../../model/fonts';
import { withAnchor, type AppliedAppearance } from '../../control/cueAdjust';
import { asDesignedPatch, facePickPatch, styleReach, COLOUR_VARS, SVG_DESIGN_MARKER, type StyleContext } from '../../control/cueStyle';
import { hostedAdjustState, hostedRecords, stageAdjustPromote, stageAdjustReset, stageAdjustStep, stageAdjustWrite, type StagedWrite } from '../../control/hostedAdjust';
import type { OutputCue, OutputGraphicSpec } from '../../control/hostedControl';
import { storePart } from '../../control/storePart';
import CueAdjust from '../home/CueAdjust';

/**
 * THE ADJUST BLOCK ON THE HOSTED PAGE AND PHONE (playout adjustments, phase 3): the production
 * page's block (home/CueAdjust.tsx), with the hosted page's authority. Every press STAGES the
 * record in the shared buffer (control/hostedAdjust.ts), so every open page sees it and only Take
 * or ✎ Update airs it; nothing here writes the production. A preset resolves against the box the
 * production page published with the cue.
 */
export default function HostedCueAdjust({
  cue,
  cues,
  graphic,
  buffer,
  applied,
  styleCtx,
  stage,
  refused,
}: {
  cue: OutputCue & { adjust: NonNullable<OutputCue['adjust']> };
  cues: readonly OutputCue[];
  graphic: OutputGraphicSpec;
  /** This graphic's shared buffer, this page's own staging over it. */
  buffer: Readonly<Record<string, string>> | undefined;
  applied: AppliedAppearance | null | undefined;
  styleCtx: StyleContext;
  /** Stage these buffer keys for this cue's graphic. */
  stage: (data: Record<string, string>) => void;
  /** A press the doors refused: the wording. */
  refused: (note: string) => void;
}) {
  const pub = cue.adjust;
  const [open, setOpen] = useState(false);
  const [onlyThisCue, setOnlyThisCue] = useState(false);
  // Nothing is measured on this page: the block's subscription has nothing to follow.
  const measured = useMemo(() => storePart<unknown>(null), []);
  const records = hostedRecords(pub, buffer, cue.id);
  const mine = cues.filter((c) => c.graphic === cue.graphic);
  const others = mine.filter((c) => c.id !== cue.id);
  const othersOwn = others.filter((c) => !!c.adjust && hostedRecords(c.adjust, buffer, c.id).cue !== undefined).length;
  const state = hostedAdjustState(pub, records, cue.id, applied, othersOwn > 0, styleCtx);
  const scope = state.eff.own.length > 0 || onlyThisCue ? 'cue' : 'graphic';
  const run = (write: StagedWrite) => {
    if (typeof write === 'string') refused(write);
    else if (Object.keys(write).length > 0) stage(write);
  };
  const anchored = <P extends AdjustPatch>(patch: P) => withAnchor(state.eff, state.m, pub.frame, patch);
  const write = (patch: AdjustPatch) => run(stageAdjustWrite(pub, records, cue.id, scope, anchored(patch)));
  // What the design paints with and its own values: once per stylesheet, not per render.
  const { reach, design, artwork } = useMemo(() => {
    const design: Record<string, string> = {};
    for (const k of ['font-heading', 'font-numeric', ...COLOUR_VARS]) {
      const v = getCssVariable(graphic.css, k);
      if (v !== null) design[k] = v;
    }
    return { reach: styleReach(graphic), design, artwork: graphic.js.includes(SVG_DESIGN_MARKER) };
  }, [graphic]);
  return (
    <CueAdjust
      graphicName={cue.graphic}
      cueCount={mine.length}
      exceptions={othersOwn}
      scope={scope}
      onlyThisCue={onlyThisCue}
      setOnlyThisCue={setOnlyThisCue}
      measured={measured}
      stateOf={() => state}
      category=""
      open={open}
      setOpen={setOpen}
      write={write}
      step={(by) => run(stageAdjustStep(pub, records, cue.id, scope, by, anchored({})))}
      reset={(at) => {
        if (at === 'cue') setOnlyThisCue(false);
        run(stageAdjustReset(pub, records, cue.id, at));
      }}
      promote={() => {
        setOnlyThisCue(false);
        run(stageAdjustPromote(pub, records, cue.id));
      }}
      style={{
        reach,
        artwork,
        imported: styleCtx.imported,
        bundled: FONTS,
        design,
        asDesigned: (row) => write(asDesignedPatch(row, scope, records.graphic, reach)),
        designedFace: () => write({ font: asDesignedPatch('type', scope, records.graphic, reach).font }),
        pickFace: (next: FontRef, weight: string) => write(facePickPatch(next, weight, scope, records.graphic, design, styleCtx.imported)),
      }}
    />
  );
}
