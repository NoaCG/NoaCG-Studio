// The EBU OGraf v1 manifest schema, encoded as a validator.
//
// The published schema is a JSON Schema draft 2020-12 document split across seven files
// (graphics/schema.json + lib/action.json + lib/constraints/{number,boolean}.json +
// gdd/{object,basic-types,gdd-types}.json). We do not ship a JSON-Schema engine — a runtime
// validator dependency for one manifest would be the "no unnecessary dependencies" rule read
// backwards — so the rules are transcribed here, one function per schema file, keeping the
// same names so a future spec revision is a readable diff.
//
// Two of those rules are easy to violate silently and are why this exists at all:
//
//  * every object in the manifest declares `additionalProperties: false` with a
//    `patternProperties: {"^v_.*": {}}` escape hatch, so ANY field we invent that is not in
//    the spec makes the whole manifest invalid — a vendor field MUST be `v_`-prefixed;
//  * `gdd/basic-types.json` types a property's `default` by its declared `type`, so a
//    checkbox field declared `"type": "boolean"` with the SPX string default `"true"` is
//    invalid — the kind of mismatch a host either rejects or silently coerces.
//
// Spec: https://ograf.ebu.io/v1/specification/docs/Specification.html
// Schema: https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json

export const OGRAF_SCHEMA_URL = 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

/** The version of the specification this validator was transcribed from. */
export const OGRAF_SPEC_VERSION = 'v1';

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every object in the spec allows vendor fields, and only vendor fields, beyond its own keys. */
function unknownKeys(value: Json, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key) && !key.startsWith('v_'));
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * A number the manifest can actually carry. `typeof NaN === 'number'` and so is `Infinity`,
 * but neither survives `JSON.stringify` - both serialize to `null`, which is not a number at
 * all, so a manifest that passed the check would fail the renderer's. JSON has no syntax for
 * them, so "finite" is what "number" means in a JSON Schema.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// ── lib/constraints/number.json + boolean.json ───────────────────────────────

function checkNumberConstraint(value: unknown, at: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${at}: a number constraint must be an object.`);
    return;
  }
  for (const key of unknownKeys(value, ['min', 'max', 'exact', 'ideal'])) {
    errors.push(`${at}.${key}: not a number-constraint key (min/max/exact/ideal), and not "v_"-prefixed.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith('v_')) continue;
    if (!isFiniteNumber(entry)) errors.push(`${at}.${key}: must be a finite number.`);
  }
}

function checkBooleanConstraint(value: unknown, at: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${at}: a boolean constraint must be an object.`);
    return;
  }
  for (const key of unknownKeys(value, ['exact', 'ideal'])) {
    errors.push(`${at}.${key}: not a boolean-constraint key (exact/ideal), and not "v_"-prefixed.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith('v_')) continue;
    if (typeof entry !== 'boolean') errors.push(`${at}.${key}: must be a boolean.`);
  }
}

// ── gdd/object.json + gdd/basic-types.json ───────────────────────────────────

const GDD_TYPES = ['boolean', 'string', 'number', 'integer', 'array', 'object'] as const;

