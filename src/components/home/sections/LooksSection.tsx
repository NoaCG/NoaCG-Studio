import { useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useTemplateStore } from '../../../store/templateStore';
import {
  addLook,
  applyLookToTemplate,
  captureLookFromTemplate,
  deleteLook,
  importLook,
  type SavedLook,
} from '../../../model/packets';
import { commitDurableWrites } from '../../../model/durableStore';
import { getDefaultBrandId, setDefaultBrand } from '../../../model/brand';
import { slug } from '../../../export/common';
import { IconDownload, IconPalette, IconUpload } from '../../icons';

/** The Brand looks section — moved verbatim from HomePage (step 8's split), emoji → icons. */
export default function LooksSection({ looks, onChanged, onDone }: { looks: SavedLook[]; onChanged: () => void; onDone: () => void }) {
  const template = useTemplateStore((s) => s.template);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);
  const [newLookName, setNewLookName] = useState('');
  // WHICH look new graphics start from, as a POINTER rather than a copy (model/brand.ts): the
  // row that owns it wears the star, and pressing "Use for new graphics" on another row moves
  // it. Held in state so the star moves on the press instead of on the next visit.
  const [defaultId, setDefaultId] = useState<string | null>(() => getDefaultBrandId());
  const [note, setNote] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const onImportLook = async (file: File | undefined) => {
    if (!file) return;
    const { error } = importLook(await file.text());
    // Confirmed before it says "imported" - the durable store reports a refusal after the call
    // returns (model/durableStore.ts). A look is a file the user still has, so this is the
    // mildest of the four, but a note that lies is a note that lies.
    const failure = error ?? (await commitDurableWrites());
    setNote(failure ?? '✓ Look imported.');
    onChanged();
  };

  return (
    <>
      <h2><IconPalette size={18} /> Brand looks</h2>
      <p className="hint">
        A look = colors + typeface + shape (corner radius, blur, edge, accent weight, tracking)
        captured as a named brand. Apply it to the graphic open in the editor, or use it as the
        default for new graphics. A design only takes the parts it actually uses.
      </p>
      <div className="row">
        <input
          className="grow"
          placeholder="Look name, e.g. Channel A7 red"
          value={newLookName}
          onChange={(e) => setNewLookName(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            addLook(newLookName || 'My look', captureLookFromTemplate(template));
            setNewLookName('');
            setNote('✓ Look saved from the graphic open in the editor.');
            onChanged();
          }}
        >
          Save current look
        </button>
        <input
          ref={importInput}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => { void onImportLook(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button onClick={() => importInput.current?.click()} title="Import a shared .look.json file">
          <IconUpload /> Import…
        </button>
      </div>
      {looks.map((look) => (
        <div className="lib-row lib-row-flat" key={look.id}>
          <span className="pk-swatches lib-row-icon" aria-hidden>
            {[look.brand.palette.accent, look.brand.palette.panel, look.brand.palette.text].map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </span>
          <div className="lib-info">
            <strong>
              {look.name}
              {look.id === defaultId && (
                <span title="New graphics start from this brand" aria-label="Default brand"> ★</span>
              )}
            </strong>
            <span className="muted">{look.brand.customFont?.family ?? look.brand.fontId ?? ''}</span>
          </div>
          <div className="lib-actions">
          <button
            onClick={() => {
              applyTemplate(applyLookToTemplate(template, look.brand));
              setActiveTab('css'); // land on the retinted :root vars, highlighted like any patch
              setNote(`✓ Applied "${look.name}" to the open graphic — back in the editor now.`);
              onDone();
            }}
            title="Retint the graphic open in the editor"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setDefaultBrand(look.id);
              setDefaultId(look.id);
              setNote(`✓ "${look.name}" is now the brand for new graphics.`);
            }}
            title="Preselect this brand where something has to choose one: a production's new graphics, and the star on Home"
            disabled={look.id === defaultId}
          >
            Use for new graphics
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ name: look.name, brand: look.brand }, null, 2)], { type: 'application/json' });
              saveAs(blob, `${slug(look.name)}.look.json`);
            }}
            title="Download as a shareable .look.json"
            aria-label={`Download ${look.name}`}
          >
            <IconDownload />
          </button>
          </div>
          <button
            onClick={() => {
              deleteLook(look.id);
              // The pointer goes with the record it named. `loadBrand` already resolves a dead
              // id to null, so this is tidiness rather than correctness - but a star that is
              // still SET on nothing would come back the moment an id was reused.
              if (look.id === defaultId) { setDefaultBrand(null); setDefaultId(null); }
              onChanged();
            }}
            title="Delete this look"
            aria-label={`Delete ${look.name}`}
          >✕</button>
        </div>
      ))}
      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'}>{note}</p>}
    </>
  );
}
