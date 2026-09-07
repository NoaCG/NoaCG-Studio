import { useEffect, useRef, useState } from 'react';
import type { AssetFile, Resolution } from '../../../model/types';
import type { ProjectFormatSelection } from '../../../model/projectFormat';
import type { DesignArt } from '../../../model/wizard';
import { fileToDataUrl, uniqueAssetPath } from '../../../assets/assetUtils';
import { probeAsset } from '../../../assets/assetInfo';
import { importSvgMarkup, isSvgFile, type SvgImportResult } from '../../../assets/svgImport';
import { isTemplateFile, type ImportedTemplateResult } from '../../../model/importTemplate';
import ProjectFormatPicker from '../../ProjectFormatPicker';
import SectionHead from '../SectionHead';

interface Props {
  art: DesignArt | null;
  images: AssetFile[];
  resolution: Resolution;
  format: ProjectFormatSelection;
  onFormat: (format: ProjectFormatSelection) => void;
  onArt: (art: DesignArt, images: AssetFile[]) => void;
  onClear: () => void;
  /** A dropped .html/.zip TEMPLATE that was parsed, rather than artwork to place fields on. */
  templateFile: ImportedTemplateResult | null;
  onTemplateFile: (file: File) => void;
  onClearTemplate: () => void;
  /** Why the dropped template file could not be read (the parse is the wizard's). */
  fileError: string | null;
  /** A dropped SVG, parsed + sanitized + inventoried (docs/SVG_IMPORT_PLAN.md). */
  svg: SvgImportResult | null;
  onSvg: (svg: SvgImportResult) => void;
  onClearSvg: () => void;
}

/** Which of `take`'s tiers a file falls in, named in the order `take` itself tries them. */
type ImportFileKind = 'template' | 'svg' | 'raster';

const importFileKind = (file: File): ImportFileKind | 'unsupported' => {
  if (isTemplateFile(file)) return 'template';
  if (isSvgFile(file)) return 'svg';
  if (file.type.startsWith('image/')) return 'raster';
  return 'unsupported';
};

/**
 * SEVERAL FILES DROPPED AT ONCE, AND ONE OF THEM TAKEN (docs/backlog/dropping-several-files-at-
 * once.md). The owner dropped a handful of boards, watched one import, and was told nothing about
 * the other four - the worst of the available behaviours, because it looks like it worked.
 *
 * One graphic is still built from ONE design: everything from here to Finish asks about a single
 * artwork - one canvas, one erase pass, one field placement, one motion choice - so the answer is
 * not to import five, it is to stop being silent about the four. The user loses nothing they
 * cannot redo by dragging the next file in, and now they can see whether the right one won.
 *
 * THE SKIPPED FILES ARE SPLIT IN TWO, because the halves need different sentences. Another design
 * can be dragged in on its own and become its own graphic, so it gets that invitation. A file this
 * step cannot read never can, so it is named WITHOUT the invitation: promising that a readme will
 * become its own graphic sends someone back to drag in a file that errors out.
 *
 * THE REASON SENTENCE IS ADDED ONLY WHEN THE DROP HELD MORE THAN ONE KIND OF USABLE FILE. That is
 * when a ranking happened the user cannot see: a template outranks an SVG and an SVG outranks a
 * raster, whatever order they were dragged in, so a picture and an SVG together import the SVG and
 * unexplained that reads as random. With a single kind nothing was ranked - five pictures are
 * equal and the first won - and explaining why "the image" was chosen would imply the others were
 * not images. An unreadable file is not a competing kind either. The raster tier therefore never
 * carries a reason at all: it is reached only when the drop held no template and no SVG.
 */