/** The type a `default` must have, per gdd/basic-types.json's if/then chain. */
function defaultMatchesType(type: string, value: unknown): boolean {
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return isFiniteNumber(value);
  if (type === 'integer') return isInteger(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  return true;
}

// ── gdd/gdd-types.json ───────────────────────────────────────────────────────

/** The JSON type each standard GDD type requires (`select` and `select-multiple` have their own rule). */
const GDD_TYPE_BASE = new Map([
  ['single-line', 'string'],
  ['multi-line', 'string'],
  ['file-path', 'string'],
  ['file-path/image-path', 'string'],
  ['color-rrggbb', 'string'],
  ['color-rrggbbaa', 'string'],
  ['percentage', 'number'],
  ['duration-ms', 'integer'],
]);

/** The exact `pattern` a colour GDD type requires. */
const GDD_COLOR_PATTERN = new Map([
  ['color-rrggbb', '^#[0-9a-f]{6}$'],
  ['color-rrggbbaa', '^#[0-9a-f]{8}$'],
]);

/** A select's values and their `gddOptions.labels` (at `labelsAt`), typed by the select's JSON type. */
function checkSelectValues(values: unknown, valueType: unknown, labels: unknown, at: string, labelsAt: string, errors: string[]): void {
  if (valueType !== 'string' && valueType !== 'number' && valueType !== 'integer') {
    errors.push(`${at}.type: a select's type must be string, number or integer.`);
    return;
  }
  if (!Array.isArray(values)) {
    errors.push(`${at}.enum: required on a select.`);
  } else if (!values.every((v) => defaultMatchesType(valueType, v))) {
    errors.push(`${at}.enum: every value must be a ${valueType}.`);
  }
  if (!isPlainObject(labels)) {
    errors.push(`${labelsAt}: required on a select, an object naming each value.`);
    return;
  }
  // A number or integer select's labels are keyed by the value's digits, each label a string.
  const keyPattern = valueType === 'integer' ? /^[0-9]+$/ : valueType === 'number' ? /^[0-9,.]+$/ : null;
  if (!keyPattern) return;
  for (const [key, label] of Object.entries(labels)) {
    if (!keyPattern.test(key)) errors.push(`${labelsAt}.${key}: a ${valueType} select's label key must be the value's digits.`);
    if (typeof label !== 'string') errors.push(`${labelsAt}.${key}: must be a string.`);
  }
}

/**
 * A property's `gddType` against gdd/gdd-types.json: each standard type requires its JSON type,
 * a select its values and labels, a colour its exact pattern, a file path's extensions a list of
 * strings. A type the standard does not define carries no rule.
 */
function checkGddType(value: Json, type: string, at: string, errors: string[]): void {
  if ('gddOptions' in value && !isPlainObject(value.gddOptions)) errors.push(`${at}.gddOptions: must be an object.`);
  if (!('gddType' in value)) return;
  const gddType = value.gddType;
  if (typeof gddType !== 'string') {
    errors.push(`${at}.gddType: must be a string.`);
    return;
  }
  const options = isPlainObject(value.gddOptions) ? value.gddOptions : null;
  const base = GDD_TYPE_BASE.get(gddType);
  if (base && type !== base) errors.push(`${at}.type: a "${gddType}" property must be a ${base}.`);
  const pattern = GDD_COLOR_PATTERN.get(gddType);
  if (pattern && value.pattern !== pattern) errors.push(`${at}.pattern: a "${gddType}" property requires the pattern ${pattern}.`);
  if ((gddType === 'file-path' || gddType === 'file-path/image-path') && options && 'extensions' in options) {
    const ext = options.extensions;
    if (!Array.isArray(ext) || !ext.every((e) => typeof e === 'string')) errors.push(`${at}.gddOptions.extensions: must be an array of strings.`);
  }
  if (gddType === 'select') {
    if (!options) errors.push(`${at}.gddOptions: required on a select.`);
    checkSelectValues(value.enum, type, options?.labels, at, `${at}.gddOptions.labels`, errors);
  }
  if (gddType === 'select-multiple') {
    if (type !== 'array') errors.push(`${at}.type: a "select-multiple" property must be an array.`);
    if (!options) errors.push(`${at}.gddOptions: required on a select-multiple.`);
    const items = isPlainObject(value.items) ? value.items : null;
    if (!items) errors.push(`${at}.items: required on a select-multiple, with its type and enum.`);
    else checkSelectValues(items.enum, items.type, options?.labels, `${at}.items`, `${at}.gddOptions.labels`, errors);
  }
}

/**
 * A GDD object — the manifest's `schema` and each custom action's payload schema. It is a
 * JSON Schema with `type` REQUIRED, so unlike plain JSON Schema every node must declare what
 * it is; `properties`/`items` are then required by that type, and `default` must match it.
 */
function checkGddObject(value: unknown, at: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${at}: must be an object.`);
    return;
  }
  const type = value.type;
  if (typeof type !== 'string' || !(GDD_TYPES as readonly string[]).includes(type)) {
    errors.push(`${at}.type: required, and one of ${GDD_TYPES.join(' / ')}.`);
    return;
  }
  checkGddType(value, type, at, errors);
  if ('hidden' in value && typeof value.hidden !== 'boolean') errors.push(`${at}.hidden: must be a boolean.`);
  if ('order' in value && !isFiniteNumber(value.order)) errors.push(`${at}.order: must be a finite number.`);
  if ('default' in value && !defaultMatchesType(type, value.default)) {
    errors.push(`${at}.default: a "${type}" property cannot default to ${JSON.stringify(value.default)}.`);
  }
  if (type === 'object') {
    if (!isPlainObject(value.properties)) {
      errors.push(`${at}.properties: required on a "object" schema.`);
      return;
    }
    for (const [key, child] of Object.entries(value.properties)) {
      checkGddObject(child, `${at}.properties.${key}`, errors);
    }
  }
  if (type === 'array') {
    if (!('items' in value)) {
      errors.push(`${at}.items: required on an "array" schema.`);
      return;
    }
    checkGddObject(value.items, `${at}.items`, errors);
  }
}

// ── lib/action.json ──────────────────────────────────────────────────────────

function checkActions(value: unknown, errors: string[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    errors.push('customActions: must be an array.');
    return ids;
  }
  value.forEach((action, index) => {
    const at = `customActions[${index}]`;
    if (!isPlainObject(action)) {
      errors.push(`${at}: must be an object.`);
      return;
    }
    for (const key of unknownKeys(action, ['id', 'name', 'description', 'schema'])) {
      errors.push(`${at}.${key}: not an Action key, and not "v_"-prefixed.`);
    }
    if (typeof action.id !== 'string' || !action.id.length) errors.push(`${at}.id: required, a non-empty string.`);
    else if (ids.has(action.id)) errors.push(`${at}.id: "${action.id}" is declared twice — action ids are unique within a Graphic.`);
    else ids.add(action.id);
    if (typeof action.name !== 'string' || !action.name.length) errors.push(`${at}.name: required, a non-empty string.`);
    if ('description' in action && typeof action.description !== 'string') errors.push(`${at}.description: must be a string.`);
    // `schema` is explicitly nullable: null means "this action takes no parameters".
    if ('schema' in action && action.schema !== null) checkGddObject(action.schema, `${at}.schema`, errors);
  });
  return ids;
}

// ── actionDurations ──────────────────────────────────────────────────────────

const DURATION_TYPES = ['playAction', 'updateAction', 'stopAction', 'customAction'] as const;

function checkDuration(value: unknown, at: string, errors: string[]): void {
  if (!isInteger(value) || value < -1) {
    errors.push(`${at}: must be an integer of at least -1 (milliseconds; -1 = dynamic/unknown).`);
  }
}

function checkActionDurations(value: unknown, actionIds: Set<string>, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('actionDurations: must be an array.');
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const at = `actionDurations[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at}: must be an object.`);
      return;
    }
    const type = entry.type;
    if (typeof type !== 'string' || !(DURATION_TYPES as readonly string[]).includes(type)) {
      errors.push(`${at}.type: required, and one of ${DURATION_TYPES.join(' / ')}.`);
      return;
    }
    const allowed =
      type === 'playAction' ? ['type', 'duration', 'steps'] : type === 'customAction' ? ['type', 'duration', 'customActionId'] : ['type', 'duration'];
    for (const key of unknownKeys(entry, allowed)) {
      errors.push(`${at}.${key}: not allowed on a "${type}" duration, and not "v_"-prefixed.`);
    }
    checkDuration(entry.duration, `${at}.duration`, errors);
    // At most one entry per non-custom type, and at most one per custom action id.
    const key = type === 'customAction' ? `customAction:${String(entry.customActionId)}` : type;
    if (seen.has(key)) errors.push(`${at}: a second duration for ${key} — at most one is allowed.`);
    seen.add(key);
    if (type === 'customAction') {
      if (typeof entry.customActionId !== 'string' || !entry.customActionId.length) {
        errors.push(`${at}.customActionId: required on a "customAction" duration.`);
      } else if (!actionIds.has(entry.customActionId)) {
        errors.push(`${at}.customActionId: "${entry.customActionId}" is not declared in customActions.`);
      }
    }
    if (type === 'playAction' && 'steps' in entry) {
      if (!Array.isArray(entry.steps)) {
        errors.push(`${at}.steps: must be an array.`);
        return;
      }
      entry.steps.forEach((step, stepIndex) => {
        const stepAt = `${at}.steps[${stepIndex}]`;
        if (!isPlainObject(step)) {
          errors.push(`${stepAt}: must be an object.`);
          return;
        }
        for (const extra of unknownKeys(step, ['step', 'duration'])) {
          errors.push(`${stepAt}.${extra}: not a step-duration key, and not "v_"-prefixed.`);
        }
        // `step` is optional — an entry without one is the fallback for unlisted steps.
        if ('step' in step && (!isInteger(step.step) || (step.step as number) < 0)) {
          errors.push(`${stepAt}.step: must be a zero-based integer.`);
        }
        checkDuration(step.duration, `${stepAt}.duration`, errors);
      });
    }
  });
}

// ── renderRequirements ───────────────────────────────────────────────────────

function checkRenderRequirements(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('renderRequirements: must be an array.');
    return;
  }
  value.forEach((entry, index) => {
    const at = `renderRequirements[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at}: must be an object.`);
      return;
    }
    for (const key of unknownKeys(entry, ['resolution', 'frameRate', 'accessToPublicInternet', 'engine'])) {
      errors.push(`${at}.${key}: not a render-requirement key, and not "v_"-prefixed.`);
    }
    if ('resolution' in entry) {
      if (!isPlainObject(entry.resolution)) {
        errors.push(`${at}.resolution: must be an object.`);
      } else {
        for (const key of unknownKeys(entry.resolution, ['width', 'height'])) {
          errors.push(`${at}.resolution.${key}: not a resolution key, and not "v_"-prefixed.`);
        }
        if ('width' in entry.resolution) checkNumberConstraint(entry.resolution.width, `${at}.resolution.width`, errors);
        if ('height' in entry.resolution) checkNumberConstraint(entry.resolution.height, `${at}.resolution.height`, errors);
      }
    }
    if ('frameRate' in entry) checkNumberConstraint(entry.frameRate, `${at}.frameRate`, errors);
    if ('accessToPublicInternet' in entry) checkBooleanConstraint(entry.accessToPublicInternet, `${at}.accessToPublicInternet`, errors);
    if ('engine' in entry) {
      if (!Array.isArray(entry.engine)) {
        errors.push(`${at}.engine: must be an array.`);
        return;
      }
      entry.engine.forEach((engine, engineIndex) => {
        const engineAt = `${at}.engine[${engineIndex}]`;
        if (!isPlainObject(engine)) {
          errors.push(`${engineAt}: must be an object.`);
          return;
        }
        if (typeof engine.type !== 'string' || !engine.type.length) errors.push(`${engineAt}.type: required, a non-empty string.`);
        if (!isPlainObject(engine.version) || typeof engine.version.min !== 'string') {
          errors.push(`${engineAt}.version: required, an object carrying a string "min".`);
        }
      });
    }
  });
}

// ── thumbnails ───────────────────────────────────────────────────────────────

const THUMBNAIL_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

function checkThumbnails(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('thumbnails: must be an array.');
    return;
  }
  value.forEach((entry, index) => {
    const at = `thumbnails[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at}: must be an object.`);
      return;
    }
    for (const key of unknownKeys(entry, ['file', 'resolution'])) {
      errors.push(`${at}.${key}: not a thumbnail key, and not "v_"-prefixed.`);
    }
    if (typeof entry.file !== 'string' || !entry.file.length) errors.push(`${at}.file: required, a non-empty string.`);
    else if (!THUMBNAIL_EXTENSIONS.test(entry.file.split(/[?#]/)[0])) {
      errors.push(`${at}.file: must be a PNG, JPG, GIF or webp image.`);
    }
    if ('resolution' in entry) {
      if (!isPlainObject(entry.resolution)) {
        errors.push(`${at}.resolution: must be an object.`);
        return;
      }
      for (const key of unknownKeys(entry.resolution, ['width', 'height'])) {
        errors.push(`${at}.resolution.${key}: not a resolution key, and not "v_"-prefixed.`);
      }
      for (const key of ['width', 'height'] as const) {
        const side = entry.resolution[key];
        if (!isInteger(side) || (side as number) < 1) errors.push(`${at}.resolution.${key}: required, a positive integer.`);
      }
    }
  });
}

// ── graphics/schema.json ─────────────────────────────────────────────────────

const ROOT_KEYS = [
  '$schema',
  'id',
  'version',
  'main',
  'name',
  'description',
  'author',
  'customActions',
  'actionDurations',
  'supportsRealTime',
  'supportsNonRealTime',
  'stepCount',
  'schema',
  'renderRequirements',
  'thumbnails',
] as const;

/** Reserved by the HTML standard — hyphenated, but `customElements.define` refuses them. */
const RESERVED_ELEMENT_NAMES = [
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
];

/**
 * Is this id something `customElements.define()` will accept?
 *
 * NOT a schema rule — the manifest schema types `id` as any string without "/". It is here
 * because a real renderer makes it one: SuperFly.tv's OGraf server registers the Graphic as
 * `customElements.define(manifest.id, class)`, so a schema-valid id with no hyphen throws
 * before the Graphic is mounted, and the operator sees a broken graphic with a manifest that
 * validates. The rule this encodes is the HTML standard's `PotentialCustomElementName`,
 * narrowed to the ASCII subset an export can actually produce.
 */
function isCustomElementName(id: string): boolean {
  if (RESERVED_ELEMENT_NAMES.includes(id)) return false;
  if (!/^[a-z]/.test(id) || !id.includes('-')) return false;
  return !/[A-Z\s"'`/\\[\]<>=]/.test(id);
}

