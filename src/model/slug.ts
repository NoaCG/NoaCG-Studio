/** Slug suitable for a folder/zip/channel name. A kernel helper: control, export and the
 *  components all reach it here (docs/ARCHITECTURE.md §3). */
export function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'spx_template'
  );
}
