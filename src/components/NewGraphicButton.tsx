import { useRouter } from '../app/router';
import { useSaveUi } from '../store/saveActions';
import { useTemplateStore } from '../store/templateStore';

/**
 * THE DOOR TO THE WIZARD - one control, every /app surface.
 *
 * Owner, 2026-08-27: "I don't get there fast enough from other views." Creating was reachable
 * from Home and the editor, one detour away on the control page, and not at all from the
 * production dashboard - so the bar's model (logo = the front page, Home = your work, this =
 * make something) only held on two surfaces out of five. It is one component rather than five
 * buttons because the five had already drifted: the video shell opened the wizard through the
 * store flag instead of the ROUTE (so Back could not close it), and only the editor's went
 * through the unsaved-changes guard.
 *
 * Always routed (`#/new`) and always guarded: a create REPLACES the working document, and
 * requestSwitch is a no-op on a clean one, so the guard costs the common case nothing.
 *
 * `productionId` is the production this open is FOR (the dashboard's own door): the wizard
 * pre-applies that production's look and preselects it on Finish. Standing inside a production,
 * a new graphic that did NOT join it would be the surprise.
 *
 * The WIZARD mounts this door too (owner, 2026-08-28): mid-walk it is a guarded START-OVER -
 * `#/new` rewinds the walk to the front page WITHOUT clearing the draft, so browser Back
 * returns to the step with everything still in it, and nothing is silently lost. On the front
 * page itself the press is a NO-OP, checked here before the guard runs: proceeding would
 * change nothing, so even a dirty document must not raise the unsaved-changes dialog for it.
 */
export default function NewGraphicButton({
  className,
  testid,
  productionId,
  title,
}: {
  className?: string;
  testid?: string;
  productionId?: string;
  title?: string;
}) {
  const navigate = useRouter((s) => s.navigate);
  return (
    <button
      className={className}
      data-testid={testid ?? 'new-graphic'}
      // One hook for THIS door on every surface, whatever testid the mount gives it. Home's empty
      // library carries a plain "+ New graphic" call to action of its own, so the accessible name
      // alone does not identify the door (e2e/_create.ts startNewProject).
      data-door="new-graphic"
      title={
        title ??
        (productionId
          ? 'Create a new graphic for this production - the wizard uses its look and adds it here'
          : 'Start a new graphic - opens the creation wizard')
      }
      onClick={() => {
        const route = useRouter.getState().route;
        if (route.view === 'new' && !route.step) return;
        useSaveUi.getState().requestSwitch(() => {
          if (productionId) useTemplateStore.setState({ pendingProductionId: productionId });
          navigate({ view: 'new' });
        });
      }}
    >
      + New graphic
    </button>
  );
}
