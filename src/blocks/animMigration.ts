import { losslessAnimData } from './animData';
import { writeOutData } from '../templates/shared/animRuntime';

/** Use the same known runtime for preview, save and export; preserve foreign source. */
export function prepareOutRuntime(js: string): string {
  const data = losslessAnimData(js);
  if (!data) return js;
  if (data.steps.length === 1) {
    if (data.machine) return js;
    data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  }
  return writeOutData(js, data) ?? js;
}
