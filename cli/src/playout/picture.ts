import { UsageError } from '../output.js';

/** Standard channel raster and square-pixel canvas. Unknown/custom formats are refused. */
export function pictureCanvas(format: string | undefined): { width: number; height: number; squareWidth: number } {
  const name = (format ?? '').toLowerCase();
  if (/^1080[pi]\d+$/.test(name)) return { width: 1920, height: 1080, squareWidth: 1920 };
  if (/^720p\d+$/.test(name)) return { width: 1280, height: 720, squareWidth: 1280 };
  if (/^2160p\d+$/.test(name)) return { width: 3840, height: 2160, squareWidth: 3840 };
  if (name === 'pal') return { width: 720, height: 576, squareWidth: 1024 };
  if (name === 'ntsc') return { width: 720, height: 486, squareWidth: 864 };
  throw new UsageError(`Picture Fit cannot determine the canvas for channel format "${format ?? 'unknown'}". Choose Stretch or a supported channel format.`);
}

/** The server's resolved image path, never a filesystem path on the Bridge computer. */
export function pictureUrl(resolved: string, initialPath?: string): string {
  if (/[\r\n\0]/.test(resolved)) throw new UsageError('The resolved picture path contains a control character.');
  let path = resolved.replace(/\\/g, '/');
  if (!/^(?:[a-z]:\/|\/)/i.test(path)) {
    if (!initialPath || !/^(?:[a-z]:\/|\/)/i.test(initialPath.replace(/\\/g, '/'))) throw new UsageError('CasparCG did not report an absolute initial path for Picture Fit. Choose Stretch.');
    path = `${initialPath.replace(/\\/g, '/').replace(/\/$/, '')}/${path}`;
  }
  // CasparCG's FFmpeg factory excludes these extensions. Refuse before replacing foreground.
  if (/\.(?:tga|tiff?|jp2|jpx|j2[ck]|swf|ct|html?)$/i.test(path)) throw new UsageError('CasparCG cannot pad this picture format. Choose Stretch or use PNG/JPEG.');
  // Windows FFmpeg expects file:C:/..., not file:///C:/.... A repeated drive slash is legal
  // and selects CasparCG's URL producer, avoiding the image factory that ignores VF filters.
  if (/^[a-z]:\//i.test(path)) return `file:${path.replace(/^([a-z]:)\//i, '$1//')}`;
  return `file://${path}`;
}

/** One opaque padded frame held indefinitely, with no background layer to strand on Out. */
export function pictureFilter(canvas: ReturnType<typeof pictureCanvas>): string {
  const { width, height, squareWidth } = canvas;
  return `format=rgba,trim=end_frame=1,scale=w=${squareWidth}:h=${height}:force_original_aspect_ratio=decrease,pad=${squareWidth}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,scale=${width}:${height},setsar=1,tpad=stop_mode=clone:stop=-1`;
}
