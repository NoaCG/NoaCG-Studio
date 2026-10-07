// The Assets panel: every file bundled with the template (images, Lottie animations,
// imported fonts) as folder-grouped rows, with drag-and-drop import, drag-to-canvas
// placement (see CanvasInteraction), reference-safe move/rename, and an info section
// that derives metadata on demand (src/assets/assetInfo.ts) — the model stays { path, data }.

import { useEffect, useRef, useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { moveAsset } from '../blocks/assetOps';
import { probeAsset, referenceCount, assetBytes, type AssetInfo } from '../assets/assetInfo';
import {
  MAX_VIDEO_ASSET_BYTES,
  isAudioAsset,
  fileToDataUrl,
  isImageAsset,
  isLottieAsset,
  isFontAsset,
  isVideoAsset,
  looksLikeLottie,
  sanitizeFolderName,
  splitAssetPath,
  uniqueAssetPath,
} from '../assets/assetUtils';
import { describeImageImport, importImageFile } from '../assets/imageImport';
import type { AssetFile } from '../model/types';
import { useInsertTemplateUi } from './InsertTemplateDialog';
import { ASSET_ACCEPT } from '../assets/fileImport';
import SoundsControls from './SoundsControls';
import type { SoundOperation } from '../blocks/soundEdit';
import type { OrganizationOperation } from '../blocks/editorOrganization';
import InlineOrganizationName from './editorFoundation/InlineOrganizationName';

export interface AssetPanelActions {
  bins?: {
    directories: string[];
    revision: () => { source: number; assets: number };
    execute: (operation: OrganizationOperation, expected: { source: number; assets: number }) => void;
    reason?: string;
  };
  sound?: (operation: SoundOperation, expectedJs: string) => void | Promise<void>;
  importFiles: (files: File[]) => Promise<string>;
  move: (from: string, to: string) => string;
  remove: (path: string) => void;
  place: (asset: AssetFile) => void;
  placeReason?: string;
  replace?: (asset: AssetFile) => void;
}

/** Soft per-asset size warning — big data-URL assets weigh on share/render budgets. */
const WARN_ASSET_BYTES = 1_500_000;
/** The community-publish gate's totals (validation/templateBench.ts) — shown as context. */
const PUBLISH_MAX_ASSETS = 24;
const PUBLISH_MAX_TOTAL = 12 * 1024 * 1024 * 0.75; // the bench caps data-URL chars; ~real bytes

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.json,.webm,.mp4';

/** The drag payload type the canvas drop target (CanvasInteraction) listens for. */
export const ASSET_DRAG_TYPE = 'application/x-noacg-asset';

function fmtBytes(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} kB`;
}

function badgeFor(path: string): string {
  if (isAudioAsset(path)) return 'SOUND';
  if (isImageAsset(path)) return 'IMG';
  if (isLottieAsset(path)) return 'LOTTIE';
  if (isFontAsset(path)) return 'FONT';
  if (isVideoAsset(path)) return 'VIDEO';
  return 'FILE';
}

/** Group key = the directory part of the path ("images", "images/logos", "fonts"…). */
function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function AssetRow({ asset, refs, selected, onSelect }: { asset: AssetFile; refs: number; selected: boolean; onSelect: () => void }) {
  const { file } = splitAssetPath(asset.path);
  const bytes = assetBytes(asset);
  const isImage = isImageAsset(asset.path) && typeof asset.data === 'string';
  return (
    <div
      className={`asset-row${selected ? ' selected' : ''}`}
      data-testid="asset-row"
      data-path={asset.path}
      onClick={onSelect}
      draggable={!isAudioAsset(asset.path)}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.path);
        e.dataTransfer.setData('text/plain', asset.path);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={
        isAudioAsset(asset.path) ? `${asset.path}: attach this sound in Sounds below.` : refs > 0
          ? `${asset.path} — used ${refs}× in this graphic. Drag onto the canvas to place another copy (each placement is its own element; the file is stored once).`
          : `${asset.path} — not placed yet. Drag onto the canvas to place it, or onto a folder to move it.`
      }
    >
      <span className="asset-row-thumb">
        {isImage ? (
          <img src={asset.data as string} alt="" />
        ) : (
          <span className="asset-row-icon">
            {isLottieAsset(asset.path) ? '✦' : isFontAsset(asset.path) ? 'Aa' : isVideoAsset(asset.path) ? '▶' : '▤'}
          </span>
        )}
      </span>
      <span className="asset-row-name" title={file}>{file}</span>
      {/* Which assets this graphic actually places — at a glance, per row. */}
      {refs > 0 && (
        <span className="asset-row-used" data-testid="asset-used" title={`Used ${refs}× in this graphic`}>
          {refs > 1 ? `${refs}×` : '✓'}
        </span>
      )}
      <span className={`asset-badge asset-badge-${badgeFor(asset.path).toLowerCase()}`}>{badgeFor(asset.path)}</span>
      <span className="asset-row-size" style={bytes > WARN_ASSET_BYTES ? { color: 'var(--warn)' } : undefined}>
        {fmtBytes(bytes)}
      </span>
    </div>
  );
}

/** The info section for the selected asset: derived facts + rename/move/remove. */
function AssetInfoSection({
  asset,
  bucketFolders,
  onMove,
  onRemove,
  bins,
  binReason,
}: {
  asset: AssetFile;
  /** Existing + pending folder names offered by the Move select. */
  bucketFolders: string[];
  /** Move/rename the asset to a target path (reference-safe, one undo step). */
  onMove: (fromPath: string, toPath: string) => void;
  onRemove?: (path: string) => void;
  bins?: boolean;
  binReason?: string;
}) {
  const template = useTemplateStore((s) => s.template);
  const removeAsset = useTemplateStore((s) => s.removeAsset);
  const [info, setInfo] = useState<AssetInfo | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const { bucket, folder, file } = splitAssetPath(asset.path);
  const dot = file.lastIndexOf('.');
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  const ext = dot >= 0 ? file.slice(dot) : '';

  useEffect(() => {
    let live = true;
    setInfo(null);
    void probeAsset(asset).then((i) => { if (live) setInfo(i); });
    return () => { live = false; };
  }, [asset]);

  const refs = referenceCount(template, asset.path);

  const commitRename = () => {
    if (renaming === null) return;
    const cleanStem = renaming.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    setRenaming(null);
    if (!cleanStem || cleanStem === stem) return;
    onMove(asset.path, `${dirOf(asset.path)}/${cleanStem}${ext}`);
  };

  const moveToFolder = (target: string) => {
    if (target === '__new__') {
      const name = sanitizeFolderName(window.prompt('New folder name:') ?? '');
      if (name) onMove(asset.path, `${bucket}/${name}/${file}`);
      return;
    }
    onMove(asset.path, target === '' ? `${bucket}/${file}` : `${bucket}/${target}/${file}`);
  };

  const isImage = isImageAsset(asset.path) && typeof asset.data === 'string';

  return (
    <div className="asset-info" data-testid="asset-info">
      <h3>Information</h3>
      <div className="asset-info-body">
        {isImage && (
          <div className="asset-info-preview asset-thumb">
            <img src={asset.data as string} alt={file} />
          </div>
        )}
        {isVideoAsset(asset.path) && typeof asset.data === 'string' && (
          <div className="asset-info-preview asset-thumb">
            <video src={asset.data} autoPlay muted loop playsInline />
          </div>
        )}
        <div className="asset-info-facts">
          <div className="asset-fact">
            <span className="asset-fact-key">Name</span>
            {renaming !== null ? (
              <input
                className="asset-rename"
                value={renaming}
                autoFocus
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <button
                className="asset-fact-value asset-name-btn"
                title="Rename (references in the code update automatically)"
                onClick={() => setRenaming(stem)}
              >
                {file} ✎
              </button>
            )}
          </div>
          <div className="asset-fact">
            <span className="asset-fact-key">Format</span>
            <span className="asset-fact-value">{info ? (info.mime || ext.replace('.', '').toUpperCase() || '—') : '…'}</span>
          </div>
          <div className="asset-fact">
            <span className="asset-fact-key">Dimensions</span>
            <span className="asset-fact-value">{info ? (info.width != null ? `${info.width} × ${info.height} px` : '—') : '…'}</span>
          </div>
          <div className="asset-fact">
            <span className="asset-fact-key">Aspect</span>
            <span className="asset-fact-value">{info ? (info.aspect ?? '—') : '…'}</span>
          </div>
          <div className="asset-fact">
            <span className="asset-fact-key">Size</span>
            <span className="asset-fact-value">{fmtBytes(assetBytes(asset))}</span>
          </div>
          <div className="asset-fact">
            <span className="asset-fact-key">Transparency</span>
            <span className="asset-fact-value">
              {info
                ? info.hasAlpha === 'vector'
                  ? 'vector (alpha)'
                  : info.hasAlpha === true
                    ? 'yes (alpha)'
                    : info.hasAlpha === false
                      ? 'no'
                      : '—'
                : '…'}
            </span>
          </div>
          {info?.kind === 'lottie' && info.durationS != null && (
            <div className="asset-fact">
              <span className="asset-fact-key">Animation</span>
              <span className="asset-fact-value">{info.durationS}s · {info.fps ?? '?'} fps · {info.frames ?? '?'} frames</span>
            </div>
          )}
          {info?.kind === 'video' && info.durationS != null && (
            <div className="asset-fact">
              <span className="asset-fact-key">Duration</span>
              <span className="asset-fact-value">{info.durationS}s (plays muted on a loop)</span>
            </div>
          )}
          <div className="asset-fact">
            <span className="asset-fact-key">Used</span>
            <span className="asset-fact-value">{refs > 0 ? `${refs}× in the template` : 'not referenced (bloats the export)'}</span>
          </div>
          <div className="asset-fact">
            <span className="asset-fact-key">{bins ? 'Bin' : 'Folder'}</span>
            <select
              aria-label={bins ? 'Asset bin' : 'Asset folder'}
              disabled={!!binReason}
              className="asset-fact-value"
              value={bins ? dirOf(asset.path).slice(bucket.length + 1) : folder ?? ''}
              onChange={(e) => moveToFolder(e.target.value)}
              title="Move to a folder (references in the code update automatically)"
            >
              <option value="">{bucket}/ (root)</option>
              {bucketFolders.map((f) => (
                <option key={f} value={f}>{bucket}/{f}/</option>
              ))}
              {!bins && <option value="__new__">New folder…</option>}
            </select>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => (onRemove ?? removeAsset)(asset.path)} title="Remove from the template (undoable)">✕ Remove</button>
      </div>
    </div>
  );
}

export default function AssetsPanel({ actions }: { actions?: AssetPanelActions } = {}) {
  const template = useTemplateStore((s) => s.template);
  const addAssets = useTemplateStore((s) => s.addAssets);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const sampleData = useTemplateStore((s) => s.sampleData);
  const setSampleValue = useTemplateStore((s) => s.setSampleValue);
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropDir, setDropDir] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedBin, setSelectedBin] = useState<string | null>(null);
  const [collapsedBins, setCollapsedBins] = useState<string[]>([]);
  const [binBucket, setBinBucket] = useState('images');
  const [binDraft, setBinDraft] = useState<{ from: string | null; name: string; bucket: string; expected: { source: number; assets: number } } | null>(null);
  // Folders the user created that hold nothing yet. Deliberately ephemeral component
  // state: assets sync/share as template JSON, and a folder only becomes real (part of
  // an asset's path) once something lands in it — persisting a cosmetic empty-folder
  // list would need a new template field.
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);
  // "Add template graphic" — insert a catalog graphic into THIS project (never replacing
  // it). The dialog itself is mounted once in AppShell; this just opens it.
  const openInsertDialog = useInsertTemplateUi((s) => s.openDialog);

  const assets = template.assets;
  const selected = assets.find((a) => a.path === selectedPath) ?? null;
  const totalBytes = assets.reduce((sum, a) => sum + assetBytes(a), 0);
  const editBin = (dir?: string) => {
    if (!actions?.bins) return;
    const bucket = dir?.split('/')[0] ?? binBucket;
    setNote(null); setBinDraft({ from: dir ?? null, name: dir?.slice(bucket.length + 1) ?? '', bucket, expected: actions.bins.revision() });
  };
  const binNameInput = (draft: NonNullable<typeof binDraft>) => <InlineOrganizationName key={draft.from ?? 'new'} name={draft.name} label="Bin name" cancel={() => setBinDraft(null)} commit={name => {
    setBinDraft(null);
    const dir = draft.bucket + '/' + name.trim();
    try {
      actions!.bins!.execute(draft.from ? { kind: 'bin.rename', from: draft.from, to: dir } : { kind: 'bin.create', dir }, draft.expected);
      if (draft.from && selectedPath?.startsWith(draft.from + '/')) setSelectedPath(dir + selectedPath.slice(draft.from.length));
      setSelectedBin(dir); setNote(null);
    } catch (error) { setNote('✗ ' + (error instanceof Error ? error.message : String(error))); }
  }} />;

  /** Move/rename via the reference-rewriting transform — ONE undoable apply, then patch
   *  any sample value that still holds the old path (a filelist field's live value). */
  const handleMove = (fromPath: string, toPath: string) => {
    if (actions) {
      try { setSelectedPath(actions.move(fromPath, toPath)); setNote(null); }
      catch (error) { setNote('✗ ' + (error instanceof Error ? error.message : String(error))); }
      return;
    }
    const { template: next, newPath } = moveAsset(template, fromPath, toPath);
    if (newPath === fromPath) return;
    applyTemplate(next);
    for (const [field, value] of Object.entries(sampleData)) {
      if (value === fromPath) setSampleValue(field, newPath);
    }
    if (selectedPath === fromPath) setSelectedPath(newPath);
    const dir = dirOf(newPath);
    setPendingFolders((p) => p.filter((f) => `images/${f}` !== dir && !dir.endsWith(`/${f}`)));
  };

  /** Import files: images as-is; .json only when it carries the Lottie signature.
   *  All accepted files land in ONE addAssets call = one undo step. */
  const importFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    if (actions) {
      try { setNote(await actions.importFiles(list)); }
      catch (error) { setNote('✗ ' + (error instanceof Error ? error.message : String(error))); }
      return;
    }
    const accepted: AssetFile[] = [];
    const rejected: string[] = [];
    /** Images that were larger than the frame and got shrunk — SAID OUT LOUD, because the
     *  file that lands is not byte-for-byte the file that was picked. */
    const shrunk: string[] = [];
    // Collect against a growing list so two same-named files in one import de-dupe.
    const existing = [...assets];
    for (const file of list) {
      if (/\.json$/i.test(file.name)) {
        const text = await file.text();
        if (!looksLikeLottie(text)) {
          rejected.push(`"${file.name}" is not a Lottie animation`);
          continue;
        }
      } else if (isVideoAsset(file.name)) {
        // Videos ride the saved template as data URLs — a hard cap keeps a save/sync/share
        // of the whole graphic from ballooning on one clip.
        if (file.size > MAX_VIDEO_ASSET_BYTES) {
          rejected.push(`"${file.name}" is ${fmtBytes(file.size)} — videos import up to ${fmtBytes(MAX_VIDEO_ASSET_BYTES)} (trim or compress it, .webm keeps alpha)`);
          continue;
        }
      } else if (!isImageAsset(file.name)) {
        rejected.push(`"${file.name}" — only images, video loops (.webm/.mp4), and Lottie .json files import here (fonts: Style panel)`);
        continue;
      }
      // An image bigger than the frame is shrunk to fit it (assets/imageImport.ts). Everything
      // else — video, Lottie — goes through untouched.
      const imported = isImageAsset(file.name)
        ? await importImageFile(file, Math.max(template.resolution.width, template.resolution.height))
        : { data: await fileToDataUrl(file), note: null };
      if (imported.note) shrunk.push(`"${file.name}" ${describeImageImport(imported.note)}`);
      const asset = { path: uniqueAssetPath(file.name, existing), data: imported.data };
      accepted.push(asset);
      existing.push(asset);
    }
    if (accepted.length > 0) {
      addAssets(accepted);
      setSelectedPath(accepted[accepted.length - 1].path);
    }
    const resized = shrunk.length > 0 ? ` Resized to fit the frame: ${shrunk.join('; ')}.` : '';
    setNote(
      rejected.length > 0
        ? `✗ ${rejected.join('; ')}`
        : accepted.length > 0
          ? `Added ${accepted.length} asset${accepted.length > 1 ? 's' : ''}. Drag one onto the canvas to place it.${resized}`
          : null,
    );
  };

  const newFolder = () => {
    const name = sanitizeFolderName(window.prompt('New folder name (inside images/):') ?? '');
    if (!name) return;
    if (!pendingFolders.includes(name)) setPendingFolders((p) => [...p, name]);
  };

  // Group rows by directory; the buckets keep a stable, meaningful order. Pending
  // (still-empty) folders appear as empty groups under images/ until something lands.
  const order = ['images', 'sounds', 'videos', 'lottie', 'fonts', 'assets'];
  const groups = new Map<string, AssetFile[]>();
  for (const a of assets) {
    const dir = dirOf(a.path);
    if (!groups.has(dir)) groups.set(dir, []);
    (groups.get(dir) as AssetFile[]).push(a);
  }
  for (const f of pendingFolders) {
    if (!groups.has(`images/${f}`)) groups.set(`images/${f}`, []);
  }
  for (const dir of actions?.bins?.directories ?? []) if (!groups.has(dir)) groups.set(dir, []);
  if (actions?.bins) for (const dir of [...groups.keys()]) if (!groups.has(dir.split('/')[0])) groups.set(dir.split('/')[0], []);
  const sortedDirs = Array.from(groups.keys()).sort((a, b) => {
    const [ba, bb] = [a.split('/')[0], b.split('/')[0]];
    const oa = order.indexOf(ba);
    const ob = order.indexOf(bb);
    if (oa !== ob) return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob);
    return a.localeCompare(b);
  });

  // Folder names available to the Move select (per selected asset's bucket) — existing
  // folders in that bucket plus the pending ones (offered for images).
  const foldersFor = (asset: AssetFile): string[] => {
    const { bucket } = splitAssetPath(asset.path);
    if (actions?.bins) return sortedDirs.filter(dir => dir.startsWith(bucket + '/')).map(dir => dir.slice(bucket.length + 1));
    const existing = assets
      .map((a) => splitAssetPath(a.path))
      .filter((p) => p.bucket === bucket && p.folder)
      .map((p) => p.folder as string);
    const pending = bucket === 'images' ? pendingFolders : [];
    return Array.from(new Set([...existing, ...pending])).sort();
  };

  /** A folder header accepts asset-row drops: moving the file into that directory. */
  const folderDropProps = (dir: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setDropDir(dir);
      }
    },
    onDragLeave: () => setDropDir((d) => (d === dir ? null : d)),
    onDrop: (e: React.DragEvent) => {
      const path = e.dataTransfer.getData(ASSET_DRAG_TYPE);
      setDropDir(null);
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      const { file } = splitAssetPath(path);
      if (dirOf(path) !== dir) handleMove(path, `${dir}/${file}`);
    },
  });

  return (
    <div
      className={`assets-panel${dragging ? ' dragging' : ''}`}
      data-testid="assets-panel"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(false);
          void importFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="panel-section">
        <h3>Assets</h3>
        <p className="hint">
          {actions ? 'Images, fonts and other files in this graphic. Import here, then place an image on the canvas.' : 'Images, video loops and Lottie animations bundled with this graphic. Drop files here to import them, then drag an asset onto the canvas to place it.'}
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={actions ? ASSET_ACCEPT : ACCEPT}
          style={{ display: 'none' }}
          data-testid="assets-import-input"
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="row" style={{ gap: 6 }}>
          <button className="primary" onClick={() => fileInput.current?.click()} data-testid="assets-import">
            {actions ? 'Import files…' : '+ Import assets…'}
          </button>
          {!actions && <button
            onClick={openInsertDialog}
            title="Insert a graphic from the template catalog into this project — it joins the canvas, timeline, and states without replacing anything"
            data-testid="assets-insert-template"
          >
            ✚ Template graphic…
          </button>}
          {!actions && <button onClick={newFolder} data-testid="assets-new-folder">🗀 New folder…</button>}
          {actions?.bins && <><select aria-label="New bin asset bucket" value={binBucket} onChange={event => setBinBucket(event.target.value)}>{order.map(bucket => <option key={bucket} value={bucket}>{bucket}</option>)}</select>
            <button aria-label="New asset bin" disabled={!!actions.bins.reason} onClick={() => editBin()}>+ Bin</button></>}
        </div>
        {binDraft?.from === null && binNameInput(binDraft)}
        {actions?.bins?.reason && <p role="alert">{actions.bins.reason}</p>}
        {note && <p role={note.startsWith('✗') ? 'alert' : 'status'} className={note.startsWith('✗') ? 'status-bad' : 'hint'} style={{ marginTop: 8 }}>{note}</p>}
        {actions && <p className="hint">Drop files here to import without placing. SVG files are image assets; editable SVG artwork uses Import graphic.</p>}
      </div>

      {sortedDirs.length > 0 && (
        <div className="panel-section">
          {sortedDirs.map((dir) => (
            <div key={dir} className={`asset-folder${dropDir === dir ? ' drop-target' : ''}`} {...folderDropProps(dir)}>
              <div className="asset-folder-head">{actions?.bins && dir.includes('/') ? <>
                <button aria-label={(collapsedBins.includes(dir) ? 'Expand' : 'Collapse') + ' bin ' + dir.slice(dir.indexOf('/') + 1)} aria-expanded={!collapsedBins.includes(dir)} onClick={() => setCollapsedBins(current => current.includes(dir) ? current.filter(item => item !== dir) : [...current, dir])}>{collapsedBins.includes(dir) ? '▸' : '▾'}</button>
                {binDraft?.from === dir ? binNameInput(binDraft) : <button aria-label={'Bin ' + dir.slice(dir.indexOf('/') + 1)} aria-pressed={selectedBin === dir} onClick={() => { setSelectedBin(dir); setSelectedPath(null); }} onDoubleClick={() => editBin(dir)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); editBin(dir); } }}>{dir.slice(dir.indexOf('/') + 1)}</button>}
                <small>{dir.split('/')[0]} · Bin</small>
                {selectedBin === dir && <button aria-label="Remove empty asset bin" disabled={(groups.get(dir)?.length ?? 0) > 0} onClick={() => {
                  try { actions.bins!.execute({ kind: 'bin.remove', dir }, actions.bins!.revision()); setSelectedBin(null); setNote(null); }
                  catch (error) { setNote('✗ ' + (error instanceof Error ? error.message : String(error))); }
                }}>×</button>}
              </> : dir + '/'}</div>
              {collapsedBins.includes(dir) ? null : (groups.get(dir) as AssetFile[]).length === 0 ? (
                <p className="hint asset-folder-empty">{actions?.bins ? 'Empty. Drag an asset here.' : 'empty — drag an asset here (kept until reload)'}</p>
              ) : (
                (groups.get(dir) as AssetFile[]).map((a) => (
                  <AssetRow
                    key={a.path}
                    asset={a}
                    refs={referenceCount(template, a.path)}
                    selected={a.path === selectedPath}
                    onSelect={() => { setSelectedPath(a.path); setSelectedBin(null); }}
                  />
                ))
              )}
            </div>
          ))}
          {assets.length > 0 && (
            <p className="hint asset-totals">
              {assets.length} / {PUBLISH_MAX_ASSETS} assets · {fmtBytes(totalBytes)} of {fmtBytes(PUBLISH_MAX_TOTAL)} (community-publish limits)
            </p>
          )}
        </div>
      )}

      {actions?.sound && <SoundsControls template={template} onEdit={actions.sound} />}
      {selected && <><AssetInfoSection key={selected.path} asset={selected} bins={!!actions?.bins} binReason={actions?.bins?.reason} bucketFolders={foldersFor(selected)} onMove={handleMove} onRemove={actions ? path => {
        try { actions.remove(path); setNote(null); } catch (error) { setNote('✗ ' + (error instanceof Error ? error.message : String(error))); }
      } : undefined} />
        {actions && isImageAsset(selected.path) && <><div className="row"><button disabled={!!actions.placeReason} onClick={() => actions.place(selected)}>Place image</button>
          {actions.replace && <button onClick={() => actions.replace?.(selected)}>Replace selected image</button>}</div>
          {actions.placeReason && <p className="hint">{actions.placeReason}</p>}</>}
      </>}
    </div>
  );
}
