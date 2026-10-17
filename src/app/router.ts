// Hash routing for /app (docs/SAVED_CONTENT_MODEL.md §3). Hash routes survive any static
// host with zero rewrite config, refresh restores the same surface, and browser Back/Forward
// are real history — which is the whole point: Home → Graphic → Back returns to where you
// were. The `?control=` / `?chat=` QUERY routes (hosted capability URLs) stay untouched
// in App.tsx; this store only owns the in-app surface.
//
// Routes:
//   ''                     no surface of its own: App.tsx renders Home (the old code editor it
//                          used to be is closed), and rewrites a bare boot to #/home
//   #/home[/<section>]     Home — no section = the dashboard (productions first, then top
//                          graphics + videos); sections: productions / graphics / videos /
//                          looks. Retired section names (recent, controls) land on the dashboard
//   #/home/productions/<packageId>
//                          Productions with ONE waiting package selected: the link `noacg pack
//                          --save` answers with (docs/AGENT_SAVE.md §9). After Install it shows
//                          what the package became. An older build ignores the third segment and
//                          lands on the list, which is the degradation the link was built for
//   #/graphic/<id>         RETIRED as a surface: App.tsx opens that graphic's control page and
//                          rewrites the address to #/control/<id> (`noacg save` still prints it)
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
  | { view: 'home'; section: string | null; item?: string }
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
      return parts[1] && parts[2] ? { view: 'home', section: parts[1], item: parts[2] } : { view: 'home', section: parts[1] ?? null };
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
      if (!route.section) return '#/home';
      return `#/home/${encodeURIComponent(route.section)}${route.item ? `/${encodeURIComponent(route.item)}` : ''}`;
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
  /** Go back to wherever the user came from inside the app, or to `fallback` when there is no
   *  such place (a cold link, a new tab, a bookmark). See `canGoBack`. */
  goBack: (fallback: Route) => void;
}

function currentRoute(): Route {
  return typeof window !== 'undefined' ? parseRoute(window.location.hash) : { view: 'editor' };
}

// IN-APP HISTORY DEPTH. Browser history cannot say whether the previous entry is still this
// app (it might be Google, or nothing at all in a fresh tab), so every entry the app writes
// carries its depth in `history.state.noacgDepth`: the first entry of a visit is 0 and each push
// adds one. A depth above 0 therefore means "Back lands on a page of this app", which is what
// the playout page's Back button needs to choose between history.back() and going Home.
// Other code that rewrites the URL passes `history.state` through, so the stamp survives it.
const DEPTH_KEY = 'noacgDepth';

function depthOf(state: unknown): number | null {
  const d = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof d === 'number' ? d : null;
}

/** The current entry's depth; an unstamped entry counts as the first one. */
function currentDepth(): number {
  return typeof window !== 'undefined' ? depthOf(window.history.state) ?? 0 : 0;
}

/** Keep whatever else lives in history.state and set the depth beside it. */
function withDepth(state: unknown, depth: number): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? state : {}), [DEPTH_KEY]: depth };
}

type NavigationGuard = (proceed: () => void) => void;
let navigationGuard: NavigationGuard | null = null;
let lastDepth = currentDepth();

/** The mounted authoring surface owns the decision; the router owns the pending move. */
export function guardNavigation(guard: NavigationGuard): () => void {
  navigationGuard = guard;
  return () => { if (navigationGuard === guard) navigationGuard = null; };
}

function requestNavigation(route: Route, proceed: () => void): void {
  if (navigationGuard && routeHash(route) !== routeHash(useRouter.getState().route)) navigationGuard(proceed);
  else proceed();
}

/** Write a hash without a same-route no-op (which would push a duplicate history entry). */
function writeHash(route: Route, mode: 'push' | 'replace'): void {
  const hash = routeHash(route);
  const url = hash === '' ? window.location.pathname + window.location.search : hash;
  if (window.location.hash === hash || (hash === '' && window.location.hash === '')) return;
  const depth = currentDepth();
  if (mode === 'push') window.history.pushState(withDepth(null, depth + 1), '', url);
  else window.history.replaceState(withDepth(null, depth), '', url);
  lastDepth = currentDepth();
}

