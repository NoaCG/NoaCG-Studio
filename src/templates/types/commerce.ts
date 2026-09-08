// The COMMERCE types — the graphics a live-shopping, auction, property or fundraising stream
// puts the actual offer on. None of them needs a state machine: a product card is content, the
// preset produces the steps, and the derived linear machine already describes it exactly. What
// they need is a FIELD CONTRACT that several looks can share, which is the other half of what a
// graphic type is for.
//
// THE ONE THING WORTH SAYING ABOUT ALL FOUR: every value that could vary by shop, currency,
// locale or format is a FIELD, not a design decision. The value's label ("Guide price" /
// "Current bid" / "Remaining"), the savings claim, the promo code, the deadline, the currency
// mark — each is text an operator types, and each disappears from the graphic when left blank
// (the designs use `:empty`, so there is no state to reset and nothing for a replay to leak).
// That is what lets ONE listing card serve a property walk-through, an auction lot and a stock
// counter instead of three near-identical designs, and it is the state schema's
// "parameterize with data, not states" rule applied to content.

import { paletteById } from '../../model/wizard';
import { card38 } from '../infoCards/card38';
import { card39 } from '../infoCards/card39';
import { card40 } from '../infoCards/card40';
import { card41 } from '../infoCards/card41';
import { card42 } from '../infoCards/card42';
import { card43 } from '../infoCards/card43';
import { card44 } from '../infoCards/card44';
import { card45 } from '../infoCards/card45';
import { card72 } from '../infoCards/card72';
import { card73 } from '../infoCards/card73';
import { card74 } from '../infoCards/card74';
import { card75 } from '../infoCards/card75';
import { card76 } from '../infoCards/card76';
import { card77 } from '../infoCards/card77';
import { card78 } from '../infoCards/card78';
import { card79 } from '../infoCards/card79';
import { optionalLine } from './graphicType';
import type { GraphicType } from './graphicType';

/** PRODUCT CARD — the thing being sold, its price, and what it used to cost. The live-commerce
 *  format's core graphic, and the one the reference data's shopping/beauty/cooking rows all
 *  reach for. */
export const productCardType: GraphicType = {
  id: 'product-card',
  name: 'Product card',
  description: 'A product with its photo, its price beside the old price, and one benefit line.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('product', '#f0'),
      optionalLine('price', '#f1'),
    ],
  },
  fields: [
    { key: 'product', label: 'Product', kind: 'text', value: 'Aurora Studio Headphones', role: 'line' },
    { key: 'price', label: 'Price', kind: 'text', value: '€149', role: 'line' },
    // Both of these are legitimately blank: a product at its normal price has no "was", and an
    // offer with nothing to claim has no savings chip. The designs hide an empty one entirely.
    { key: 'was', label: 'Was', kind: 'text', value: '€229', role: 'line' },
    { key: 'saving', label: 'Saving', kind: 'text', value: 'SAVE 35%', role: 'line' },
    { key: 'detail', label: 'Detail', kind: 'text', value: 'Free next-day delivery · 2-year warranty', role: 'line' },
    // The product SHOT, not a logo: it is the graphic's payload, so it is the design's own
    // image field rather than the shared logo slot.
    { key: 'image', label: 'Product image', kind: 'image', value: '', role: 'data' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 5,
    logo: 'none',
    animationPresets: ['slide-up', 'line-reveal', 'pop-spring', 'mask-wipe', 'fade', 'blur-in'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'card38',
      name: 'House Product',
      description: 'The NoaCG product card: a square shot beside the name, a large accent price, a benefit line.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => card38.create(options),
    },
    {
      id: 'card39',
      name: 'Frost Product',
      description: 'A frosted product card: a wide shot over the name, its price, and one benefit line.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      // The glass card is drawn portrait for a vertical shopping stream and written around
      // its own goods; the house card is the horizontal one.
      samples: {
        product: 'Calm Linen Throw',
        price: '£68',
        was: '£95',
        saving: 'BUNDLE DEAL',
        detail: 'Four colours · ships in 48 hours',
      },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      defaultZone: 'mid-right',
      create: (_type, options) => card39.create(options),
    },
    {
      id: 'card72', name: 'Clean Product', description: 'A panel-light product card with a framed shot and hairline price hierarchy.',
      styleTag: 'minimal', palette: paletteById('ivory'), fontId: 'inter',
      samples: { product: 'Field Notes Desk Lamp', price: '€89', was: '€119', saving: 'Save 25%', detail: 'Warm dimming - five-year guarantee' },
      animationPresets: ['line-reveal', 'slide-up', 'fade', 'mask-wipe', 'slide-down', 'blur-in'],
      create: (_type, options) => card72.create(options),
    },
    {
      id: 'card73', name: 'Volt Product', description: 'A hard-edged product slab with a large price and saving chip.',
      styleTag: 'sport', palette: paletteById('volt'), fontId: 'oswald',
      samples: { product: 'MATCHDAY PRO JACKET', price: '€129', was: '€179', saving: 'SAVE 28%', detail: 'WATERPROOF - CLUB DELIVERY INCLUDED' },
      animationPresets: ['snap-stinger', 'mask-wipe', 'slide-left', 'fade', 'slide-up', 'flip-3d'],
      create: (_type, options) => card73.create(options),
    },
  ],
};

