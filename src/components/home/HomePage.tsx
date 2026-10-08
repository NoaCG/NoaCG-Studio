import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, type Route } from '../../app/router';
import { loadGraphics, type GraphicDoc } from '../../model/library';
import { loadLooks } from '../../model/packets';
import { loadShows } from '../../model/shows';
import {
  listSavedVideoProjects,
  saveCurrentVideoProject,
  type SavedVideoRecord,
} from '../../model/videoProject';
import { useDocKindStore } from '../../store/docKindStore';
import { isBackendConfigured } from '../../backend/config';
import { subscribeAuth } from '../../backend/auth';
import { getSyncState, onSyncState, syncNow, type IncomingCounts, type SyncState } from '../../backend/syncController';
import {
  listMySubmissions,
  publishGraphic,
  STATUS_LABEL,
  unpublish,
  type MySubmission,
} from '../../community/communityData';
import { publishGate } from '../../community/gate';
import { checkTemplateLegibility } from '../../validation/designRulesWarnings';
import type { ProjectLegibility } from '../../model/designRules';
import type { ValidationIssue, ValidationResult } from '../../validation/validateTemplate';
import { graphicKindLabel, type SpxTemplate } from '../../model/types';
import { DOWNLOADS_URL } from '../../downloads/links';
import BrandLogo from '../BrandLogo';
import NewGraphicButton from '../NewGraphicButton';
import AuthStatus from '../auth/AuthStatus';
import { useAuthState } from '../auth/useAuthState';
import SyncStatus from '../SyncStatus';
import { BetaFeedbackButton } from '../feedback/BetaFeedback';
import SettingsDialog from '../SettingsDialog';
import { copyLink } from './copyLink';
import { nameList } from './CueRundown';
import { activeValues } from './GraphicRow';
import GraphicThumb from './GraphicThumb';
import GraphicsSection from './sections/GraphicsSection';
import ProductionsSection from './sections/ProductionsSection';
import VideosSection, { VideoList } from './sections/VideosSection';
import LooksSection from './sections/LooksSection';
import TeamsSection from './sections/TeamsSection';
import { useTeamsAvailable } from '../teams/useTeamsAvailable';
import { useTeamState } from '../teams/useTeamState';
import { openNewEditor } from '../editorFoundation/openNewEditor';
import { IconFilm, IconGrid, IconLink, IconPalette, IconSliders, IconTv, IconUsers } from '../icons';

type Section = 'productions' | 'teams' | 'graphics' | 'videos' | 'looks';

/** Productions lead (docs/GOALS_ARCHIVE.md "Student release" step 8) — the production is the unit that
 *  airs, so it is the first thing Home offers. Recent/Control-panels are retired sections: the
 *  dashboard covers "recent", and every graphic row reaches its control panel. */
const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'productions', label: 'Productions', icon: <IconTv /> },
  // Only while the account is in a team - see `sections` below.
  { id: 'teams', label: 'Teams', icon: <IconUsers /> },
  { id: 'graphics', label: 'Graphics', icon: <IconGrid /> },
  { id: 'videos', label: 'Videos', icon: <IconFilm /> },
  { id: 'looks', label: 'Brands', icon: <IconPalette /> },
];

/** How often a burst of library changes may refresh Home (see the listener in HomePage). */
const REFRESH_EVERY_MS = 250;

/**
 * HOME (docs/SAVED_CONTENT_MODEL.md §3) — the routed dashboard over everything saved.
 * `#/home` is the DASHBOARD: productions first (open a dashboard, copy an output URL — one
 * click), then the top graphics with search, then recent videos. The nav's four sections are
 * the full lists. Local-first and open to everyone (auth posture: no gate — sign-in only adds
 * sync). Rendered for `#/home[/<section>]`; browser Back/Forward walk it like any pages.
 * Retired section routes (`recent`, `controls`, old `#/package/*` links) land on the dashboard.
 */
