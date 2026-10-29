export const FRAME_READY_TYPE = 'noacg-preview-frame-ready';

export function regionFromPoints(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function selectionAt(targets, point) {
  return [...targets].reverse().find(({ bounds: b }) => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height);
}

export function buildChangeMessage(snapshot, { revision, selection, request }) {
  if (revision !== snapshot.revision) throw new Error('The source changed. Refresh and select again.');
  if (typeof request !== 'string' || !request.trim() || request.length > 4000) throw new Error('Enter a change request (up to 4000 characters).');
  let selected;
  if (selection?.kind === 'element') {
    const target = snapshot.targets.find((candidate) => candidate.id === selection.id);
    if (!target) throw new Error('Unknown selected element. Refresh and select again.');
    selected = { kind: 'element', ...target };
  } else if (selection?.kind === 'region') {
    const b = selection.bounds;
    if (!b || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(b[key])) || b.x < 0 || b.y < 0 || b.width < 1 || b.height < 1 || b.x + b.width > snapshot.size.width || b.y + b.height > snapshot.size.height) throw new Error('Select a region inside the graphic.');
    selected = { kind: 'region', bounds: b };
  } else throw new Error('Select an element or region first.');
  const context = {
    packageId: snapshot.packageId, revision: snapshot.revision, viewId: snapshot.viewId,
    sourceRoot: snapshot.sourceRoot, sourceFiles: snapshot.sourceFiles,
    size: snapshot.size, selection: selected, sampleValues: snapshot.sampleValues,
    rehearsal: snapshot.rehearsal ?? 'settled fixture', request: request.trim(),
  };
  return {
    role: 'user',
    content: [
      { type: 'text', text: `Change this local NoaCG graphic using this task's normal file tools. The attached PNG shows the selected source revision. After editing, validate and inspect it, then call noacg_preview to refresh.\n${JSON.stringify(context, null, 2)}` },
      { type: 'image', mimeType: 'image/png', data: snapshot.image },
    ],
    _meta: { 'openai/message': { target: 'active', send: true } },
  };
}
