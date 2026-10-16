import { App } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import { regionFromPoints, selectionAt } from './protocol.mjs';

const app = new App({ name: 'NoaCG preview trial', version: '0.1.0' }, {});
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

function status(text, error = false) {
  element('status').textContent = text;
  element('status').dataset.error = String(error);
}
function buttons() {
  element('refresh').disabled = busy || !app.getHostCapabilities()?.serverTools;
  element('send').disabled = busy || !snapshot || !selection || !element('request').value.trim() || !extensions.message;
}
function showSelection(bounds, label) {
  highlight.hidden = !bounds;
  if (bounds) for (const [css, key, extent] of [['left', 'x', 1920], ['top', 'y', 1080], ['width', 'width', 1920], ['height', 'height', 1080]]) highlight.style[css] = `${bounds[key] / extent * 100}%`;
  element('selected').textContent = label;
  buttons();
}
function render(result) {
  if (result.isError) throw new Error(result.content?.find((item) => item.type === 'text')?.text ?? 'Preview tool failed.');
  const next = result._meta?.preview;
  if (!next) return;
  snapshot = next;
  selection = undefined;
  graphic.srcdoc = snapshot.document;
  showSelection(null, 'Select part of the graphic');
  element('source').textContent = `${snapshot.sourceRoot}\n${snapshot.sourceFiles.join(', ')}\n${snapshot.revision}`;
  status(extensions.message ? 'Ready' : 'This host does not advertise OpenAI message support. Sending is unavailable.');
}
function point(event) {
  const b = layer.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1920, (event.clientX - b.left) / b.width * 1920)), y: Math.max(0, Math.min(1080, (event.clientY - b.top) / b.height * 1080)) };
}
new ResizeObserver(() => { graphic.style.transform = `scale(${stage.clientWidth / 1920})`; }).observe(stage);
layer.addEventListener('pointerdown', (event) => {
  if (!snapshot || busy) return;
  if (element('mode').value === 'region') {
    dragStart = point(event);
    layer.setPointerCapture(event.pointerId);
  } else {
    const target = selectionAt(snapshot.targets, point(event));
    selection = target ? { kind: 'element', id: target.id } : undefined;
    showSelection(target?.bounds, target ? target.label : 'No element here. Choose Region to mark an area.');
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
element('mode').addEventListener('change', () => { selection = undefined; showSelection(null, 'Select part of the graphic'); });
element('request').addEventListener('input', buttons);

async function run(work) {
  busy = true;
  buttons();
  try { await work(); } catch (error) { status(error.message, true); }
  finally { busy = false; buttons(); }
}
element('refresh').addEventListener('click', () => run(async () => {
  status('Refreshing source…');
  render(await app.callServerTool({ name: 'noacg_preview', arguments: {} }));
}));
element('send').addEventListener('click', () => run(async () => {
  status('Checking selected revision…');
  const result = await app.callServerTool({ name: 'noacg_preview_request', arguments: { revision: snapshot.revision, selection, request: element('request').value } });
  if (result.isError || !result._meta?.message) throw new Error(result.content?.find((item) => item.type === 'text')?.text ?? 'Change request refused.');
  const sent = await extensions.message.send(result._meta.message);
  if (sent.isError) throw new Error('The host refused the change message.');
  status('Change and image sent to this task');
}));
app.ontoolresult = (result) => { try { render(result); } catch (error) { status(error.message, true); } };
void (async () => {
  try {
    await app.connect();
    buttons();
    if (!extensions.message) status('This host does not advertise OpenAI message support. Sending is unavailable.');
  } catch (error) { status(`Host connection failed: ${error.message}`, true); }
})();
