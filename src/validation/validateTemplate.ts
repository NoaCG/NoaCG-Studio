// Template validation. Runs before export and on AI output so the platform — not the model —
// owns SPX compatibility. Returns errors (block export) and warnings (allow but flag).

import { parseDefinition } from '../model/spxDefinition';
import { animDataFault, parseAnimData } from '../blocks/animData';
import { allTimelines, validateMachine } from '../blocks/animMachine';
import {
  dataUsesCutStyle,
  dataUsesLifecycleStyle,
  dataUsesTransitionStyles,
  hasCutStyleRuntime,
  hasLifecycleStyleRuntime,
  hasMachineRuntime,
  hasTransitionStyleRuntime,
} from '../templates/shared/animRuntime';
import { DATA_FTYPES, type SpxTemplate } from '../model/types';
import {
  behaviourDataFault,
  behaviourFieldsNamed,
  behaviourStatesNamed,
  parseBehaviourData,
} from '../blocks/behaviourData';
import { deriveMachine } from '../blocks/animMachine';
import { hasBehaviourRuntime } from '../templates/importedDesign/behaviourRuntime';

export interface ValidationIssue {
  rule: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean; // true when there are no errors
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Host suffixes allowed as external dependencies without warning. Supabase is the one blessed
 *  backend (Era 5, opt-in realtime/chat blocks); everything else still warns (offline-first). */
const ALLOWED_EXTERNAL: string[] = ['.supabase.co'];

/** True when a URL's HOST ends with an allowed suffix — a real host check, not a substring match
 *  (so `evil.supabase.co.attacker.com` is NOT allowed). Exported for the community share gate,
 *  which applies the same allowlist to URLs written into the template JS. */
export function isAllowedExternal(url: string): boolean {
  try {
    const host = new URL(url.startsWith('//') ? `https:${url}` : url).host.toLowerCase();
    return ALLOWED_EXTERNAL.some((suffix) => host === suffix.replace(/^\./, '') || host.endsWith(suffix));
  } catch {
    return false;
  }
}

/** Detect the runtime entry points: classic globals OR the modern spxRenderer event API. */
function hasRuntimeEntryPoints(js: string): { ok: boolean; missing: string[] } {
  const hasClassic =
    /function\s+play\s*\(|\bplay\s*=\s*function|\bwindow\.play\s*=/.test(js) &&
    /function\s+stop\s*\(|\bstop\s*=\s*function|\bwindow\.stop\s*=/.test(js) &&
    /function\s+update\s*\(|\bupdate\s*=\s*function|\bwindow\.update\s*=/.test(js);
  const hasModern = /spxRenderer\s*\.\s*on\s*\(/.test(js);
  if (hasClassic || hasModern) return { ok: true, missing: [] };

  const missing: string[] = [];
  if (!/function\s+play\s*\(/.test(js)) missing.push('play()');
  if (!/function\s+stop\s*\(/.test(js)) missing.push('stop()');
  if (!/function\s+update\s*\(/.test(js)) missing.push('update(data)');
  return { ok: false, missing };
}

/** Extract all element ids present in the HTML. */
function htmlIds(html: string): Set<string> {
  const ids = new Set<string>();
  const re = /\bid=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

/** Collect every URL reference in the HTML (src/href/data-lottie) and CSS (url(...)). */
function collectRefs(html: string, css: string): string[] {
  const refs: string[] = [];
  const htmlRe = /\b(?:src|href|data-lottie)=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlRe.exec(html))) refs.push(m[1]);
  const cssRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = cssRe.exec(css))) refs.push(m[1]);
  return refs;
}

/** Classify URL references from HTML + CSS into external, absolute-root, and relative buckets. */
function classifyRefs(html: string, css: string): { external: string[]; absolute: string[]; relative: string[] } {
  const external: string[] = [];
  const absolute: string[] = [];
  const relative: string[] = [];
  for (const url of collectRefs(html, css)) {
    if (/^data:/i.test(url)) continue; // inline data URLs are self-contained
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
      if (!isAllowedExternal(url)) external.push(url);
    } else if (url.startsWith('/')) {
      absolute.push(url);
    } else {
      relative.push(url);
    }
  }
  return { external, absolute, relative };
}

/** Check the template JS compiles (catches obvious syntax errors). */
function jsCompiles(js: string): string | null {
  try {
    new Function(js);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export interface ValidateOptions {
  /** A runtime error captured from the live preview iframe (window.onerror), if any. */
  runtimeError?: string | null;
}

export function validateTemplate(template: SpxTemplate, options: ValidateOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 0. The three code files must exist.
  if (!template.html.trim()) errors.push({ rule: 'files', message: 'The HTML is empty.' });
  if (!template.js.trim()) errors.push({ rule: 'files', message: 'The JavaScript is empty (needs play()/stop()/update()).' });
  if (!template.css.trim()) warnings.push({ rule: 'files', message: 'The CSS is empty.' });

  // 1. Runtime entry points.
  const runtime = hasRuntimeEntryPoints(template.js);
  if (!runtime.ok) {
    errors.push({
      rule: 'runtime',
      message: `Missing runtime functions: ${runtime.missing.join(', ')}. Provide play()/stop()/update(data) or use spxRenderer.on(...).`,
    });
  }

  // 2. SPXGCTemplateDefinition exists and parses.
  const parsed = parseDefinition(template.html);
  if (!parsed) {
    errors.push({
      rule: 'definition',
      message: 'SPXGCTemplateDefinition is missing or could not be parsed from the HTML.',
    });
  }

  // 3. Each data field maps to a matching DOM id. On an imported SVG design this is an
  //    ERROR, not a warning: the field was bound to one of the artwork's own text nodes at
  //    import (docs/SVG_IMPORT_PLAN.md), so a missing id means the operator's value silently
  //    goes nowhere in a graphic whose whole point is being exactly the designer's. The design
  //    is recognised by its MARKUP - the imported SVG root carries the `<prefix>-art` artwork
  //    class (templates/importedDesign/svg.ts) - never by the template's category string: a
  //    category selects nothing at the playout boundary (docs/CONTROL_LAYER.md), and this was the
  //    one place a type string changed an export verdict.
  const svgBound = /<svg\b[^>]*\bclass="[^"]*\b[\w-]+-art\b[^"]*"/i.test(template.html);
  if (parsed) {
    const ids = htmlIds(template.html);
    for (const field of parsed.fields) {
      if (!DATA_FTYPES.includes(field.ftype)) continue;
      if (!ids.has(field.field)) {
        (svgBound ? errors : warnings).push({
          rule: svgBound ? 'svg-binding' : 'field-mapping',
          message: svgBound
            ? `Field "${field.field}" (${field.title}) is no longer bound — no element in the SVG carries id="${field.field}", so the operator's value would go nowhere. Restore the id or remove the field.`
            : `Field "${field.field}" (${field.title}) has no matching element id in the HTML.`,
        });
      }
    }
    if (parsed.fields.length === 0) {
      warnings.push({ rule: 'fields', message: 'The template definition has no DataFields.' });
    }
  }

  // 4. Asset paths (HTML + CSS): absolute-root (error), external deps (warn),
  //    and relative assets/ references that won't be in the exported package (warn).
  const { external, absolute, relative } = classifyRefs(template.html, template.css);
  for (const url of absolute) {
    errors.push({
      rule: 'absolute-path',
      message: `Absolute path "${url}" will break in SPX. Use a relative path (e.g. assets/...).`,
    });
  }
  for (const url of external) {
    warnings.push({
      rule: 'external-dependency',
      message: `External dependency "${url}". Bundle it locally for reliable offline playout.`,
    });
  }
  // Relative assets/ and lottie/ references must correspond to an uploaded asset (the
  // exporter only writes template.assets[]). js/ and css/ are provided by the exporter itself.
  const assetPaths = new Set(template.assets.map((a) => a.path));
  for (const url of relative) {
    const normalized = url.replace(/^\.\//, '');
    if (/^(assets|lottie)\//i.test(normalized) && !assetPaths.has(normalized)) {
      warnings.push({
        rule: 'missing-asset',
        message: `"${url}" is referenced but not in the package. Upload it in the Assets panel or fix the path.`,
      });
    }
  }

  // 5. JS syntax.
  const syntax = jsCompiles(template.js);
  if (syntax) {
    errors.push({ rule: 'syntax', message: `JavaScript syntax error: ${syntax}` });
  }

  // 5b. Step reveal targets: every selector in stepGroups should exist in the HTML. A
  //     dangling one is a WARNING, not an error — GSAP tweens an empty target list, so the
  //     press is a harmless no-op, but the operator would wonder why a Continue does nothing.
  const groupsLiteral = template.js.match(/var stepGroups = \[([\s\S]*?)\];/)?.[1];
  if (groupsLiteral) {
    const selectors = [...groupsLiteral.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const sel of selectors) {
      const exists = sel.startsWith('#')
        ? new RegExp(`id="${sel.slice(1)}"`).test(template.html)
        : sel.startsWith('.')
          ? new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b[^"]*"`).test(template.html)
          : true; // an exotic selector — leave it to the author
      if (!exists) {
        warnings.push({
          rule: 'step-target',
          message: `Step reveal targets "${sel}", which no longer exists in the HTML — that » Next press will do nothing for it.`,
        });
      }
    }
  }

  // 5c. Timeline v2 data blocks: the same dangling-selector guard for NOACG_ANIM layers
  //     and reveals, plus an honest warning when the block exists but the timeline cannot
  //     read it (the graphic still plays — the interpreter reads whatever is there — but
  //     every visual editing surface will treat it as hand-crafted code).
  if (template.js.includes('var NOACG_ANIM')) {
    const data = parseAnimData(template.js);
    if (!data) {
      // An unreadable block is normally an honest hand-crafted or legacy region, which the
      // platform deliberately tolerates. A block that DECLARES a machine and gets its shape
      // wrong is different in kind: the interpreter reads `NOACG_ANIM.machine` verbatim, so it
      // would ship and run unchecked on air. That one blocks export.
      if (animDataFault(template.js) === 'off-shape-machine') {
        errors.push({
          rule: 'machine',
          message:
            'The NOACG_ANIM block declares a state machine whose shape is invalid — it would run unchecked on air. Fix the machine (or remove it) before exporting.',
        });
      } else {
        warnings.push({
          rule: 'anim-data',
          message:
            'The NOACG_ANIM block is not readable as animation data (strict JSON, version 1 or 2) — the timeline and Inspector will treat this template as hand-crafted code.',
        });
      }
    } else {
      // A machine state's INLINE timeline plays exactly like a step, so it gets the same
      // dangling-selector / call / builder guards.
      const allSteps = allTimelines(data);
      const selectors = new Set<string>();
      for (const step of allSteps) {
        Object.keys(step.layers).forEach((s) => selectors.add(s));
        (step.reveals ?? []).forEach((s) => selectors.add(s));
        // A dynamic segment's target is handed to its builder, which will query for it —
        // a dangling one silently produces no motion, so it earns the same guard.
        (step.dynamics ?? []).forEach((d) => d.target && selectors.add(d.target));
      }
      // Data-driven categories BUILD their elements at play time — a bar chart's fills, a
      // ticker's items, a credits roll's lines all come from a rebuild, so their markup lives
      // in the template's JS and never in the static HTML. Look there too, but only OUTSIDE the
      // marked region: inside it sits the animation data itself, which names every selector it
      // targets and would happily vouch for one whose element was deleted.
      const runtime = template.js.replace(/\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//, '');
      const declares = (re: RegExp) => re.test(template.html) || re.test(runtime);
      for (const sel of selectors) {
        const exists = sel.startsWith('#')
          ? declares(new RegExp(`id="${sel.slice(1)}"`))
          : sel.startsWith('.')
            ? declares(new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b[^"]*"`))
            : true; // an exotic selector — leave it to the author
        if (!exists) {
          warnings.push({
            rule: 'anim-data-target',
            message: `The animation data targets "${sel}", which no longer exists in the HTML — its keyframes will do nothing.`,
          });
        }
      }
      // Step calls and dynamic-motion builders both name template functions the interpreter
      // resolves by window[name] — a missing one is a silent no-op at runtime, so flag it
      // here (a warning, in the same spirit as the dangling-selector check: the graphic
      // still plays).
      const definedInJs = (name: string): boolean =>
        new RegExp(`function\\s+${name}\\s*\\(`).test(template.js) ||
        new RegExp(`\\b${name}\\s*=\\s*function`).test(template.js) ||
        new RegExp(`\\bwindow\\.${name}\\s*=`).test(template.js);

      const calledNames = new Set<string>();
      for (const step of allSteps) for (const c of step.calls ?? []) calledNames.add(c.call);
      for (const name of calledNames) {
        if (!definedInJs(name)) {
          warnings.push({
            rule: 'anim-data-call',
            message: `The animation data calls "${name}()", but no such function is defined in template.js — it will do nothing when the step plays.`,
          });
        }
      }

      // A dynamic segment's builder measures the DOM and returns the tween. Without it the
      // step loses its measured motion entirely — a ticker would fade in and never travel.
      const builderNames = new Set<string>();
      for (const step of allSteps) for (const d of step.dynamics ?? []) builderNames.add(d.build);
      for (const name of builderNames) {
        if (!definedInJs(name)) {
          warnings.push({
            rule: 'anim-data-dynamic',
            message: `The animation data builds measured motion with "${name}()", but no such function is defined in template.js — that motion will not play.`,
          });
        }
      }

      // 5d. The state machine's SEMANTIC judgement (shape already gated by the parser):
      //     a disconnected default path etc. blocks export; advice lands as warnings.
      const machineVerdict = validateMachine(data);
      for (const message of machineVerdict.errors) errors.push({ rule: 'machine', message });
      for (const message of machineVerdict.warnings) warnings.push({ rule: 'machine', message });

      // Machine data under an interpreter that predates the machine engine would parse but
      // never run — the frozen-interpreter pairing rule (templates/shared/animRuntime.ts).
      if (data.machine && !hasMachineRuntime(template.js)) {
        errors.push({
          rule: 'machine',
          message:
            'The animation data declares a state machine, but the interpreter in this template predates the machine engine — re-emit the ANIMATION region (replaceRegionWithAnimData) so the machine can run.',
        });
      }

      // The same pairing rule for transition STYLES: a styled arrow under an interpreter
      // without noacgStyleTimeline would parse and silently play the classic change.
      if (dataUsesTransitionStyles(data) && !hasTransitionStyleRuntime(template.js)) {
        errors.push({
          rule: 'machine',
          message:
            'A transition carries a style (cut/fade/push/wipe), but the interpreter in this template predates transition styles — re-emit the ANIMATION region (replaceRegionWithAnimData) so the styled change can play.',
        });
      } else if (dataUsesCutStyle(data) && !hasCutStyleRuntime(template.js)) {
        // 'cut' landed after the first style runtime — the same pairing failure one step on.
        errors.push({
          rule: 'machine',
          message:
            "A transition carries the 'cut' style, but the interpreter in this template predates it — re-emit the ANIMATION region (replaceRegionWithAnimData) so the cut can play.",
        });
      } else if (dataUsesLifecycleStyle(data) && !hasLifecycleStyleRuntime(template.js)) {
        // The materialised entrance/exit edges are newer still: an interpreter whose
        // play()/stop() never consult them would silently play the classic change.
        errors.push({
          rule: 'machine',
          message:
            'The entrance or exit edge carries a style, but the interpreter in this template predates the materialised play/stop edges — re-emit the ANIMATION region (replaceRegionWithAnimData) so the styled change can play.',
        });
      }

      // A control button's payload names field ids whose values ride the event — a key no
      // field carries would send nothing and silently break the atomic-change promise.
      if (data.machine?.controls) {
        const fieldById = new Map(template.fields.map((f) => [f.field, f]));
        for (const control of data.machine.controls) {
          for (const key of control.payload ?? []) {
            if (!fieldById.has(key)) {
              warnings.push({
                rule: 'machine',
                message: `Machine controls: "${control.event}" sends the value of "${key}", but no field has that id.`,
              });
            }
          }
          // An adjust moves a FIGURE: a key no field carries sends nothing, and a field that is
          // not a number would be "moved" from whatever parseInt makes of its text.
          for (const key of Object.keys(control.adjust ?? {})) {
            const field = fieldById.get(key);
            if (!field) {
              warnings.push({
                rule: 'machine',
                message: `Machine controls: "${control.event}" adjusts "${key}", but no field has that id.`,
              });
            } else if (field.ftype !== 'number') {
              warnings.push({
                rule: 'machine',
                message: `Machine controls: "${control.event}" adjusts "${key}", which is a ${field.ftype} field, not a number.`,
              });
            }
          }
          // An add or a remove moves a LIST by one line: the list has to be a textarea, and the
          // source has to exist, or the press reads nothing and the list never moves.
          for (const member of ['add', 'remove'] as const) {
            const verb = member === 'add' ? 'adds to' : 'removes from';
            for (const [key, source] of Object.entries(control[member] ?? {})) {
              const field = fieldById.get(key);
              if (!field) {
                warnings.push({ rule: 'machine', message: `Machine controls: "${control.event}" ${verb} "${key}", but no field has that id.` });
              } else if (field.ftype !== 'textarea') {
                warnings.push({
                  rule: 'machine',
                  message: `Machine controls: "${control.event}" ${verb} "${key}", which is a ${field.ftype} field, not a line list.`,
                });
              }
              if (!fieldById.has(source)) {
                warnings.push({ rule: 'machine', message: `Machine controls: "${control.event}" ${verb} "${key}" from "${source}", but no field has that id.` });
              }
            }
          }
        }
      }
    }
  }

  // 5e. Inline SVG artwork (the SVG import road, docs/SVG_IMPORT_PLAN.md §5). The importer
  //     sanitizes on the way in, but the GATE is authoritative — a hand edit or an older file
  //     can reintroduce what the importer strips, and these ship straight into srcdoc
  //     previews and playout. Errors, not warnings: each is either script running inside a
  //     graphic or a network reference an exported package cannot satisfy.
  for (const svgMarkup of template.html.match(/<svg[\s\S]*?<\/svg>/gi) ?? []) {
    if (/<script\b/i.test(svgMarkup)) {
      errors.push({
        rule: 'svg',
        message: 'The inline SVG contains a <script> element — a graphic must not carry scripts inside its artwork. Remove it (the template JS is where behaviour lives).',
      });
    }
    if (/<foreignObject\b/i.test(svgMarkup)) {
      errors.push({
        rule: 'svg',
        message: 'The inline SVG contains a <foreignObject> block — embedded HTML cannot ride into playout. Remove it.',
      });
    }
    if (/\son[a-z]+\s*=/i.test(svgMarkup)) {
      errors.push({
        rule: 'svg',
        message: 'The inline SVG carries an event-handler attribute (onload/onclick/…) — script must not run from artwork. Remove it.',
      });
    }
    for (const m of svgMarkup.matchAll(/(?:xlink:)?href=["']((?:https?:)?\/\/[^"']+)["']/gi)) {
      if (!isAllowedExternal(m[1])) {
        errors.push({
          rule: 'svg',
          message: `The inline SVG references "${m[1]}" on the network — an exported graphic must play out offline. Embed the file into the SVG or add it as an asset.`,
        });
      }
    }
  }

  // 5e. The BEHAVIOUR BINDING table (blocks/behaviourData.ts) - the looks, gauges and readouts
  //     of behaviour on imported artwork. Shape-gated like the animation data, paired with its
  //     runtime like the machine, and checked against the machine it names states of: a rule
  //     naming a state no group has, or a field no holder carries, would never fire on air.
  {
    const fault = behaviourDataFault(template.js);
    if (fault === 'unreadable' || fault === 'off-shape') {
      errors.push({
        rule: 'behaviour',
        message:
          'The NOACG_BEHAVIOUR block is not valid - the behaviour rules would run unchecked on air. Fix the table (or remove it) before exporting.',
      });
    } else if (fault === 'unknown-version') {
      warnings.push({
        rule: 'behaviour',
        message: 'The NOACG_BEHAVIOUR block is a version this build does not read; the template is treated as hand-crafted behaviour.',
      });
    } else if (fault === 'ok') {
      const table = parseBehaviourData(template.js)!;
      if (!hasBehaviourRuntime(template.js)) {
        errors.push({
          rule: 'behaviour',
          message:
            'The template carries a NOACG_BEHAVIOUR table but no behaviour runtime - re-create the graphic so the runtime that reads the table is emitted with it.',
        });
      }
      const anim = parseAnimData(template.js);
      if (anim) {
        const machine = deriveMachine(anim);
        const known = new Set(machine.groups.flatMap((g) => g.states.map((s) => `${g.id}/${s.id}`)));
        for (const named of behaviourStatesNamed(table)) {
          if (!known.has(named)) {
            errors.push({ rule: 'behaviour', message: `A behaviour rule waits for state "${named}", but the machine has no such state - that look would never show.` });
          }
        }
      }
      const fieldIds = new Set(template.fields.map((f) => f.field));
      const named = behaviourFieldsNamed(table);
      for (const id of named.ids) {
        if (!fieldIds.has(id)) {
          errors.push({ rule: 'behaviour', message: `A behaviour rule reads field "${id}", but the template defines no such field.` });
        }
      }
      for (const head of named.unresolved) {
        errors.push({ rule: 'behaviour', message: `A behaviour rule reads "${head}", which names no field the table knows.` });
      }
    }
  }

  // 6. Runtime error captured from the live preview.
  if (options.runtimeError) {
    errors.push({ rule: 'preview', message: `Preview reported a runtime error: ${options.runtimeError}` });
  }

  return { ok: errors.length === 0, errors, warnings };
}
