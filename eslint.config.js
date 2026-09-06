// ESLint flat config. Runs as part of `npm run build` (the CI gate), so the tree must stay
// lint-clean. Scope: app source, e2e specs, and the node scripts — not generated output or
// the vendored GSAP bundle.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Shared restriction entries for the Architecture Stage A blocks below (docs/ARCHITECTURE.md §3).
const supabaseRestriction = {
  name: '@supabase/supabase-js',
  message:
    'Only src/backend/ talks to Supabase directly — get the client via getSupabase() and feature-detect via isBackendConfigured() (docs/ARCHITECTURE.md §3, invariant 1).',
  allowTypeImports: true,
};
const storeRestriction = {
  group: ['**/store', '**/store/**'],
  message:
    'src/store/ is editor-UI state; processing domains take and return plain documents (docs/ARCHITECTURE.md §3, invariant 3).',
};
const componentsRestriction = {
  group: ['**/components', '**/components/**'],
  message:
    'Nothing imports src/components/ — the UI is the top of the graph (docs/ARCHITECTURE.md §3, invariant 4).',
};
// The video harness reaches the model gateway ONLY through src/ai/video/videoGateway.ts, which
// stamps `surface: 'video'` on every call — the tag api/ai/generate.ts needs to apply the
// ai.video entitlement (docs/ADMIN.md, "Gating a surface on a shared endpoint"). A direct
// ../modelGateway import compiles and works; it just silently leaves the ungated path, and no
// test can catch a call site that was never written. Hence a build-time boundary.
const videoGatewayRestriction = {
  group: ['**/modelGateway'],
  message:
    "src/ai/video calls the gateway through ./videoGateway, which stamps surface: 'video' — a direct ../modelGateway import silently drops the ai.video entitlement tag (docs/ADMIN.md).",
};
// NoaCG Pro's retired concept-and-reconstruct engine used to be held here by a
// `**/reconstruct/**` import boundary. **The engine is DELETED (2026-08-15), so the boundary is
// gone with it** - a rule guarding a directory that does not exist is a rule nothing can violate
// and nobody can check. What it bought while it stood is worth keeping in mind if a second
// engine is ever carried beside a live one again: a per-FILE list of the same modules was
// mutation-checked and found VACUOUS, because these patterns match the IMPORT STRING rather than
// the resolved file and the sibling form (`../compile`) went straight past it. A path segment
// appears in every form of an import; a filename does not.

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '**/node_modules/',
      '.claude/',
      '.render-dev/',
      'render-worker/bundle/', // webpack output (render-worker/bundle.mjs), not source
      'render-worker/remotion/*.generated.ts', // data-URL font CSS (scripts/gen-video-font-css.mjs)
      'src/assets/gsap.min.js',
      'example_projects/', // vendored SPX reference packs, not ours to lint
      // The real-broadcaster corpus and its sweep output (both gitignored, licence-restricted):
      // third-party production templates carrying their own bundled libraries — axios, the
      // WebCG framework — whose inline eslint directives fight ours. Same reason as
      // example_projects/ above, and the same failure mode as the bench directories below: a
      // checkout that HAS the corpus had a permanently red `eslint .`, and therefore a red
      // build gate, over code that is not ours and that we never ship.
      'spx_examples/',
      'spx-corpus-out/',
      'playwright-report/',
      'test-results/',
      // Bench output directories (same broad patterns as .gitignore): they hold
      // MODEL-EMITTED code, including deliberately broken emits a failed arm wrote to
      // disk for diagnosis - a generated artifact must never gate the repo build. Found
      // the hard way: a syntax-broken coder emit from the versus smoke round failed
      // `eslint .` while sitting in a gitignored directory.
      'bench-*/',
      'compare-out*/',
      'creative-route-out*/',
      'creative-pilot-out*/',
      'creative-rerun-out*/',
      'creative-gallery/',
      'lite-bench-out*/',
      'lite-eval-out*/',
      'pro-bench-out*/',
      'pro-spike-out*/',
      'pro-iterate-out*/', // the iterate/type-sweep rounds save every emit round to disk
      // The Pro Harness bench writes each delivered graphic's html/css/js to code/. It is
      // a MODEL's code, kept as evidence of a round, so linting it reds the build over a
      // finding the round already recorded - which is what it did on 2026-09-06.
      'pro-harness-out*/',
      'pro-freeform-blind/',
      'pro-iterate-blind/',
      'pro-typesweep-blind/',
      'lite-on-pro-out*/',
      'pro-machine-out*/',
      'video-bench-out*/',
      'video-benchmark-out/',
      // Model-emitted code ARCHIVED beside a round's write-up, for the same reason as the
      // out-directories above and one more: the artifact is evidence. The Pro round's saved
      // template redeclares `noacgMachineState` (the model wrote one, the platform's
      // interpreter writes another) - editing that away to please the linter would delete
      // the finding the file exists to record.
      'benchmarks/**/*.js',
      'benchmarks/**/*.html',
    ],
  },

  // TypeScript + React (the app) and the Playwright specs.
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts', 'vite.config.ts', 'playwright*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // Template runtimes and control-panel scripts are emitted as strings and often name
      // their parameters for readability even when unused; keep the underscore escape hatch.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The React-Compiler-era rules flag two deliberate house patterns: state mirrored into a
      // ref during render (the drag/phase machinery in the timeline components reads it from
      // window-level event handlers) and reset-state-on-open effects (dialogs/wizard). Both
      // remain legal on React 19; re-enable these rules only as part of a dedicated refactor
      // (or React Compiler adoption). The classic rules-of-hooks and exhaustive-deps stay on.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // ---- Architecture Stage A (docs/ARCHITECTURE.md §3, §7) --------------------------------
  // Machine-pins invariants 1, 3 and 4 of the architecture doc, which were verified clean when
  // introduced — these blocks stop regressions; the full edge table stays review-time until
  // Stage B (dependency-cruiser). Flat-config gotcha: when several blocks match one file, the
  // LAST rule config replaces the earlier ones (options never merge), so src/ is split into
  // disjoint regions below, each carrying the full restriction set for its region. Imports are
  // relative (no path aliases), hence the `**/store`-style gitignore patterns.
  //
  //  - invariant 1: @supabase/supabase-js is value-imported only inside src/backend/ — every
  //    other module gets the client via getSupabase() and feature-detects via
  //    isBackendConfigured(). Type-only imports (SupabaseClient) are fine anywhere. api/ and
  //    e2e/configured/ run server/test-side and sit outside this scope on purpose.
  //  - invariant 3: src/store/ is the editor-UI state; only components/ and the entry files
  //    import it. Processing domains take and return plain documents.
  //  - invariant 4: nothing imports src/components/ — UI is the top of the graph.
  {
    // The default region: every src/ module that is subject to all three restrictions.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/backend/**',
      'src/components/**',
      'src/store/**',
      'src/App.tsx',
      'src/main.tsx',
      'src/blocks/registry.ts',
      'src/ai/video/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [supabaseRestriction],
        patterns: [storeRestriction, componentsRestriction],
      }],
    },
  },
  {
    // The UI region may import store/ and components/ freely; Supabase stays behind backend/.
    files: ['src/components/**/*.{ts,tsx}', 'src/App.tsx', 'src/main.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [supabaseRestriction],
      }],
    },
  },
  {
    // backend/ owns the Supabase client but is still below store/ and components/.
    files: ['src/backend/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [storeRestriction, componentsRestriction],
      }],
    },
  },
  {
    // store/ imports itself freely; everything else still applies.
    files: ['src/store/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [supabaseRestriction],
        patterns: [componentsRestriction],
      }],
    },
  },
  {
    // The video harness: the default region's set PLUS the one-door gateway boundary. Repeated
    // in full because these options replace rather than merge (see the gotcha above).
    files: ['src/ai/video/**/*.{ts,tsx}'],
    ignores: ['src/ai/video/videoGateway.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [supabaseRestriction],
        patterns: [storeRestriction, componentsRestriction, videoGatewayRestriction],
      }],
    },
  },
  {
    // videoGateway.ts IS the door, so it alone may import the gateway.
    files: ['src/ai/video/videoGateway.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [supabaseRestriction],
        patterns: [storeRestriction, componentsRestriction],
      }],
    },
  },
  {
    // Grandfathered (ARCHITECTURE.md §6): blocks/registry.ts type-imports EditorTab from the
    // store. Store restriction lifted for this one file; delete this block when that row falls.
    files: ['src/blocks/registry.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [supabaseRestriction],
        patterns: [componentsRestriction],
      }],
    },
  },

  // Invariant 2 (docs/ARCHITECTURE.md §3): the render purity trio. api/ and render-worker/
  // compile these exact files, and src/render/CLAUDE.md declares them PURE - no DOM, no
  // Vite-isms (?raw / ?url / ?inline suffixes), no import.meta, no wall-clock/frame timing.
  // These rule names differ from the Stage A no-restricted-imports blocks, so they compose
  // with them instead of replacing their options.
  {
    files: ['src/render/manifest.ts', 'src/render/schedule.ts', 'src/render/limits.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
          'fetch', 'XMLHttpRequest', 'requestAnimationFrame', 'cancelAnimationFrame',
          'performance'].map((name) => ({
          name,
          message: `The render purity trio is environment-free - '${name}' breaks the render-worker/api build (docs/ARCHITECTURE.md §3, invariant 2).`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value=/[?]/]',
          message: 'No Vite query-suffix imports (?raw/?url/?inline) in the render purity trio - the render-worker webpack build cannot resolve them (docs/ARCHITECTURE.md §3, invariant 2).',
        },
        {
          selector: 'ImportExpression[source.value=/[?]/]',
          message: 'No Vite query-suffix imports (?raw/?url/?inline) in the render purity trio - the render-worker webpack build cannot resolve them (docs/ARCHITECTURE.md §3, invariant 2).',
        },
        {
          selector: "MetaProperty[meta.name='import']",
          message: 'No import.meta in the render purity trio - it is a bundler-specific construct the render-worker/api builds do not share (docs/ARCHITECTURE.md §3, invariant 2).',
        },
      ],
    },
  },

  // Node scripts (dev tooling). Browser globals too: the Playwright sweeps run code inside
  // page.evaluate callbacks, which execute in the page.
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // The render API functions (Vercel serverless; fetch-style handlers under Node).
  {
    files: ['api/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // The Remotion render worker (its own package; the composition runs in a browser bundle,
  // the .mjs entrypoints under Node).
  {
    files: ['render-worker/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['render-worker/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
