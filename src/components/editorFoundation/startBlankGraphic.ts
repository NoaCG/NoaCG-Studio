import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { guardNavigation, useRouter, type Route } from '../../app/router';
import { createAuthoringProject, useAuthoringProjects } from '../../store/authoringProjects';
import { useSaveUi } from '../../store/saveActions';
import { createAuthoringBlankTemplate } from '../../templates/blank';
import { openNewEditor } from './openNewEditor';

type Request = {
  walk: unknown;
  route: Route;
  creating: boolean;
  revoked: boolean;
  release?: () => void;
  unsubscribe?: () => void;
};

/** The Entry owns presentation, while the existing project transaction owns durable writes. */
export function useBlankGraphic(open: boolean, walk: unknown, close: () => void) {
  const current = useRef<Request | null>(null);
  const latest = useRef({ open, walk, close });
  latest.current = { open, walk, close };
  const [pending, setPending] = useState(false);

  const finish = (request: Request) => {
    request.revoked = true;
    request.release?.();
    request.unsubscribe?.();
    if (current.current === request) {
      current.current = null;
      setPending(false);
    }
  };
  const owns = (request: Request) => current.current === request && !request.revoked;

  useLayoutEffect(() => {
    const request = current.current;
    // A successful core restore closes the gallery before its Promise completes. The
    // creating lease survives that owned close; requested continuations never do.
    if (request && !request.creating && (!open || request.walk !== walk)) finish(request);
  }, [open, walk]);

  useEffect(() => {
    const depart = () => { if (current.current) finish(current.current); };
    window.addEventListener('pagehide', depart);
    return () => {
      window.removeEventListener('pagehide', depart);
      depart();
    };
  }, []);

  const canLeave = () => {
    const save = useSaveUi.getState();
    if (save.confirmSwitch || save.saveDialog) return false;
    const request = current.current;
    if (request?.creating) return false;
    if (request) finish(request);
    return true;
  };

  const start = () => {
    const save = useSaveUi.getState();
    if (!latest.current.open || current.current?.creating || useAuthoringProjects.getState().busy || save.confirmSwitch || save.saveDialog) return;
    if (current.current) finish(current.current);
    const request: Request = { walk: latest.current.walk, route: useRouter.getState().route, creating: false, revoked: false };
    current.current = request;
    request.unsubscribe = useRouter.subscribe(state => {
      if (state.route !== request.route) finish(request);
    });
    save.requestSwitch(() => {
      if (!owns(request) || !latest.current.open || latest.current.walk !== request.walk || useRouter.getState().route !== request.route) return;
      // Eligibility and the gate are synchronous: a second event cannot outrun disabled UI.
      request.creating = true;
      setPending(true);
      request.release = guardNavigation(() => {});
      void (async () => {
        try {
          const ok = await createAuthoringProject('Untitled project', [createAuthoringBlankTemplate()]);
          if (ok && owns(request)) {
            finish(request);
            latest.current.close();
            openNewEditor({ replace: true });
          }
        } catch (error) {
          if (owns(request)) useAuthoringProjects.setState({ error: error instanceof Error ? error.message : String(error) });
        } finally {
          finish(request);
        }
      })();
    }, () => finish(request));
  };
  return { pending, start, canLeave };
}
