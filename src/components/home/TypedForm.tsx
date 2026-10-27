// THE TYPED FORM (docs/work-specs/playout-ograf-controls/spec.md, E2.1): a foreign OGraf schema
// drawn as the operator's form, generated from E1's descriptor tree (control/ografForm.ts). Every
// scalar is the one field control (components/fields/FieldControl.tsx); an object is a group, a
// list is its items with Add and ✕; a node this version does not carry shows its value and why.
// Text is committed when the edit is over (home/useDeferredEdits), so a keystroke is not a write.
// A value that does not fit is marked where it is and kept: only the action that sends it refuses.

import type { ReactNode } from 'react';
import { FieldControl, isSegmented, type FieldImage } from '../fields/FieldControl';
import { getAt, pathKey, setAt, typedLabel, typedLeaf, typedNodeAt, typedOptionalAt, TYPED_FORM_ITEMS_SHOWN, type TypedPath } from '../../control/ografForm';
import { typedSeed, type TypedNode } from '../../model/ografTyped';
import type { JsonValue } from '../../model/productionData';
import { useDeferredEdits } from './useDeferredEdits';

export interface TypedFormProps {
  /** The root descriptor: a data schema, or one action's arguments. */
  node: TypedNode;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
  /** Each failing path's reasons (control/ografForm.ts `typedErrorsByPath`). */
  errors: ReadonlyMap<string, string[]>;
  /** Names the test ids: `<prefix>-<path>` on a control. */
  testIdPrefix: string;
  images?: FieldImage[];
  imageHint?: string;
  /** A top-level property drawn by the caller instead (a field bound to the production's data). */
  replaced?: (key: string, label: string) => ReactNode | null;
}

/** Kinds whose edit is typed: committed when it is over, not per keystroke (a number's ± too). */
const TYPED_TEXT = new Set(['text', 'lines', 'color', 'number']);

