import { obsScenesOf, sceneLink } from '../../model/obsScenes';
import { MAX_EXPECTED_OUTPUTS } from '../../control/readiness';
import type { Show } from '../../model/shows';

/** The OBS scenes guide (docs/OBS_SCENES.md): browser source settings, the walk-through, the fallback
 *  and what each failure needs. */
export const OBS_SCENES_GUIDE_URL = 'https://github.com/NoaCG/NoaCG-Studio/blob/main/docs/OBS_SCENES.md';

/** What the panel and the settings say while the switch is on and no folder is a scene. */
export const NO_SCENES_YET = 'No OBS scenes yet. Mark a rundown folder as an OBS scene in its ⋯ menu.';

/** "<scene>: <link>", one line per scene: what "Copy all links" copies (obs-scenes OS3 M7). */
export function allSceneLinks(scenes: readonly { id: string; name: string }[], outputUrl: string): string {
  return scenes.map((scene) => `${scene.name}: ${sceneLink(outputUrl, scene.id)}`).join('\n');
}

/**
 * PLAYOUT SETTINGS' OBS SCENES SECTION (obs-scenes OS3 M7), shown while the switch is on: each scene
 * with its graphics and its own link, Copy per link, Copy all links, and the guide. A copy goes
 * through the production page's own copy, which also marks the output as set up.
 */
export default function ObsScenesSettings({ show, outputUrl, copied, onCopy }: {
  show: Show;
  /** The production's output link; null before the first publish. */
  outputUrl: string | null;
  /** What was copied last: `scene:<id>`, or `scene:*` for every link. */
  copied: string | null;
  onCopy: (kind: `scene:${string}`, text: string) => void;
}) {
  const scenes = obsScenesOf(show);
  return (
    <section aria-label="OBS scenes" data-testid="settings-obs-scenes">
      <p className="dlg-caption">OBS scenes</p>
      {scenes.length === 0 ? (
        <p className="hint">{NO_SCENES_YET}</p>
      ) : (
        <ul className="obs-scene-list">
          {scenes.map((scene) => {
            const link = outputUrl ? sceneLink(outputUrl, scene.id) : null;
            return (
              <li key={scene.id} data-testid="settings-obs-scene" data-scene={scene.id}>
                <strong>{scene.name}</strong>
                <span className="hint"> {scene.graphics.length > 0 ? scene.graphics.join(', ') : 'No graphics'}</span>
                <div className="pd-pp-url-row">
                  <code className="pd-pp-url" data-testid="settings-obs-scene-link">{link ?? 'Available after publishing'}</code>
                  <button type="button" disabled={!link} onClick={() => link && onCopy(`scene:${scene.id}`, link)} data-testid="settings-obs-scene-copy">
                    {copied === `scene:${scene.id}` ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {scenes.length > MAX_EXPECTED_OUTPUTS && (
        <p className="status-warn" data-testid="settings-obs-too-many">
          More than {MAX_EXPECTED_OUTPUTS} OBS scenes: NoaCG watches {MAX_EXPECTED_OUTPUTS} outputs, so a scene link beyond those that stops answering is not reported.
        </p>
      )}
      <div className="pd-pp-actions">
        <button
          type="button"
          disabled={!outputUrl || scenes.length === 0}
          onClick={() => outputUrl && onCopy('scene:*', allSceneLinks(scenes, outputUrl))}
          data-testid="settings-obs-copy-all"
        >
          {copied === 'scene:*' ? '✓ Copied' : 'Copy all links'}
        </button>
        <a href={OBS_SCENES_GUIDE_URL} target="_blank" rel="noopener" data-testid="settings-obs-guide">
          OBS scenes guide
        </a>
      </div>
    </section>
  );
}
