import { App } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import { FRAME_READY_TYPE, regionFromPoints, selectionAt } from './protocol.mjs';

const app = new App({ name: 'NoaCG package preview trial', version: '0.1.4' }, {});
const extensions = new OpenAIExtensions(app);
const element = (id) => document.getElementById(id);
const stage = element('stage');
const graphic = element('graphic');
const layer = element('selection-layer');
const highlight = element('highlight');
let snapshot;
let selection;
let dragStart;
let busy = false;
let pendingWork = 0;
let renderEpoch = 0;
let cancelGraphicLoad;
let hitTargets = [];
let controlNodes = [];
let inputs = new Map();

function status(text, error = false) {
  element('status').textContent = text;
  element('status').dataset.error = String(error);
}
function toolName(name) {
  const hostName = app.getHostContext()?.toolInfo?.tool?.name;
  return hostName?.endsWith('noacg_preview') ? hostName.slice(0, -'noacg_preview'.length) + name : name;
}
function buttons() {
  for (const node of hitTargets) node.disabled = busy;
  for (const node of controlNodes) node.disabled = busy || !snapshot || !app.getHostCapabilities()?.serverTools || node.dataset.unavailable === 'true';
  element('refresh').disabled = busy || !app.getHostCapabilities()?.serverTools;
  element('send').disabled = busy || !app.getHostCapabilities()?.serverTools || !snapshot || !selection || !element('request').value.trim() || !extensions.message;
}
function placeBounds(node, bounds) {
  for (const [css, key, extent] of [['left', 'x', snapshot.size.width], ['top', 'y', snapshot.size.height], ['width', 'width', snapshot.size.width], ['height', 'height', snapshot.size.height]]) node.style[css] = bounds[key] / extent * 100 + '%';
}
function selectTarget(target) {
  selection = target ? { kind: 'element', id: target.id } : undefined;
  showSelection(target?.bounds, target ? target.label : 'No element here. Choose Region to mark an area.');
}
function renderTargets() {
  for (const node of hitTargets) node.remove();
  hitTargets = snapshot.targets.map((target) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'hit-target';
    node.setAttribute('aria-label', 'Select ' + target.label);
    placeBounds(node, target.bounds);
    node.hidden = element('mode').value === 'region';
    node.addEventListener('click', () => { if (!busy && element('mode').value === 'element') selectTarget(target); });
    layer.append(node);
    return node;
  });
}
function showSelection(bounds, label) {
  highlight.hidden = !bounds;
  if (bounds) placeBounds(highlight, bounds);
  element('selected').textContent = label;
  buttons();
}
function scaleGraphic() {
  if (snapshot) graphic.style.transform = `scale(${stage.clientWidth / snapshot.size.width})`;
}
function renderControls() {
  const fields = element('fields');
  const controls = element('rehearsal-controls');
  fields.replaceChildren();
  controls.replaceChildren();
  inputs = new Map();
  controlNodes = [];
  for (const field of snapshot.fields ?? []) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement(field.kind === 'lines' ? 'textarea' : field.kind === 'select' ? 'select' : 'input');
    input.setAttribute('aria-label', field.label);
    if (field.kind === 'select') {
      for (const item of field.options ?? []) {
        const option = document.createElement('option');
        option.textContent = item.label;
        option.value = item.value;
        input.append(option);
      }
    } else if (field.kind !== 'lines') input.type = { number: 'number', toggle: 'checkbox', color: 'color' }[field.kind] ?? 'text';
    const value = snapshot.sampleValues[field.key] ?? '';
    if (field.kind === 'toggle') input.checked = value === '1' || value === 'true';
    else input.value = value;
    label.append(input);
    fields.append(label);
    inputs.set(field.key, { input, kind: field.kind });
    controlNodes.push(input);
  }
  const addControl = (label, operation, unavailable = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.unavailable = String(unavailable);
    button.addEventListener('click', () => run(async () => {
      status('Rehearsing…');
      const args = typeof operation === 'function' ? operation() : operation;
      await render(await app.callServerTool({ name: toolName('noacg_preview_rehearse'), arguments: { revision: snapshot.revision, viewId: snapshot.viewId, ...args } }));
    }));
    controls.append(button);
    controlNodes.push(button);
  };
  for (const [cmd, label] of [['play', 'Take'], ['update', 'Update preview'], ['next', 'Next'], ['stop', 'Out']]) {
    if (!(snapshot.lifecycle ?? []).includes(cmd)) continue;
    addControl(label, () => ({ cmd, ...(cmd === 'update' ? { values: Object.fromEntries([...inputs].map(([key, { input, kind }]) => [key, kind === 'toggle' ? (input.checked ? '1' : '0') : input.value])) } : {}) }));
  }
  for (const action of snapshot.actions ?? []) addControl(action.label, { cmd: 'event', event: action.event }, action.disabled);
  addControl('Reset rehearsal', { cmd: 'reset' });
}
function loadGraphic(next) {
  cancelGraphicLoad?.();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      if (cancelGraphicLoad === cancel) cancelGraphicLoad = undefined;
      if (error) reject(new Error(error)); else resolve();
    };
    const cancel = () => finish();
    const receive = (event) => {
      // This is a render-only acknowledgement, never a tool or conversation bridge.
      if (event.source !== graphic.contentWindow || event.data?.type !== FRAME_READY_TYPE || event.data.viewId !== next.viewId) return;
      finish(event.data.error);
    };
    const timer = setTimeout(() => finish('The graphic did not finish rehearsal. Refresh to try again.'), 5000);
    cancelGraphicLoad = cancel;
    window.addEventListener('message', receive);
    graphic.srcdoc = next.document;
  });
}
async function render(result) {
  if (result.isError) throw new Error(result.content?.find((item) => item.type === 'text')?.text ?? 'Preview tool failed.');
  const next = result._meta?.preview;
  if (!next) return;
  const epoch = ++renderEpoch;
  snapshot = next;
  selection = undefined;
  stage.style.aspectRatio = `${snapshot.size.width} / ${snapshot.size.height}`;
  graphic.style.width = snapshot.size.width + 'px';
  graphic.style.height = snapshot.size.height + 'px';
  scaleGraphic();
  const loaded = loadGraphic(snapshot);
  renderControls();
  renderTargets();
  showSelection(null, 'Select part of the graphic');
  element('source').textContent = `${snapshot.sourceRoot}\n${snapshot.sourceFiles.join(', ')}\n${snapshot.revision}`;
  status('Loading graphic…');
  try { await loaded; } catch (error) {
    if (epoch !== renderEpoch) return;
    snapshot = undefined; selection = undefined; throw error;
  }
  if (epoch !== renderEpoch) return;
  status(extensions.message ? 'Ready' : 'This host does not advertise OpenAI message support. Sending is unavailable.');
}
function point(event) {
  const b = layer.getBoundingClientRect();
  return { x: Math.max(0, Math.min(snapshot.size.width, (event.clientX - b.left) / b.width * snapshot.size.width)), y: Math.max(0, Math.min(snapshot.size.height, (event.clientY - b.top) / b.height * snapshot.size.height)) };
}
new ResizeObserver(scaleGraphic).observe(stage);
layer.addEventListener('pointerdown', (event) => {
  if (!snapshot || busy) return;
  if (element('mode').value === 'region') {
    dragStart = point(event);
    layer.setPointerCapture(event.pointerId);
  } else {
    const target = selectionAt(snapshot.targets, point(event));
    selectTarget(target);
  }
});
layer.addEventListener('pointermove', (event) => {
  if (dragStart) showSelection(regionFromPoints(dragStart, point(event)), 'Selecting region');
});
layer.addEventListener('pointerup', (event) => {
  if (!dragStart) return;
  const bounds = regionFromPoints(dragStart, point(event));
  dragStart = undefined;
  selection = bounds.width >= 1 && bounds.height >= 1 ? { kind: 'region', bounds } : undefined;
  showSelection(selection?.bounds, selection ? 'Selected region' : 'Drag to select a region');
});
layer.addEventListener('pointercancel', () => { dragStart = undefined; selection = undefined; showSelection(null, 'Select part of the graphic'); });
element('mode').addEventListener('change', () => {
  for (const node of hitTargets) node.hidden = element('mode').value === 'region';
  dragStart = undefined;
  selection = undefined;
  showSelection(null, 'Select part of the graphic');
});
element('request').addEventListener('input', buttons);

async function run(work) {
  pendingWork += 1;
  busy = true;
  buttons();
  try { await work(); } catch (error) { status(error.message, true); }
  finally { pendingWork -= 1; busy = pendingWork > 0; buttons(); }
}
element('refresh').addEventListener('click', () => run(async () => {
  status('Refreshing source…');
  await render(await app.callServerTool({ name: toolName('noacg_preview'), arguments: {} }));
}));
element('send').addEventListener('click', () => run(async () => {
  status('Checking selected revision…');
  const result = await app.callServerTool({ name: toolName('noacg_preview_request'), arguments: { revision: snapshot.revision, viewId: snapshot.viewId, selection, request: element('request').value } });
  if (result.isError || !result._meta?.message) throw new Error(result.content?.find((item) => item.type === 'text')?.text ?? 'Change request refused.');
  const sent = await extensions.message.send(result._meta.message);
  if (sent.isError) throw new Error('The host refused the change message.');
  status('Change and image sent to this task');
}));
app.ontoolresult = (result) => run(() => render(result));
void (async () => {
  try {
    await app.connect();
    buttons();
    if (!extensions.message) status('This host does not advertise OpenAI message support. Sending is unavailable.');
  } catch (error) { status(`Host connection failed: ${error.message}`, true); }
})();