const multiDropMessage = (dropped: File[], used: File, kind: ImportFileKind) => {
  if (dropped.length < 2) return null;
  // One pass over the skipped files answers all three questions: which of them are designs the
  // user could bring in next, which are files this step cannot read, and which usable kinds were
  // in the drop at all. `kinds` starts with the winner's own kind, so it ends up holding exactly
  // the usable kinds present.
  const designs: string[] = [];
  const unreadable: string[] = [];
  const kinds = new Set<ImportFileKind>([kind]);
  for (const file of dropped) {
    if (file === used) continue;
    const fileKind = importFileKind(file);
    if (fileKind === 'unsupported') {
      unreadable.push(file.name);
    } else {
      designs.push(file.name);
      kinds.add(fileKind);
    }
  }
  const reason =
    kinds.size < 2 || kind === 'raster'
      ? ''
      : kind === 'template'
        ? ' The template was used because it is already a finished graphic.'
        : ' The SVG was used because it is the better import: its text layers become fields.';
  const others = designs.length
    ? ` Not used: ${designs.join(', ')}. One graphic is built from one design. Bring the others in one at a time - each becomes its own graphic.`
    : '';
  const junk = unreadable.length
    ? ` ${unreadable.join(', ')} ${unreadable.length === 1 ? 'is not a design file' : 'are not design files'}, so nothing was read from ${unreadable.length === 1 ? 'it' : 'them'}.`
    : '';
  return { text: `Used ${used.name}.${reason}${others}${junk}`, fromTemplate: kind === 'template' };
};

/**
 * "Import graphic", step 1 — bring in the finished artwork.
 *
 * ONE image, and it IS the design (not a logo dropped into someone else's template). Any
 * raster format the browser decodes is accepted — the flow works off the decoded pixels, so
 * PNG, JPEG, WebP, GIF and AVIF are the same to it. Its natural size is MEASURED here rather
 * than assumed: it decides the graphic's size, whether the design covers the frame or floats
 * inside it, and where the text defaults land. Guessing any of that would put the user's
 * artwork somewhere they didn't draw it.
 *
 * THE SAME ZONE TAKES A FINISHED TEMPLATE (.html / .zip). "I already have this graphic" is
 * the same errand as "I already have this picture" — both arrive here holding something made
 * elsewhere and wanting it usable in a production — so the flow reads the file, not the
 * user's route to it. A template file skips artwork preparation entirely (there is nothing to
 * erase and no field to place: it already declares its own) and goes straight to Finish,
 * where it joins a production or exports like anything else.
 */
