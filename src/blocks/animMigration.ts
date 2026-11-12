import { losslessAnimData } from './animData';
import { STOP_AGAIN_GUARD_JS, writeOutData } from '../templates/shared/animRuntime';
import { upgradeSvgFitRuntime } from '../assets/svgFitUpgrade';

export { hasLoopRuntime } from '../templates/shared/animRuntime';

/**
 * The raster stretch runtime's edge walk as a design imported before #924 carries it, and as it is
 * now. The old walk summed offsets past the canvas into the renderer's page, so on an OGraf
 * renderer that does not put its stage at the page origin the design stretched short, or too far
 * when it grows leftward (issue #925). The runtime is written into a design's own code at import,
 * so a saved design keeps the line until it is upgraded here.
 */
const OLD_STRETCH_EDGE_WALK = 'for (var el = box; el; el = el.offsetParent) x += el.offsetLeft;';
const STRETCH_EDGE_WALK = 'for (var el = box; el && el !== document.body; el = el.offsetParent) x += el.offsetLeft;';

/**
 * The infographic and competition scaffolds' `stop()` bodies as a design saved before #759 carries
 * them: a repeated Stop killed the running exit and froze the graphic on air. Only these exact
 * bodies are upgraded, so a stop() someone rewrote stays as written. The guard goes in front.
 */
const OLD_STOP_OPENING = 'function stop() {\n  if (activeTl) activeTl.kill();\n';
const STOP_UPGRADES = [
  '  activeTl = buildOutTimeline();\n}',
  "  gsap.killTweensOf('*');\n  activeTl = buildOutTimeline();\n  return activeTl;\n}",
].map((rest) => [OLD_STOP_OPENING + rest, `function stop() {\n  ${STOP_AGAIN_GUARD_JS}\n  if (activeTl) activeTl.kill();\n${rest}`]);

/** Use the same known runtime for preview, save and export; preserve foreign source. */
export function prepareOutRuntime(js: string): string {
  js = js.split(OLD_STRETCH_EDGE_WALK).join(STRETCH_EDGE_WALK);
  js = upgradeSvgFitRuntime(js);
  for (const [old, upgraded] of STOP_UPGRADES) js = js.split(old).join(upgraded);
  const data = losslessAnimData(js);
  if (!data) return js;
  if (data.steps.length === 1) {
    if (data.machine) return js;
    data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  }
  return writeOutData(js, data) ?? js;
}