/** OFFER CARD — the price drop announced on its own, without the product beside it. The
 *  full-attention moment of a flash sale, a live-shopping segment or a membership push. */
export const offerCardType: GraphicType = {
  id: 'offer-card',
  name: 'Offer card',
  description: 'A discount claim on its own, with its terms, a promo code, and a deadline.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('kicker', '#f0'),
      optionalLine('claim', '#f1'),
    ],
  },
  fields: [
    { key: 'kicker', label: 'Kicker', kind: 'text', value: 'FLASH DEAL', role: 'line' },
    { key: 'offer', label: 'Offer', kind: 'text', value: '40% OFF', role: 'line' },
    { key: 'detail', label: 'Detail', kind: 'text', value: 'EVERYTHING IN THE WINTER RANGE', role: 'line' },
    // Blank is a real answer for both: an uncoded promo and an open-ended offer are ordinary,
    // and the designs drop the element rather than leaving a hole.
    { key: 'code', label: 'Code', kind: 'text', value: 'WINTER40', role: 'line' },
    { key: 'ends', label: 'Ends', kind: 'text', value: 'ENDS TONIGHT 23:59', role: 'line' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 5,
    logo: 'none',
    animationPresets: ['snap-stinger', 'mask-wipe', 'slide-left', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'mid-left',
  },
  designs: [
    {
      id: 'card40',
      name: 'Volt Offer',
      description: 'A forward-leaning sport slab: a huge discount claim over its terms, code and deadline.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => card40.create(options),
    },
    {
      id: 'card41',
      name: 'Clean Offer',
      description: 'A panel-free offer card: a large offer line over its terms, promo code, and deadline.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      // The minimal card is written in sentence case for a bookshop register, not the sport
      // card's shouted caps.
      samples: {
        kicker: 'Members',
        offer: 'Two for one',
        detail: 'On every hardback in the autumn list',
        code: 'AUTUMN2',
        ends: 'Until Sunday',
      },
      animationPresets: ['line-reveal', 'mask-wipe', 'slide-up', 'fade', 'slide-down', 'blur-in'],
      create: (_type, options) => card41.create(options),
    },
    {
      id: 'card74', name: 'House Offer', description: 'The house offer card with a large claim, code, and deadline on a void panel.',
      styleTag: 'noacg', palette: paletteById('noacg'), fontId: 'space-grotesk',
      samples: { kicker: 'MEMBER OFFER', offer: '30% OFF', detail: 'ALL ANNUAL PLANS', code: 'ON-AIR30', ends: 'ENDS SUNDAY 23:59' },
      animationPresets: ['slide-up', 'line-reveal', 'mask-wipe', 'fade', 'slide-down', 'blur-in'],
      create: (_type, options) => card74.create(options),
    },
    {
      id: 'card75', name: 'Frost Offer', description: 'A frosted offer panel with a luminous claim, outlined code, and deadline.',
      styleTag: 'glass', palette: paletteById('frost'), fontId: 'manrope',
      samples: { kicker: 'Private preview', offer: '20% off', detail: 'The new studio collection', code: 'PREVIEW20', ends: 'Through midnight' },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'], defaultZone: 'mid-right',
      create: (_type, options) => card75.create(options),
    },
  ],
};

/** LISTING CARD — one listed thing and what it is worth right now. The auction lot, the
 *  property walk-through and the stock counter are the SAME graphic with a different value
 *  label typed into it, which is why the label is a field. */
export const listingCardType: GraphicType = {
  id: 'listing-card',
  name: 'Listing card',
  description: 'A listed item — lot, property or resource — beside a labelled live value.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('title', '#f0'),
      // The value legitimately drops when the listing is used with fewer lines — card42 omits
      // the whole value block so no rule floats beside an empty column — so it cannot be a
      // required part even though it is the card's point. See optionalLine.
      optionalLine('value', '#f3'),
    ],
  },
  fields: [
    { key: 'title', label: 'Title', kind: 'text', value: '14 Meadow Lane, Hillside', role: 'line' },
    { key: 'meta', label: 'Meta', kind: 'text', value: '3 bed · 118 m² · garden · garage', role: 'line' },
    // THE FIELD THAT MAKES THIS ONE TYPE: an auction says "Current bid", a property says
    // "Guide price", a stock counter says "Remaining". Same graphic, different word.
    { key: 'valueLabel', label: 'Value label', kind: 'text', value: 'Guide price', role: 'line' },
    { key: 'value', label: 'Value', kind: 'text', value: '£415,000', role: 'line' },
    { key: 'status', label: 'Status', kind: 'text', value: 'Viewing today', role: 'line' },
    { key: 'image', label: 'Photo', kind: 'image', value: '', role: 'data' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 5,
    logo: 'none',
    animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'blur-in'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'card42',
      name: 'Clean Listing',
      description: 'A quiet keyline panel: a photo and title beside a labelled value block.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      create: (_type, options) => card42.create(options),
    },
    {
      id: 'card43',
      name: 'House Lot',
      description: 'The NoaCG listing card: the lot photo and title beside a live value in amber.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      // The house card is written around an auction lot; the minimal one around a property.
      samples: {
        title: 'Lot 24 — Blue Period Study',
        meta: 'Oil on canvas · 1961 · 92 × 65 cm',
        valueLabel: 'Current bid',
        value: '€18,500',
        status: 'Bidding open',
      },
      animationPresets: ['slide-up', 'line-reveal', 'mask-wipe', 'fade', 'slide-down', 'blur-in'],
      create: (_type, options) => card43.create(options),
    },
    {
      id: 'card76', name: 'Volt Listing', description: 'A sport listing slab with a high-impact labelled value.',
      styleTag: 'sport', palette: paletteById('volt'), fontId: 'oswald',
      samples: { title: 'LOT 18 - SIGNED FINAL SHIRT', meta: '2026 FINAL - PLAYER WORN', valueLabel: 'CURRENT BID', value: '€2,400', status: 'BIDDING OPEN' },
      animationPresets: ['snap-stinger', 'mask-wipe', 'slide-left', 'fade', 'slide-up', 'flip-3d'],
      create: (_type, options) => card76.create(options),
    },
    {
      id: 'card77', name: 'Frost Listing', description: 'A frosted listing card with a softly separated live value.',
      styleTag: 'glass', palette: paletteById('frost'), fontId: 'manrope',
      samples: { title: 'Harbour Loft, West Quay', meta: '2 bedrooms - 104 m² - sea view', valueLabel: 'Guide price', value: '£575,000', status: 'Private viewing' },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'], defaultZone: 'bottom-right',
      create: (_type, options) => card77.create(options),
    },
  ],
};

