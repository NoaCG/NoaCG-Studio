// This bundle is installed only INSIDE the untrusted graphic's isolated document.
// Reuse the product's descriptors, action payloads, authored format and settle recipe;
// no editor, product bridge, account state or Node capability enters the document.
import { fieldDescriptors, eventButtons, eventPayload, eventLegality, isEventLegal } from '../../src/control/controlModel.ts';
import { detectAuthoredFormat } from '../../src/model/importTemplate.ts';
import { settleGraphic } from '../../src/preview/settleGraphic.ts';

export function metadata() {
  const definition = window.SPXGCTemplateDefinition;
  const fields = (Array.isArray(definition?.DataFields) ? definition.DataFields : []).slice(0, 40).filter((field) => /^[a-zA-Z][\w-]{0,79}$/.test(field.field) && !['constructor', 'prototype', '__proto__'].includes(field.field)).map((field) => ({
    field: String(field.field), title: String(field.title ?? field.field).slice(0, 120), ftype: String(field.ftype), value: String(field.value ?? '').slice(0, 4000),
    ...(Array.isArray(field.items) ? { items: field.items.slice(0, 100).map((item) => ({ text: String(item.text ?? item.value).slice(0, 120), value: String(item.value).slice(0, 4000) })) } : {}),
  }));
  const js = [...document.scripts].filter((script) => script.id !== 'noacg-preview-runtime').map((script) => script.textContent).join('\n');
  const format = detectAuthoredFormat(document.documentElement.outerHTML, [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n'), js);
  if (!format.resolution) throw new Error('Package must declare its authored canvas dimensions.');
  const { width, height } = format.resolution;
  if (width > 4096 || height > 4096 || width * height > 16777216) throw new Error('Package canvas exceeds the trial limit.');
  return {
    size: { width, height }, fields: fieldDescriptors(fields, { includeHidden: true }),
    actions: eventButtons(js).slice(0, 40), legality: eventLegality(js),
    lifecycle: ['play', 'update', 'next', 'stop'].filter((name) => typeof window[name] === 'function'),
  };
}

export async function rehearse(operations) {
  const info = metadata();
  let values = Object.fromEntries(info.fields.map((field) => [field.key, field.defaultValue]));
  let last = 'settle';
  settleGraphic(window, JSON.stringify(values));
  for (const operation of operations) {
    last = operation.cmd;
    if (operation.cmd === 'update') {
      values = { ...values, ...operation.values };
      if (!window.update) throw new Error('This graphic has no Update control.');
      window.update(JSON.stringify(values));
    } else if (operation.cmd === 'event') {
      const action = info.actions.find((candidate) => candidate.event === operation.event);
      if (!action || !window.noacgDispatch) throw new Error('This graphic has no such operator action.');
      if (!isEventLegal(info.legality, action.event, window.noacgMachineState?.())) throw new Error('The graphic cannot use this action from its current state.');
      const payload = eventPayload(action, (key) => values[key]);
      const accepted = window.noacgDispatch(action.event, payload);
      if (accepted === false) throw new Error('The graphic refused this operator action.');
      values = { ...values, ...payload };
    } else {
      if (typeof window[operation.cmd] !== 'function') throw new Error(`This graphic has no ${operation.cmd} control.`);
      window[operation.cmd]();
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 150));
  const labels = new Map(info.fields.map((field) => [field.key, field.label]));
  const targets = [...document.querySelectorAll('[data-preview-target][id], [id]')].filter((node) => node.hasAttribute('data-preview-target') || labels.has(node.id)).flatMap((node) => {
    const b = node.getBoundingClientRect();
    if (!node.getClientRects().length || b.width <= 0 || b.height <= 0 || getComputedStyle(node).visibility === 'hidden') return [];
    return [{ id: node.id, label: (node.getAttribute('data-preview-target') || labels.get(node.id)).slice(0, 120), bounds: { x: b.x, y: b.y, width: b.width, height: b.height } }];
  }).slice(0, 128);
  const state = typeof window.noacgMachineState === 'function' ? window.noacgMachineState() : null;
  return { ...info, actions: info.actions.map((action) => ({ ...action, disabled: !isEventLegal(info.legality, action.event, state) })), targets, sampleValues: values, rehearsal: { last, operations, state } };
}