/**
 * Validate one `.ograf.json` manifest against the OGraf v1 schema. Returns the list of
 * violations — empty means conformant. Every message names the offending path, so a failure
 * reads as an instruction rather than a verdict.
 */
export function validateOgrafManifest(manifest: unknown, options: { elementId?: boolean } = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(manifest)) return ['The manifest must be a JSON object.'];

  for (const key of unknownKeys(manifest, ROOT_KEYS)) {
    errors.push(`${key}: not an OGraf manifest field. A vendor-specific field MUST be "v_"-prefixed.`);
  }

  if (manifest.$schema !== OGRAF_SCHEMA_URL) errors.push(`$schema: must be exactly "${OGRAF_SCHEMA_URL}".`);
  for (const key of ['id', 'name', 'main'] as const) {
    if (typeof manifest[key] !== 'string' || !(manifest[key] as string).length) errors.push(`${key}: required, a non-empty string.`);
  }
  // The spec forbids "/" in an id: a renderer may address a Graphic by id in a path.
  if (typeof manifest.id === 'string' && manifest.id.includes('/')) errors.push('id: must not contain "/".');
  // NoaCG's own rule, not the schema's: what we WRITE must register under its id. A stranger's
  // package is mounted under a tag of the host's making (control/ografHost.ts `hostTagFor`), so the
  // importer reads the schema alone (`elementId: false`), or the EBU's own scoreboard is refused.
  if (options.elementId !== false && typeof manifest.id === 'string' && manifest.id.length && !isCustomElementName(manifest.id)) {
    errors.push(
      `id: "${manifest.id}" is not a legal custom element name, so a renderer that registers the Graphic `
      + 'by its id cannot load it. It must start with an ASCII lowercase letter, contain a hyphen, and '
      + 'use no uppercase letters.',
    );
  }
  if (typeof manifest.supportsRealTime !== 'boolean') errors.push('supportsRealTime: required, a boolean.');
  if (typeof manifest.supportsNonRealTime !== 'boolean') errors.push('supportsNonRealTime: required, a boolean.');
  if ('version' in manifest && typeof manifest.version !== 'string') errors.push('version: must be a string.');
  if ('description' in manifest && typeof manifest.description !== 'string') errors.push('description: must be a string.');

  if ('author' in manifest) {
    if (!isPlainObject(manifest.author)) {
      errors.push('author: must be an object.');
    } else {
      for (const key of unknownKeys(manifest.author, ['name', 'email', 'url'])) {
        errors.push(`author.${key}: not an author key, and not "v_"-prefixed.`);
      }
      if (typeof manifest.author.name !== 'string' || !manifest.author.name.length) errors.push('author.name: required, a non-empty string.');
      for (const key of ['email', 'url'] as const) {
        if (key in manifest.author && typeof manifest.author[key] !== 'string') errors.push(`author.${key}: must be a string.`);
      }
    }
  }

  if ('stepCount' in manifest && (!isInteger(manifest.stepCount) || (manifest.stepCount as number) < -1)) {
    errors.push('stepCount: must be an integer of at least -1 (-1 = dynamic/unknown).');
  }
  if ('schema' in manifest) checkGddObject(manifest.schema, 'schema', errors);

  const actionIds = 'customActions' in manifest ? checkActions(manifest.customActions, errors) : new Set<string>();
  if ('actionDurations' in manifest) checkActionDurations(manifest.actionDurations, actionIds, errors);
  if ('renderRequirements' in manifest) checkRenderRequirements(manifest.renderRequirements, errors);
  if ('thumbnails' in manifest) checkThumbnails(manifest.thumbnails, errors);

  return errors;
}