/**
 * QR CARD — a scannable code beside the address written out in full.
 *
 * THE HONEST PART, and the reason this type exists rather than a "generate a QR from a URL"
 * feature: NoaCG bundles no QR encoder, and generated templates take no runtime dependency
 * (`root/keep-generated-template-self-contained-runtime`), so a template that drew its own code
 * would need an encoder inlined
 * into every export or a call out to the network at playout. A graphic that silently renders an
 * unscannable code is worse than one that never claimed to. So the code is an ordinary SPX
 * image field — the operator makes the PNG once and picks it — and the ADDRESS beside it is
 * real text, which is also what makes the card work for a viewer watching on a TV who cannot
 * scan anything. docs/PACK_TAXONOMY.md records the encoder as the open question it is.
 */
export const qrCardType: GraphicType = {
  id: 'qr-card',
  name: 'QR card',
  description: 'A scannable code (your own image) beside the address, written out in full.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('headline', '#f0'),
      optionalLine('address', '#f1'),
    ],
  },
  fields: [
    { key: 'headline', label: 'Headline', kind: 'text', value: 'Scan to donate', role: 'line' },
    { key: 'address', label: 'Address', kind: 'text', value: 'noacg.studio/give', role: 'line' },
    { key: 'detail', label: 'Detail', kind: 'text', value: 'Every euro goes to the appeal', role: 'line' },
    // The code itself. An image field, deliberately — see this type's comment.
    { key: 'code', label: 'QR image', kind: 'image', value: '', role: 'data' },
  ],
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 3,
    logo: 'none',
    animationPresets: ['slide-up', 'pop-spring', 'line-reveal', 'fade', 'slide-down', 'blur-in'],
    defaultZone: 'bottom-right',
  },
  designs: [
    {
      id: 'card44',
      name: 'House Scan',
      description: 'The NoaCG QR card: a white quiet-zone tile beside a headline and the address.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => card44.create(options),
    },
    {
      id: 'card45',
      name: 'Clean Scan',
      description: 'A stacked QR card: the code tile above a headline, the address, and one detail line.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      // The minimal card is written around a sign-up rather than an appeal.
      samples: {
        headline: 'Register for the workshop',
        address: 'city.edu/spring-lab',
        detail: 'Places are limited to 40',
      },
      animationPresets: ['line-reveal', 'slide-up', 'fade', 'mask-wipe', 'slide-down', 'blur-in'],
      defaultZone: 'mid-right',
      create: (_type, options) => card45.create(options),
    },
    {
      id: 'card78', name: 'Volt Scan', description: 'A hard-edged QR slab with a protected white tile and written address.',
      styleTag: 'sport', palette: paletteById('volt'), fontId: 'oswald',
      samples: { headline: 'SCAN FOR TICKETS', address: 'voltafc.com/final', detail: 'FINAL RELEASE - LIMITED SEATS' },
      animationPresets: ['snap-stinger', 'mask-wipe', 'slide-left', 'fade', 'slide-up', 'flip-3d'],
      create: (_type, options) => card78.create(options),
    },
    {
      id: 'card79', name: 'Frost Scan', description: 'A frosted QR card with a protected white tile and readable address.',
      styleTag: 'glass', palette: paletteById('frost'), fontId: 'manrope',
      samples: { headline: 'Continue the story', address: 'frost.media/aftershow', detail: 'Interviews and the full gallery' },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'], defaultZone: 'mid-right',
      create: (_type, options) => card79.create(options),
    },
  ],
};
