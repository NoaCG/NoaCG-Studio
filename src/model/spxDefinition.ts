// Parse and serialize the SPXGCTemplateDefinition that lives inside a template's HTML.
//
// The definition is the single source of truth for fields + settings. It is stored in the
// visible HTML inside:  <script id="spx-template-definition"> window.SPXGCTemplateDefinition = {...} </script>
// We parse it into structured data for the Sample Data panel / validator, and serialize edits
// back into that same block so the code and the UI never drift.

import { DEFAULT_SETTINGS, type SpxField, type SpxSettings } from './types';

export interface ParsedDefinition {
  settings: SpxSettings;
  fields: SpxField[];
}

const DEFINITION_SCRIPT_ID = 'spx-template-definition';

/** Brace-match the `{ ... }` object literal starting at `start`. */
function matchBraces(source: string, start: number): string | null {
  let depth = 0;
  let inString: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract candidate `{ ... }` object literals, one per `SPXGCTemplateDefinition =` ASSIGNMENT.
 * Real templates mention the name in prose comments too ("See SPXGCTemplateDefinition -object
 * below"), so anchoring on the first mention grabs whatever `=` and `{` happen to follow - which
 * either fails to parse or, worse, captures an unrelated block that evaluates to a plausible
 * empty definition. Only a `=` directly after the name (whitespace only) anchors a candidate,
 * and the caller tries each candidate until one evaluates.
 */
function extractObjectLiterals(source: string): string[] {
  const literals: string[] = [];
  const assignment = /SPXGCTemplateDefinition\s*=/g;
  for (let m = assignment.exec(source); m; m = assignment.exec(source)) {
    const start = source.indexOf('{', m.index + m[0].length);
    if (start === -1) continue;
    if (source.slice(m.index + m[0].length, start).trim() !== '') continue;
    const literal = matchBraces(source, start);
    if (literal) literals.push(literal);
  }
  return literals;
}

/** Safely evaluate a JS object literal (handles trailing commas / unquoted keys). */
function evalObjectLiteral(literal: string): Record<string, unknown> | null {
  try {
    const fn = new Function('return (' + literal + ');');
    const value = fn();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Parse a definition object (already evaluated) into structured settings + fields. */
function fromDefinitionObject(def: Record<string, unknown>): ParsedDefinition {
  const settings: SpxSettings = {
    description: String(def.description ?? DEFAULT_SETTINGS.description),
    playserver: String(def.playserver ?? DEFAULT_SETTINGS.playserver),
    playchannel: String(def.playchannel ?? DEFAULT_SETTINGS.playchannel),
    playlayer: String(def.playlayer ?? DEFAULT_SETTINGS.playlayer),
    webplayout: String(def.webplayout ?? DEFAULT_SETTINGS.webplayout),
    out: String(def.out ?? DEFAULT_SETTINGS.out),
    steps: String(def.steps ?? DEFAULT_SETTINGS.steps),
    dataformat: String(def.dataformat ?? DEFAULT_SETTINGS.dataformat),
    uicolor: String(def.uicolor ?? DEFAULT_SETTINGS.uicolor),
  };

  const rawFields = Array.isArray(def.DataFields) ? (def.DataFields as Record<string, unknown>[]) : [];
  const fields: SpxField[] = rawFields.map((f) => {
    const field: SpxField = {
      field: String(f.field ?? ''),
      ftype: (String(f.ftype ?? 'textfield') as SpxField['ftype']),
      title: String(f.title ?? ''),
      value: f.value === undefined ? '' : String(f.value),
    };
    if (f.prvar !== undefined) field.prvar = String(f.prvar);
    if (Array.isArray(f.items)) {
      field.items = (f.items as Record<string, unknown>[]).map((it) => ({
        text: String(it.text ?? it.value ?? ''),
        value: String(it.value ?? ''),
      }));
    }
    if (f.assetfolder !== undefined) field.assetfolder = String(f.assetfolder);
    if (f.extension !== undefined) field.extension = String(f.extension);
    if (f.fcall !== undefined) field.fcall = String(f.fcall);
    if (f.descr !== undefined) field.descr = String(f.descr);
    return field;
  });

  return { settings, fields };
}

/** Parse the SPXGCTemplateDefinition out of a template's HTML. Returns null if absent/invalid. */
export function parseDefinition(html: string): ParsedDefinition | null {
  for (const literal of extractObjectLiterals(html)) {
    const obj = evalObjectLiteral(literal);
    if (obj) return fromDefinitionObject(obj);
  }
  return null;
}

/** Serialize settings + fields into a pretty `window.SPXGCTemplateDefinition = {...};` string. */
export function serializeDefinition(settings: SpxSettings, fields: SpxField[]): string {
  const def: Record<string, unknown> = {
    description: settings.description,
    playserver: settings.playserver,
    playchannel: settings.playchannel,
    playlayer: settings.playlayer,
    webplayout: settings.webplayout,
    out: settings.out,
    steps: settings.steps,
    dataformat: settings.dataformat,
    uicolor: settings.uicolor,
    DataFields: fields.map((f) => {
      const entry: Record<string, unknown> = { field: f.field, ftype: f.ftype, title: f.title, value: f.value };
      if (f.prvar !== undefined) entry.prvar = f.prvar;
      if (f.items) entry.items = f.items;
      if (f.assetfolder !== undefined) entry.assetfolder = f.assetfolder;
      if (f.extension !== undefined) entry.extension = f.extension;
      if (f.fcall !== undefined) entry.fcall = f.fcall;
      if (f.descr !== undefined) entry.descr = f.descr;
      return entry;
    }),
  };
  return 'window.SPXGCTemplateDefinition = ' + JSON.stringify(def, null, 4) + ';';
}

/** Build the full `<script id=...>` block string for the definition. */
export function definitionScriptBlock(settings: SpxSettings, fields: SpxField[]): string {
  return (
    `<script id="${DEFINITION_SCRIPT_ID}" type="text/javascript">\n` +
    // HTML parses the script boundary before JavaScript parses these JSON strings.
    serializeDefinition(settings, fields).replace(/</g, '\\u003c') +
    `\n</script>`
  );
}

/**
 * Replace the definition script block in HTML with a freshly serialized one.
 * If no block exists yet, insert one just before </head> (or </body> as a fallback).
 */
export function replaceDefinitionInHtml(html: string, settings: SpxSettings, fields: SpxField[]): string {
  const block = definitionScriptBlock(settings, fields);
  const scriptRegex = new RegExp(
    `<script[^>]*id=["']${DEFINITION_SCRIPT_ID}["'][^>]*>[\\s\\S]*?<\\/script>`,
    'i',
  );
  if (scriptRegex.test(html)) {
    return html.replace(scriptRegex, block);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${block}\n</head>`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `  ${block}\n</body>`);
  }
  return html + '\n' + block;
}
