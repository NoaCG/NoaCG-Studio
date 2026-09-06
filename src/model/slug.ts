/** Slug suitable for a folder/zip/channel name (its own module so control + export code
 *  can share it without an import cycle through common.ts). */
export function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'spx_template'
  );
}
