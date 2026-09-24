import { useEffect, useLayoutEffect, useRef } from 'react';
// NO AppShell IMPORT, on purpose (owner, 2026-09-24). The old code editor stays in the repo until
// the new editor has taken over what is worth keeping, but no route renders it, so nothing here
// may pull it (and Monaco behind it) into the bundle every visitor downloads.
import EditorFoundation from './components/editorFoundation/EditorFoundation';
import VideoAppShell from './components/video/VideoAppShell';
import SendIn from './showchat/SendIn';
import HostedControlPage from './components/HostedControlPage';
import HomePage from './components/home/HomePage';
import ExportWindow from './components/ExportWindow';
import CreationWizard from './components/wizard/CreationWizard';
import GraphicControlPage from './components/home/GraphicControlPage';
import ProductionPage from './components/home/ProductionPage';
import PasswordRecoveryPage from './components/auth/PasswordRecoveryPage';
import AgentAccessConsent from './components/auth/AgentAccessConsent';
import SignInDialog from './components/auth/SignInDialog';
import BridgePairPage from './components/BridgePairPage';
import StorageAlertDialog from './components/save/StorageAlertDialog';
import SaveDialogs from './components/save/SaveDialogs';
import ShareWithTeamDialog from './components/teams/ShareWithTeamDialog';
import JoinTeamDialog from './components/teams/JoinTeamDialog';
import { useAuthUi } from './components/auth/authUi';
import { isBackendConfigured } from './backend/config';
import { isAgentRequestUrl } from './backend/agentAccess';
import { isBridgePairUrl } from './control/playoutLink';
import { arrivingRecoveryLink, isRecoveryRequestUrl } from './backend/recoveryLink';
import { useDocKindStore } from './store/docKindStore';
import { useTemplateStore } from './store/templateStore';
import { parseRoute, useRouter, type Route } from './app/router';
import { raiseStorageAlert } from './store/storageAlert';
import AnalyticsConsentBanner from './components/AnalyticsConsentBanner';
import StorageHealthNotice from './components/StorageHealthNotice';

/** The page's own query string. Read once: only a document load can change it (the router writes
 *  the HASH, and carries the search along unchanged), so re-parsing it per render was the same
 *  answer at a small cost. */
const bootQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

/** Is this page answered by a QUERY capability rather than by a routed surface? `?chat=`,
 *  `?control=`, `?agent=`, `?bridge=` and `?recovery=1` are each rendered INSTEAD of the studio (see App
 *  below). One definition, because two would drift the moment a fifth capability is added — and
 *  the two readers want opposite things from it: App needs to know which one, the boot decision
 *  only needs to know that it must keep its hands off the URL. */
const queryCapabilityOwnsPage = (q: URLSearchParams): boolean =>
  q.has('chat') || q.has('control') || isAgentRequestUrl(q) || isBridgePairUrl(q) || isRecoveryRequestUrl(q);

/**
 * MAY A BOOT DECISION REWRITE THIS PAGE'S URL? Only a bare `/app`, and only when no query
 * capability owns the page.
 *
 * `parseRoute` reads any fragment it does not recognise as the editor, so rewriting one
 * DESTROYS it — and the fragment is where Supabase delivers a session. `detectSessionInUrl` is
 * on and the flow is the implicit one, so Google sign-in and every password-reset link come
 * back to `/app#access_token=…&type=recovery` (backend/supabase.ts, and OAUTH_REDIRECT in
 * backend/auth.ts). Replace that hash before the client is constructed and the token is simply
 * gone: no session, no evidence for backend/recoveryLink.ts to read, and the recovery route
 * hands the reader an expired-link card for a link that was perfectly good.
 *
 * BOTH URL WRITERS ASK THIS, which is the point of it being a function rather than two lines
 * inside decideBootRoute. They run at different moments and for a while only one of them
 * checked: the first-visit redirect below still fires from an effect, and a browser opening a
 * reset link has no autosaved project, so `galleryOpen` is true there and the effect stamped
 * `#/new` over the token one frame after the module-load guard had carefully left it alone.
 */
