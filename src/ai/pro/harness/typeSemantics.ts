// TYPE SEMANTICS - what a graphic type MEANS and how it is OPERATED, read from the registry
// (docs/PRO_HARNESS_PLAN.md §3.2). The other half of the knowledge split: `knowledge.ts` teaches
// design once for every type; this module says, per type, which fields it carries and what they
// are for, which operator events exist, how many steps the default path walks, where it sits by
// default and what its scope excludes. Nothing here is design guidance.
//
// Two sources, one answer: the type registry (fields, machine, controls, capabilities,
// structuralScope) is the declaration the product compiles from, and the AI category registry's
// `workflowNotes` (src/ai/spec/categories.ts) is the operational prose the wizard already reads.
// Both are read live, so a new type or a changed control is in the model's hands with no edit
// here. Imports the registry, so it stays OUT of the pure test path; the Workbench interface
// carries the result across.

import { aiCategoryById, AI_CATEGORIES } from '../../spec/categories';
import { typeById, TYPES } from '../../../templates/types/registry';
import type { GraphicType } from '../../../templates/types/graphicType';
import type { TypeSemantics } from './workbench.js';

export type { TypeSemantics };


/** Operator events named anywhere in the machine declaration - the same walk the bridge does. */
function declaredEvents(machine: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(machine)) machine.forEach((m) => declaredEvents(m, out));
  else if (machine && typeof machine === 'object') {
    const m = machine as Record<string, unknown>;
    if (m.trigger === 'operator' && typeof m.event === 'string') out.add(m.event);
    Object.values(m).forEach((v) => declaredEvents(v, out));
  }
  return out;
}

/** How many Continue presses the default path answers. One rule, stated once: a persisted path
 *  walks its declared events plus the start; a type that is stepped by construction walks one
 *  waypoint per line; everything else is a plain Take/Out graphic. */
function stepsOf(type: GraphicType): number {
  const path = type.machine.main?.pathEvents?.length;
  if (path) return path + 1;
  return type.capabilities.defaultSteps ? Math.max(1, type.fields.filter((f) => f.role === 'line').length) : 1;
}

export function typeSemanticsFor(type: GraphicType): TypeSemantics {
  const category = AI_CATEGORIES.find((c) => c.typeId === type.id) ?? aiCategoryById(type.id);
  const declared = new Map(type.controls.map((c) => [c.event, c]));
  const events = [...declaredEvents(type.machine)].map((event) => {
    const c = declared.get(event);
    const carries = c?.adjust && Object.keys(c.adjust).length
      ? `moves ${Object.entries(c.adjust).map(([k, v]) => `${k} by ${v}`).join(', ')}`
      : c?.payload?.length ? `carries ${c.payload.join(', ')}` : undefined;
    return {
      event,
      label: c?.label ?? event,
      ...(c?.section ? { section: c.section } : {}),
      ...(carries ? { carries } : {}),
    };
  });
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    category: type.structure.category,
    prefix: type.structure.prefix,
    fields: type.fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, role: f.role, sample: f.value })),
    events,
    steps: stepsOf(type),
    defaultZone: type.capabilities.defaultZone,
    logo: type.capabilities.logo,
    ...(type.structuralScope ? { scope: type.structuralScope } : {}),
    ...(category?.workflowNotes ? { workflowNotes: category.workflowNotes } : {}),
  };
}

export function typeSemantics(typeId: string): TypeSemantics | null {
  const type = typeById(typeId);
  return type ? typeSemanticsFor(type) : null;
}

/** Every registered type, one line each, for the model's `listGraphicTypes`. */
export function typeIndex(): { id: string; name: string; description: string; fields: number; events: number }[] {
  return TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    fields: t.fields.length,
    events: declaredEvents(t.machine).size,
  }));
}
