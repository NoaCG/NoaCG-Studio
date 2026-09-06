// Document hygiene for a template that arrives from a file or a Starter package: its HTML must
// reference the external css/js/gsap files that ship beside it. Both the importer (model) and the
// SPX Starter packager (export) apply it, so it lives in the kernel where either may reach it.

/** Ensure the HTML references the external css/js/gsap files (Starter packaging). */
export function ensureExternalRefs(html: string): string {
  let out = html;
  const head = /<\/head>/i;
  if (!/href=["'](?:\.\/)?css\/template\.css["']/i.test(out) && head.test(out)) {
    out = out.replace(head, `  <link rel="stylesheet" href="css/template.css" />\n</head>`);
  }
  if (!/src=["'](?:\.\/)?js\/gsap\.min\.js["']/i.test(out) && head.test(out)) {
    out = out.replace(head, `  <script src="js/gsap.min.js"></script>\n</head>`);
  }
  if (!/src=["'](?:\.\/)?js\/template\.js["']/i.test(out) && head.test(out)) {
    out = out.replace(head, `  <script src="js/template.js"></script>\n</head>`);
  }
  return out;
}
