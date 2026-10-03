import { useEffect, useRef, useState } from 'react';
import type { AssetFile } from '../../model/types';
import { imageSize, readAssetFiles } from '../../assets/fileImport';
import { imagePlacement, importAssets } from '../../blocks/editorImages';
import type { EditorSession, Revision } from './session';
import type { EditorOperation } from './operations';
import type { PreviewReply, RenderedPart } from './protocol';

/** File reads carry the initiating revision; Escape, another read or unmount cancels the batch. */
export function useImageImport(session: EditorSession, drawingSpace?: PreviewReply['drawingSpace']) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const token = useRef({ run: 0 });
  const run = token.current, space = useRef(drawingSpace); space.current = drawingSpace;
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { run.run++; setBusy(false); } };
    window.addEventListener('keydown', cancel);
    return () => { run.run++; window.removeEventListener('keydown', cancel); };
  }, [session, run]);
  const execute = (operations: EditorOperation[], expected: Revision = session.version()) => session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations });
  const awaitSpace = async (id: number) => {
    const deadline = performance.now() + 5000;
    while (!space.current && id === run.run && performance.now() < deadline) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (!space.current) throw new Error('The drawing surface is not ready. Reload the preview and try again.');
    return space.current;
  };
  const placeOperations = async (asset: AssetFile, point: { x: number; y: number }, time: number): Promise<EditorOperation> => {
    const geometry = imagePlacement(session.port.read(), await imageSize(asset.data), point, await awaitSpace(run.run));
    return { kind: 'image.place', assetPath: asset.path, geometry, time };
  };
  const files = async (list: readonly File[], mode: 'assets' | 'place' | 'replace', point?: { x: number; y: number }, target?: { selector: string; appearance?: RenderedPart['appearance'] }) => {
    if (!list.length) return '';
    const id = ++run.run, expected = session.version(), template = session.port.read(), time = session.port.view().time;
    setError(''); setBusy(true);
    try {
      if (mode === 'replace' && list.length !== 1) throw new Error('Choose one replacement image.');
      const result = await readAssetFiles(list, template.resolution, mode !== 'assets');
      const settled = importAssets(template, result.assets);
      const operations: EditorOperation[] = [{ kind: 'asset.import', assets: result.assets }];
      if (mode === 'place') {
        const matrix = await awaitSpace(id);
        for (const path of settled.paths) {
          const asset = settled.template.assets.find(a => a.path === path)!;
          operations.push({ kind: 'image.place', assetPath: path, geometry: imagePlacement(template, await imageSize(asset.data), point ?? { x: template.resolution.width / 2, y: template.resolution.height / 2 }, matrix), time });
        }
      } else if (mode === 'replace') {
        if (!target) throw new Error('Select the image to replace.');
        operations.push({ kind: 'image.replace', selector: target.selector, assetPath: settled.paths[0], box: target.appearance?.size ? { width: target.appearance.size[0], height: target.appearance.size[1] } : undefined });
      }
      if (id !== run.run) return '';
      execute(operations, expected);
      return result.note || `Imported ${result.assets.length} file${result.assets.length === 1 ? '' : 's'}.`;
    } catch (cause) {
      if (id !== run.run) return '';
      const message = cause instanceof Error ? cause.message : String(cause);
      if (mode !== 'assets') setError(message);
      throw Object.assign(new Error(message), { cause });
    } finally { if (id === run.run) setBusy(false); }
  };
  const place = async (asset: AssetFile, point?: { x: number; y: number }) => {
    const id = ++run.run, expected = session.version(), template = session.port.read(), time = session.port.view().time;
    setError(''); setBusy(true);
    try {
      const operation = await placeOperations(asset, point ?? { x: template.resolution.width / 2, y: template.resolution.height / 2 }, time);
      if (id === run.run) execute([operation], expected);
    } catch (cause) { if (id === run.run) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (id === run.run) setBusy(false); }
  };
  const replace = async (asset: AssetFile, target: { selector: string; appearance?: RenderedPart['appearance'] }) => {
    const id = ++run.run, expected = session.version(), size = target.appearance?.size;
    setError(''); setBusy(true);
    try {
      await imageSize(asset.data);
      if (id === run.run) execute([{ kind: 'image.replace', selector: target.selector, assetPath: asset.path, box: size ? { width: size[0], height: size[1] } : undefined }], expected);
    } catch (cause) { if (id === run.run) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (id === run.run) setBusy(false); }
  };
  return { files, place, replace, execute, error, busy };
}
