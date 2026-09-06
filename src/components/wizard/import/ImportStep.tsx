import { useRef, useState } from 'react';
import { CATEGORIES, type AssemblerId } from '../../../model/wizard';
import type { AssetFile } from '../../../model/types';
import { fileToDataUrl, isImageAsset, uniqueAssetPath } from '../../../assets/assetUtils';
import ProjectFormatPicker from '../../ProjectFormatPicker';
import { draftFormatSelection, formatDraftPatch } from '../draft/format';
import type { DraftPatch, WizardDraft } from '../draft/core';

interface Props {
  images: AssetFile[];
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  onImages: (images: AssetFile[]) => void;
  onContinue: (category: AssemblerId) => void;
}

/**
 * "Images" — the catalog continuation of the Create-with-AI step: review the dropped
 * images, add more, pick what you're making, and continue into the template picker with
 * logo-slot designs first and the first image pre-placed. (Existing-template import lives
 * in the Create-with-AI step itself; this step is images-only.)
 */
export default function ImportStep({ images, draft, onDraft, onImages, onContinue }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [category, setCategory] = useState<AssemblerId>('lower-third');

  const addFiles = async (files: FileList | File[]) => {
    const next = [...images];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await fileToDataUrl(file);
      next.push({ path: uniqueAssetPath(file.name, next), data: dataUrl });
    }
    onImages(next);
  };

  return (
    <div>
      <ProjectFormatPicker
        value={draftFormatSelection(draft)}
        onChange={(selection) => onDraft(formatDraftPatch(selection))}
        idPrefix="legacy-import-format"
        description="Choose the project canvas before images are placed into a catalog design."
      />

      <div
        className={`wz-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
        />
        <strong>Add more images</strong>
        <span className="hint">Logos work best as PNG with transparency.</span>
      </div>

      {images.length > 0 && (
        <div className="asset-grid" style={{ marginTop: 14 }}>
          {images.filter((a) => isImageAsset(a.path)).map((a) => (
            <div className="asset-card" key={a.path}>
              <div className="asset-thumb">
                <img src={typeof a.data === 'string' ? a.data : ''} alt={a.path} />
              </div>
              <div className="asset-path" title={a.path}>{a.path.replace('assets/', '')}</div>
              <button onClick={() => onImages(images.filter((x) => x.path !== a.path))}>✕ Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="panel-section" style={{ marginTop: 18 }}>
        <h3>What are you making with these?</h3>
        <select value={category} onChange={(e) => setCategory(e.target.value as AssemblerId)}>
          {/* 'imported' is not something you make WITH an image — it IS the image (the
              Import graphic entry). See CategoryInfo.group. */}
          {CATEGORIES.filter((c) => c.group !== 'imported').map((c) => (
            <option key={c.id} value={c.id} disabled={!c.available}>
              {c.name}{c.available ? '' : ' — coming soon'}
            </option>
          ))}
        </select>
        <p className="hint" style={{ marginTop: 6 }}>
          Designs with a logo slot are shown first; your first image is placed automatically.
        </p>
      </div>

      <button className="primary" disabled={images.length === 0} onClick={() => onContinue(category)}>
        Continue with {images.length} image{images.length === 1 ? '' : 's'} ›
      </button>
    </div>
  );
}
