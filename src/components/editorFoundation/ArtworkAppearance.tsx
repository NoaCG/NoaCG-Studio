import { useEffect, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { artworkNode, artworkText, typeReasons, type ArtworkStyle } from '../../blocks/artworkEdits';
import { lineFit, lineTextStyle, placedLines, slotSize } from '../../blocks/designLayout';
import { FONTS, fontWeights } from '../../model/fonts';
import type { FieldDescriptor } from '../../model/fieldModel';
import { FieldControl } from '../fields/FieldControl';
import ArtworkTextEditor from './ArtworkTextEditor';
import { sameRevision, type EditorSession, type Revision } from './session';
import type { RenderedPart } from './protocol';
import { isArmed, writeChannel } from '../../blocks/editorAnimation';
import { ownerOf, readTimeline } from './timelineView';
import { authoringPosition, editingPose } from './animationAuthoring';
import { AnimationButtons } from './AnimationProperties';
import type { EditorOperation } from './operations';

interface Props {
  template: SpxTemplate; selector: string; session: EditorSession;
  appearance?: RenderedPart['appearance']; previewCss: (css: string) => void;
  previewTemplate: (template: SpxTemplate) => void;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

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
  // Animated opacity keys the channel it lives in: opacity, or autoAlpha (R1.2a.6).
  const view = readTimeline(template), owner = ownerOf(view, selector);
  const armed = property === 'opacity' && isArmed(view.data, owner, 'opacity');
  const operations = (values: ArtworkStyle): EditorOperation[] => armed
    ? [{ kind: 'animation.key', selector, property: writeChannel(view.data, owner, 'opacity'), ...authoringPosition(template, selector, session.port.view().time, session.port.view().cue), value: values.opacity!, action: 'set' }]
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
      // Number fields send numbers; Font size is typed text and Weight a choice.
      const typed = property === 'fontSize' || property === 'weight';
      const values: ArtworkStyle = { [property]: property === 'opacity' ? Number(raw) / 100 : typed ? Number(raw) : raw };
      if (invalidNumber.current || (typed && !String(raw).trim())) throw new Error('Enter a valid ' + descriptor.label.toLowerCase() + '.');
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

/**
 * Typography and fit (R1.2b.2, docs/research/editor-r1-2b-2): weight from the font's own range,
 * alignment, line and letter spacing, and what a long value does with its width (and a text box's
 * height). A control the layer cannot take is absent and its reason shows instead (owner, 2026-10-02).
 */
function Typography(props: Props) {
  const { template, selector, appearance } = props;
  const id = selector.slice(1), reasons = typeReasons(template, selector);
  const place = placedLines(template.html, template.css)[selector];
  const style = place ? lineTextStyle(template.html, template.css, id) : null, fit = place ? lineFit(template.html, template.css, id) : null;
  const box = place ? slotSize(template.css, place.wrapperId) : null;
  const weight = appearance?.fontWeight ?? 400, weights = fontWeights(appearance?.fontFamily ?? '');
  if (!weights.some(w => w.value === weight)) weights.push({ value: weight, label: String(weight) });
  const options = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
  const said = [...new Set(Object.values(reasons))];
  return <>
    <AppearanceField {...props} property="weight" descriptor={{ key: 'font-weight', label: 'Weight', kind: 'select', defaultValue: '400',
      options: weights.map(w => ({ value: String(w.value), label: w.label })) }} value={String(weight)} testId="artwork-weight" />
    {!reasons.align && <AppearanceField {...props} property="align" descriptor={{ key: 'text-align', label: 'Alignment', kind: 'select', defaultValue: 'left',
      options: options([['left', 'Left'], ['center', 'Center'], ['right', 'Right']]) }} value={style?.align ?? 'left'} testId="artwork-align" />}
    {!reasons.lineHeight && <AppearanceField {...props} property="lineHeight" descriptor={{ key: 'line-height', label: 'Line spacing', kind: 'number', defaultValue: 1.2, min: .5, max: 5, step: .05 }}
      value={appearance?.lineHeight === undefined ? '' : round(appearance.lineHeight)} testId="artwork-line-spacing" />}
    <AppearanceField {...props} property="letterSpacing" descriptor={{ key: 'letter-spacing', label: 'Letter spacing', kind: 'number', defaultValue: 0, min: -500, max: 500, step: .5 }}
      value={round(appearance?.letterSpacing ?? 0)} testId="artwork-letter-spacing" />
    {fit && <>
      <AppearanceField {...props} property="fit" descriptor={{ key: 'fit', label: 'Long text', kind: 'select', defaultValue: 'overflow',
        options: options([['shrink', 'Shrink to fit'], ['wrap', 'Wrap'], ['overflow', 'Run on']]) }} value={fit.mode} testId="artwork-fit" />
      {fit.mode !== 'overflow' && <div className="ef-number-row">
        <AppearanceField {...props} property="width" descriptor={{ key: 'box-width', label: 'Width', kind: 'number', defaultValue: 400, min: 1, step: 1 }}
          value={round(box?.width ?? fit.maxWidth ?? 0)} testId="artwork-box-width" />
        {box && <AppearanceField {...props} property="height" descriptor={{ key: 'box-height', label: 'Height', kind: 'number', defaultValue: 120, min: 1, step: 1 }}
          value={round(box.height)} testId="artwork-box-height" />}
      </div>}
    </>}
    {said.length > 0 && <p className="ef-muted" data-testid="artwork-type-reason">{said.join(' ')}</p>}
  </>;
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
  // On a flag a layer that edits the departing cue starts from that cue's opacity, not the arriving preview's.
  const opacity = editingPose(template, selector, appearance, session.port.view().time, session.port.view().cue)?.opacity ?? 1;
  return <>
    {text && <><ArtworkTextEditor key={selector + ':' + session.version().source} selector={selector} text={text.text} session={session} />
      <p className="ef-muted">{text.field ? 'Artwork and playout default. Operator sample values are kept separately.' : 'Artwork only. This text has no operator field.'}</p>
      <AppearanceField {...props} property="fontId" descriptor={{ key: 'font', label: 'Font', kind: 'select', defaultValue: '', options: [
        { value: '', label: 'Current: ' + (appearance?.fontFamily.split(',')[0] ?? 'inherited font') }, ...FONTS.map(f => ({ value: f.id, label: f.family })),
      ] }} value={currentFont?.id ?? ''} testId="artwork-font" />
      <AppearanceField {...props} property="fontSize" descriptor={{ key: 'font-size', label: 'Font size', kind: 'text', defaultValue: '' }}
        value={appearance?.fontSize ?? node.getAttribute('font-size') ?? ''} testId="artwork-font-size" />
      <Typography {...props} />
    </>}
    {(text || shape) && <>
      <AppearanceField {...props} property={text ? 'color' : 'fill'} descriptor={{ key: 'appearance-color', label: text ? 'Text colour' : 'Solid fill', kind: 'color', defaultValue: '#ffffff' }} value={hex} testId="artwork-colour" />
    </>}
    {(text || shape || svg) && <>
      <AppearanceField {...props} property="opacity" descriptor={{ key: 'appearance-opacity', label: 'Opacity %', kind: 'number', defaultValue: 100, min: 0, max: 100, step: 1 }} value={Math.round(opacity * 100)} testId="artwork-opacity" />
      <AnimationButtons {...props} property="opacity" label="Opacity" />
      <p className="ef-muted">Changes preview immediately. Enter or leave the field to finish; Escape cancels.</p>
    </>}
  </>;
}
