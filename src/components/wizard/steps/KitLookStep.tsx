interface Props {
  /** How many graphics of the set are still unbuilt. */
  remaining: number;
  /** What the first graphic settled on, read back so the offer is not taken blind. */
  summary: string;
  onUseForAll: () => void;
  onWalkEachOne: () => void;
}

/**
 * THE LOOK QUESTION — asked once, after the first graphic of a kit is finished.
 *
 * A BORDERED CARD IN THE FORM COLUMN, never a modal. It is a fork in the walk, not an
 * interruption of it: the rail still says where the walk is, the tray still says which graphic
 * of the set was just finished, and both stay readable while the question is answered. A modal
 * would cover exactly the two surfaces that make the question answerable.
 *
 * "Yes" is the default because it is the reason a kit exists (docs/GOALS.md, "Kits, not one
 * graphic at a time": say which graphics the programme needs, get all of them in ONE unified
 * look). "No" is a real answer, not a courtesy: a match-day kit's scorebug and its full-frame
 * result card are legitimately different decisions.
 *
 * What "this look" MEANS is stated on the card rather than implied, because the propagation is
 * exactly the palette / typeface / size / motion transform and nothing else
 * (wizard/kitPlan.ts `kitLookPatch`) — a card promising "everything" over a transform that
 * carries five things would be the surface lying about what it does.
 */
export default function KitLookStep({ remaining, summary, onUseForAll, onWalkEachOne }: Props) {
  // A kit of two leaves exactly one graphic to ask about, and "the other 1 graphic" / "All 1
  // are made" is the kind of line that makes a product read as generated. Counted words only
  // where there is a count worth reading.
  const others = remaining === 1 ? 'the other graphic' : `the other ${remaining} graphics`;
  return (
    <div className="wz-kit-look" data-testid="kit-look">
      <h3>Use this look for {others}?</h3>
      <p className="hint">
        The colours, typeface, sizes and motion you just chose ({summary}), applied to{' '}
        {remaining === 1 ? 'it' : 'every graphic left in the kit'}. Each design keeps its own
        fields and its own placement.
      </p>
      <div className="wz-kit-look-doors">
        <button
          className="wz-entry-card wz-entry-card--primary"
          onClick={onUseForAll}
          data-testid="kit-look-yes"
        >
          <span className="wz-entry-head">
            <span className="wz-entry-icon">✦</span>
            <strong>Yes, build them now</strong>
          </span>
          <span className="hint">
            {remaining === 1 ? 'It is' : `All ${remaining} are`} made in this look, and you go
            straight to naming the production.
          </span>
        </button>
        <button className="wz-entry-card" onClick={onWalkEachOne} data-testid="kit-look-no">
          <span className="wz-entry-head">
            <span className="wz-entry-icon">▤</span>
            <strong>No, take me through each one</strong>
          </span>
          <span className="hint">
            Fields, look and motion for every remaining graphic, one at a time.
          </span>
        </button>
      </div>
    </div>
  );
}
