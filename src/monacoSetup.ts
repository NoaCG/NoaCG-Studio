// Self-hosted Monaco: the editor is bundled with the app (like GSAP) instead of being
// downloaded from a CDN at runtime — the builder works fully offline and never breaks
// because a CDN is slow or blocked on a production network.
//
// Two pieces:
//   1. loader.config({ monaco }) points @monaco-editor/react at the bundled instance
//      (its default is an AMD loader fetching from cdn.jsdelivr.net).
//   2. MonacoEnvironment.getWorker hands Vite-bundled web workers to the editor
//      (language smarts for HTML/CSS/JS run in workers).

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
// Worker paths drop the `esm/vs/` prefix as of monaco 0.56: the package gained an `exports`
// map whose `"./*": "./esm/vs/*.js"` rule adds that prefix itself, so the old specifier now
// resolves to `esm/vs/esm/vs/…` and fails the build. The files did not move.
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

// The bundled namespace, re-exported for code that needs Monaco outside an editor callback
// (src/editor/commentVisibility.ts takes it as an argument, and the E2E specs drive it directly).
export { monaco };

// TSX support for the video editor's Composition.tsx model. Syntax-only diagnostics: without
// react/remotion type acquisition, semantic checking would drown the editor in "cannot find
// module" noise. Only the typescript defaults change — the SPX JS tab uses javascriptDefaults
// and keeps its behavior. (monaco 0.55 moved these to the top-level `typescript` namespace.)
monaco.typescript.typescriptDefaults.setCompilerOptions({
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  target: monaco.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
});
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

// Turn OFF Monaco's built-in HTML/CSS/JS document formatters. The retired old code editor used to
// register a Prettier document-formatting provider for these languages, and with the built-ins on
// "Format Document" could pick the built-in beautifier instead; nothing registers a formatter for
// them now, so a stray "Format Document" does nothing rather than beautifying a template with a
// formatter the exports never ran. The video editor's TSX model uses typescriptDefaults, which is
// left untouched.
for (const defaults of [monaco.html.htmlDefaults, monaco.css.cssDefaults, monaco.typescript.javascriptDefaults]) {
  defaults.setModeConfiguration({
    ...defaults.modeConfiguration,
    documentFormattingEdits: false,
    documentRangeFormattingEdits: false,
  });
}