export function TypedForm(props: TypedFormProps) {
  const { node, value, onChange, errors, testIdPrefix } = props;
  // An edit is keyed by its path's JSON; the commit, which the hook repoints every render, reads it
  // into the newest value through the node at that path.
  // An optional value emptied is absent again, never an empty string the schema may refuse.
  const edits = useDeferredEdits((key, text) => {
    const path = JSON.parse(key) as TypedPath;
    const leaf = typedLeaf(typedNodeAt(node, path) ?? node, pathKey(path));
    if (leaf) onChange(setAt(value, path, text === '' && typedOptionalAt(node, path) ? undefined : leaf.read(text)));
  });

  const errorLine = (path: TypedPath) => {
    const reasons = errors.get(pathKey(path));
    return reasons?.length ? (
      <span className="pd-typed-error" data-testid={`${testIdPrefix}-error-${pathKey(path)}`}>
        {reasons.join('; ')}
      </span>
    ) : null;
  };

  const leafRow = (n: TypedNode, path: TypedPath, label: string): ReactNode => {
    const key = pathKey(path);
    const editKey = JSON.stringify(path);
    const leaf = typedLeaf(n, key, label);
    if (!leaf) return null;
    const stored = getAt(value, path);
    const shown = leaf.show(stored);
    const text = TYPED_TEXT.has(leaf.descriptor.kind);
    const optional = typedOptionalAt(node, path);
    // A declared list holding a value outside it says so in its own option; one holding none, or
    // whose value may be absent, has an empty choice, never the first one shown as if picked.
    const descriptor =
      shown === 'other' && leaf.descriptor.options
        ? { ...leaf.descriptor, options: [...leaf.descriptor.options, { value: 'other', label: `${JSON.stringify(stored)} (not a choice)` }] }
        : (shown === '' || optional) && leaf.descriptor.options && !isSegmented(leaf.descriptor.options)
          ? { ...leaf.descriptor, options: [{ value: '', label: '' }, ...leaf.descriptor.options] }
          : leaf.descriptor;
    const invalid = errors.has(key);
    return (
      <div className={`field-row pd-typed-row${invalid ? ' pd-typed-invalid' : ''}`} key={key} onBlur={text ? edits.flush : undefined} data-dirty={text && edits.dirty(editKey) ? '' : undefined}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{label}</label>
          {/* A control with no empty state of its own (a number, on/off, a short choice) clears an
              optional value here; every other one clears it by being emptied. */}
          {optional && stored !== undefined && (leaf.descriptor.kind === 'number' || leaf.descriptor.kind === 'toggle' || (leaf.descriptor.options && isSegmented(leaf.descriptor.options))) && (
            <button type="button" className="pd-typed-unset" title={`Remove ${label}`} aria-label={`Remove ${label}`} onClick={() => onChange(setAt(value, path, undefined))} data-testid={`${testIdPrefix}-unset-${key}`}>
              ✕
            </button>
          )}
        </div>
        <FieldControl
          descriptor={descriptor}
          value={text ? edits.text(editKey, String(shown)) : shown}
          onChange={(v) => {
            if (text) edits.type(editKey, String(v));
            // An empty choice (a picture's None, a list's blank) clears an optional value; on a
            // required one it is the text it says, except a declared list's placeholder.
            else if (v === '' && optional) onChange(setAt(value, path, undefined));
            else if (v !== 'other' && !(v === '' && n.enum)) onChange(setAt(value, path, leaf.read(v)));
          }}
          images={props.images}
          imageHint={props.imageHint}
          testId={`${testIdPrefix}-${key}`}
        />
        {errorLine(path)}
      </div>
    );
  };

  const unsupportedRow = (n: TypedNode, path: TypedPath, label: string): ReactNode => {
    const stored = getAt(value, path);
    const shown = stored === undefined ? '' : JSON.stringify(stored);
    return (
      <div className="field-row pd-typed-row pd-typed-kept" key={pathKey(path)} data-testid={`${testIdPrefix}-kept-${pathKey(path)}`}>
        <div className="field-meta">
          <label style={{ margin: 0 }}>{label}</label>
        </div>
        <input value={shown.length > 200 ? `${shown.slice(0, 200)}…` : shown} readOnly tabIndex={-1} />
        <span className="hint">Kept as it is: {(n.unsupported ?? []).join('; ')}</span>
      </div>
    );
  };

  const add = (n: TypedNode, path: TypedPath, label: string, testKey: string) => (
    <button type="button" className="pd-typed-add" onClick={() => onChange(setAt(value, path, typedSeed(n) ?? null))} data-testid={`${testIdPrefix}-add-${testKey}`}>
      + {label}
    </button>
  );

  const properties = (n: TypedNode, path: TypedPath): ReactNode[] =>
    (n.properties ?? []).map(({ key, node: child }) => {
      if (path.length === 0) {
        const own = props.replaced?.(key, typedLabel(child, key));
        if (own) return <div key={key}>{own}</div>;
      }
      return row(child, [...path, key], typedLabel(child, key));
    });

  const row = (n: TypedNode, path: TypedPath, label: string): ReactNode => {
    if (n.type === 'unsupported') return unsupportedRow(n, path, label);
    if (n.type !== 'object' && n.type !== 'array') return leafRow(n, path, label);
    const key = pathKey(path);
    const stored = getAt(value, path);
    if (stored === undefined) {
      // An optional group or list that is not there yet: one press makes it, from its defaults.
      return (
        <div className="pd-typed-group pd-typed-absent" key={key}>
          {add(n, path, label, key)}
          {errorLine(path)}
        </div>
      );
    }
    // An optional group or list that is there can be taken away again, as it was added.
    const legend = (
      <legend>
        {label}
        {typedOptionalAt(node, path) && (
          <button type="button" className="pd-typed-unset" title={`Remove ${label}`} aria-label={`Remove ${label}`} onClick={() => onChange(setAt(value, path, undefined))} data-testid={`${testIdPrefix}-unset-${key}`}>
            ✕
          </button>
        )}
      </legend>
    );
    if (n.type === 'object') {
      return (
        <fieldset className="pd-typed-group" key={key} data-testid={`${testIdPrefix}-group-${key}`}>
          {legend}
          {properties(n, path)}
          {errorLine(path)}
        </fieldset>
      );
    }
    const items = Array.isArray(stored) ? stored : [];
    const full = n.maxItems !== undefined && items.length >= n.maxItems;
    return (
      <fieldset className="pd-typed-group pd-typed-list" key={key} data-testid={`${testIdPrefix}-group-${key}`}>
        {legend}
        {items.slice(0, TYPED_FORM_ITEMS_SHOWN).map((_, i) => (
          <div className="pd-typed-item" key={i}>
            <div className="pd-typed-item-body">{n.items ? row(n.items, [...path, i], String(i + 1)) : null}</div>
            <button type="button" className="pd-typed-remove" title={`Remove ${i + 1}`} aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(setAt(value, [...path, i], undefined))} data-testid={`${testIdPrefix}-remove-${pathKey([...path, i])}`}>
              ✕
            </button>
          </div>
        ))}
        {items.length > TYPED_FORM_ITEMS_SHOWN && <span className="hint">{items.length - TYPED_FORM_ITEMS_SHOWN} more not shown</span>}
        {n.items && n.items.type !== 'unsupported' && !full && add(n.items, [...path, items.length], 'Add', key)}
        {errorLine(path)}
      </fieldset>
    );
  };

  // An object that is there draws its properties flat; anything else is one row.
  const flat = node.type === 'object' && value !== undefined;
  return (
    <div className="pd-typed-form" data-testid={`${testIdPrefix}-form`}>
      {flat ? properties(node, []) : row(node, [], typedLabel(node, ''))}
      {flat && errorLine([])}
    </div>
  );
}
