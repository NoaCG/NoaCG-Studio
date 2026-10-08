// Step 1 (Video mode) - "Video or animation with AI": describe the animation, set the
// canvas (duration/aspect/fps/transparency), optionally upload assets, and create. The
// create itself is instant - generation runs in the video editor's chat, where iteration
// continues. A reopen strip surfaces saved video projects (open needs no account).

import { useMemo, useRef, useState } from 'react';
import { aiConfigured, loadAiSettings, saveAiSettings } from '../../../ai/settings';
import { useAuthState } from '../../auth/useAuthState';
import SignInPrompt from '../../auth/SignInPrompt';
import AiProviderSettings from '../../AiProviderSettings';
import { fileToDataUrl } from '../../../assets/assetUtils';
import { uniqueVideoAssetPath } from '../../../video/types';
import {
  guessPurpose,
  isReferencePurpose,
  type PurposedImage,
  type ReferencePurpose,
} from '../../../model/imagePurpose';
import { UploadCard } from './ai/UploadCard';
import {
  resolutionForSelection,
  type ProjectFormatSelection,
} from '../../../model/projectFormat';
import {
  createDefaultVideoProject,
  VIDEO_ENGINES,
  type VideoEngine,
  type VideoProject,
} from '../../../model/videoTypes';
import { listSavedVideoProjects, loadCurrentVideoProject } from '../../../model/videoProject';
import { useDocKindStore } from '../../../store/docKindStore';
import ProjectFormatPicker from '../../ProjectFormatPicker';

const ASSET_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,.mov';
/** Same hard cap as the Assets panel - assets ride in the render upload + autosave. */
const MAX_ASSET_BYTES = 3_000_000;

/**
 * The starter suggestions. Each carries the canvas settings that match its prompt, so
 * tapping one loads a self-consistent brief (the duration in the words matches the field)
 * - they double as the feature's acceptance tests: each should reliably produce a genuinely
 * good result out of the box.
 */
interface Example {
  label: string;
  prompt: string;
  durationSec: number;
  transparent: boolean;
}
const EXAMPLES: Example[] = [
  {
    label: 'Sports stinger',
    prompt:
      'A 3-second stinger to cut between plays in a live match broadcast. Fast, physical and unmistakably sport - the team name has to land hard and clear out fast.',
    durationSec: 3,
    transparent: false,
  },
  {
    label: 'News intro',
    prompt:
      'A 5-second opener for a serious daily news bulletin. Authoritative and precise; the programme name is the hero, and it should look like it belongs to a channel with a house style.',
    durationSec: 5,
    transparent: false,
  },
  {
    label: 'Logo reveal',
    prompt:
      "A premium 2.5-second logo reveal for a brand's title card. Confident and memorable - commit to one device the piece is remembered by. If no logo image is provided, set the brand name in confident type - never a placeholder box.",
    durationSec: 2.5,
    transparent: false,
  },
  {
    label: 'Countdown',
    prompt:
      'A 5-second countdown into the start of a live show. Each number lands with intent and the anticipation builds to the final beat.',
    durationSec: 5,
    transparent: false,
  },
];

/** Clamp a raw duration string to the allowed range (min 1s, max 60s, half-second grid). */
function clampDuration(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(60, Math.max(1, Math.round(n * 2) / 2));
}

interface Props {
  format: ProjectFormatSelection;
  onFormat: (format: ProjectFormatSelection) => void;
  onCreate: (project: VideoProject) => void;
  onOpen: (project: VideoProject) => void;
}