export default function ImportDesignStep({
  art,
  images,
  resolution,
  format,
  onFormat,
  onArt,
  onClear,
  templateFile,
  onTemplateFile,
  onClearTemplate,
  fileError,
  svg,
  onSvg,
  onClearSvg,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiDropNotice, setMultiDropNotice] = useState<ReturnType<typeof multiDropMessage>>(null);
  /** Is the "Need help exporting SVG?" answer open? Closed on arrival: the step still says its
   *  piece in one line, and a wall of menu paths nobody asked for is the clutter the owner
   *  ruled against. */
  const [exportHelp, setExportHelp] = useState(false);

  const preview = art ? images.find((a) => a.path === art.path) : null;
  const fullFrame = !!art && art.width === resolution.width && art.height === resolution.height;
  const scaled = !!art && art.sourceWidth != null;

  /**
   * Does this artwork carry transparency at all? A graphic that fills the frame with no
   * transparent pixel anywhere COVERS THE LIVE PICTURE - correct for a full-screen card, and
   * the commonest thing to get wrong when a lower third is exported with the footage or the
   * mock-up background still behind it. Nothing here blocks: a full-frame card is a real
   * graphic, so this states the fact and names both readings.
   *
   * `probeAsset` samples a 64x64 downscale, so it answers "any transparency anywhere" rather
   * than a proportion - which is exactly the question. Unknown (a canvas readback the browser
   * refused) says nothing at all, since a guess here would be a warning about someone's
   * correct file.
   */
  const [opaque, setOpaque] = useState(false);
  useEffect(() => {
    if (!preview) {
      setOpaque(false);
      return;
    }
    let alive = true;
    void probeAsset(preview)
      .then((info) => alive && setOpaque(info.hasAlpha === false))
      .catch(() => alive && setOpaque(false));
    return () => {
      alive = false;
    };
  }, [preview]);

  /** The artwork's real pixel size — an <img> is the only thing that actually knows it. */
  const measure = (dataUrl: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = dataUrl;
    });

  /**
   * The design-space size: artwork larger than the frame is scaled down to FIT it, because a
   * larger file is almost always the same design exported at higher resolution (a 2× / retina
   * export), and placing it at natural size would push most of it off the frame. The file keeps
   * every pixel — only the display size shrinks — and the real size is kept for the summary.
   */
  const fitToFrame = (size: { width: number; height: number }): Omit<DesignArt, 'path'> => {
    if (size.width <= resolution.width && size.height <= resolution.height) return size;
    const fit = Math.min(resolution.width / size.width, resolution.height / size.height);
    return {
      width: Math.round(size.width * fit),
      height: Math.round(size.height * fit),
      sourceWidth: size.width,
      sourceHeight: size.height,
    };
  };

  const take = async (files: FileList | File[]) => {
    setError(null);
    setMultiDropNotice(null);
    // A finished template first: it is decided by the FILE, so dropping one here never has to
    // be a different gesture from dropping the picture it was made from.
    const dropped = Array.from(files);
    const template = dropped.find(isTemplateFile);
    if (template) {
      onTemplateFile(template);
      setMultiDropNotice(multiDropMessage(dropped, template, 'template'));
      return;
    }
    // An SVG before the raster path: its MIME type is image/*, so without this branch it
    // would fall into the pixel measurement below and die at the no-intrinsic-size check.
    // A vector file is not a defect to explain — it is the better import (the SVG road,
    // docs/SVG_IMPORT_PLAN.md): parsed, sanitized, its text layers offered as fields.
    const svgFile = dropped.find(isSvgFile);
    if (svgFile) {
      try {
        onSvg(importSvgMarkup(await svgFile.text()));
        setMultiDropNotice(multiDropMessage(dropped, svgFile, 'svg'));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    // Any image the browser can decode is welcome — the pipeline works off the decoded
    // pixels, never the container, so PNG, JPEG, WebP, GIF and AVIF all behave the same.
    // (Erasing baked-in text re-encodes to PNG, so a lossy original never loses more.)
    const file = dropped.find((f) => f.type.startsWith('image/'));
    if (!file) {
      setError('That is neither an image nor a template file. Bring in your finished design as a PNG, JPEG or WebP, or a graphic you already have as .html or .zip.');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const size = await measure(dataUrl);
      // A vector file with no intrinsic size measures 0 × 0, and every downstream number
      // (the design's size, the placement defaults, the erase rect) is derived from it —
      // so say what is wrong instead of creating a zero-sized design.
      if (size.width < 1 || size.height < 1) {
        setError('That image has no fixed pixel size. Export it at the size you want it on air and drop it again.');
        return;
      }
      // One design per graphic: a second drop REPLACES the artwork rather than piling up.
      const asset: AssetFile = { path: uniqueAssetPath(file.name, []), data: dataUrl };
      onArt({ path: asset.path, ...fitToFrame(size) }, [asset]);
      setMultiDropNotice(multiDropMessage(dropped, file, 'raster'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <ProjectFormatPicker
        value={format}
        onChange={onFormat}
        disabled={!!art || !!templateFile || !!svg}
        idPrefix="import-design-format"
        description={
          templateFile
            ? 'A finished template brings its own canvas — this is what it is read back against.'
            : art || svg
              ? 'Remove the current artwork before changing its authored canvas.'
              : 'Choose the canvas before artwork is measured and placed.'
        }
      />

      {/* ONE LINE PER THING, AND AN ⓘ FOR THE REST (GOALS goal 4): the drop zone carries one
          line; what each format buys lives behind this dot. */}
      {!art && !templateFile && !svg && (
        <SectionHead title="Your design" summary="the artwork you already made" testid="import-design-why">
          <p>
            An <strong>SVG</strong> from Illustrator, Figma or Inkscape is the best import. It
            stays pixel-exact, and its text layers become editable fields on their own.
          </p>
          <p>
            PNG, JPEG and WebP work too. You place the text fields yourself, in the next steps.
          </p>
          <p>
            Use a format that carries transparency (SVG, PNG, WebP) and the video shows through
            behind your graphic.
          </p>
          <p>
            Already have the finished graphic as <strong>.html</strong> or <strong>.zip</strong>?
            Drop that instead. It comes in as it is, with its own fields.
          </p>
        </SectionHead>
      )}

      {/*
       * THE HELP GOES WHERE THE FILE IS DROPPED (owner, 2026-08-29). The export settings that
       * decide whether an SVG imports well were only in the docs, and the owner's ruling on that
       * is blunt: "people are not going to go into the documentation to get this information.
       * They need it when they are about to upload their SVG." So the three rules that actually
       * decide it, plus where Export lives in each app, sit on the drop step itself.
       *
       * ABOVE THE DROP ZONE, AND ASKED AS A QUESTION (owner walk, 2026-09-01). It used to sit
       * under the zone as another ⓘ head, and the owner walked straight past it: he dragged a
       * file in and continued. Nothing below the target of the gesture gets read, and a dot
       * that looks like the four other dots on the step does not say it holds the answer to
       * "how do I get my SVG out of Illustrator". So it leads, it is a QUESTION in the words
       * someone would ask it in, and the amber mark is the step's one accent — his own ruling:
       * "possibly using NoaCG yellow sparingly to draw attention. Avoid adding lots of text or
       * visual clutter."
       *
       * Still ONE LINE + the rest behind a press (GOALS goal 4): the summary IS the three rules,
       * in three words each, and the per-app menu path opens under it. It stays while an SVG is
       * loaded too, because "no text layers found, re-export" is exactly when someone needs the
       * Illustrator checkbox named. A raster or .html/.zip drop hides it: nothing to re-export.
       */}
      {!art && !templateFile && (
        <div className="wz-help-strip-wrap">
          <button
            type="button"
            className={`wz-help-strip${exportHelp ? ' open' : ''}`}
            aria-expanded={exportHelp}
            onClick={() => setExportHelp((o) => !o)}
            data-testid="import-svg-export-why"
          >
            <span className="wz-help-strip-mark" aria-hidden="true">?</span>
            <strong>Need help exporting SVG?</strong>
            <span className="muted">named layers, live text, one artboard</span>
            <span className="wz-help-strip-chev" aria-hidden="true">{exportHelp ? '▴' : '▾'}</span>
          </button>
          {exportHelp && (
            <div className="wz-why hint" data-testid="import-svg-export-why-body">
              <p>
                <strong>Name your layers.</strong> The names become the labels your operator
                reads. "Home team" beats "Rectangle_3".
              </p>
              <p>
                <strong>Keep text as text.</strong> Do not convert it to outlines. Live text is
                what becomes an editable field.
              </p>
              <p>
                <strong>One artboard, at the size you want on air.</strong> 1920 &times; 1080 with
                a transparent background is the safe one.
              </p>
              <p>
                <strong>Embed your pictures.</strong> A linked image is dropped on the way in.
              </p>
              <p>Where Export lives:</p>
              <ul>
                <li>
                  <strong>Illustrator</strong> &middot; File &gt; Export &gt; Export As&hellip; &gt;
                  SVG. Font: <strong>SVG</strong>. Images: <strong>Embed</strong>. Object IDs:{' '}
                  <strong>Layer Names</strong>.
                </li>
                <li>
                  <strong>Figma</strong> &middot; select the frame, Export &gt; SVG. Include "id"
                  attribute <strong>on</strong>. Outline text <strong>off</strong>.
                </li>
                <li>
                  <strong>Inkscape</strong> &middot; File &gt; Save As&hellip; &gt; Plain SVG. Do
                  not run Object to Path on your text.
                </li>
              </ul>
              <p>
                The rest is in the{' '}
                <a href="/docs#svg" target="_blank" rel="noreferrer">
                  SVG import guide
                </a>
                .
              </p>
            </div>
          )}
        </div>
      )}

      {/* Once the design is in, the drop zone steps DOWN to a quiet swap target: keeping it
          at full height would give the loudest element on the step to an action the user has
          already finished, and push everything that still matters below the fold. */}
      <div
        className={`wz-drop ${art || templateFile || svg ? 'compact' : ''} ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void take(e.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.svg,.html,.htm,.zip"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ''; }}
        />
        <strong>
          {art || templateFile || svg ? 'Drop another file to replace it' : 'Drop your finished design here'}
        </strong>
        {/* ONE LINE (GOALS goal 4): the drop zone says what to do; the format detail — why an
            SVG beats a PNG, what transparency buys, the .html/.zip door — moved to the ⓘ
            beside the step title above. */}
        {!art && !templateFile && !svg && (
          <span className="hint">
            A layered <strong>SVG</strong> is best. PNG, JPEG, WebP, .html and .zip work too.
          </span>
        )}
      </div>

      {(error || fileError) && (
        <p className="status-bad" style={{ marginTop: 10 }} data-testid="import-drop-error">✗ {error ?? fileError}</p>
      )}

      {/* `fileError` silences this notice ONLY when the file it names is the template that failed
          to parse - otherwise "Used card.zip" would sit above the line saying card.zip could not
          be read. It must not silence the notice in any other case: that error belongs to the
          PARENT and is cleared only by a template drop or the template card's ✕, so a rejected
          .zip leaves it on screen with no card and no button to clear it. Gating on it blindly
          would then hide the notice from the next five-picture drop - the exact silence this
          whole notice exists to end, two gestures in. `error` is this component's own and is
          cleared at the top of every `take`, so it is always about the drop just made. */}
      {multiDropNotice && !error && !(multiDropNotice.fromTemplate && fileError) && (
        <p className="status-warn" style={{ marginTop: 10 }} data-testid="import-multi-drop-notice">
          {multiDropNotice.text}
        </p>
      )}

      {templateFile && (
        <div className="panel-section" style={{ marginTop: 16 }} data-testid="import-template-card">
          <h3>Your template</h3>
          <p>
            <strong>{templateFile.template.name}</strong>{' '}
            <span className="hint mono">
              {templateFile.template.resolution.width} × {templateFile.template.resolution.height}
              {templateFile.detection.fps ? ` · ${templateFile.detection.fps} fps` : ''}
            </span>
          </p>
          {/* The FIELDS are the whole point of importing a template rather than a picture:
              they are what an operator types into, on the control page and in playout. Naming
              them here is what turns "it opened" into "it is usable". */}
          {templateFile.template.fields.length > 0 ? (
            <p className="hint" data-testid="import-template-fields">
              {templateFile.template.fields.length} operator field
              {templateFile.template.fields.length === 1 ? '' : 's'}:{' '}
              {templateFile.template.fields.map((f) => f.title || f.field).join(', ')}
            </p>
          ) : (
            <p className="status-bad" data-testid="import-template-nofields">
              No operator fields were found in this file, so there is nothing to type into on
              air. It can still be exported and played out as a fixed graphic.
            </p>
          )}
          {templateFile.detection.messages.map((m) => (
            <p className="hint" key={m}>{m}</p>
          ))}
          <button onClick={() => { setMultiDropNotice(null); onClearTemplate(); }}>
            ✕ Use a different file
          </button>
        </div>
      )}

      {svg && (
        <div className="panel-section" style={{ marginTop: 16 }} data-testid="import-svg-card">
          <h3>Your design</h3>
          <p>
            <strong>SVG artwork</strong>{' '}
            <span className="hint mono">{svg.width} × {svg.height}</span>
          </p>
          {/* The text layers are the whole point of an SVG import: each becomes an operator
              field with the designer's exact typography. Counting them here is what turns
              "it opened" into "it is bindable". */}
          {svg.candidates.length > 0 ? (
            <p className="hint" data-testid="import-svg-layers">
              {svg.candidates.length} text layer{svg.candidates.length === 1 ? '' : 's'} found.
              Pick which ones the operator can retype, next step.
            </p>
          ) : (
            <p className="status-warn" data-testid="import-svg-nolayers">
              No text layers here. The type was probably turned into outlines on export
              (Illustrator: Fonts set to “Convert to outlines”; Figma: “Outline text” ticked).
              It still imports pixel-exact as a fixed graphic. For editable text, re-export
              keeping text as text and drop the new file here.
              {svg.outlines.length > 0
                ? ' Or, next step, tick a group of shapes that was text and a live line takes its place.'
                : ''}
            </p>
          )}
          {svg.fonts.length > 0 && (
            <p className="hint" data-testid="import-svg-fonts">
              Typeface{svg.fonts.length === 1 ? '' : 's'}: {svg.fonts.map((f) => f.family).join(', ')}
            </p>
          )}
          {svg.notices.map((n) => (
            <p className="hint" key={n}>{n}</p>
          ))}
          <button onClick={() => { setMultiDropNotice(null); onClearSvg(); }}>
            ✕ Use a different design
          </button>
        </div>
      )}

      {art && preview && (
        <div className="panel-section" style={{ marginTop: 16 }}>
          <h3>Your design</h3>
          <div className="asset-card" style={{ maxWidth: 320 }}>
            <div className="asset-thumb">
              <img src={typeof preview.data === 'string' ? preview.data : ''} alt={art.path} />
            </div>
            <div className="asset-path" title={art.path}>{art.path.replace('images/', '')}</div>
            <div className="hint mono" style={{ marginBottom: 6 }}>
              {art.sourceWidth ?? art.width} × {art.sourceHeight ?? art.height}
            </div>
            <button onClick={() => { setMultiDropNotice(null); onClear(); }}>
              ✕ Use a different design
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {fullFrame && scaled
              ? `A ${Math.round((art.sourceWidth! / art.width) * 10) / 10}× export of the ${resolution.width} × ${resolution.height} frame — shown frame-sized, edge to edge, exactly as you drew it (the extra resolution keeps it sharp).`
              : fullFrame
                ? `Frame-sized (${resolution.width} × ${resolution.height}) — it will sit exactly where you drew it, edge to edge.`
                : scaled
                  ? `Larger than the ${resolution.width} × ${resolution.height} frame, so it is scaled down to fit it (the extra resolution keeps it sharp) and placed as an object you can position.`
                  : `Smaller than the ${resolution.width} × ${resolution.height} frame, so it is placed as an object you can position and resize.`}
          </p>
          {fullFrame && opaque && (
            <p className="status-warn" data-testid="import-opaque-warning">
              This artwork fills the frame and has no transparent areas, so on air it covers the
              whole picture. Right for a full-screen card. Wrong for a lower third exported with
              its background behind it. If the video should show through, export again as PNG or
              WebP with a transparent background.
            </p>
          )}
          {!scaled &&
            art.width / art.height === resolution.width / resolution.height &&
            (art.width < resolution.width || art.height < resolution.height) && (
              <p className="status-bad" data-testid="import-raster-warning">
                This source is smaller than the project canvas. It stays at native pixel size;
                enlarging it to fill the frame would soften it.
              </p>
            )}
        </div>
      )}

      <div className="panel-section" style={{ marginTop: 14 }}>
        <h3>What happens next</h3>
        <p className="hint">
          {templateFile
            ? 'Name it, then send it to a production or export it: OGraf, CasparCG, SPX, LiveOS or an OBS/vMix overlay. Your file is kept exactly as you wrote it.'
            : svg
              ? 'Next you pick which text layers the operator can edit, match the typefaces, and choose how it moves on and off air. The SVG is never redrawn. Your exact artwork goes on air.'
              : 'Next you clean up the artwork if it needs it, place the text fields, and choose how it moves on and off air. Your artwork is never redrawn. NoaCG only adds the broadcast behaviour around it.'}
        </p>
      </div>
    </div>
  );
}
