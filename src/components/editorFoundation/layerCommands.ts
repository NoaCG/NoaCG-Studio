import type { SpxTemplate } from '../../model/types';
import type { EditorOperation } from './operations';

/** Operate once on selected roots; a selected child must not be deleted/duplicated twice. */
export function selectedLayerOperations(template: SpxTemplate, selectors: string[], action: 'delete' | 'duplicate' | 'forward' | 'backward'): EditorOperation[] {
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const roots = [...new Set(selectors)].filter(selector => {
    const node = doc.querySelector(selector);
    return node && !selectors.some(other => other !== selector && doc.querySelector(other)?.contains(node));
  }).sort((a, b) => doc.querySelector(a)!.compareDocumentPosition(doc.querySelector(b)!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  if (action === 'forward') roots.reverse();
  return roots.map(selector => action === 'delete' || action === 'duplicate' ? { kind: action === 'delete' ? 'layer.delete' : 'layer.duplicate', selector }
    : { kind: 'layer.reorder', selector, direction: action });
}
