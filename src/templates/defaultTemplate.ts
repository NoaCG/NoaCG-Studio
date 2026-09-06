// Default template used on first load (behind the creation wizard): the store seeds itself from it.
// Delegates to the first wizard variant so there is a single source of truth.

import { lt01 } from './lowerThirds/lt01';
import type { SpxTemplate } from '../model/types';

export function createDefaultTemplate(): SpxTemplate {
  return lt01.create();
}
