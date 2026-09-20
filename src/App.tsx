import { useEffect, useLayoutEffect, useRef } from 'react';
import AppShell from './components/AppShell';
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
import StorageAlertDialog from './components/save/StorageAlertDialog';
import SaveDialogs from './components/save/SaveDialogs';
import ShareWithTeamDialog from './components/teams/ShareWithTeamDialog';
import JoinTeamDialog from './components/teams/JoinTeamDialog';
import { useAuthUi } from './components/auth/authUi';
import { useAuthState } from './components/auth/useAuthState';
import { isBackendConfigured } from './backend/config';
import { isAgentRequestUrl } from './backend/agentAccess';
import { arrivingRecoveryLink, isRecoveryRequestUrl } from './backend/recoveryLink';
import { graphicWhenSynced } from './backend/graphicWhenSynced';
import { useDocKindStore } from './store/docKindStore';
import { useTemplateStore } from './store/templateStore';
import { parseRoute, useRouter, type Route } from './app/router';
import { openGraphicDoc, useSaveUi } from './store/saveActions';
import { raiseStorageAlert } from './store/storageAlert';
import { isAdvancedMode, useAdvancedMode } from './components/useAdvancedMode';
import AnalyticsConsentBanner from './components/AnalyticsConsentBanner';
import StorageHealthNotice from './components/StorageHealthNotice';

/** The page's own query string. Read once: only a document load can change it (the router writes
 *  the HASH, and carries the search along unchanged), so re-parsing it per render was the same
 *  answer at a small cost. */
const bootQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

/** Is this page answered by a QUERY capability rather than by a routed surface? `?chat=`,
 *  `?control=`, `?agent=` and `?recovery=1` are each rendered INSTEAD of the studio (see App
 *  below). One definition, because two would drift the moment a fifth capability is added — and
 *  the two readers want opposite things from it: App needs to know which one, the boot decision
 *  only needs to know that it must keep its hands off the URL. */
