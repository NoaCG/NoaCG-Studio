// The join link as a QR code, in the studio (interaction spec, "Joining" ▸ QR; AC-5).
//
// qrcode-generator (MIT), error correction M, drawn here: no third-party QR service ever sees a
// production's link. The Join card draws its own with the same encoder, vendored into the graphic
// (templates/shared/qrEncoder.min.js), so an exported card needs no network.

import qrcode from 'qrcode-generator';

/** Modules of quiet zone around the code: the standard's four. */
const QUIET = 4;

/** The code's dark modules, row by row. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** The code as a standalone SVG: dark modules as one path over a light square, quiet zone included. */
export function qrSvg(text: string, colours: { dark?: string; light?: string } = {}): string {
  const matrix = qrMatrix(text);
  const size = matrix.length + QUIET * 2;
  let d = '';
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }),
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="${colours.light ?? '#ffffff'}"/>` +
    `<path d="${d}" fill="${colours.dark ?? '#000000'}"/></svg>`
  );
}

/** The code as a PNG of about `side` pixels, each module a whole number of pixels so it stays sharp. */
export async function qrPng(text: string, side = 1024): Promise<Blob | null> {
  const matrix = qrMatrix(text);
  const modules = matrix.length + QUIET * 2;
  const scale = Math.max(1, Math.floor(side / modules));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = modules * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale);
    }),
  );
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
