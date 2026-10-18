// This bundle is installed only INSIDE the untrusted graphic's isolated document.
// Reuse the product's descriptors, action payloads, authored format and settle recipe;
// no editor, product bridge, account state or Node capability enters the document.
import { fieldDescriptors, eventButtons, eventPayload, eventLegality, isEventLegal } from '../../src/control/controlModel.ts';
import { detectAuthoredFormat } from '../../src/model/importTemplate.ts';
import { settleGraphic } from '../../src/preview/settleGraphic.ts';

// Detect the declared canvas without executing any package script. Capture calls this
// inside its contained browser before loading the source at the authored viewport.
export function authoredSize(html) {
  const format = detectAuthoredFormat(html);
  if (!format.resolution) throw new Error('Package must declare its authored canvas dimensions.');
  const { width, height } = format.resolution;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width > 4096 || height > 4096) throw new Error('Package canvas exceeds the trial limit.');
  return { width, height };
}

function describe(assetUrls) {
  const definition = window.SPXGCTemplateDefinition;
  const rawFields = Array.isArray(definition?.DataFields) ? definition.DataFields : [];
  if (rawFields.length > 40) throw new Error('The trial supports up to 40 declared fields.');
  const images = new Map(Object.entries(assetUrls));
  const fields = rawFields.filter((field) => /^[a-zA-Z][\w-]{0,79}$/.test(field.field) && !['constructor', 'prototype', '__proto__'].includes(field.field)).map((field) => {
    let value = String(field.value ?? '');
    if (field.ftype === 'filelist') {
      const path = [...images].find(([, url]) => url === value)?.[0];
      if (path) value = path;
      else if (value.startsWith('data:image/')) {
        const key = `embedded:${field.field}`;
        images.set(key, value);
        value = key;
      }
    }
    if (value.length > 4000) throw new Error('A sample field exceeds the trial limit (4000 characters).');
    if (Array.isArray(field.items) && field.items.length > 100) throw new Error('A field exceeds the trial limit (100 choices).');
    return {
      field: String(field.field), title: String(field.title ?? field.field).slice(0, 120), ftype: String(field.ftype), value,
      ...(Array.isArray(field.items) ? { items: field.items.map((item) => {
        const value = String(item.value);
        if (value.length > 4000) throw new Error('A choice exceeds the trial value limit.');
        return { text: String(item.text ?? item.value).slice(0, 120), value };
      }) } : {}),
    };
  });
  const js = [...document.scripts].filter((script) => script.id !== 'noacg-preview-runtime').map((script) => script.textContent).join('\n');
  const actions = eventButtons(js);
  if (actions.length > 40) throw new Error('The trial supports up to 40 operator actions.');
  return { images, info: {
    size: authoredSize(document.documentElement.outerHTML),
    fields: fieldDescriptors(fields, { includeHidden: true }).map((field) => field.kind === 'image' ? { ...field, options: [{ label: 'None', value: '' }, ...[...images.keys()].map((key) => ({ label: key.startsWith('embedded:') ? 'Embedded image' : key, value: key }))] } : field),
    actions, legality: eventLegality(js),
    lifecycle: ['play', 'update', 'next', 'stop'].filter((name) => typeof window[name] === 'function'),
  } };
}

export async function rehearse(operations, assetUrls = {}) {
  const { info, images } = describe(assetUrls);
  const imageFields = new Set(info.fields.filter((field) => field.kind === 'image').map((field) => field.key));
  const renderData = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (!imageFields.has(key) || !value) return [key, value];
    if (!images.has(value)) throw new Error('Choose an image from this package.');
    return [key, images.get(value)];
  }));
  let values = Object.fromEntries(info.fields.map((field) => [field.key, field.defaultValue]));
  let last = 'settle';
  settleGraphic(window, JSON.stringify(renderData(values)));
  for (const operation of operations) {
    last = operation.cmd;
    if (operation.cmd === 'update') {
      values = { ...values, ...operation.values };
      if (!window.update) throw new Error('This graphic has no Update control.');
      window.update(JSON.stringify(renderData(values)));
    } else if (operation.cmd === 'event') {
      const action = info.actions.find((candidate) => candidate.event === operation.event);
      if (!action || !window.noacgDispatch) throw new Error('This graphic has no such operator action.');
      if (!isEventLegal(info.legality, action.event, window.noacgMachineState?.())) throw new Error('The graphic cannot use this action from its current state.');
      const payload = eventPayload(action, (key) => values[key]);
      const accepted = window.noacgDispatch(action.event, payload ? renderData(payload) : undefined);
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
