import type { SpxTemplate } from '../model/types';
import { resetCanvasCss, runtimeJs } from '../model/graphicSourceContract';
import { ANIMATION_MARK_OPEN, ANIMATION_MARK_CLOSE } from '../templates/lowerThirds/animPresets';
import { canWriteAnchorData } from '../templates/shared/animRuntime';
import { losslessAnimData } from './animData';
import { allTimelines } from './animMachine';
import { inspectCss } from './edit';

export function refuseComposition(reason: string): never {
  throw new Error(reason + ' Whole-graphic placement is unavailable; source is preserved.');
}
const normalize = (source: string) => source.replace(/\r\n/g, '\n').trim();
const inherited = /^(?:--|font(?:-|$)|color$|line-height$|text-rendering$|-webkit-font-smoothing$)/;

/** Positive current-source contract: unknown code is playable, never adopted for transforms. */
export function compositionSource(template: SpxTemplate, css: string) {
  const data = losslessAnimData(template.js);
  if (!data || !canWriteAnchorData(template.js)) refuseComposition('This source has no supported playback runtime.');
  const start = template.js.indexOf(ANIMATION_MARK_OPEN), end = template.js.indexOf(ANIMATION_MARK_CLOSE) + ANIMATION_MARK_CLOSE.length;
  const region = template.js.slice(start, end);
  // The generated title comment is descriptive; every executable byte outside the qualified
  // interpreter must remain the shared scaffold. Artwork/data edits do not rewrite that code.
  const withoutTitle = (source: string) => normalize(source.slice(source.indexOf('\n') + 1));
  const title = template.js.replace(/\r\n/g, '\n').split('\n')[0];
  if (!/^\/\/ [^\r\u2028\u2029]*$/.test(title) || withoutTitle(template.js) !== withoutTitle(runtimeJs('', region))) refuseComposition('This source has custom playback helpers.');
  if (data!.machine?.groups.some(group => group.transitions.some(edge => edge.style && edge.style !== 'cut')) || allTimelines(data!).some(step => step.calls?.length || step.dynamics?.length)) refuseComposition('This source uses measured or custom choreography.');
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  if ([...doc.documentElement.attributes].some(attr => !['lang', 'style'].includes(attr.name)) || [...doc.body.attributes].some(attr => attr.name !== 'style')) refuseComposition('This source has a nonstandard document canvas.');
  if (doc.documentElement.style.cssText || doc.body.style.cssText || [...doc.head.querySelectorAll('style')].some(style => !!style.textContent?.trim())) refuseComposition('This source has canvas styles that its exports cannot preserve.');
  if (doc.querySelectorAll(data!.root).length !== 1 || doc.querySelector(data!.root)?.parentElement !== doc.body) refuseComposition('The playback root is not on the composition canvas.');
  if (doc.querySelector('base,iframe,frame,frameset,object,embed,portal,video,audio,form,input,button,select,textarea,meta[http-equiv]')) refuseComposition('This source has unsupported active document content.');
  if ([...doc.querySelectorAll('*')].some(node => [...node.attributes].some(attr => /^on/i.test(attr.name) || /^(?:javascript|vbscript):/i.test(attr.value.trim())))) refuseComposition('This source has custom document behavior.');
  const scripts = [...doc.querySelectorAll('script')];
  const refs = ['js/gsap.min.js', 'js/template.js'];
  if (scripts.length !== 3 || refs.some(ref => scripts.filter(script => script.getAttribute('src') === ref).length !== 1)) refuseComposition('This source has unsupported script references.');
  for (const script of scripts) {
    const src = script.getAttribute('src');
    if (src) {
      if (!refs.includes(src) || [...script.attributes].some(attr => attr.name !== 'src') || script.textContent?.trim()) refuseComposition('This source has unsupported script behavior.');
    } else {
      if (script.id !== 'spx-template-definition' || [...script.attributes].some(attr => !['id', 'type'].includes(attr.name)) || script.getAttribute('type') !== 'text/javascript') refuseComposition('This source has unsupported inline code.');
      const assignment = /^\s*window\.SPXGCTemplateDefinition\s*=\s*(\{[\s\S]*\})\s*;\s*$/.exec(script.textContent ?? '');
      try { if (!assignment || !JSON.parse(assignment[1])) refuseComposition('The field definition is not data-only.'); }
      catch { refuseComposition('The field definition is not data-only.'); }
    }
  }
  const links = [...doc.querySelectorAll('link')];
  if (links.length !== 1 || links[0].getAttribute('rel') !== 'stylesheet' || links[0].getAttribute('href') !== 'css/template.css' || [...links[0].attributes].some(attr => !['rel', 'href'].includes(attr.name))) refuseComposition('This source has unsupported stylesheet references.');
  const styles = [...doc.querySelectorAll('style')];
  if (styles.some(style => [...style.attributes].some(attr => attr.name !== 'id'))) refuseComposition('This source has conditional embedded styles.');
  const sheets = [css, ...styles.map(style => style.textContent ?? '')].map(sheet => inspectCss(sheet));
  if (sheets.some(sheet => sheet.unresolved || sheet.rules.some(rule => rule.selectors.some(selector => /:(?:hover|active|focus(?:-visible|-within)?|target|visited|checked|has|empty)\b/.test(selector))))) refuseComposition('This source has unresolved or interactive styles.');
  // Parse the emitted reset in this same CSSOM: shorthands expand identically on both
  // sides (background, margin, padding and overflow), without spelling exceptions.
  const canonical = new Map<string, string>();
  for (const rule of inspectCss(resetCanvasCss(template.resolution)).rules) for (const property of rule.style) canonical.set(property, rule.style.getPropertyValue(property).trim());
  const canvasSelectors = new Set(['html', 'body', ':root', '*', 'html body']);
  if (sheets.some(sheet => sheet.rules.some(rule => rule.selectors.some(selector => /(?:^|[^\w-])(?:html|body)(?:$|[^\w-])|:root/.test(selector) && !canvasSelectors.has(selector.trim()))))) refuseComposition('This source has conditional document selectors.');
  for (const node of [doc.documentElement, doc.body]) {
    const matched = sheets.flatMap(sheet => sheet.rules.filter(rule => rule.selectors.some(selector => node.matches(selector.replace(/::[\w-]+(?:\([^)]*\))?|:(?:before|after)\b/g, '')))));
    const entries = [{ style: node.style, guaranteed: true }, ...matched.map(rule => ({ style: rule.style, guaranteed: !rule.nested }))];
    for (const { style } of entries) for (const property of style) {
      const value = style.getPropertyValue(property).trim();
      if (/^overflow(?:-|$)/.test(property) && style.getPropertyPriority(property)) refuseComposition('The source owns important canvas clipping.');
      if (inherited.test(property) || canonical.get(property) === value ||
          property === 'position' && ['static', 'relative'].includes(value) || property === 'display' && value === 'block') continue;
      refuseComposition('The source has a nonstandard canvas (' + property + ').');
    }
    const guaranteed = entries.filter(entry => entry.guaranteed).map(entry => entry.style);
    for (const property of ['width', 'height', 'overflow', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom']) {
      if (!guaranteed.some(style => !!style.getPropertyValue(property))) refuseComposition('The source has no fixed transparent zero-offset canvas.');
    }
    if (allTimelines(data!).some(step => [...Object.keys(step.layers), ...Object.keys(step.loops ?? {}), ...Object.keys(step.spans ?? {})].some(selector => node.matches(selector)))) refuseComposition('The source animates its canvas.');
  }
  const artworkStyles = [...sheets.flatMap(sheet => sheet.rules.map(rule => rule.style)), ...[...doc.querySelectorAll<HTMLElement>('[style]')].map(node => node.style)];
  if (artworkStyles.some(style => ['fixed', 'sticky'].includes(style.position) || style.backgroundAttachment === 'fixed')) refuseComposition('This source has viewport-attached artwork.');
  return { doc, data: data! };
}
