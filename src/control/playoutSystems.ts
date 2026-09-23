// THE PLAYOUT SYSTEMS NoaCG CAN BE SET UP TO DRIVE, as one short list.
//
// Today there is one: CasparCG, reached through NoaCG Bridge (docs/BRIDGE.md), configured by
// the form in components/PlayoutSettingsPanel.tsx and stored by control/playoutLink.ts. The
// Playout settings dialog and the production header read this list rather than naming
// CasparCG themselves, so a second system is one more entry here plus its own settings panel,
// not a hunt through the header, the dialog and the copy.
//
// This is a CODE list, never persisted: nothing is stored about which system is "selected",
// because with one system there is nothing to select. Everything that plays a browser source
// (OBS, vMix, a CasparCG HTML producer loaded by hand) needs no entry at all - it takes the
// production's output URL, which is why that route is stated beside this list, not in it.

export interface PlayoutSystem {
  /** Stable id, for test ids and a future stored choice. */
  id: 'casparcg';
  /** What the operator calls the server. */
  name: string;
  /** How NoaCG reaches it, said once in the dialog. */
  via: string;
  /** One line on what setting it up gives you. */
  summary: string;
}

export const PLAYOUT_SYSTEMS: readonly PlayoutSystem[] = [
  {
    id: 'casparcg',
    name: 'CasparCG',
    via: 'through NoaCG Bridge on this computer',
    summary:
      'Put the production on a CasparCG channel from this page, and cue the templates and clips already on the server.',
  },
];

/** The system the production header names. The first entry until there is a real choice. */
export const DEFAULT_PLAYOUT_SYSTEM = PLAYOUT_SYSTEMS[0];
