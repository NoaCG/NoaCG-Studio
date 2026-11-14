import { createBlankTemplate } from '../../templates/blank';
import { createAuthoringProject } from '../../store/authoringProjects';
import { useSaveUi } from '../../store/saveActions';
import { openNewEditor } from './openNewEditor';

/** The established guarded, durable project creation path also owns a single blank graphic. */
export function startBlankGraphic(close: () => void): void {
  useSaveUi.getState().requestSwitch(() => {
    void createAuthoringProject('Untitled project', [createBlankTemplate()]).then(ok => {
      if (ok) { close(); openNewEditor({ replace: true }); }
    });
  });
}