const queryCapabilityOwnsPage = (q: URLSearchParams): boolean =>
  q.has('chat') || q.has('control') || isAgentRequestUrl(q) || isRecoveryRequestUrl(q);

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
  // would otherwise cover whatever the link pointed at. Both modes.
  if (url.view !== 'editor') {
    if (useTemplateStore.getState().galleryOpen) useTemplateStore.getState().closeGallery();
    return url;
  }

  // ONLY A BARE BOOT IS REWRITTEN — everything below this point WRITES the URL. A hash this
  // app does not own, and a page a query capability owns, are both left exactly as they are;
  // bootMayRewriteUrl carries the reasoning, and the boot effect in App asks it too, because
  // that one writes the URL as well.
  if (!bootMayRewriteUrl()) return url;

  // WIZARD-FIRST BOOT (docs/GOALS_ARCHIVE.md "Student release" step 4), default mode only:
  // the bare '' route lands on the wizard for a first-ever visit (galleryOpen's initial
  // value) and on HOME for a returning reader. Advanced mode keeps the classic behaviour —
  // '' is the editor, restoring the autosaved document.
  if (isAdvancedMode()) return url;

  // ONLY THE RETURNING READER IS SETTLED HERE, and that is a deliberate limit rather than an
  // oversight. It is the boot the owner reported and by far the common one: a browser that has
  // made something before, opening `/app`, used to paint the whole canvas editor for a frame on
  // its way to Home.
  //
  // The FIRST-EVER visit — no autosaved project, so the answer is the wizard — is left to the
  // effect below, exactly as it has always worked, and it still costs the frame this file
  // exists to remove. Moving it here was tried and backed out when `layout.spec.ts` went red on
  // CI; that red is now understood (it was the stranded startup wizard, not the under-surface
  // the revert blamed), so the move is available again. It is a piece of work rather than a
  // line, and docs/backlog/first-visit-boot-flash.md carries the trail.
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
  // Which editor world is active: SPX live graphics or the AI video editor. Persisted;
  // the wizard flips it when a project of the other kind is created or opened.
  const kind = useDocKindStore((s) => s.kind);
  const advanced = useAdvancedMode((s) => s.advanced);

  // In-app surface routing (docs/SAVED_CONTENT_MODEL.md §3): hash routes for Home,
  // per-graphic control panels, productions, and direct graphic links — real history, so
  // Back/Forward walk between surfaces and a refresh restores the same place.
  const route = useRouter((s) => s.route);

  // Signing in is a second chance at a deep link that could not be resolved without an account
  // (the graphic-route effect below). Offline this reads true and nothing ever waits on it.
  const { signedIn } = useAuthState();

  // THE ONE BOOT DECISION STILL MADE FROM AN EFFECT: a first-ever visit, which lands on the
  // wizard. Everything else is settled at module load by decideBootRoute, which explains why
  // this is so much smaller than it was. It is late by a frame, and the comment on
  // decideBootRoute's last branch says why moving it is its own piece of work rather than a
  // line to change here.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (isAdvancedMode()) return;
    if (useRouter.getState().route.view !== 'editor') return;
    // This WRITES the URL, so it answers to the same guard decideBootRoute does. A hash the
    // app does not own reads as the editor and would otherwise be replaced here.
    if (!bootMayRewriteUrl()) return;
    if (useTemplateStore.getState().galleryOpen) useRouter.getState().replace({ view: 'new' });
  }, []);

  // A `#/graphic/<id>` route means THAT library graphic should be the working document.
  // Loading is guarded (unsaved changes ask first); handled once per route change so a
  // canceled guard doesn't re-ask in a loop. Cancel rewinds the URL to the plain editor.
  //
  // ONE ATTEMPT PER ID, AND EXACTLY ONE MORE WHEN A SESSION ARRIVES. `signedIn` is false while
  // the session is still being read (up to 6 s - backend/auth.ts's bounded read), so keying this
  // on the flag alone ran the whole body twice on every ordinary signed-in boot: two cloud
  // lookups, and a second unsaved-changes dialog for a switch the reader had just approved.
  // Only the attempt that ENDED at "nobody is signed in here" is worth repeating, and only once
  // somebody has signed in.
  const graphicAttempt = useRef<{ id: string; needsSignIn: boolean } | null>(null);
  useEffect(() => {
    if (route.view !== 'graphic') {
      graphicAttempt.current = null;
      return;
    }
    const previous = graphicAttempt.current;
    if (previous && previous.id === route.id && !(previous.needsSignIn && signedIn)) return;
    graphicAttempt.current = { id: route.id, needsSignIn: false };
    const { saved } = useTemplateStore.getState();
    if (saved.graphicId === route.id) return; // already open (the normal refresh case)
    useSaveUi.getState().requestSwitch(
      () => {
        // ONE LOOKUP, not two: graphicWhenSynced answers from the local library when it can, and
        // a miss is not an answer yet - the record may be one an agent's `noacg save` minted a
        // second ago, in the cloud and not in this browser (docs/AGENT_SAVE.md). It asks the
        // cloud and waits; what to DO with each answer is decided here, because each one wants
        // something different on screen.
        void (async () => {
          const found = await graphicWhenSynced(route.id);
          // The cloud answers in seconds, and the reader may have moved on inside them. Opening
          // a document over whatever they went to instead would be worse than not opening it.
          const live = useRouter.getState().route;
          if (live.view !== 'graphic' || live.id !== route.id) return;
          if (useTemplateStore.getState().saved.graphicId === route.id) return; // a parallel attempt won
          if (found.status === 'found') {
            openGraphicDoc(found.doc);
            return;
          }
          if (found.status === 'needs-sign-in') {
            // KEEP THE LINK AND ASK. The graphic is somebody's - very likely this reader's, in
            // an account they have not signed into on this machine - so replacing the URL with
            // Home would destroy the only copy of the address they were given. The route stays,
            // a refresh still works, and signing in runs this effect once more (the ref above).
            graphicAttempt.current = { id: route.id, needsSignIn: true };
            useAuthUi.getState().openSignIn('Sign in to open this graphic. It is saved in an account.');
            return;
          }
          // Unknown id (deleted, other profile): land on Home rather than a dead editor.
          useRouter.getState().replace({ view: 'home', section: null });
        })();
      },
      () => useRouter.getState().replace({ view: 'editor' }),
    );
  }, [route, signedIn]);

  // `#/video` and `#/graphic` pin the persisted shell kind so refresh matches the URL.
  useEffect(() => {
    if (route.view === 'video' && useDocKindStore.getState().kind !== 'video') {
      useDocKindStore.getState().setKind('video');
    }
    if (route.view === 'graphic' && useDocKindStore.getState().kind !== 'spx') {
      useDocKindStore.getState().setKind('spx');
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
        // branch never sees them); what lands here is ✕/Escape — and a default-mode close
        // must land on Home, never the editor (step 4). Advanced keeps the classic rewind.
        routedWizard.current = false;
        consumedDesign.current = null;
        useRouter.getState().replace(isAdvancedMode() ? { view: 'editor' } : { view: 'home', section: null });
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

  // Routed surfaces: Home, a saved graphic's control panel, a production's page; then the
  // editor, which is open to everyone — no login wall (Era 5.6). Account features (cloud
  // sync, community, AI) gate themselves via useAuthState and the on-demand SignInDialog.
  // Under the full-screen wizard (`#/new`) the default studio renders HOME, not an editor
  // shell — booting Monaco under a surface that covers it helped no one; Advanced mode keeps
  // the classic editor-under-wizard so its create flows land where they always did.
  // The two HomePage usages share ONE key on purpose: navigating Home ⇄ `#/new` must NOT
  // remount Home — the remount repainted blank thumbnails for a frame before the wizard
  // covered them (the acceptance round's "flash"). Freshness after a wizard create comes from
  // Home's own 'spx-data-changed' listener instead.
  // ...but only the WARM path has a Home worth preserving — see `bootedOnWizard` above.
  const surface =
    route.view === 'editor-foundation' ? (new URLSearchParams(window.location.search).get('editor') === 'foundation' ? <EditorFoundation /> : <HomePage key="home" route={{ view: 'home', section: null }} />)
    : route.view === 'home' ? <HomePage key="home" route={route} />
    : route.view === 'control' ? <GraphicControlPage id={route.id} />
    : route.view === 'production' ? <ProductionPage id={route.id} sub={route.sub ?? null} />
    // A join link's SURFACE is Home - the dialog itself mounts below, with the app-level
    // dialogs, so an offline build (where it renders nothing) simply lands the visitor on Home
    // rather than on a blank surface.
    : route.view === 'join-team' ? <HomePage key="home" route={{ view: 'home', section: 'productions' }} />
    : route.view === 'video' ? <VideoAppShell />
    : route.view === 'graphic' ? <AppShell />
    : route.view === 'new' && !advanced ? (bootedOnWizard.current ? null : <HomePage key="home" route={{ view: 'home', section: null }} />)
    : kind === 'video' ? <VideoAppShell />
    : <AppShell />;

  // The export window and the WIZARD mount HERE rather than inside a shell: Home is a
  // SIBLING of AppShell, not a child, and both open them. The wizard used to mount in each
  // editor shell, which forced `#/new` to render an editor underneath - at App level it
  // opens full-screen over ANY surface (step 4). Both live in module stores, so mounting
  // per surface would put two modals on screen at once.
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
