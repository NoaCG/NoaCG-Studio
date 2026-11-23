// THE CRAWL: one line that travels (svg-template-library TL6: a ticker crawl, an end-credits crawl).
//
// The built-in marquee (tickers/tickerMotion.ts) on artwork: the designer draws ONE text layer,
// `Crawl`, where the run starts; the operator types the items one per line in Items, and the
// runtime prints them as one run, twice over, and moves it right to left at the built-in's pace
// times the operator's Scroll speed (%), clipped to its window. Everything that moves is the
// runtime's `crawl` rule (importedDesign/behaviourRuntime.ts); the recipe only declares it.
//
// NO MACHINE: a marquee has no state of its own, as the built-in marquee has none. The take starts
// the run again from where it was drawn (an entrance call); data keeps it moving from where it is.
//
// Items STARTS with the drawn text, so a take with nothing typed crawls the drawing.

import type { PaintRule } from '../../blocks/behaviourData';
import type { BehaviourRecipe } from './recipe';
import { rolesOf } from './recipe';

const ITEMS = 'items';
const SPEED = 'speed';

export const crawlRecipe: BehaviourRecipe = {
  id: 'crawl',
  name: 'Crawl',
  description: 'One line that travels across its window at a steady speed, looping without a seam.',
  category: 'ticker',
  defaultZone: 'bottom-center',
  roles: rolesOf('crawl'),
  fields: (ctx) => [
    { key: ITEMS, label: 'Items', kind: 'lines', value: ctx.drawn('crawl'), spec: { kind: 'lines' } },
    // The built-in marquee's field: a percentage of the pace the design ships at, 10 to 400.
    { key: SPEED, label: 'Scroll speed (%)', kind: 'number', value: '100' },
  ],
  path: () => ({ entrance: 'Crawling', entranceCalls: ['noacgCrawlRestart'] }),
  machine: () => ({}),
  controls: () => [],
  paint: (ctx): PaintRule[] => [
    { crawl: 'crawl', from: `${ITEMS}:joined`, speed: `${SPEED}:text`, ...(ctx.bound('crawl.window') ? { window: 'crawl.window' } : {}) },
  ],
};
