import { useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { artworkNode, artworkText, type ArtworkStyle } from '../../blocks/artworkEdits';
import { FONTS } from '../../model/fonts';
import { FieldControl } from '../fields/FieldControl';
import ArtworkTextEditor from './ArtworkTextEditor';
import type { EditorSession } from './session';
import type { RenderedPart } from './protocol';

export default function ArtworkAppearance({ template, selector, session, appearance }: { template: SpxTemplate; selector: string; session: EditorSession; appearance?: RenderedPart['appearance'] }) {
  const text = artworkText(template, selector), node = artworkNode(template, selector);
  const [draft, setDraft] = useState<ArtworkStyle>({});
  const [error, setError] = useState('');
  const [expected] = useState(() => session.version());
  const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
  const shape = !text && ['rect', 'ellipse', 'circle', 'path', 'polygon', 'div'].includes(node.tagName.toLowerCase());
  const currentColour = (text ? appearance?.color : appearance?.fill) ?? (svg ? node.getAttribute('fill') : null) ?? '#ffffff';
  const rgb = currentColour.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  const hex = rgb ? '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('') : currentColour;
  const currentFont = FONTS.find(f => appearance?.fontFamily.replace(/["']/g, '').split(',')[0].trim() === f.family);
  const apply = () => {
    try {
      session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'style.set', selector, values: draft }] }); setDraft({}); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <>
    {text && <><ArtworkTextEditor key={selector + text.text} selector={selector} text={text.text} session={session} />
      <p className="ef-muted">{text.field ? 'Artwork and playout default. Operator sample values are kept separately.' : 'Artwork only. This text has no operator field.'}</p>
      <label className="ef-appearance-field">Font<select aria-label="Font" value={draft.fontId ?? currentFont?.id ?? ''} onChange={e => setDraft({ ...draft, fontId: e.target.value })}>
        <option value="" disabled>Current: {appearance?.fontFamily.split(',')[0] ?? 'inherited font'}</option>{FONTS.map(font => <option key={font.id} value={font.id}>{font.family}</option>)}
      </select></label>
      <label className="ef-appearance-field">Font size<input aria-label="Font size" inputMode="decimal" placeholder={node.getAttribute('font-size') ?? 'Current size'} value={draft.fontSize ?? appearance?.fontSize ?? ''}
        onChange={e => setDraft({ ...draft, fontSize: e.target.value ? Number(e.target.value) : undefined })} /></label>
    </>}
    {(text || shape) && <>
      <label className="ef-appearance-field">{text ? 'Text colour' : 'Solid fill'}<FieldControl descriptor={{ key: 'appearance-color', label: text ? 'Text colour' : 'Solid fill', kind: 'color', defaultValue: '#ffffff' }}
        value={(text ? draft.color : draft.fill) ?? hex}
        onChange={value => setDraft({ ...draft, [text ? 'color' : 'fill']: String(value) })} testId="artwork-colour" /></label>
      <div className="ef-edit-actions"><button disabled={!Object.keys(draft).length} onClick={apply}>Apply appearance</button>
        <button disabled={!Object.keys(draft).length} onClick={() => setDraft({})}>Reset changes</button></div>
    </>}
    {error && <p role="alert">{error}</p>}
  </>;
}
