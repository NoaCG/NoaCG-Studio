import type { SpxTemplate } from '../model/types';
import { getTemplateParts, svgInspectionSelector } from '../model/structure';
import { artworkNode, artworkRange } from './artworkEdits';
import { artworkLayerNode } from './artworkLayers';
import { baseValues } from './baseEdits';
import { appendCss, findRuleBody } from './edit';
import { locateAnimData, losslessAnimData } from './animData';
import { allTimelines } from './animMachine';
import { animateLayer, documentContains, sequenceAuthoringReason, trackOwner } from './editorAnimation';
import { writeAnimData } from '../templates/shared/animRuntime';

export interface GroupBox { x: number; y: number; width: number; height: number }
export type GroupOperation =
  | { kind: 'group.create'; selectors: string[]; box: GroupBox }
  | { kind: 'group.ungroup'; selector: string }
  | { kind: 'group.move'; selector: string; step: number; delta: number }
  | { kind: 'group.trim'; selector: string; step: number; interval: number; edge: 'start' | 'end'; time: number };
const SVG = 'http://www.w3.org/2000/svg';
const GROUP = '[data-noacg-group]';
const CARRIER = '[data-noacg-carrier]';
const fine = (value: number) => Math.round(value * 1e9) / 1e9;

export function groupBox(node: Element): GroupBox | null {
  if (!node.hasAttribute('data-noacg-group') && !node.hasAttribute('data-noacg-carrier')) return null;
  const values = ['x', 'y', 'width', 'height'].map(key => Number(node.getAttribute('data-group-' + key)));
  if (values.some(value => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) throw new Error('This group has no valid transform frame. Its source is preserved.');
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}
/** Group membership comes from source, never from a second scene or UI selection. */
export function groupHierarchy(template: SpxTemplate) {
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const parts = getTemplateParts(template.html, template.fields, true);
  const groups = new Set(parts.filter(part => doc.querySelector(part.selector)?.matches(GROUP)).map(part => part.selector));
  const parent: Record<string, string | undefined> = {};
  for (const part of parts) {
    const node = doc.querySelector(part.selector), group = node?.parentElement?.closest(GROUP);
    if (group?.id && groups.has('#' + group.id)) parent[part.selector] = '#' + group.id;
  }
  return { groups, parent };
}
function freshId(template: SpxTemplate, prefix: string, reserved: string[] = []) {
  let index = 1;
  const source = template.html + template.css + template.js;
  while (source.includes(prefix + index) || reserved.includes(prefix + index)) index++;
  return prefix + index;
}
function rulesOf(template: SpxTemplate) {
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(template.css + '\n' + [...doc.querySelectorAll('style')].map(node => node.textContent).join('\n'));
  const rules: CSSStyleRule[] = [];
  const visit = (list: CSSRuleList) => {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) rules.push(rule);
      else if (rule instanceof CSSGroupingRule) visit(rule.cssRules);
    }
  };
  visit(sheet.cssRules);
  return rules;
}
// Pseudo-elements paint on their host even though Element.matches never matches them.
const hostSelector = (selector: string) => selector.replace(/::[\w-]+(?:\([^)]*\))?|:(?:before|after)\b/g, '');
function checkWrapperStyle(rules: CSSStyleRule[], wrapper: Element, name: string) {
  for (const rule of rules.filter(rule => wrapper.matches(hostSelector(rule.selectorText)))) {
    for (const property of rule.style) {
      const value = rule.style.getPropertyValue(property).trim();
      if (property === 'box-sizing' ||
          ['font-family', 'font-size', 'font-weight', 'line-height', 'color', '-webkit-font-smoothing', 'text-rendering'].includes(property) && ['inherit', 'unset'].includes(value) ||
          /^(?:margin|padding|border)(?:-|$)/.test(property) && /^(?:0(?:px)?|none)$/.test(value)) continue;
      throw new Error('The source rule ' + rule.selectorText + ' would style ' + name + ' (' + property + '). Its source is preserved.');
    }
  }
}
/** A new wrapper may not change any existing selector's meaning, including unselected siblings. */
function checkStructure(template: SpxTemplate, doc: Document, mutate: () => Element[], name = 'the new group') {
  const rules = rulesOf(template);
  const location = locateAnimData(template.js);
  const raw = location ? JSON.parse(template.js.slice(location.start, location.end)) : null;
  if (rules.some(rule => /:(?:hover|active|focus(?:-visible|-within)?|target|visited|checked)\b/.test(rule.selectorText))) throw new Error('This source uses interaction-state CSS selectors. Grouping cannot preserve their structural meaning exactly. Its source is preserved.');
  const selectors = new Set(rules.map(rule => hostSelector(rule.selectorText)));
  const motionSelectors = new Set<string>();
  const motion = (selector: string) => { selectors.add(selector); motionSelectors.add(selector); };
  const collect = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (['layers', 'spans', 'loops'].includes(key) && entry && typeof entry === 'object') Object.keys(entry).forEach(motion);
      else if (['reveals', 'hides'].includes(key) && Array.isArray(entry)) entry.forEach(motion);
      else if (['root', 'target'].includes(key) && typeof entry === 'string') motion(entry);
      else collect(entry);
    }
  };
  collect(raw);
  const nodes = [...doc.querySelectorAll('*')];
  const before = [...selectors].map(selector => ({ selector, matches: nodes.map(node => node.matches(selector)) }));
  const wrappers = mutate();
  for (const { selector, matches } of before) {
    if (nodes.some((node, index) => node.isConnected && node.matches(selector) !== matches[index])) {
      throw new Error('Grouping would change the structural selector ' + selector + '. Its source is preserved.');
    }
  }
  for (const wrapper of wrappers) {
    if ([...motionSelectors].some(selector => wrapper.matches(selector))) throw new Error('A source animation selector would also target the new group. Its source is preserved.');
    checkWrapperStyle(rules, wrapper, name);
  }
}
function sameDocumentTarget(template: SpxTemplate, doc: Document, selector: string) {
  const layer = artworkLayerNode(template, selector);
  return doc.querySelector(svgInspectionSelector(layer))!;
}
function createGroup(template: SpxTemplate, selectors: string[], box: GroupBox) {
  if (!Array.isArray(selectors) || selectors.length < 2 || selectors.length > 100 || new Set(selectors).size !== selectors.length) throw new Error('Select 2 to 100 independent artwork layers to group.');
  if (![box.x, box.y, box.width, box.height].every(value => Number.isFinite(value) && Math.abs(value) <= 100000) || fine(box.width) <= 0 || fine(box.height) <= 0) throw new Error('This selection has no finite, nonempty group transform frame. Its source is preserved.');
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const nodes = selectors.map(selector => {
    const base = baseValues(template, selector);
    if (base.mode === 'flow') throw new Error('This layer uses flow layout. Group positioned artwork to preserve its placement exactly.');
    const node = sameDocumentTarget(template, doc, selector);
    if (node.matches('[data-noacg-role], [data-noacg-el]') || node.querySelector('[data-noacg-role], [data-noacg-el]')) throw new Error('This artwork has behavior or responsive-layout bindings. Its structure is preserved.');
    return node;
  });
  if (nodes.some(a => nodes.some(b => a !== b && a.contains(b)))) throw new Error('A selected parent contains another selected layer. Select independent siblings to group.');
  const parent = nodes[0].parentElement;
  if (!parent || nodes.some(node => node.parentElement !== parent)) throw new Error('Group layers with the same parent. Their coordinate spaces are preserved.');
  const ordered = [...parent.children].filter(node => nodes.includes(node));
  const siblings = [...parent.children], first = siblings.indexOf(ordered[0]), last = siblings.indexOf(ordered[ordered.length - 1]);
  if (last - first + 1 !== nodes.length) throw new Error('Group contiguous sibling layers to preserve the paint order of unselected artwork.');
  for (let between: ChildNode | null = ordered[0].nextSibling; between && between !== ordered[ordered.length - 1]; between = between.nextSibling) if (between.nodeType === Node.TEXT_NODE && between.textContent?.trim()) throw new Error('Grouping would include unaddressable text between the selected layers. Its source is preserved.');
  const svg = nodes[0].namespaceURI === SVG;
  if (nodes.some(node => (node.namespaceURI === SVG) !== svg || svg && ['svg', 'foreignobject'].includes(node.tagName.toLowerCase()))) throw new Error('Group artwork in one HTML or SVG coordinate space.');
  const data = svg ? losslessAnimData(template.js) : null;
  if (svg && (!data || sequenceAuthoringReason(data))) throw new Error('This SVG source has no supported group pivot initializer. Its source is preserved.');
  if (svg && allTimelines(data!).some(step => Object.keys(step.layers).some(selector => Object.keys(step.layers[selector]).some(property => property !== 'transformOrigin') && nodes.some(node => node.matches(selector) || [...node.querySelectorAll('*')].some(member => member.matches(selector)))))) throw new Error('Group SVG members before authoring their motion so the new pivot can be initialized exactly. Their existing motion is preserved.');
  const ranges = ordered.map(node => artworkRange(template.html, node));
  const id = freshId(template, 'group-'), selector = '#' + id;
  const wrapper = doc.createElementNS(svg ? SVG : 'http://www.w3.org/1999/xhtml', svg ? 'g' : 'div');
  wrapper.id = id; wrapper.setAttribute('data-gfx', ''); wrapper.setAttribute('data-noacg-group', '');
  const frame = (['x', 'y', 'width', 'height'] as const).map(key => [key, fine(box[key])] as const);
  frame.forEach(([key, value]) => wrapper.setAttribute('data-group-' + key, String(value)));
  checkStructure(template, doc, () => { parent.insertBefore(wrapper, ordered[0]); ordered.forEach(node => wrapper.appendChild(node)); return [wrapper]; });
  const tag = svg ? 'g' : 'div', attrs = frame.map(([key, value]) => ' data-group-' + key + '="' + value + '"').join('');
  const opening = '<' + tag + ' id="' + id + '" data-gfx data-noacg-group' + attrs + '>';
  const html = template.html.slice(0, ranges[0].start) + opening + template.html.slice(ranges[0].start, ranges[ranges.length - 1].end) + '</' + tag + '>' + template.html.slice(ranges[ranges.length - 1].end);
  const geometry = svg ? 'transform-box: fill-box;' : 'position: absolute; left: 0px; top: 0px; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; box-sizing: border-box;';
  const css = appendCss(template.css, 'Group transform; member coordinates and animation remain intact.', selector + ' { ' + geometry + '\n' +
    '  --base-anchor-x: ' + fine((svg ? 0 : box.x) + box.width / 2) + 'px; --base-anchor-y: ' + fine((svg ? 0 : box.y) + box.height / 2) + 'px;\n' +
    '  transform-origin: var(--base-anchor-x) var(--base-anchor-y);\n}');
  let js = template.js;
  if (data) {
    // A static source initializer fixes GSAP's SVG pivot before any member motion.
    // It uses the existing interpreter and remains a base pivot, hidden from key authoring.
    for (const step of allTimelines(data)) step.layers[selector] = {transformOrigin:[{time:0,value:fine(box.width/2)+'px '+fine(box.height/2)+'px'}]};
    const changed = writeAnimData(js, data); if (!changed) throw new Error('The group pivot initializer cannot be written.'); js = changed;
  }
  return { template: { ...template, html, css, js }, targets: [selector] };
}
function groupNode(template: SpxTemplate, selector: string) {
  const node = artworkNode(template, selector);
  if (!node.matches(GROUP) || !node.id) throw new Error('Select an editable group. Its source is preserved.');
  groupBox(node);
  return node;
}
function ungroup(template: SpxTemplate, selector: string) {
  const node = groupNode(template, selector), range = artworkRange(template.html, node);
  const data = losslessAnimData(template.js);
  if (locateAnimData(template.js) && !data) throw new Error('This animation contains data the current writer cannot preserve exactly. Its source is preserved.');
  const timelines = data ? allTimelines(data) : [];
  const originalData = JSON.stringify(data);
  if (data && node.matches(data.root)) throw new Error('The graphic root is owned by playback. Its source is preserved.');
  for (const step of timelines) {
    const selectors = [...Object.keys(step.layers), ...Object.keys(step.spans ?? {}), ...Object.keys(step.loops ?? {}), ...step.reveals ?? [], ...step.hides ?? []];
    if (selectors.some(target => target !== selector && node.matches(target)) || step.dynamics?.some(dynamic => dynamic.target && node.matches(dynamic.target))) throw new Error('This group is targeted by another animation selector or measured motion. Its source is preserved.');
  }
  const own = findRuleBody(template.css, selector);
  if (!own) throw new Error('This group has no owned transform rule. Its source is preserved.');
  const cssStart = template.css.lastIndexOf(selector, own.start), cssEnd = own.end + 1;
  const rule = rulesOf(template).find(rule => rule.selectorText === selector)!;
  const ownedProperties = new Set(['position', 'left', 'top', 'width', 'height', 'margin', 'padding', 'border', 'box-sizing',
    'transform-box', 'transform-origin', '--base-anchor-x', '--base-anchor-y', '--base-x', '--base-y', '--base-scale-x', '--base-scale-y', '--base-rotation',
    'transform', 'translate', 'scale', 'rotate', 'visibility', 'overflow', 'opacity',
    'filter', 'backdrop-filter', 'clip-path', 'mask', 'mask-image', 'mix-blend-mode', 'isolation', 'background', 'background-color', 'box-shadow']);
  const neutralEdge = (property: string) => /^(?:margin|padding)-(?:top|right|bottom|left)$/.test(property) && Number.parseFloat(rule.style.getPropertyValue(property)) === 0 || /^border-(?:top|right|bottom|left)-(?:width|style|color)$/.test(property) && ['top', 'right', 'bottom', 'left'].every(side => Number.parseFloat(rule.style.getPropertyValue('border-' + side + '-width')) === 0);
  for (const property of rule.style) if (!ownedProperties.has(property) && !neutralEdge(property) && !(property.startsWith('border-image-') && ['none', 'initial', ''].includes(rule.style.getPropertyValue('border-image-source')))) throw new Error('This group owns unsupported CSS (' + property + '). Ungroup cannot remove or split that appearance exactly. Its source is preserved.');
  const opacity = rule.style.opacity;
  const effects = ['filter', 'backdrop-filter', 'clip-path', 'mask', 'mask-image', 'mix-blend-mode', 'isolation', 'background', 'background-color', 'box-shadow'];
  if (opacity && Number(opacity) !== 1 || effects.some(property => {
    const value = rule.style.getPropertyValue(property); return value && !['none', 'normal', 'auto', 'transparent'].includes(value);
  }) || timelines.some(step => Object.entries(step.layers[selector] ?? {}).some(([property, keys]) => ['opacity', 'autoAlpha', 'filter', 'clipPath'].includes(property) && keys.some(key => property !== 'opacity' || key.value !== 1)))) {
    throw new Error('This group composites opacity, masking or effects across its members. Ungroup cannot split that appearance exactly. Its source is preserved.');
  }
  if (node.attributes.length !== [...node.attributes].filter(attr => ['id', 'data-gfx', 'data-noacg-group', 'data-noacg-label', 'data-group-x', 'data-group-y', 'data-group-width', 'data-group-height'].includes(attr.name)).length) throw new Error('This group has additional source attributes. Ungroup would change their meaning; its source is preserved.');
  const groupReference = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
  const relatedRules = rulesOf(template).filter(rule => groupReference.test(rule.selectorText));
  if (relatedRules.length !== 1 || relatedRules[0].selectorText !== selector) throw new Error('Other CSS rules refer to this group. Its source is preserved.');
  checkWrapperStyle(rulesOf(template).filter(rule => rule.selectorText !== selector), node, 'this group during ungroup');
  if (node.namespaceURI !== SVG && (rule.style.position !== 'absolute' || rule.style.display && rule.style.display !== 'block' || ['padding', 'margin', 'border'].some(property => {
    const value = rule.style.getPropertyValue(property); return value && !/^(?:0(?:px)?|none)$/.test(value);
  }))) throw new Error('This group owns a layout that cannot be split between its members. Its source is preserved.');
  const location = locateAnimData(template.js);
  const outside = location ? template.js.slice(0, location.start) + template.js.slice(location.end) : template.js;
  if (outside.includes(node.id)) throw new Error('Custom behavior refers to this group. Its source is preserved.');
  const doc = node.ownerDocument, parts = getTemplateParts(template.html, template.fields, true);
  const members = parts.filter(part => doc.querySelector(part.selector)?.parentElement?.closest(GROUP) === node);
  const targets = members.filter(part => !members.some(other => other !== part && doc.querySelector(other.selector)!.contains(doc.querySelector(part.selector)))).map(part => part.selector);
  if (!targets.length || [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) throw new Error('This group contains unaddressable content. Its source is preserved.');
  const children = [...node.children], ranges = children.map(child => artworkRange(template.html, child));
  if (children.some(child => !targets.some(target => child === doc.querySelector(target) || child.contains(doc.querySelector(target))))) throw new Error('This group contains an unaddressable member. Its source is preserved.');
  const transformed = ['left', 'top', '--base-x', '--base-y', '--base-scale-x', '--base-scale-y', '--base-rotation'].some(property => {
    const value = rule.style.getPropertyValue(property); return value && Number.parseFloat(value) !== (property.includes('scale') ? 1 : 0);
  }) || ['transform', 'translate', 'scale', 'rotate', 'visibility', 'overflow'].some(property => {
    const value = rule.style.getPropertyValue(property); return value && !['none', 'visible'].includes(value);
  }) || node.namespaceURI !== SVG && (rule.style.width !== '100%' || rule.style.height !== '100%') || timelines.some(step => step.layers[selector] || step.spans?.[selector] || step.reveals?.includes(selector) || step.hides?.includes(selector));
  if (transformed && rulesOf(template).some(rule => rule.style.zIndex && rule.style.zIndex !== 'auto' && [...node.querySelectorAll('*')].some(member => member.matches(rule.selectorText)))) throw new Error('Group members own a stacking order inside the shared transform. Ungroup cannot split that order exactly. Its source is preserved.');
  if (transformed && node.namespaceURI !== SVG && rulesOf(template).some(rule => {
    const blend = rule.style.mixBlendMode, backdrop = rule.style.getPropertyValue('backdrop-filter');
    return (blend && blend !== 'normal' || backdrop && backdrop !== 'none') && [...node.querySelectorAll('*')].some(member => member.matches(rule.selectorText.replace(/::[\w-]+(?:\([^)]*\))?|:(?:before|after)\b/g, '')));
  })) throw new Error('This group has member blending or backdrop filtering. Ungroup cannot split its shared compositing context exactly. Its source is preserved.');
  let html: string, css = template.css, js = template.js;
  if (transformed && node.namespaceURI === SVG) {
    // Keep one transparent SVG carrier: per-member boxes would change GSAP's pivot.
    const id = freshId(template, 'group-carrier-');
    const wrapper = node.cloneNode(false) as Element;
    wrapper.id = id; wrapper.removeAttribute('data-gfx'); wrapper.removeAttribute('data-noacg-group'); wrapper.setAttribute('data-noacg-carrier', '');
    checkStructure(template, doc, () => { node.replaceWith(wrapper); wrapper.append(...node.childNodes); return [wrapper]; }, 'the new transform carrier');
    const opening = template.html.slice(range.start, range.content).replace(/\bid="[^"]*"/, 'id="'+id+'"').replace(/\sdata-gfx\b/, '').replace(/\bdata-noacg-group\b/, 'data-noacg-carrier');
    html = template.html.slice(0, range.start)+opening+template.html.slice(range.content);
    css = css.slice(0,cssStart)+'#'+id+' {'+own.body+'}'+css.slice(cssEnd);
    for (const step of timelines) {
      for (const key of ['layers','spans','loops'] as const) if (step[key]?.[selector]) { Object.assign(step[key]!,{['#'+id]:step[key]![selector]}); delete step[key]![selector]; }
      for (const key of ['reveals','hides'] as const) if (step[key]) step[key] = step[key]!.map(target => target === selector ? '#'+id : target);
    }
    js = template.js.slice(0,location!.start)+JSON.stringify(data,null,2)+template.js.slice(location!.end);
  } else if (!transformed) {
    checkStructure(template, doc, () => { node.replaceWith(...node.childNodes); return []; });
    html = template.html.slice(0, range.start) + template.html.slice(range.content, range.close) + template.html.slice(range.end);
    css = css.slice(0, cssStart) + css.slice(cssEnd);
  } else {
    const ids: string[] = [];
    for (let index = 0; index < children.length; index++) ids.push(freshId(template, 'group-carrier-', ids));
    const opening = template.html.slice(range.start, range.content);
    const closing = template.html.slice(range.close, range.end);
    const carriers = children.map((_, index) => {
      const wrapper = node.cloneNode(false) as Element;
      wrapper.id = ids[index]; wrapper.removeAttribute('data-gfx'); wrapper.removeAttribute('data-noacg-group'); wrapper.setAttribute('data-noacg-carrier', '');
      return wrapper;
    });
    checkStructure(template, doc, () => { node.replaceWith(...carriers); children.forEach((child, index) => carriers[index].appendChild(child)); return carriers; }, 'the new transform carrier');
    let inner = '', at = range.content;
    ranges.forEach((child, index) => {
      const carrier = opening.replace(/\bid="[^"]*"/, 'id="' + ids[index] + '"').replace(/\sdata-gfx\b/, '').replace(/\bdata-noacg-group\b/, 'data-noacg-carrier');
      inner += template.html.slice(at, child.start) + carrier + template.html.slice(child.start, child.end) + closing; at = child.end;
    });
    html = template.html.slice(0, range.start) + inner + template.html.slice(at, range.close) + template.html.slice(range.end);
    css = css.slice(0, cssStart) + ids.map(id => '#' + id).join(', ') + ' {' + own.body + '}' + css.slice(cssEnd);
    if (data) {
      for (const step of timelines) {
        for (const key of ['layers', 'spans', 'loops'] as const) {
          const dictionary = step[key];
          if (!dictionary?.[selector]) continue;
          for (const id of ids) Object.assign(dictionary, { ['#' + id]: structuredClone(dictionary[selector]) });
          delete dictionary[selector];
        }
        for (const key of ['reveals', 'hides'] as const) if (step[key]) step[key] = step[key]!.flatMap(target => target === selector ? ids.map(id => '#' + id) : [target]);
      }
      if (JSON.stringify(data) !== originalData) js = template.js.slice(0, location!.start) + JSON.stringify(data, null, 2) + template.js.slice(location!.end);
    }
  }
  return { template: { ...template, html, css, js }, targets };
}
function timing(template: SpxTemplate, operation: Extract<GroupOperation, { kind: 'group.move' | 'group.trim' }>) {
  const node = groupNode(template, operation.selector), data = losslessAnimData(template.js);
  const reason = sequenceAuthoringReason(data);
  if (reason || !data) throw new Error(reason ?? 'This group has no supported timeline.');
  if (operation.kind === 'group.trim') {
    const { data: next } = animateLayer(data, trackOwner(template, data, operation.selector), { ...operation, kind: 'layer.trim' }, data.speed / template.fps);
    const js = writeAnimData(template.js, next);
    if (!js) throw new Error('The animation region cannot be written.');
    return { template: { ...template, js }, targets: [operation.selector] };
  }
  const doc = node.ownerDocument;
  const selectors = getTemplateParts(template.html, template.fields, true).filter(part => node.contains(doc.querySelector(part.selector))).map(part => part.selector);
  const carriers = [...node.querySelectorAll(CARRIER)].map(carrier => '#' + carrier.id);
  const owners = [...new Set([...selectors.map(selector => trackOwner(template, data, selector)), ...carriers])];
  let next = structuredClone(data);
  const pivots = new Map(owners.flatMap(selector => {
    const pivotOwner = doc.querySelector(selector);
    if (pivotOwner?.namespaceURI !== SVG || !pivotOwner.matches(GROUP + ', ' + CARRIER)) return [];
    const keys = next.steps.map(step => step.layers[selector]?.transformOrigin);
    if (!keys.every(list => list?.length === 1 && list[0].time === 0 && typeof list[0].value === 'string' && list[0].value === keys[0]![0].value)) return [];
    for (const step of next.steps) delete step.layers[selector].transformOrigin;
    return [[selector,keys[0]!] as const];
  }));
  for (const selector of owners) next = animateLayer(next, selector, { ...operation, kind: 'layer.move', selector }, data.speed / template.fps, documentContains(template.html)).data;
  for (const [selector,keys] of pivots) for (const step of next.steps) step.layers[selector] = {...step.layers[selector],transformOrigin:structuredClone(keys)};
  const js = writeAnimData(template.js, next);
  if (!js) throw new Error('The animation region cannot be written.');
  return { template: { ...template, js }, targets: [operation.selector] };
}
export function applyGroup(template: SpxTemplate, operation: GroupOperation) {
  if (operation.kind === 'group.create') return createGroup(template, operation.selectors, operation.box);
  if (operation.kind === 'group.ungroup') return ungroup(template, operation.selector);
  return timing(template, operation);
}
