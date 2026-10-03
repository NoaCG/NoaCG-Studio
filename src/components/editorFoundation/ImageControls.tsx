import { useRef } from 'react';
import type { SpxTemplate } from '../../model/types';
import { IMAGE_ACCEPT } from '../../assets/fileImport';
import { imageCapability } from '../../blocks/editorImages';
import { getTemplateParts } from '../../model/structure';
import { useImageImport } from './useImageImport';
import type { EditorSession } from './session';
import type { RenderedPart } from './protocol';

export default function ImageControls({ template, selector, session, appearance, openAssets }: { template: SpxTemplate; selector: string; session: EditorSession; appearance?: RenderedPart['appearance']; openAssets: () => void }) {
  const input = useRef<HTMLInputElement>(null), image = useImageImport(session);
  if (getTemplateParts(template.html, template.fields, true).find(p => p.selector === selector)?.kind !== 'image') return null;
  const capability = imageCapability(template, selector);
  return <section className="ef-image-controls" aria-label="Image">
    <span className="ef-section-label">Image · fit inside its box</span>
    {capability.supported ? <><button onClick={() => input.current?.click()} disabled={image.busy}>Replace image…</button>
      <button onClick={openAssets}>Choose from Assets</button>
      <input hidden ref={input} type="file" accept={IMAGE_ACCEPT} data-testid="image-replace-input" onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = '';
        void image.files(files, 'replace', undefined, { selector, appearance }).catch(() => {});
      }} />
      <p className="ef-muted">Keeps the box and fits the whole image without distortion.</p></> : <p className="ef-muted" data-testid="image-refusal">{capability.reason}</p>}
    {image.error && <p role="alert">{image.error}</p>}
  </section>;
}
