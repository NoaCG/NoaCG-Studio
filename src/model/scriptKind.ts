/** Script tags that must retain their markup rather than enter the classic JS pane. */
export function scriptKind(attrs: string): 'classic' | 'module' | 'data' {
  const type = attrs.match(/(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const mime = (type?.[1] ?? type?.[2] ?? type?.[3] ?? '').trim().toLowerCase();
  if (mime === 'module') return 'module';
  return !mime || /^(?:text|application)\/(?:x-)?(?:java|ecma)script(?:;.*)?$/.test(mime) ? 'classic' : 'data';
}