function bootMayRewriteUrl(): boolean {
  const hash = window.location.hash;
  if (hash !== '' && hash !== '#' && hash !== '#/') return false;
  return !queryCapabilityOwnsPage(bootQuery);
}

/**
 * WHICH SURFACE THIS PAGE LOAD LANDS ON — decided HERE, at module load, before React's first
 * render. main.tsx imports this module and renders immediately after, so "module load" is
 * "before the first frame" by construction, and the answer cannot be confused with a later
 * in-app navigation.
 *
 * THE RULE THIS FILE KEEPS: a boot surface is never chosen from an effect. A plain `useEffect`
 * runs after the first commit has been PAINTED, so the frame it corrects is a frame the reader
 * already saw. A `useLayoutEffect` does run before paint — the routed-wizard effect below
 * depends on exactly that — but it cannot carry a store write, for the reason in the first
 * bullet. Both halves were paid for:
 *
 *   - The wizard used to be opened from an effect. A zustand write made there is scheduled,
 *     not flushed: the store notifies through useSyncExternalStore and React renders the
 *     wizard in a LATER frame, so the first commit painted the studio with no wizard in it.
 *     That is why moving it to useLayoutEffect did not help either — the write still landed a
 *     frame late. Sharing HomePage's `key`, the other attempt, changed what happened AROUND
 *     that frame and never the fact that the wizard did not exist IN it.
 *   - The wizard-first REDIRECT used to be an effect too, and cost the same frame at the
 *     other end: a plain `/app` boot rendered `<AppShell/>` because `''` still parsed as the
 *     editor, painted the whole canvas editor, and only then rewrote the route to Home.
 *     Measured 2026-09-02 on a production build at 4x CPU throttle: one full frame of the
 *     editor, on top, on a boot whose destination was always Home (owner walk 2026-08-28,
 *     "it flashes some other screen underneath... It's very annoying").
 *
 * Deciding here makes the first render the only render there is: `galleryOpen` is already
 * true when the wizard is the answer, and the route already says Home when Home is.
 */
function decideBootRoute(): Route {
  const url = parseRoute(window.location.hash);

  // A boot onto `#/new` is the product's PRIMARY DOOR (the landing page's "Start creating").
  // Open the wizard now, so it is in the first frame there is.
  if (url.view === 'new') {
    useTemplateStore.getState().openGallery(url.design ?? null);
    return url;
  }

  // A DEEP LINK (a production page, a control panel, a graphic, a video) must never open
  // under the startup wizard: the auto-open (galleryOpen's initial value — no autosaved
  // project) exists for the bare '' boot only, and since the wizard mounts at App level it
  // would otherwise cover whatever the link pointed at.
  if (url.view !== 'editor') {
    if (useTemplateStore.getState().galleryOpen) useTemplateStore.getState().closeGallery();
    // A STALE `#/graphic/<id>` - the old code editor's own route, and the link an agent's
    // `noacg save` still answers with (docs/AGENT_SAVE.md) - opens that graphic's CONTROL page,
    // which asks the cloud for a record this browser has not pulled yet. The URL is rewritten
    // so everything downstream reads one route; the render below maps `graphic` to the same
    // page as well, so no frame can show anything else.
    if (url.view === 'graphic' && !queryCapabilityOwnsPage(bootQuery)) {
      const control: Route = { view: 'control', id: url.id };
      useRouter.getState().replace(control);
      return control;
    }
    return url;
  }

  // ONLY A BARE BOOT IS REWRITTEN — everything below this point WRITES the URL. A hash this
  // app does not own, and a page a query capability owns, are both left exactly as they are;
  // bootMayRewriteUrl carries the reasoning, and the boot effect in App asks it too, because
  // that one writes the URL as well.
  if (!bootMayRewriteUrl()) return url;

  // WIZARD-FIRST BOOT (docs/GOALS_ARCHIVE.md "Student release" step 4): the bare '' route
  // lands on the wizard for a first-ever visit (galleryOpen's initial value) and on HOME for a
  // returning reader. There is no editor under '' any more: a stored `advancedMode: true` used
  // to make it the old code editor, and model/prefs.ts now drops that value on read.

  // ONLY THE RETURNING READER IS SETTLED HERE, and that is a deliberate limit rather than an
  // oversight. It is the boot the owner reported and by far the common one: a browser that has
  // made something before, opening `/app`, used to paint the whole canvas editor for a frame on
  // its way to Home.
  //
  // The FIRST-EVER visit — no autosaved project, so the answer is the wizard — is left to the
  // effect below, which rewrites the URL to `#/new` a frame late. That frame no longer shows
  // anything wrong: the '' route renders Home now, never the old editor, and the wizard is open
  // (galleryOpen's initial value) in the same first commit, covering it. Moving the rewrite here
  // was tried once and backed out when `layout.spec.ts` went red on CI; that red was the stranded
  // startup wizard, not this boot, so the move is available if the late URL ever matters.
  if (useTemplateStore.getState().galleryOpen) return url;
  const landing: Route = { view: 'home', section: null };
  useRouter.getState().replace(landing);
  return landing;
}

