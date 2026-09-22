// The wizard's legibility controls (docs/DESIGN_RULES_PLAN.md §5 R4): WHERE the graphic will
// be watched, and the two size-floor toggles the ratified severity policy names. One shared
// component, because the catalog walk (Style step) and the AI step both offer the same three
// decisions and two copies would drift.
//
// THE SIZE FLOORS ARE ONE TRI-STATE AND ARE DRAWN AS ONE (model/designRules.ts
// LegibilityFloors: 'relaxed' | undefined | 'safe'). They used to be two checkboxes over that
// single value, which is a control that lies about its own shape: ticking "Guaranteed readable
// size" silently changed what "Broadcast text sizes" meant, un-ticking one could not say which
// of the other two states you would land in, and the pair could express a fourth combination
// the model does not have. Three radios say what there is - and each one states what it
// PERMITS, because that is the actual decision: a floor is a rule about what may ship, not a
// feature to switch on.

import {
  VIEWING_PROFILE_LABELS,
  type LegibilityFloors,
  type ProjectLegibility,
  type ViewingProfileId,
} from '../../model/designRules';

interface Props {
  value: ProjectLegibility;
  onChange: (next: ProjectLegibility) => void;
}

/** The three states, smallest type first, each phrased as what it lets through. `undefined` is
 *  the default and is what an untouched project serializes to - nothing. */
const FLOOR_CHOICES: ReadonlyArray<{
  id: 'relaxed' | 'standard' | 'safe';
  floors: LegibilityFloors | undefined;
  title: string;
  permits: string;
}> = [
  {
    id: 'relaxed',
    floors: 'relaxed',
    title: 'Allow denser, smaller type',
    permits:
      'Permits text below the broadcast sizes. Nothing is hidden - the findings still appear, '
      + 'as warnings - and the AI is told the smaller scale was your call.',
  },
  {
    id: 'standard',
    floors: undefined,
    title: 'Broadcast text sizes',
    permits:
      'Permits any size at or above what we know reads on air at the distance above. '
      + 'The default, and what the catalog is drawn to.',
  },
  {
    id: 'safe',
    floors: 'safe',
    title: 'Guaranteed readable size',
    permits:
      'Permits only large type, and the AI designs FOR it from the start - fewer fields, a '
      + 'simpler composition. It never inflates a small layout to get there.',
  },
];

export default function ViewingControls({ value, onChange }: Props) {
  const profile: ViewingProfileId = value.viewing?.profile ?? 'tv';
  const floors = value.floors;
  const active = VIEWING_PROFILE_LABELS.find((p) => p.id === profile) ?? VIEWING_PROFILE_LABELS[0];

  const setProfile = (id: ViewingProfileId) => {
    onChange({
      ...value,
      viewing: id === 'tv' ? undefined : { profile: id, ...(id === 'custom' && value.viewing?.note ? { note: value.viewing.note } : {}) },
    });
  };

  return (
    <div className="panel-section viewing-section" data-testid="wz-viewing">
      {/* The subtitle CONTINUES the title rather than labelling it from the right, so it must
          stay sentence case. The wizard's step CSS already does that for its own headings; the
          editor's `.panel-section h3` uppercases everything inside, which ran the two together
          into "VIEWING WHERE THIS GRAPHIC WILL BE WATCHED". `.viewing-section` is what carries
          the exemption to the editor's Style panel. */}
      <h3>Viewing <span className="muted">where this graphic will be watched</span></h3>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span style={{ whiteSpace: 'nowrap' }}>Watched on:</span>
        <select
          className="grow"
          data-testid="wz-viewing-profile"
          value={profile}
          onChange={(e) => setProfile(e.target.value as ViewingProfileId)}
        >
          {VIEWING_PROFILE_LABELS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>{active.hint}. Text-size recommendations scale to it.</p>
      {profile === 'custom' && (
        <input
          className="grow"
          data-testid="wz-viewing-note"
          placeholder="Describe the environment, for example “projected in a lecture hall”, “stadium ribbon board”…"
          value={value.viewing?.note ?? ''}
          onChange={(e) => onChange({ ...value, viewing: { profile: 'custom', note: e.target.value } })}
          style={{ marginTop: 6 }}
        />
      )}
      {/* One decision, three answers. A radio group also makes the DEFAULT visible, which two
          checkboxes could not: "neither ticked" and "the standard floors" looked the same. */}
      <fieldset className="viewing-floors" data-testid="wz-floors">
        {/* "Minimum", not "Text size": the Style panel's own `Text size` heading is the global
            `--type-scale` knob, and these three are a FLOOR - what may ship, not how big the
            type is. Two controls a user meets side by side must not read as the same one. */}
        <legend>Minimum text size</legend>
        {FLOOR_CHOICES.map((choice) => (
          <label className="dlg-check" key={choice.id}>
            <input
              type="radio"
              name="wz-legibility-floors"
              data-testid={`wz-floors-${choice.id}`}
              checked={(floors ?? 'standard') === choice.id}
              onChange={() => onChange({ ...value, floors: choice.floors })}
            />
            <span className="dlg-check-text">
              <span className="dlg-check-title">{choice.title}</span>
              <span className="dlg-check-desc">{choice.permits}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
