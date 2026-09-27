import { useEffect, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { artworkNode, artworkText, type ArtworkStyle } from '../../blocks/artworkEdits';
import { FONTS } from '../../model/fonts';
import type { FieldDescriptor } from '../../model/fieldModel';
import { FieldControl } from '../fields/FieldControl';
import ArtworkTextEditor from './ArtworkTextEditor';
import { sameRevision, type EditorSession, type Revision } from './session';
import type { RenderedPart } from './protocol';
import { isArmed } from '../../blocks/editorAnimation';
import { parseAnimData } from '../../blocks/animData';
import { authoringPosition } from './animationAuthoring';
import { AnimationButtons } from './AnimationProperties';
import type { EditorOperation } from './operations';

interface Props {
  template: SpxTemplate; selector: string; session: EditorSession;
  appearance?: RenderedPart['appearance']; previewCss: (css: string) => void;
  previewTemplate: (template: SpxTemplate) => void;
}

/** A field owns its draft until blur/Enter (or a discrete choice). Preview never
 * writes the document; cleanup discards it when selection or revision changes. */
function AppearanceField({ template, selector, session, previewCss, previewTemplate, descriptor, value, property, testId }: Omit<Props, 'appearance'> & {
  descriptor: FieldDescriptor; value: string | number; property: keyof ArtworkStyle; testId: string;
}) {
  const [draft, setDraft] = useState<string | number | null>(null);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  const active = useRef<{ expected: Revision; time: number; cue?: number; values: ArtworkStyle | null; original: string | number; template: SpxTemplate } | null>(null);
  const invalidNumber = useRef(false);
  const armed = property === 'opacity' && isArmed(parseAnimData(template.js), selector, 'opacity');
  const operations = (values: ArtworkStyle): EditorOperation[] => armed
    ? [{ kind: 'animation.key', selector, property: 'opacity', ...authoringPosition(template, selector, session.port.view().time, session.port.view().cue), value: values.opacity!, action: 'set' }]
    : [{ kind: 'style.set', selector, values }];
  const restore = () => { if (armed) previewTemplate(template); else previewCss(template.css); };
  useEffect(() => () => {
    if (!active.current || active.current.template !== template) return;
    session.cancel(false);
    if (session.port.read() === template) { if (armed) previewTemplate(template); else previewCss(template.css); }
    active.current = null;
    setDraft(null); setError(''); setReset(n => n + 1);
  }, [session, template, previewCss, previewTemplate, armed]);
  const cancel = () => {
    const original = active.current?.original ?? null;
    if (active.current) {
      session.cancel(false);
      if (session.port.read() === template) restore();
    }
    active.current = null; invalidNumber.current = false;
    setDraft(original); setError(''); setReset(n => n + 1);
  };
  const finish = () => {
    const edit = active.current;
    if (!edit) return;
    if (!edit.values) { cancel(); return; }
    try {
      if (armed && (edit.time !== session.port.view().time || edit.cue !== session.port.view().cue)) throw new Error('The playhead moved. Inspect the value again before editing.');
      // Clear before execute so revision cleanup cannot cancel a completed edit.
      active.current = null;
      session.execute({ documentId: session.documentId, expected: edit.expected, transactionId: crypto.randomUUID(),
        operations: operations(edit.values) });
      setDraft(null); setError('');
    } catch (cause) { session.cancel(false); cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const change = (raw: string | number) => {
    setDraft(raw);
    try {
      if (!active.current) { const expected = session.version(); session.begin(expected); active.current = { expected, time: session.port.view().time, cue: session.port.view().cue, values: null, original: draft ?? value, template }; }
      if (!sameRevision(active.current.expected, session.version())) { cancel(); return; }
      const values: ArtworkStyle = { [property]: property === 'opacity' ? Number(raw) / 100 : property === 'fontSize' ? Number(raw) : raw };
      if (invalidNumber.current || (property === 'fontSize' && !String(raw).trim())) throw new Error('Enter a valid ' + descriptor.label.toLowerCase() + '.');
      const patch = session.preview(operations(values));
      active.current.values = values;
      if (armed) previewTemplate(patch.template); else previewCss(patch.template.css);
      setError('');
      if (descriptor.kind === 'select') finish();
    } catch (cause) {
      if (active.current) active.current.values = null;
      if (session.port.read() === template) restore();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return <div className="ef-appearance-field" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) finish();
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
    if (event.key === 'Enter') { event.preventDefault(); finish(); }
  }} onInputCapture={event => {
    const input = event.target as HTMLInputElement;
    if (input.type !== 'number') return;
    invalidNumber.current = input.value === '' || !input.validity.valid;
    if (invalidNumber.current) {
      if (active.current) active.current.values = null;
      restore();
    }
  }} onClick={event => {
    if ((event.target as HTMLElement).closest('button')) finish();
  }}>
    <label>{descriptor.label}<FieldControl key={reset} descriptor={descriptor} value={draft ?? value} onChange={change} testId={testId} /></label>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export default function ArtworkAppearance(props: Props) {
  const { template, selector, session, appearance } = props;
  const text = artworkText(template, selector), node = artworkNode(template, selector);
  const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
  const shape = !text && ['rect', 'ellipse', 'circle', 'path', 'polygon', 'div'].includes(node.tagName.toLowerCase());
  const currentColour = (text ? appearance?.color : appearance?.fill) ?? (svg ? node.getAttribute('fill') : null) ?? '#ffffff';
  const rgb = currentColour.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  const hex = rgb ? '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('') : currentColour;
  const currentFont = FONTS.find(f => appearance?.fontFamily.replace(/["']/g, '').split(',')[0].trim() === f.family);
  return <>
    {text && <><ArtworkTextEditor key={selector + ':' + session.version().source} selector={selector} text={text.text} session={session} />
      <p className="ef-muted">{text.field ? 'Artwork and playout default. Operator sample values are kept separately.' : 'Artwork only. This text has no operator field.'}</p>
      <AppearanceField {...props} property="fontId" descriptor={{ key: 'font', label: 'Font', kind: 'select', defaultValue: '', options: [
        { value: '', label: 'Current: ' + (appearance?.fontFamily.split(',')[0] ?? 'inherited font') }, ...FONTS.map(f => ({ value: f.id, label: f.family })),
      ] }} value={currentFont?.id ?? ''} testId="artwork-font" />
      <AppearanceField {...props} property="fontSize" descriptor={{ key: 'font-size', label: 'Font size', kind: 'text', defaultValue: '' }}
        value={appearance?.fontSize ?? node.getAttribute('font-size') ?? ''} testId="artwork-font-size" />
    </>}
    {(text || shape) && <>
      <AppearanceField {...props} property={text ? 'color' : 'fill'} descriptor={{ key: 'appearance-color', label: text ? 'Text colour' : 'Solid fill', kind: 'color', defaultValue: '#ffffff' }} value={hex} testId="artwork-colour" />
      <AppearanceField {...props} property="opacity" descriptor={{ key: 'appearance-opacity', label: 'Opacity %', kind: 'number', defaultValue: 100, min: 0, max: 100, step: 1 }} value={Math.round((appearance?.opacity ?? 1) * 100)} testId="artwork-opacity" />
      <AnimationButtons {...props} property="opacity" label="Opacity" />
      <p className="ef-muted">Changes preview immediately. Enter or leave the field to finish; Escape cancels.</p>
    </>}
  </>;
}