/** Did the reader ARRIVE on the wizard? Captured before decideBootRoute is allowed to rewrite
 *  the URL, so it answers where this load came FROM, not where it is going. */
const arrivedOnWizard = typeof window !== 'undefined' && parseRoute(window.location.hash).view === 'new';

// Called for its EFFECTS, which are the whole point: it opens or closes the wizard and settles
// the route, all before React's first render. The route it returns is the one the router store
// now holds, so every reader below takes it from there rather than from a second copy.
if (typeof window !== 'undefined') decideBootRoute();

export default function App() {
  // In-app surface routing (docs/SAVED_CONTENT_MODEL.md §3): hash routes for Home,
  // per-graphic control panels, productions, and direct graphic links — real history, so
  // Back/Forward walk between surfaces and a refresh restores the same place.
  const route = useRouter((s) => s.route);

  // THE ONE BOOT DECISION STILL MADE FROM AN EFFECT: a first-ever visit, which lands on the
  // wizard. Everything else is settled at module load by decideBootRoute, which explains why
  // this is so much smaller than it was. It is late by a frame, and the comment on
  // decideBootRoute's last branch says why moving it is its own piece of work rather than a
  // line to change here.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (useRouter.getState().route.view !== 'editor') return;
    // This WRITES the URL, so it answers to the same guard decideBootRoute does. A hash the
    // app does not own reads as the editor and would otherwise be replaced here.
    if (!bootMayRewriteUrl()) return;
    if (useTemplateStore.getState().galleryOpen) useRouter.getState().replace({ view: 'new' });
  }, []);

  // A `#/graphic/<id>` reached AFTER boot (a link pasted into the address bar of a tab that is
  // already open, or Back onto an old history entry) gets the same answer as a boot onto one:
  // that graphic's control page. decideBootRoute settles the boot; this is the in-app half.
  // The render below already shows the control page for this route, so the rewrite only
  // makes the URL say so. A page a query capability owns is left alone, as at boot.
  useEffect(() => {
    if (route.view !== 'graphic' || queryCapabilityOwnsPage(bootQuery)) return;
    useRouter.getState().replace({ view: 'control', id: route.id });
  }, [route]);

  // `#/video` pins the persisted shell kind so refresh matches the URL.
  useEffect(() => {
    if (route.view === 'video' && useDocKindStore.getState().kind !== 'video') {
      useDocKindStore.getState().setKind('video');
    }
  }, [route]);

  // The wizard is routed (`#/new`): opening the route opens it, Back closes it, and closing
  // it IN the app (create, ✕, Escape) rewinds the route — otherwise the still-current `#/new`
  // would immediately reopen it. The store flag stays the source the shells read; this effect
  // only keeps the two in agreement. Only a wizard the ROUTE opened is closed by leaving the
  // route — the first-visit startup wizard (galleryOpen's initial value, true only when no
  // autosaved project exists) must not be closed by the plain '' route on boot.
  const galleryOpen = useTemplateStore((s) => s.galleryOpen);
  const routedWizard = useRef(false);
  // Which design id this route has already pushed into the store — a first-ever visit opens
  // the wizard by DEFAULT (galleryOpen's initial value), before this effect ever runs, so the
  // `if (galleryOpen)` branch below must still hand a `#/new/<id>` route's design off to
  // openGallery rather than assuming a prior call already did.
  const consumedDesign = useRef<string | null>(null);
  // useLayoutEffect, not useEffect: on the WARM path (Home → `#/new`) the wizard should be in
  // the frame the route change paints. It cannot carry the COLD path — a store write from any
  // effect lands a frame later — which is why a boot onto `#/new` opens the wizard at module
  // load instead (bootRoute above).
  useLayoutEffect(() => {
    if (route.view === 'new') {
      const design = route.design ?? null;
      // The LIVE flag, not the rendered one: this effect writes `galleryOpen` and its own
      // subscribed value is still the pre-write `false` when it runs again with the same
      // deps — which StrictMode's remount simulation does on every mount. Read stale, the
      // run below mistook "I just opened it" for "the reader closed it" and rewound `#/new`
      // to `#/home` on boot. Reading the store makes the effect idempotent, which is exactly
      // what that simulation is there to check.
      if (useTemplateStore.getState().galleryOpen) {
        routedWizard.current = true;
        if (design && consumedDesign.current !== design) {
          consumedDesign.current = design;
          useTemplateStore.getState().openGallery(design);
        }
      } else if (routedWizard.current) {
        // Closed from inside the app while the route still says wizard: rewind the URL.
        // Create paths navigate somewhere real in their own handler (same tick, so this
        // branch never sees them); what lands here is ✕/Escape, and that ALWAYS lands on Home
        // (step 4). It used to rewind to the old code editor whenever a browser had Advanced
        // mode ticked, which is how the owner met it on 2026-09-24.
        routedWizard.current = false;
        consumedDesign.current = null;
        useRouter.getState().replace({ view: 'home', section: null });
      } else {
        routedWizard.current = true;
        consumedDesign.current = design;
        useTemplateStore.getState().openGallery(design);
      }
    } else {
      // LEAVING THE WIZARD ROUTE CLOSES THE WIZARD — and WHICH wizard that may be is the whole
      // question. One the ROUTE opened is always the route's to close. The STARTUP wizard
      // (galleryOpen's initial value, true only when there is no autosaved project) has no
      // route of its own: it is legitimate over the bare '' editor route, which is the
      // first-ever visit, and it is the deep-link case over anything else.
      //
      // decideBootRoute applies that same deep-link rule at module load, and for almost every
      // boot this reaches the identical answer a moment later. The two differ when the URL
      // MOVES between the module's evaluation and this effect — a window that spans the whole
      // first render, since main.tsx imports App only after hydrating the durable store and
      // then renders a concurrent root. There decideBootRoute judged a URL the page has already
      // left, the boot effect above returns early because the route is no longer the editor,
      // and NOTHING closes the startup wizard: it ends up full-screen over Home with the
      // surface under it unreachable. Not a flash but a STUCK state — CI 2026-09-02 spent 60 s
      // clicking Home's dashboard door into the wizard's backdrop (layout.spec.ts's phone
      // walk), and it never reproduced on a fast laptop, where the window is milliseconds.
      // Reading the LIVE route here is what makes the rule hold whichever order they land in.
      //
      // It cannot close an in-app wizard by mistake: every door into the wizard (Home's empty
      // hint, the production page, NewGraphicButton, a template page's deep link) navigates to
      // `#/new` FIRST, so a wizard open on any other route is only ever that boot.
      const strandedStartupWizard = route.view !== 'editor';
      if (useTemplateStore.getState().galleryOpen && (routedWizard.current || strandedStartupWizard)) {
        useTemplateStore.getState().closeGallery();
      }
      routedWizard.current = false;
      consumedDesign.current = null;
    }
    // `galleryOpen` stays a dependency — it is what RE-RUNS this effect when the wizard opens
    // or closes; the branches above just read the live value rather than this snapshot of it.
  }, [route, galleryOpen]);

  // Only the WARM path (Home → `#/new`) has a Home worth preserving under the wizard. A boot
  // that LANDED on `#/new` renders NO under-surface: there is nothing to keep alive, and
  // mounting the whole dashboard (with its thumbnails) beneath a full-screen opaque wizard is
  // work whose only possible visible outcome is a flash. The flag clears the moment the route
  // leaves the wizard, so Home → `#/new` gets the preserved Home back for the rest of the
  // session.
  //
  // It reads the URL THE READER ARRIVED ON, not the route decideBootRoute resolved to. Those
  // differ for exactly one boot — a first-ever visit to a bare `/app`, which resolves to the
  // wizard — and there the under-surface stays Home, as it has been. Reading the resolved
  // route instead looks tidier and is a behaviour change nobody asked for: it takes `.topbar`
  // off a first-visit `/app`, which is the boot several specs bootstrap through
  // (`e2e/_create.ts`'s "both shells render a `.topbar`", motion-presets, wizard-logo). The
  // flash this branch fixed is gone either way, because the route already says `new` when the
  // first render happens, so the surface under the wizard is Home rather than the editor.
  const bootedOnWizard = useRef(arrivedOnWizard);
  useEffect(() => {
    if (route.view !== 'new') bootedOnWizard.current = false;
  }, [route]);

  // A session that DIED (refresh token expired/revoked — syncController's transition, never a
  // deliberate Sign out) surfaces as the ordinary sign-in prompt with a reason: sync stops
  // silently otherwise, and local work was never at risk, so the prompt says both. Never a
  // wall — dismissing it keeps the whole studio working offline-style (step 9).
  useEffect(() => {
    if (!isBackendConfigured()) return;
    const onExpired = () =>
      useAuthUi.getState().openSignIn(
        'Your session expired — sign in again to keep syncing. Everything you made is safe on this device.',
        'resume',
      );
    window.addEventListener('spx-session-expired', onExpired);
    return () => window.removeEventListener('spx-session-expired', onExpired);
  }, []);

  // A DURABLE WRITE that failed after the fact (model/durableStore.ts). Persisting to IndexedDB
  // is confirmed a moment after the call returns, so a refusal cannot come back as that call's
  // return value the way a localStorage quota error did - it arrives here instead, and it must
  // still be loud. The same dialog, raised from the event, is what keeps "a save either happened
  // or said so" true now that the write is asynchronous. The next write throws synchronously
  // (the store's sticky full flag), so the ordinary in-line error paths take over from here.
  useEffect(() => {
    const onStorageError = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string; message?: string }>).detail;
      raiseStorageAlert({
        action: 'Saving to this browser',
        error: detail?.message ?? 'Your work could not be saved to browser storage.',
        outcome: 'Your work is still open here — export it or free some room, then save again.',
      });
      // The topbar must not keep reading "Saved" for a write that did not land.
      const s = useTemplateStore.getState();
      if (s.saved.status !== 'failed') s.setSaved({ ...s.saved, dirty: true, status: 'failed' });
    };
    window.addEventListener('spx-storage-error', onStorageError);
    return () => window.removeEventListener('spx-storage-error', onStorageError);
  }, []);

  // Public show-chat send-in page: <app-url>?chat=<slug>. Anyone with the link may submit;
  // RLS is the boundary. Everything else is the builder. `bootQuery` is the page's own query
  // string, read once at module load — the boot decision consults the same one.
  const params = bootQuery;
  const chatSlug = params.get('chat');
  if (chatSlug) return <SendIn slug={chatSlug} />;

  // Hosted control page: <app-url>?control=<slug> — the show's operator page, no login,
  // the unguessable slug is the capability (same pattern as ?chat=).
  const controlSlug = params.get('control');
  if (controlSlug) return <HostedControlPage slug={controlSlug} />;

  // Agent access consent: <app-url>?agent=<state>&port=&name=&challenge= — a coding agent's CLI
  // (`noacg login`) opened this; the page asks once and hands a one-time code to the CLI's
  // loopback listener (docs/AGENT_SAVE.md). A query route like the two above, rendered INSTEAD
  // of the studio: it is a question, not a surface.
  if (isAgentRequestUrl(params)) return <AgentAccessConsent params={params} />;

  // NoaCG Bridge pairing: <app-url>?bridge=<port>&code=<code> - the local playout helper opened
  // this (docs/BRIDGE.md §2); one click exchanges the one-time code for its token over loopback.
  if (isBridgePairUrl(params)) return <BridgePairPage params={params} />;

  // PASSWORD RECOVERY: <app-url>?recovery=1 — the route a reset link points at
  // (backend/auth.ts RECOVERY_REDIRECT). It boots a Supabase client, reads the token out of the
  // fragment, offers the set-a-new-password form, and SAYS SO when the link is expired. Before
  // it, recovery had no destination of its own: the mail landed wherever the request had been
  // made from and hoped a dialog would catch one event
  // (docs/backlog/password-reset-link-lands-nowhere.md).
  //
  // THE HASH IS THE SECOND KEY, and it is the one that cannot be lost. `?recovery=1` reaches us
  // only if Supabase's redirect allow-list accepts the query, and every mail ALREADY SENT points
  // at bare `/app`; `type=recovery` in the fragment is put there by Supabase itself on every one
  // of those, old and new. So a recovery token opens this page whichever way it arrives.
  // `kind === 'error'` is deliberately NOT a key on its own — a failed Google sign-in returns an
  // error fragment too, and telling that reader their reset link expired would be a lie.
  //
  // Offline the branch is not taken at all: the page renders null there (zero auth UI, pinned by
  // e2e/auth.spec.ts), and a null here would be a blank screen instead of the studio.
  if (isBackendConfigured() && (isRecoveryRequestUrl(params) || arrivingRecoveryLink().kind === 'token')) {
    return <PasswordRecoveryPage />;
  }

  // Routed surfaces: Home, a saved graphic's control panel, a production's page, the video
  // workspace and the new editor, all open to everyone, with no login wall (Era 5.6). Account
  // features (cloud sync, community, AI) gate themselves via useAuthState and the on-demand
  // SignInDialog.
  //
  // NO ROUTE RENDERS THE OLD CODE EDITOR (AppShell), whatever this browser has stored (owner,
  // 2026-09-24). The routes that used to reach it now land somewhere real:
  //   - `#/graphic/<id>` shows that graphic's control page (and is rewritten to `#/control/<id>`
  //     at boot and by the effect above);
  //   - the bare '' route, `#/` and any hash this app does not own - which is where a Supabase
  //     sign-in or reset token arrives - show HOME. Only the render changes there: the URL is
  //     left alone, because rewriting it would destroy the token (bootMayRewriteUrl).
  //
  // The HomePage usages share ONE key on purpose: navigating Home ⇄ `#/new` must NOT remount
  // Home: the remount repainted blank thumbnails for a frame before the wizard covered them
  // (the acceptance round's "flash"). Freshness after a wizard create comes from Home's own
  // 'spx-data-changed' listener instead. Under the full-screen wizard (`#/new`) only the WARM
  // path has a Home worth preserving (see `bootedOnWizard` above).
  const home = <HomePage key="home" route={{ view: 'home', section: null }} />;
  const surface =
    route.view === 'editor-foundation' ? (new URLSearchParams(window.location.search).get('editor') === 'foundation' ? <EditorFoundation /> : home)
    : route.view === 'home' ? <HomePage key="home" route={route} />
    : route.view === 'control' || route.view === 'graphic' ? <GraphicControlPage id={route.id} />
    : route.view === 'production' ? <ProductionPage id={route.id} sub={route.sub ?? null} />
    // A join link's SURFACE is Home - the dialog itself mounts below, with the app-level
    // dialogs, so an offline build (where it renders nothing) simply lands the visitor on Home
    // rather than on a blank surface.
    : route.view === 'join-team' ? <HomePage key="home" route={{ view: 'home', section: 'productions' }} />
    : route.view === 'video' ? <VideoAppShell />
    : route.view === 'new' ? (bootedOnWizard.current ? null : home)
    : home;

  // The export window and the WIZARD mount HERE rather than inside a surface: several surfaces
  // open them. The wizard used to mount in each editor shell, which forced `#/new` to render
  // an editor underneath - at App level it opens full-screen over ANY surface (step 4). Both
  // live in module stores, so mounting per surface would put two modals on screen at once.
  return (
    <>
      {surface}
      <CreationWizard />
      {/* The save dialogs mount ONCE, here, and AFTER the wizard on purpose. They used to be
          per-shell, which left every shell without one (the control page, the production
          dashboard, the video shell, a cold boot on `#/new`) with a guard that could be
          REQUESTED but never rendered - requestSwitch set the store and nothing appeared. And
          the unsaved-changes guard can now be raised from INSIDE the wizard (its + New graphic
          door), so it must paint over the wizard. Since 2026-09-03 it wins by NUMBER - the
          wizard's shell dropped to the full-screen layer while a dialog backdrop stayed on the
          modal one (the scale in src/styles/base.css) - but it must still mount OUT HERE, because
          that shell is a stacking context and nothing inside it can rise above the app's corner
          notices whatever z-index it carries. */}
      <SaveDialogs />
      {/* The on-demand SIGN-IN dialog mounts ONCE, here, for the same reason as the save dialogs
          above. It used to live inside the Home, editor and video shells, so the production page
          and the graphic control page could ASK for it (Start production, "Sign in to open this
          panel") and nothing appeared - the owner's "Start production does nothing" while signed
          out, 2026-09-22. Offline it renders nothing (`backendConfigured` gates it), so this
          adds no auth UI to a build without a backend. The agent consent page returns before
          this tree and keeps its own copy. */}
      <SignInDialog />
      {/* The teams doors (docs/TEAMS_PLAN.md §6), mounted ONCE here because both are reached
          from siblings: the share dialog from Home's production card menu AND the production
          page header, the join dialog from a route. Each renders nothing at all unless a real
          session exists on a build with a backend - an offline build grows no team UI, which is
          pinned by e2e/auth.spec.ts. */}
      <ShareWithTeamDialog />
      {route.view === 'join-team' && <JoinTeamDialog code={route.code} />}
      <ExportWindow />
      {/* A failed write to browser storage is announced HERE, not by whichever surface hit it:
          the wizard closes itself the moment a create replaces the route, so an inline message
          would unmount before it could be read (the "add to production dumps you in the canvas"
          defect). */}
      <StorageAlertDialog />
      <AnalyticsConsentBanner />
      {/* A boot that could not use IndexedDB (blocked, wedged, or absent) says so once,
          honestly - model/durableStore.ts durableStoreHealth. Renders null on the healthy
          path, which is every ordinary browser. */}
      <StorageHealthNotice />
    </>
  );
}