/**
 * The package half of conformance: a manifest is only loadable if the files it names are
 * actually in the package. `files` are the package-relative paths beside the manifest.
 *
 * This is the dangling-reference doctrine applied to OGraf: a `main` a renderer cannot fetch
 * fails at load with a network error the operator reads as "the graphic is broken", and a
 * missing thumbnail silently renders as an empty tile in the host's browser.
 */
export function validateOgrafPackage(manifest: unknown, files: readonly string[]): string[] {
  const errors: string[] = [];
  if (!isPlainObject(manifest)) return errors;
  const packaged = new Set(files);
  const references: Array<{ path: unknown; label: string }> = [{ path: manifest.main, label: 'main' }];
  if (Array.isArray(manifest.thumbnails)) {
    manifest.thumbnails.forEach((entry, index) => {
      if (isPlainObject(entry)) references.push({ path: entry.file, label: `thumbnails[${index}].file` });
    });
  }
  for (const { path, label } of references) {
    if (typeof path !== 'string' || !path.length) continue;
    // An absolute URL is the host's to resolve, not the package's.
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path)) continue;
    const clean = path.replace(/^\.\//, '').split(/[?#]/)[0];
    if (!packaged.has(clean)) errors.push(`${label}: the package does not contain "${clean}".`);
  }
  return errors;
}