export default function HomePage({ route }: { route: Route }) {
  const navigate = useRouter((s) => s.navigate);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The profile button (AuthStatus) renders, and carries Settings, only with a backend AND a
  // session; offline, `useAuthState` reports signed-in but there is no profile button at all.
  const { backendConfigured: hasBackend, status: authStatus } = useAuthState();
  const profileMenuShown = hasBackend && authStatus === 'signed-in';
  // THE TEAMS SECTION IS LISTED ONLY FOR SOMEBODY IN A TEAM (docs/TEAMS_PLAN.md §6): a user who
  // never opened the team door sees no nav item with the word in it, and one who was invited
  // finds their team one click from anywhere on Home. `useTeamsAvailable` is the one gate, so the
  // offline build can never list it.
  const teamsAvailable = useTeamsAvailable();
  const teamState = useTeamState();
  const teamsShown = teamsAvailable && teamState.teams.length > 0;
  const sections = SECTIONS.filter((s) => s.id !== 'teams' || teamsShown);

  // One nonce refreshes every list after any mutation (the model layer is the store).
  const [rev, setRev] = useState(0);
  const refresh = () => setRev((r) => r + 1);
  // Every model layer announces a persisted change (saves, deletes, sync pulls) with
  // 'spx-data-changed'. Refreshing on it is what lets Home stay MOUNTED under the wizard —
  // the old remount-on-key-change repainted a blank Home for one frame before the wizard
  // covered it — while a graphic the wizard just created still appears the moment it lands.
  // A BURST IS ONE REFRESH. A first sign-in's sync writes the library one document at a time,
  // and each write announces itself, so refreshing on every one re-read the whole library (tens
  // of MB for a real account) a hundred times in a few seconds. The first change still refreshes
  // at once; the rest of a burst lands in one refresh at most every REFRESH_EVERY_MS.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let again = false;
    const onData = () => {
      if (timer) {
        again = true;
        return;
      }
      setRev((r) => r + 1);
      timer = setTimeout(() => {
        timer = null;
        if (again) {
          again = false;
          onData();
        }
      }, REFRESH_EVERY_MS);
    };
    window.addEventListener('spx-data-changed', onData);
    return () => {
      window.removeEventListener('spx-data-changed', onData);
      if (timer) clearTimeout(timer);
    };
  }, []);
  /* eslint-disable react-hooks/exhaustive-deps */
  const graphics = useMemo(() => loadGraphics().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [rev]);
  const looks = useMemo(() => loadLooks(), [rev]);
  // NEWEST FIRST, like the graphics: the work you were just on is the upper-left card, and the
  // dashboard's five are the five most recent rather than the five oldest. Compared as
  // times, since a team row's stamp can be Postgres-formatted rather than ISO `Z`.
  const productions = useMemo(() => loadShows().sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)), [rev]);
  const videos = useMemo(() => listSavedVideoProjects(), [rev]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const personalCount = productions.filter((p) => !p.teamId).length;

  // A BROWSER THAT HAS NONE OF THE ACCOUNT'S LIBRARY YET is not an empty account. The first pass
  // on a new browser can take a minute for a real library, and "Nothing saved yet" through all of
  // it read as data loss (docs/SAVED_CONTENT_MODEL.md §3). While the library is empty and that
  // pass is running, or has failed, Home says what is happening instead. Once the cloud has been
  // listed and holds nothing to show, it is a new account after all, and the first-run hint is
  // the right answer again.
  // Only a first pass matters here, so an ordinary pass (one every few seconds while somebody
  // works) keeps the state it found and re-renders nothing.
  const [sync, setSync] = useState<SyncState>(getSyncState());
  useEffect(() => onSyncState((next) => setSync((prev) => (prev.firstPass || next.firstPass ? next : prev))), []);
  // Team productions do not count: they come from the team fetch, not from this pass, and can be
  // on screen long before the account's own library is.
  const libraryEmpty = graphics.length === 0 && videos.length === 0 && personalCount === 0;
  const cloudEmpty = sync.incoming !== undefined && totalIncoming(sync.incoming) === 0;
  // `firstPass` is only ever set on a pass that is running or has failed.
  const arriving = libraryEmpty && sync.firstPass === true && !cloudEmpty;

  const [query, setQuery] = useState('');
  const [productionFilter, setProductionFilter] = useState<string | null>(null);
  /** One reverse index answers both filtering and every row's readout. Initialising every
   *  library id is what keeps "Not in a production" an honest, reachable set. */
  const productionsByGraphic = useMemo(() => {
    const byGraphic = new Map<string, { id: string; name: string }[]>(
      graphics.map((graphic) => [graphic.id, []]),
    );
    for (const production of productions) {
      // A production contains a graphic if any pool copy carries its back-link. De-duplicate
      // within one production so an old pool with two copies cannot print the same pill twice.
      const memberIds = new Set(
        production.graphics
          .map((graphic) => graphic.graphicId)
          .filter((id): id is string => !!id && byGraphic.has(id)),
      );
      for (const graphicId of memberIds) {
        byGraphic.get(graphicId)?.push({ id: production.id, name: production.name });
      }
    }
    return byGraphic;
  }, [graphics, productions]);
  // A production this session filtered to can be deleted while the filter stands - from the
  // Productions section, or by a sync pull. The select would then match no option while the
  // list stayed empty, which is the "parked inside a place that no longer exists" state the
  // folder band walks itself out of. Do the same: fall back to the whole library.
  //
  // "Not in a production" needs the same walk-out for a different reason: it names a set that
  // still exists, but the whole control is drawn only while a production does, so deleting the
  // last one takes away the only way to clear it - and a filter nothing can clear leaves the
  // folder band flattened for the rest of the page's life.
  useEffect(() => {
    if (productionFilter === null) return;
    if (productionFilter === 'none') {
      if (productions.length === 0) setProductionFilter(null);
      return;
    }
    if (!productions.some((production) => production.id === productionFilter)) setProductionFilter(null);
  }, [productionFilter, productions]);
  const q = query.trim().toLowerCase();
  const searchFiltered = useMemo(
    () => (q ? graphics.filter((graphic) => graphic.name.toLowerCase().includes(q)) : graphics),
    [graphics, q],
  );
  /** Memoised, and PASSED THROUGH untouched when no production filter stands: this array is the
   *  Graphics section's refresh signal, and every memo in there is keyed on its identity (the
   *  type chips, the folder read, the sorted list). A fresh array on every render would rebuild
   *  all of them, and re-read the folders off the model layer, for a filter nobody applied. */
  const filtered = useMemo(() => {
    if (productionFilter === null) return searchFiltered;
    return searchFiltered.filter((graphic) => {
      const memberships = productionsByGraphic.get(graphic.id) ?? [];
      if (productionFilter === 'none') return memberships.length === 0;
      return memberships.some((production) => production.id === productionFilter);
    });
  }, [searchFiltered, productionsByGraphic, productionFilter]);
  /** What each option of the production filter would list. Counted over the SEARCH-filtered set
   *  and not over the production-filtered one, the same shape the type chips use: a facet whose
   *  counts ignored the search above it would promise four and then list two, and one that
   *  counted its own filter would renumber every other option to zero the moment you picked. */
  const productionCounts = useMemo(() => {
    const counts = new Map(productions.map((production) => [production.id, 0]));
    let unassigned = 0;
    for (const graphic of searchFiltered) {
      const memberships = productionsByGraphic.get(graphic.id) ?? [];
      if (memberships.length === 0) unassigned += 1;
      for (const production of memberships) {
        counts.set(production.id, (counts.get(production.id) ?? 0) + 1);
      }
    }
    return { counts, unassigned };
  }, [productions, productionsByGraphic, searchFiltered]);
  const sectionCounts: Record<Section, number> = {
    productions: productions.length,
    teams: teamState.teams.length,
    graphics: graphics.length,
    videos: videos.length,
    looks: looks.length,
  };

  // Community publishing: only surfaces with a configured backend AND a signed-in account —
  // the offline app grows zero community UI.
  const backendConfigured = isBackendConfigured();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => subscribeAuth((s) => setSignedIn(s.status === 'signed-in' && !!s.user)), []);
  const communityOn = backendConfigured && signedIn;
  const [publish, setPublish] = useState<{ name: string; template: SpxTemplate; gate: ValidationResult; legibility: ProjectLegibility | null } | null>(null);
  const [mySubs, setMySubs] = useState<MySubmission[]>([]);
  // Which share link was just copied. A clipboard write is invisible — without this the button
  // looks broken and gets pressed again.
  const [copiedSub, setCopiedSub] = useState<string | null>(null);
  useEffect(() => {
    if (communityOn) void listMySubmissions().then(setMySubs).catch(() => {});
    else setMySubs([]);
  }, [communityOn, rev]);

  /** null = the dashboard. Old bookmarks/specs naming the retired sections land there too. */
  const section: Section | null =
    route.view === 'home' && sections.some((s) => s.id === route.section)
      ? (route.section as Section)
      : null;
  /** What the main column shows. The arrival stands in for every view that would otherwise list
   *  the empty library; teams are fetched on their own, and brands are not what anybody signs in
   *  to find. */
  const view: Section | 'dashboard' | 'arrival' =
    arriving && section !== 'teams' && section !== 'looks' ? 'arrival' : (section ?? 'dashboard');

  /** "Open" puts a graphic on its CONTROL page (preview + data + operating), from where "Edit
   *  graphic" reaches the new editor (docs/GOALS_ARCHIVE.md "Student release" step 4). */
  const openGraphic = (g: GraphicDoc) => {
    navigate({ view: 'control', id: g.id });
  };

  const openVideo = (record: SavedVideoRecord) => {
    saveCurrentVideoProject(record.project);
    useDocKindStore.getState().setKind('video');
    navigate({ view: 'video' });
  };

  const onPublish = communityOn
    ? (g: GraphicDoc) => setPublish({ name: g.name, template: g.template, gate: publishGate(g.template), legibility: g.legibility ?? null })
    : undefined;

  const searchRow = (
    <div className="home-search row">
      <input
        className="grow"
        placeholder="Search graphics…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="home-search"
      />
    </div>
  );

  return (
    <div className="app home-page" data-testid="home-page">
      <header className="topbar">
        {/* THE SHELL NAV, the same group the wizard's header wears (owner, 2026-09-28): logo,
            Home, + New graphic, in the same positions to the pixel, so moving between Home and
            the wizard never moves a door. The page you stand on is marked current and is NOT a
            button: on the dashboard that is Home. In a section Home is a real door again - the
            dashboard is another page, and the section rail has no entry for it - while the rail
            marks the section itself as current.
            THE LOGO IS THE SITE ROOT on every surface, Home included: a real <a>, so middle-click
            and ⌘-click open the front page in a new tab like any logo.
            + New graphic sits in the SHARED LEFT ORDER (owner walk, 2026-08-29) and is not
            `primary`: "I like the blue one, it doesn't need to be yellow" - amber is the on-air
            accent (Brand §3), and creating a graphic is not an on-air act. */}
        <nav className="shell-nav" aria-label="Studio">
          <a className="brand brand-home" href="/" title="NoaCG Studio front page">
            <BrandLogo size={24} />
          </a>
          <span className="divider-dot" aria-hidden="true">·</span>
          {section === null ? (
            <span className="shell-door" data-testid="home-door" aria-current="page">
              Home
            </span>
          ) : (
            <button
              className="shell-door"
              data-testid="home-door"
              title="Home: your productions, recent graphics and videos"
              onClick={() => navigate({ view: 'home', section: null })}
            >
              Home
            </button>
          )}
          <NewGraphicButton className="shell-door" testid="home-new-project" />
        </nav>
        <div className="spacer" />
        {/* Settings must be reachable WITHOUT an account - offline builds have no account at
            all. Signed in, the PROFILE button carries it
            (AuthStatus: Home · Settings · Downloads), so the bar shows one door, not two
            (owner, 2026-09-23: settings belong in the profile control, made easy to find). */}
        {!profileMenuShown && (
          <button onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings" data-testid="home-settings">
            <IconSliders />
          </button>
        )}
        {/* The general beta door, on every surface a student actually stands on. It used to
            exist only in the old EDITOR shell, which the student release demoted and which no
            door opens any more - so the release's own user could not send feedback at all,
            and feedback is what the Lite prompt learns from. Renders nothing offline. */}
        <BetaFeedbackButton area="home" />
        <SyncStatus />
        <AuthStatus />
      </header>

      <div className="home-body">
        <nav className="home-nav" aria-label="Home sections">
          {sections.map((s) => (
            <button
              key={s.id}
              className={s.id === section ? 'active' : ''}
              aria-current={s.id === section ? 'page' : undefined}
              onClick={() => navigate({ view: 'home', section: s.id })}
              data-testid={`home-nav-${s.id}`}
            >
              <span aria-hidden="true">{s.icon}</span>
              <span className="home-nav-label">{s.label}</span>
              {/* How much is in there, read from the live lists — the question "do I have
                  any productions yet" is answered in the nav rather than by visiting it
                  (re-design/handoff.md §5). */}
              <span className="home-nav-count">{sectionCounts[s.id]}</span>
            </button>
          ))}
        </nav>

        <main className="home-content">
          {publish && (
            <PublishSheet
              target={publish}
              onDone={(note) => {
                setPublish(null);
                if (note) refresh();
              }}
            />
          )}

          {view === 'arrival' && <LibraryArrival failed={sync.phase === 'error'} incoming={sync.incoming} />}

          {view === 'dashboard' && (
            <>
              {/* The dashboard: productions lead — the unit that airs is one click from open. */}
              <ProductionsSection
                productions={productions}
                onOpen={(p) => navigate({ view: 'production', id: p.id })}
                onBrowseGraphics={(showId) => {
                  setProductionFilter(showId);
                  navigate({ view: 'home', section: 'graphics' });
                }}
                onChanged={refresh}
                limit={5}
              />
              {/* The dashboard caps YOUR productions at five; a team's are always all listed
                  (ProductionsSection's TeamBands), so only your own can be behind this link. */}
              {personalCount > 5 && (
                <button className="link-inline" onClick={() => navigate({ view: 'home', section: 'productions' })}>
                  View all {personalCount} of your productions →
                </button>
              )}

              {/* A SHELF, not eight full rows (re-design/handoff.md §5a). The dashboard's job
                  is "pick up where you left off", which a graphic answers by being recognised —
                  so the thumbnail leads and the row's controls stand down. Everything you can
                  DO to a graphic is one click away in the section, which the link opens. */}
              <div className="home-shelf-head">
                <h2><IconGrid size={18} /> Recent graphics</h2>
                <div className="spacer" />
                {searchFiltered.length > 0 && (
                  <button className="link-inline" onClick={() => navigate({ view: 'home', section: 'graphics' })}>
                    All {searchFiltered.length} graphic{searchFiltered.length === 1 ? '' : 's'} →
                  </button>
                )}
              </div>
              {searchRow}
              {/* An EMPTY LIBRARY, not an empty search result: see the same gate in the Graphics
                  section below. */}
              {graphics.length === 0 && videos.length === 0 && productions.length === 0 && (
                <EmptyHint onNew={() => navigate({ view: 'new' })} />
              )}
              <div className="home-shelf">
                {searchFiltered.slice(0, 6).map((g) => (
                  <button
                    key={g.id}
                    className="home-shelf-card"
                    onClick={() => openGraphic(g)}
                    title={`Open "${g.name}" to preview, edit data and operate`}
                    data-testid="shelf-graphic"
                  >
                    <GraphicThumb template={g.template} revision={`${g.id}:${g.updatedAt}`} values={activeValues(g)} label={g.name} fill />
                    <span className="home-shelf-name">{g.name}</span>
                    {/* The category's NAME ("Lower third"), as the Graphics list prints it,
                        never its id ("lower-third"). */}
                    <span className="muted">
                      {graphicKindLabel(g.type)} · {new Date(g.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>

              {videos.length > 0 && (
                <>
                  <h2 style={{ marginTop: 20 }}><IconFilm size={18} /> Recent videos</h2>
                  <VideoList videos={videos.slice(0, 4)} onOpen={openVideo} onChanged={refresh} />
                </>
              )}
            </>
          )}

          {view === 'productions' && (
            <ProductionsSection
              productions={productions}
              onOpen={(p) => navigate({ view: 'production', id: p.id })}
              onBrowseGraphics={(showId) => {
                setProductionFilter(showId);
                navigate({ view: 'home', section: 'graphics' });
              }}
              onChanged={refresh}
            />
          )}

          {view === 'teams' && (
            <TeamsSection productions={productions} onOpen={(p) => navigate({ view: 'production', id: p.id })} />
          )}

          {view === 'graphics' && (
            <>
              {/* The section's whole header - title, search, sort, view - is ONE row inside
                  GraphicsSection (re-design/handoff.md §5b): the toggle and the sort belong
                  to the list that answers them, and a title on one line with the search on
                  the next is what pushed the first graphic off the fold. */}
              <GraphicsSection
                graphics={filtered}
                productions={productions}
                productionsByGraphic={productionsByGraphic}
                productionCounts={productionCounts}
                query={query}
                onQuery={setQuery}
                productionFilter={productionFilter}
                onProductionFilter={setProductionFilter}
                onOpen={openGraphic}
                onChanged={refresh}
                onPublish={onPublish}
              />
              {/* "Nothing saved yet - create a graphic" is only true of an EMPTY LIBRARY. A
                  filter that happens to match nothing empties this list too, and answering that
                  with the first-run hint tells a user with forty graphics that they have none.
                  The section says why its own list is short; the hint is for having no work. */}
              {graphics.length === 0 && <EmptyHint onNew={() => navigate({ view: 'new' })} />}
              {communityOn && mySubs.length > 0 && (
                <div className="panel-section" style={{ marginTop: 14 }}>
                  <h3>My community templates</h3>
                  {mySubs.map((s) => (
                    <div className="pk-graphic" key={s.id}>
                      <strong>{s.name}</strong>
                      <span className="muted">{s.kind} · {STATUS_LABEL[s.status]}</span>
                      <div className="spacer" />
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}?template=${encodeURIComponent(s.slug)}`;
                          void copyLink(url).then((ok) => {
                            if (!ok) return;
                            setCopiedSub(s.id);
                            setTimeout(() => setCopiedSub((c) => (c === s.id ? null : c)), 2000);
                          });
                        }}
                        title="Copy a share link"
                        aria-label={`Copy a share link for ${s.name}`}
                      >
                        {copiedSub === s.id ? '✓ Copied' : <IconLink />}
                      </button>
                      <button onClick={() => { void unpublish(s.id).then(refresh); }} title="Remove from the community">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'videos' && <VideosSection videos={videos} onOpen={openVideo} onChanged={refresh} />}

          {/* Applying a brand retints the WORKING graphic, so Apply lands where that graphic can
              be seen and saved: the new editor (owner, 2026-09-21: no door to the old editor). */}
          {view === 'looks' && <LooksSection looks={looks} onChanged={refresh} onDone={openNewEditor} />}
        </main>
      </div>

      {/* The guard, save and sign-in dialogs mount once in App.tsx (they can appear over any
          surface). */}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/** The publish sheet (moved from the retired packet manager): the automated gate first,
 *  then a one-line summary, then the share. */
function PublishSheet({
  target,
  onDone,
}: {
  target: { name: string; template: SpxTemplate; gate: ValidationResult; legibility: ProjectLegibility | null };
  onDone: (published: boolean) => void;
}) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The design-rules legibility warnings (R4, warn-first): measured under the graphic's own
  // saved viewing settings, shown to the author, never blocking the publish.
  const [ruleWarnings, setRuleWarnings] = useState<ValidationIssue[]>([]);
  useEffect(() => {
    let alive = true;
    void checkTemplateLegibility(target.template, target.legibility).then((w) => {
      if (alive) setRuleWarnings(w);
    });
    return () => {
      alive = false;
    };
  }, [target]);
  const confirm = async () => {
    if (!target.gate.ok) return;
    setBusy(true);
    const res = await publishGraphic(target.template, summary);
    setBusy(false);
    if (res.error) setError(res.error);
    else onDone(true);
  };
  return (
    <div className="panel-section" style={{ outline: '2px solid var(--accent)', outlineOffset: 2, marginBottom: 14 }} data-testid="publish-sheet">
      <h3 style={{ marginTop: 0 }}>Publish “{target.name}”</h3>
      {!target.gate.ok && (
        <div className="status-bad">
          <strong>Fix before sharing:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {target.gate.errors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      )}
      {ruleWarnings.length > 0 && (
        <div className="hint" data-testid="publish-legibility-warnings">
          <strong>Worth a look (does not block sharing):</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {ruleWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </div>
      )}
      <p className="hint">Shared with other signed-in users; its fonts and images travel with it. Unpublish anytime.</p>
      <div className="row">
        <input
          className="grow"
          placeholder="One-line description — what it is, when to use it"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={140}
        />
      </div>
      {error && <p className="status-bad">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || !target.gate.ok} onClick={() => void confirm()}>
          {busy ? 'Publishing…' : 'Publish'}
        </button>
        <button onClick={() => onDone(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function totalIncoming(n: IncomingCounts): number {
  return n.graphics + n.productions + n.videos;
}

/** "12 graphics and 1 production are on their way": the count once the cloud has been listed,
 *  and the kinds without a number before that. */
function arrivalSentence(n: IncomingCounts | undefined): string {
  if (!n) return 'Your graphics and productions are on their way from your account.';
  const list = nameList(
    ([[n.graphics, 'graphic'], [n.productions, 'production'], [n.videos, 'video']] as const)
      .filter(([count]) => count > 0)
      .map(([count, word]) => `${count} ${word}${count === 1 ? '' : 's'}`),
  );
  return totalIncoming(n) === 1 ? `${list} is on its way from your account.` : `${list} are on their way from your account.`;
}

/** Home's first-pass state: the library is on its way, or the pass bringing it stopped. */
function LibraryArrival({ failed, incoming }: { failed: boolean; incoming?: IncomingCounts }) {
  if (failed) {
    return (
      <div className="panel-section home-arrival" role="status" data-testid="library-arrival-failed">
        <h3>Your library has not reached this browser yet</h3>
        <p className="hint">
          The first sync stopped before it finished. Nothing was lost: your work is still in your
          account.
        </p>
        <button className="primary" onClick={() => void syncNow()} data-testid="library-arrival-retry">
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="panel-section home-arrival" role="status" data-testid="library-arrival">
      <h3>Bringing your library to this browser</h3>
      <p data-testid="library-arrival-count">{arrivalSentence(incoming)}</p>
      <div className="home-arrival-bar" aria-hidden="true">
        <span />
      </div>
      <p className="hint">This happens once on each browser. A large library can take a minute.</p>
    </div>
  );
}

// THE FIRST-RUN HINT names every way in, in the owner's order (2026-09-27): your AI coding agent
// with the NoaCG CLI, your own SVG, a template. A new user should know what NoaCG does and start
// within half a minute, and the two installable tools should be findable from the first screen
// rather than only from the account menu and Playout settings. The link goes to the one public
// page that explains both (src/downloads/links.ts), never to a tool directly.
function EmptyHint({ onNew }: { onNew: () => void }) {
  return (
    <div className="panel-section">
      <h3>Nothing saved yet</h3>
      <p className="hint">
        Make your first graphic with <strong>+ New graphic</strong>. Start from a template, import
        your own SVG, or use your AI coding agent with the NoaCG CLI. It lands here, ready to add
        to a production, and syncs across your devices while you are signed in.
      </p>
      <button className="primary" onClick={onNew}>+ New graphic</button>
      <p className="hint">
        Get the NoaCG CLI and NoaCG Bridge from <a href={DOWNLOADS_URL}>Downloads</a>.
      </p>
    </div>
  );
}