export default function VideoStep({ format, onFormat, onCreate, onOpen }: Props) {
  const { needsSignIn } = useAuthState();
  const [settings, setSettings] = useState(loadAiSettings);
  const [showSettings, setShowSettings] = useState(!aiConfigured());
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState<VideoEngine>('remotion');
  // Kept as a string so the field can be temporarily cleared while editing; the value is
  // validated (clamped to 1-60s) on blur and again at create, not on every keystroke.
  const [durationText, setDurationText] = useState('6');
  const [transparent, setTransparent] = useState(false);
  // Uploads plus what each is FOR (model/imagePurpose.ts), the same four choices the SPX
  // wizard offers. They must be settled HERE: a video project is created instantly and its
  // first generation runs later in the shell, so a reference has to ride along on the project
  // to be read at all (VideoProject.assetUses).
  const [uploads, setUploads] = useState<PurposedImage[]>([]);
  const assets = useMemo(() => uploads.map((u) => u.asset), [uploads]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saved = listSavedVideoProjects();
  // The autosaved working video project - offered as "continue" when the user is currently
  // in the SPX shell (from the video shell it's already what they're editing).
  const docKind = useDocKindStore((s) => s.kind);
  const current = docKind === 'spx' ? loadCurrentVideoProject() : null;

  const resolution = resolutionForSelection(format);
  const fps = format.fps;

  const saveSetting = (patch: Parameters<typeof saveAiSettings>[0]) => {
    saveAiSettings(patch);
    setSettings(loadAiSettings());
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setAssetError(null);
    const next = [...uploads];
    for (const file of Array.from(files)) {
      const data = await fileToDataUrl(file);
      if (data.length > MAX_ASSET_BYTES) {
        setAssetError(`"${file.name}" is too large (3 MB per asset) - compress or trim it.`);
        continue;
      }
      const asset = { path: uniqueVideoAssetPath(file.name, next.map((u) => u.asset)), data };
      const purpose = file.type.startsWith('image/') ? await guessPurpose(asset) : 'asset';
      next.push({ asset, purpose });
    }
    setUploads(next);
  };

  const applyExample = (ex: Example) => {
    setPrompt(ex.prompt);
    setDurationText(String(ex.durationSec));
    setTransparent(ex.transparent);
  };

  const create = () => {
    const brief = prompt.trim();
    if (!brief) return;
    const durationSec = clampDuration(durationText);
    // Only the tagged ones are recorded; an absent map means "every asset is composition
    // material", which is exactly what an untagged upload is.
    const assetUses: Record<string, ReferencePurpose> = {};
    for (const u of uploads) {
      if (isReferencePurpose(u.purpose)) assetUses[u.asset.path] = u.purpose;
    }
    onCreate(
      createDefaultVideoProject({
        name: brief.length > 42 ? `${brief.slice(0, 42)}…` : brief,
        prompt: brief,
        engine,
        chat: [{ role: 'user', text: brief, at: new Date().toISOString() }],
        fps,
        width: resolution.width,
        height: resolution.height,
        durationInFrames: Math.max(1, Math.round(durationSec * fps)),
        transparent,
        assets,
        ...(Object.keys(assetUses).length ? { assetUses } : {}),
      }),
    );
  };

  return (
    <div data-testid="video-step">
      {/* Reopen strip - above any gate: opening a saved local project needs no account. */}
      {(saved.length > 0 || current) && (
        <div className="panel-section">
          <h3>Your videos</h3>
          <div className="row wrap" style={{ gap: 6 }}>
            {current && !saved.some((r) => r.id === current.id) && (
              <button
                className="wz-example"
                onClick={() => onOpen(current)}
                title="Continue the video project you were working on"
                data-testid="video-continue"
              >
                ↩ Continue: {current.name}
              </button>
            )}
            {saved.slice(0, 6).map((r) => (
              <button key={r.id} className="wz-example" onClick={() => onOpen(r.project)} title={`Open "${r.name}"`}>
                ▶ {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {needsSignIn ? (
        <SignInPrompt
          feature="Video or animation with AI"
          reason="Sign in to use AI."
        />
      ) : (
        <>
          <ProjectFormatPicker
            value={format}
            onChange={onFormat}
            idPrefix="video-format"
          />

          <div className="panel-section">
            <h3>Describe your video</h3>
            <div className="wz-engine-row" role="radiogroup" aria-label="Generation engine">
              {VIDEO_ENGINES.map((e) => (
                <button
                  key={e.id}
                  role="radio"
                  aria-checked={engine === e.id}
                  className={`wz-engine ${engine === e.id ? 'active' : ''}`}
                  onClick={() => setEngine(e.id)}
                  data-testid={`video-engine-${e.id}`}
                >
                  <span className="wz-engine-name">
                    {e.label}
                    {e.experimental && <span className="wz-engine-badge">Experimental</span>}
                  </span>
                  <span className="wz-engine-desc">{e.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="row wrap" style={{ marginBottom: 6, gap: 6 }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                className="wz-example"
                title={`Load this example: ${ex.prompt}`}
                onClick={() => applyExample(ex)}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <textarea
            rows={4}
            placeholder={'e.g. "A fast 3-second sports stinger with sharp geometric shapes and a dramatic reveal of my uploaded logo."'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            data-testid="video-prompt"
          />

          <div className="row wrap" style={{ marginTop: 10, gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label>Duration (s)</label>
              <input
                type="number"
                min={1}
                max={60}
                step={0.5}
                value={durationText}
                onChange={(e) => setDurationText(e.target.value)}
                onBlur={() => setDurationText(String(clampDuration(durationText)))}
                style={{ width: 90 }}
                data-testid="video-step-duration"
              />
            </div>
            <label className="row" style={{ gap: 6, alignItems: 'center', paddingBottom: 6 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              Transparent
            </label>
          </div>

          <div className="row wrap" style={{ marginTop: 10, alignItems: 'center' }}>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ASSET_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button onClick={() => fileInput.current?.click()}>🖼 Add logo / images / video…</button>
          </div>
          {uploads.length > 0 && (
            <div className="wz-uploads" data-testid="video-uploads">
              {uploads.map((item) => (
                <UploadCard
                  key={item.asset.path}
                  item={item}
                  // A video clip has no purpose to choose: it is footage, always composition
                  // material. Offering "take the look and feel" for one would be nonsense.
                  choosable={typeof item.asset.data === 'string' && item.asset.data.startsWith('data:image/')}
                  showBinding={false}
                  onChange={(patch) =>
                    setUploads((current) =>
                      current.map((u) => (u.asset.path === item.asset.path ? { ...u, ...patch } : u)),
                    )
                  }
                  onRemove={() =>
                    setUploads((current) => current.filter((u) => u.asset.path !== item.asset.path))
                  }
                />
              ))}
            </div>
          )}
          {assetError && <p className="status-bad" style={{ marginTop: 6 }}>✗ {assetError}</p>}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="primary"
              disabled={!prompt.trim()}
              onClick={create}
              data-testid="video-create"
              title={aiConfigured(settings) ? undefined : 'No AI key configured - the project starts from an offline sample you can edit'}
            >
              ✦ Create video
            </button>
            <button onClick={() => setShowSettings((s) => !s)}>⚙ AI settings</button>
          </div>
          {!aiConfigured(settings) && (
            <p className="hint" style={{ marginTop: 6 }}>
              No AI key configured - creation works, using an offline sample generator. Add a
              key for real AI generation.
            </p>
          )}

          {showSettings && (
            <div className="panel-section" style={{ marginTop: 10 }}>
              <h3>AI settings</h3>
              <AiProviderSettings settings={settings} onChange={saveSetting} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
