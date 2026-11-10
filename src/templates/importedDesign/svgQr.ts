// THE QR LAYER of an imported SVG (interaction spec, Graphics ▸ Join card and QR layer, AC-13).
//
// A layer the designer named `QR` is where a QR code goes. The graphic gains one field, titled
// **Join link**, and its runtime draws that link as a QR code (error correction M, quiet zone of
// four modules, dark on a white plate) inside the layer's own box, with the encoder carried in the
// graphic (shared/qrEncoder.min.js, qrcode-generator, MIT), so an exported graphic needs no
// network. The drawn layer itself is a stand-in and stays hidden; an empty Join link draws
// nothing. The field is appended after every other field, so no saved `fN` moves.

import type { DesignSvg } from '../../model/wizard';
import type { SpxField } from '../../model/types';
import { svgLayerLabel } from '../../assets/svgImport';
import { DATA_SOURCE_CLASS } from '../shared/base';
import QR_ENCODER_JS from '../shared/qrEncoder.min.js?raw';
import { PREFIX } from './shared';

/** The layer name that asks for a QR code, compared without case. */
export const QR_LAYER_NAME = 'QR';
/** The field the code is drawn from: the same title the Join card and Interaction use. */
export const QR_FIELD_TITLE = 'Join link';
/** The class the bind pass stamps on the `QR` layer. */
export const QR_LAYER_CLASS = `${PREFIX}-qr`;

/** The first drawn element whose layer name is `QR`, in document order, or null. Text is never
 *  one (Figma names a text layer after its words, so a label reading "QR" would qualify), and
 *  nothing in `<defs>` is drawn where it stands. */
export function findQrLayer(root: Element): Element | null {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.localName;
    if (tag === 'text' || tag === 'tspan' || el.closest('defs, text')) continue;
    if (svgLayerLabel(el).toUpperCase() === QR_LAYER_NAME) return el;
  }
  return null;
}

/** Whether this artwork has a `QR` layer. */
export function hasQrLayer(svg: DesignSvg): boolean {
  const doc = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  return findQrLayer(doc.documentElement) !== null;
}

/** The Join link field, at index `at` (after the artwork's and the behaviour's fields). */
export function qrField(at: number): SpxField {
  return { field: `f${at}`, ftype: 'textfield', title: QR_FIELD_TITLE, value: '' };
}

/** The hidden holder the operator's link is written into. */
export function qrHolderHtml(at: number): string {
  return `
    <!-- ${QR_FIELD_TITLE} (f${at}) - the link your QR layer draws as a code; empty draws nothing. -->
    <div id="f${at}" class="${DATA_SOURCE_CLASS}"></div>`;
}

export const QR_CSS = `/* The layer named QR is a stand-in: hidden, while the code the runtime draws inside it shows. */
.${QR_LAYER_CLASS} {
  visibility: hidden;
}`;

/** The update() hook line. */
export const QR_HOOK = `  if (typeof svgQrPaint === 'function') svgQrPaint();  // the QR layer's code (below)`;

/** The encoder and the painter. ES5, DOM-ready safe, names no URL (the publish gate refuses one). */
export function qrRuntimeJs(at: number): string {
  return `
// ---- The QR layer: the Join link drawn as a QR code ----
// The encoder: qrcode-generator (MIT), carried in this file so the graphic needs no network.
${QR_ENCODER_JS.trim()}

// svgQrPaint(): draw the Join link (the hidden #f${at}) as a QR code over the box of the layer
// named QR, error correction M with a four-module quiet zone on a white square plate, centred in
// that box. An empty or unencodable link draws nothing.
function svgQrPaint() {
  var source = document.getElementById('f${at}');
  var layer = document.querySelector('.${QR_LAYER_CLASS}');
  if (!source || !layer) return;
  var old = layer.querySelector('.${QR_LAYER_CLASS}-code');
  if (old) layer.removeChild(old);
  var link = (source.textContent || '').trim();
  if (!link || typeof qrcode !== 'function') return;
  var qr;
  try {
    qr = qrcode(0, 'M');
    qr.addData(link, 'Byte');
    qr.make();
  } catch (e) {
    return;
  }
  // The layer's box in its own frame (the stand-in's geometry), measured before the code joins it.
  var box;
  try { box = layer.getBBox(); } catch (e) { return; }
  var side = Math.min(box.width, box.height);
  if (!(side > 0)) return;
  var quiet = 4, n = qr.getModuleCount(), size = n + quiet * 2, d = '';
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    }
  }
  // The code is drawn INSIDE the QR layer, so it moves with whatever animates that layer, and
  // shows through the hidden stand-in by its own visibility. It sets every inherited paint it
  // depends on, so a stroke or opacity the artwork declares above it cannot spoil the scan.
  var ns = layer.namespaceURI;
  var g = document.createElementNS(ns, 'g');
  g.setAttribute('class', '${QR_LAYER_CLASS}-code');
  var unit = side / size;
  var x = box.x + (box.width - side) / 2, y = box.y + (box.height - side) / 2;
  g.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + unit + ')');
  g.setAttribute('visibility', 'visible');
  g.setAttribute('shape-rendering', 'crispEdges');
  g.setAttribute('stroke', 'none');
  g.setAttribute('fill-opacity', '1');
  g.setAttribute('fill-rule', 'nonzero');
  var plate = document.createElementNS(ns, 'rect');
  plate.setAttribute('width', size);
  plate.setAttribute('height', size);
  plate.setAttribute('fill', '#ffffff');
  var modules = document.createElementNS(ns, 'path');
  modules.setAttribute('fill', '#000000');
  modules.setAttribute('d', d);
  g.appendChild(plate);
  g.appendChild(modules);
  layer.appendChild(g);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svgQrPaint);
} else {
  svgQrPaint();
}
`;
}
