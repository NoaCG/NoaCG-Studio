import type { SpxTemplate } from '../model/types';
import { svgInspectionSelector } from '../model/structure';
import { svgLayerLabel } from '../assets/svgImport';
import { BEHAVIOUR_ROLE_ATTR, parseBehaviourData } from './behaviourData';
import { artworkRange } from './artworkEdits';
import { LOOK_ENTRANCE_RUNTIME } from '../templates/shared/lookEntrance';

export type LookEntrance = 'cut' | 'fade' | 'pop';
export const LOOK_ENTRANCE_ATTR = 'data-noacg-look-entrance';
const START = '// BEGIN NOACG LOOK ENTRANCE ', END = '// END NOACG LOOK ENTRANCE ';

/** Drawn looks only: generated fallback treatments retain their recipe behavior. This registry
 * is derived from the binding table and the same role stamps the paint runtime resolves. */
export function behaviourLooks(template: SpxTemplate) {
  const behaviour = parseBehaviourData(template.js);
  if (!behaviour) return [];
  const roles = new Set(behaviour.paint.flatMap(rule => 'look' in rule ? [rule.look] : []));
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  return [...doc.querySelectorAll('[' + BEHAVIOUR_ROLE_ATTR + ']')]
    .filter(node => (node.getAttribute(BEHAVIOUR_ROLE_ATTR) ?? '').split(/\s+/).some(token => roles.has(token.split('/')[0])))
    .map(node => ({ selector: svgInspectionSelector(node), label: svgLayerLabel(node), entrance: node.getAttribute(LOOK_ENTRANCE_ATTR) ?? '' }));
}

/** One bounded document operation; preserve the table, machine, frozen runtime and unrelated
 * source bytes. An optional HTML attribute needs no schema migration; absence keeps old output. */
export function setLookEntrance(template: SpxTemplate, selector: string, entrance: LookEntrance | ''): SpxTemplate {
  if (!['', 'cut', 'fade', 'pop'].includes(entrance) || !behaviourLooks(template).some(look => look.selector === selector)) {
    throw new Error('Choose a drawn look and Cut, Fade or Pop.');
  }
  if (!['function noacgLookShow(', 'function noacgPop(', 'function noacgRepaint(', 'function noacgSnap(', 'function noacgResetGraphic(', 'function noacgResetPointers('].every(name => template.js.includes(name))) {
    throw new Error('This saved runtime does not support look entrances. Its source is preserved.');
  }
  const begins = template.js.split(START).length - 1, ends = template.js.split(END).length - 1;
  const installed = begins === 1 && ends === 1 && template.js.includes(LOOK_ENTRANCE_RUNTIME);
  if ((begins || ends) && !installed) {
    throw new Error('This look entrance runtime has custom changes. Its source is preserved.');
  }
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const nodes = doc.querySelectorAll(selector);
  if (nodes.length !== 1) throw new Error('Choose a uniquely addressable drawn look.');
  const node = nodes[0];
  if ((node.getAttribute(LOOK_ENTRANCE_ATTR) ?? '') === entrance) return template;
  const range = artworkRange(template.html, node);
  const opening = template.html.slice(range.start, range.content).replace(/\s+data-noacg-look-entrance\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const patched = entrance ? opening.replace(/\s*\/?>$/, end => ' ' + LOOK_ENTRANCE_ATTR + '="' + entrance + '"' + end) : opening;
  return { ...template, html: template.html.slice(0, range.start) + patched + template.html.slice(range.content),
    js: installed || !entrance ? template.js : template.js.trimEnd() + '\n\n' + LOOK_ENTRANCE_RUNTIME + '\n' };
}
