// Hash routing for /app (docs/SAVED_CONTENT_MODEL.md §3). Hash routes survive any static
// host with zero rewrite config, refresh restores the same surface, and browser Back/Forward
// are real history — which is the whole point: Home → Graphic → Back returns to where you
// were. The `?control=` / `?chat=` QUERY routes (hosted capability URLs) stay untouched
// in App.tsx; this store only owns the in-app surface.
//
// Routes:
//   ''                     the editor (whichever kind docKind persisted)
//   #/home[/<section>]     Home — no section = the dashboard (productions first, then top
//                          graphics + videos); sections: productions / graphics / videos /
//                          looks. Retired section names (recent, controls) land on the dashboard
//   #/graphic/<id>         open that library graphic in the SPX editor (refresh restores it)
//   #/control/<graphicId>  the graphic's control panel
//   #/production/<id>      one production's page (pool, cues, links, operating)
//   #/production/<id>/data the production's DATA workspace (datasets — quiz banks, teams,
//                          rosters; docs/INTERACTIVE_PLAYOUT_PLAN.md D6). An unknown third
//                          segment lands on the playout surface, so an old build (or a stale
//                          link) degrades to the page that always exists.
//   #/join-team/<code>     join a team by its code (docs/TEAMS_PLAN.md §6) — the link a teacher
//                          pastes in the class chat. The surface under it is Home, and the code
//                          rides the FRAGMENT, so it is never sent to a server in a request line.
//                          A missing code lands on Home; an offline build renders no dialog at
//                          all (App decides that, not this parser - routing stays pure)
//   #/video                the video editor shell
//   #/new[/<designId>]     the creation wizard's front page (Back leaves it); an optional
//                          trailing catalog variant id preselects that design
//                          (docs/PRERENDER.md's template-page deep link) — an id that fails to
//                          resolve just opens at Entry
//   #/new[/<designId>]/step/<name>
//                          ONE STEP of the wizard's walk. Every step the reader reaches gets its
//                          own history entry, so browser Back walks the walk backwards instead
//                          of leaving the app; Back off the front page (no `/step/`) still
//                          leaves, which is the contract App.tsx's routed-wizard effect keeps.
//                          The step is named, NEVER numbered: import mode carries an extra
//                          step and every later index shifts by one, so an index would mean a
//                          different step depending on which mode wrote the URL. `step` is a
//                          literal marker segment because the design id is positional and
//                          optional — without it, `#/new/fields` could not be told apart from
//                          a design called `fields`
//   #/package/*            RETIRED (packages removed - docs/GOALS_ARCHIVE.md "Student release" step 3);
//                          old links land on Home

import { create } from 'zustand';

/** The production shell's WORKSPACES (docs/INTERACTIVE_PLAYOUT_PLAN.md D6). Absent = Playout,
 *  the operating surface; an unknown third segment degrades to it rather than 404ing. */
export type ProductionSub = 'data' | 'audience';

export type Route =
  | { view: 'editor' }
  | { view: 'editor-foundation' }
  | { view: 'home'; section: string | null }
  | { view: 'graphic'; id: string }
  | { view: 'control'; id: string }
  | { view: 'production'; id: string; sub?: ProductionSub }
  | { view: 'join-team'; code: string }
  | { view: 'video' }
  | { view: 'new'; design?: string | null; step?: string | null };

/** The marker segment that introduces a wizard STEP name (see the route table above). */
const STEP_SEGMENT = 'step';

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'editor-foundation':
      return { view: 'editor-foundation' };
    case 'home':
      return { view: 'home', section: parts[1] ?? null };
    case 'package':
      // Retired route: a bookmarked package link lands on Home rather than a dead surface.
      return { view: 'home', section: null };
    case 'graphic':
      return parts[1] ? { view: 'graphic', id: parts[1] } : { view: 'editor' };
    case 'control':
      return parts[1] ? { view: 'control', id: parts[1] } : { view: 'home', section: 'graphics' };
    case 'production':
      if (!parts[1]) return { view: 'home', section: 'productions' };
      return parts[2] === 'data' || parts[2] === 'audience'
        ? { view: 'production', id: parts[1], sub: parts[2] }
        : { view: 'production', id: parts[1] };
    case 'join-team':
      // No code, no join: land on the productions list, which is where a team production would
      // appear anyway. Degrading rather than 404ing is the same rule the routes above follow.
      return parts[1] ? { view: 'join-team', code: parts[1] } : { view: 'home', section: 'productions' };
    case 'video':
      return { view: 'video' };
    case 'new': {
      // `#/new/step/<name>` (no design) and `#/new/<designId>/step/<name>` both land here;
      // anything after the step name is ignored rather than 404ing, the way the production
      // route degrades.
      const marked = parts.indexOf(STEP_SEGMENT, 1);
      const design = (marked === 1 ? null : parts[1]) ?? null;
      return { view: 'new', design, step: marked === -1 ? null : parts[marked + 1] ?? null };
    }
    default:
      return { view: 'editor' };
  }
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'editor':
      return '';
    case 'editor-foundation':
      return '#/editor-foundation';
    case 'home':
      return route.section ? `#/home/${encodeURIComponent(route.section)}` : '#/home';
    case 'graphic':
      return `#/graphic/${encodeURIComponent(route.id)}`;
    case 'control':
      return `#/control/${encodeURIComponent(route.id)}`;
    case 'production':
      return route.sub
        ? `#/production/${encodeURIComponent(route.id)}/${route.sub}`
        : `#/production/${encodeURIComponent(route.id)}`;
    case 'join-team':
      return `#/join-team/${encodeURIComponent(route.code)}`;
    case 'video':
      return '#/video';
    case 'new': {
      const design = route.design ? `/${encodeURIComponent(route.design)}` : '';
      const step = route.step ? `/${STEP_SEGMENT}/${encodeURIComponent(route.step)}` : '';
      return `#/new${design}${step}`;
    }
  }
}

interface RouterState {
  route: Route;
  /** Navigate forward (pushes history — Back returns here). */
  navigate: (route: Route) => void;
  /** Replace the current entry (no new history — e.g. after Save As re-points the URL). */
  replace: (route: Route) => void;
}

function currentRoute(): Route {
  return typeof window !== 'undefined' ? parseRoute(window.location.hash) : { view: 'editor' };
}

/** Write a hash without a same-route no-op (which would push a duplicate history entry). */
function writeHash(route: Route, mode: 'push' | 'replace'): void {
  const hash = routeHash(route);
  const url = hash === '' ? window.location.pathname + window.location.search : hash;
  if (window.location.hash === hash || (hash === '' && window.location.hash === '')) return;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export const useRouter = create<RouterState>((set) => ({
  route: currentRoute(),
  navigate: (route) => {
    writeHash(route, 'push');
    set({ route });
  },
  replace: (route) => {
    writeHash(route, 'replace');
    set({ route });
  },
}));

// Back/Forward (and manual hash edits) update the store. pushState doesn't fire hashchange
// in the same document, so both events feed one handler; popstate covers history traversal.
if (typeof window !== 'undefined') {
  const sync = () => useRouter.setState({ route: currentRoute() });
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
}
