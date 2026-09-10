// The shared LIVE project-format label for every place the editor prints the authored format.
// Deriving its catalogue warning from the working template here covers every load door - boot
// restore, library open, import, cloud pull, and hand-edited code - without duplicating a check
// at each route or allowing the header and canvas chip to drift.
//
// The header used to put a THIN space before `fps` and the canvas chip a normal one. Merging them
// meant picking one, and the normal space won on purpose: both labels are now one string, so a
// test can assert it once and a reader comparing the two surfaces sees the same thing twice.

import { validateProjectFormat } from '../model/projectFormat';
import type { SpxTemplate } from '../model/types';

interface Props {
  template: SpxTemplate;
  className: string;
  testId: string;
}

// What the warning MEANS, appended to the validator's own sentence. It deliberately does not
// tell the reader to go and change the format: there is no format control for an already-made
// graphic (ProjectFormatPicker only appears in the creation wizard and in video settings), so
// an instruction to use one would send them looking for a door that is not there. It says what
// still works and what the number costs instead.
const CONSEQUENCE =
  'The graphic still opens, saves and exports, but this is not a format the app offers, ' +
  'so nothing here has been laid out or measured against it.';

export default function ProjectFormatMeta({ template, className, testId }: Props) {
  const issues = validateProjectFormat(template.resolution, template.fps);
  const unsupported = issues.length > 0;

  return (
    <span
      className={className}
      data-testid={testId}
      data-format-unsupported={unsupported ? 'true' : undefined}
      title={unsupported ? `${issues.join(' ')} ${CONSEQUENCE}` : 'Authored project format'}
    >
      {unsupported ? '⚠ ' : ''}
      {template.resolution.width}×{template.resolution.height} · {template.fps} fps
    </span>
  );
}
