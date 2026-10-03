import { useState } from 'react';
import LibMenu from './LibMenu';
import { routeHash } from '../../app/router';
import { IconDownload, IconSliders, IconUsers } from '../icons';
import { panelTone, panelToneWords, type PanelAnswerState } from '../control/PanelControl';

/**
 * THE SETUP MENU at the right of the production page's header (docs/PLAYOUT_DASHBOARD.md §2,
 * owner 2026-10-03: "share, panel, export, at least could be under its own settings tab"). A
 * menu, not a tab, so the monitors never leave the screen to reach it.
 *
 * It holds the doors an operator opens before a show and not during one: Share, the Stream Deck
 * panel, Playout settings, Export, and the two views a production may not use yet (Data and
 * Audience, offered here only while the header's switcher does not show them). What is pressed
 * live stays in the header: ■ All out and the playout status. What must be SEEN live without
 * opening anything (a panel answering, a team production's save state) is a small status beside
 * this button, drawn by the page.
 *
 * Every item keeps the test id and the accessible name its header button had, so a door moved
 * here is still found by the same name.
 */
export function ProductionSetupMenu({
  showId,
  onShare,
  panel,
  onPanel,
  onPlayoutSettings,
  onExport,
  offerData,
  offerAudience,
}: {
  showId: string;
  /** The team door for a personal production, signed in; absent offline and on a team's. */
  onShare?: () => void;
  panel: PanelAnswerState;
  onPanel: () => void;
  onPlayoutSettings: () => void;
  onExport: () => void;
  /** The Data view is not in the switcher, so the menu is its way in. */
  offerData: boolean;
  offerAudience: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const pick = (run: () => void) => () => {
    close();
    run();
  };
  const tone = panelTone(panel);
  const words = panelToneWords(tone);
  const view = (sub: 'data' | 'audience', label: string, testId: string, title: string) => (
    // A real link into the view's own browser tab, as the switcher's are: Playout stays on screen
    // here, and middle-click works.
    <a
      role="menuitem"
      href={routeHash({ view: 'production', id: showId, sub })}
      target="_blank"
      rel="noopener"
      title={title}
      onClick={close}
      data-testid={testId}
    >
      {label}
    </a>
  );
  return (
    <span className="lib-menu-host pd-setup-host">
      <button
        className="pd-setup"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Setup: share, the Stream Deck panel, playout settings, export, data and audience"
        onClick={() => setOpen((o) => !o)}
        data-testid="production-setup"
      >
        <span className="pd-setup-label">Setup</span> <span className="pd-setup-caret" aria-hidden="true">▾</span>
      </button>
      <LibMenu open={open} onClose={close} testid="production-setup-menu" className="pd-setup-menu">
        {onShare && (
          <button
            role="menuitem"
            onClick={pick(onShare)}
            title="Share this production with a team, so everyone works on it from their own account"
            aria-label="Share"
            data-testid="share-with-team"
          >
            <IconUsers /> Share…
          </button>
        )}
        <button
          role="menuitem"
          className={`pd-target-${tone}`}
          onClick={pick(onPanel)}
          title={`Hardware panels (Stream Deck through Companion). ${words}.`}
          aria-label={`Hardware panels (${words})`}
          data-testid="panel-open"
          data-state={tone}
        >
          <span className="pd-target-dot" aria-hidden="true" />
          Stream Deck panel…
          <span className="pd-setup-note">{words}</span>
        </button>
        <button
          role="menuitem"
          onClick={pick(onPlayoutSettings)}
          title="Where graphics play: CasparCG through NoaCG Bridge, its channels and layers"
          data-testid="setup-playout-settings"
        >
          <IconSliders /> Playout settings…
        </button>
        <button
          role="menuitem"
          onClick={pick(onExport)}
          title="Export this production as a package"
          aria-label="Export…"
          data-testid="export-production"
        >
          <IconDownload /> Export…
        </button>
        {(offerData || offerAudience) && <div className="pd-setup-sep" role="separator" />}
        {offerData &&
          view('data', 'Add data source…', 'setup-data', 'Open Data in a new tab: tables and live values your graphics can read')}
        {offerAudience &&
          view('audience', 'Turn on audience…', 'setup-audience', 'Open Audience in a new tab: questions, votes and the join page')}
      </LibMenu>
    </span>
  );
}