/** True when the entry before this one is a page of this app (see IN-APP HISTORY DEPTH). */
export function canGoBack(): boolean {
  return currentDepth() > 0;
}

export const useRouter = create<RouterState>((set) => ({
  route: currentRoute(),
  navigate: (route) => {
    requestNavigation(route, () => {
      writeHash(route, 'push');
      set({ route });
    });
  },
  replace: (route) => {
    requestNavigation(route, () => {
      writeHash(route, 'replace');
      set({ route });
    });
  },
  goBack: (fallback) => {
    if (canGoBack()) window.history.back();
    else useRouter.getState().navigate(fallback);
  },
}));

// Back/Forward (and manual hash edits) update the store. pushState doesn't fire hashchange
// in the same document, so both events feed one handler; popstate covers history traversal.
if (typeof window !== 'undefined') {
  // Stamp the entry the visit started on, so an unstamped entry met later is known to be NEW -
  // one a plain `<a href="#/...">` click pushed without going through navigate().
  if (depthOf(window.history.state) === null) {
    window.history.replaceState(withDepth(window.history.state, 0), '');
  }
  let restoring: { depth: number; delta: number; guard: NavigationGuard; route: Route; key?: string } | null = null;
  let approvedDepth: number | null = null;
  // The Navigation API names an entry by key; where it exists, Back is replayed onto that entry.
  type Traversal = { committed: Promise<unknown>; finished: Promise<unknown> };
  const navigation = (window as unknown as { navigation?: {
    currentEntry: { key: string } | null; entries(): { key: string }[]; traverseTo(key: string): Traversal;
  } }).navigation;
  const sync = () => {
    if (depthOf(window.history.state) === null) {
      window.history.replaceState(withDepth(window.history.state, lastDepth + 1), '');
    }
    const depth = currentDepth(), route = currentRoute();
    if (restoring) {
      if (depth !== restoring.depth) return;
      const pending = restoring;
      restoring = null;
      // Approval replays the attempted move onto the attempted DESTINATION, never by counting
      // entries from here: while the guard asks, the editor's preview frame can navigate (a
      // save's name adoption rebuilds it), and a subframe navigation inserts a session-history
      // entry after this one. That drops the forward entry a hash change or Forward made, so
      // `go(1)` silently did nothing and the leave never continued (#1386), and it puts an entry
      // between this one and a Back destination that `go(-1)` would land on instead.
      pending.guard(() => {
        if (pending.delta < 0) {
          writeHash(pending.route, 'push');
          useRouter.setState({ route: pending.route });
          return;
        }
        approvedDepth = pending.depth - pending.delta;
        const key = pending.key;
        if (key && navigation?.entries().some(entry => entry.key === key)) {
          const traversal = navigation.traverseTo(key);
          // A refused traversal (another navigation won) leaves the editor up, as a cancel does.
          traversal.committed.catch(() => undefined); traversal.finished.catch(() => undefined);
        } else window.history.go(-pending.delta);
      });
      return;
    }
    // The guarded editor is already rendered at a restored entry; its second event
    // must not ask twice. Other surfaces retain native navigation notifications,
    // including a same-hash visit that closes an export snapshot from that surface.
    if (routeHash(route) === routeHash(useRouter.getState().route)) {
      lastDepth = depth;
      if (!navigationGuard) useRouter.setState({ route });
      return;
    }
    if (approvedDepth === depth) approvedDepth = null;
    else if (navigationGuard) {
      const delta = lastDepth - depth;
      if (delta) {
        // Restore the original history entry before asking. Cancel leaves Back/Forward
        // intact; approval replays exactly the attempted traversal once.
        restoring = { depth: lastDepth, delta, guard: navigationGuard, route, key: navigation?.currentEntry?.key };
        window.history.go(delta);
      } else {
        const previous = useRouter.getState().route;
        writeHash(previous, 'replace');
        requestNavigation(route, () => {
          writeHash(route, 'replace');
          useRouter.setState({ route });
        });
      }
      return;
    }
    lastDepth = depth;
    useRouter.setState({ route });
  };
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
}
