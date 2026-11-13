// Read by e2e/_offline-guard.ts and e2e/_configured-guard.ts, each evaluating it inside a page
// to learn the backend that page was built against. Never imported by a spec or by the app.
//
// WHY A MODULE AND NOT SOURCE-PARSING. Vite does NOT inline `import.meta.env.VITE_*` in DEV -
// verified against the running dev server, which serves these expressions verbatim; the
// inlining everyone remembers is a BUILD-mode transform. So the guard cannot learn a running
// server's env by fetching and reading text. It evaluates this module inside a real page
// instead, where `import.meta.env` resolves at runtime to exactly what the app sees.
//
// src/backend/config.ts cannot stand in for this: it reads env through a dynamic
// `(import.meta.env as Record<string, unknown>)[name]` lookup and only exposes a boolean.
//
// Export names match the env keys so the guard's failure message can name them directly.

export const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const VITE_AI_PROXY_URL = import.meta.env.VITE_AI_PROXY_URL;
// Pinned ON rather than empty, so it fails the OTHER way round - see MUST_BE_SET in the guard.
export const VITE_RENDER_API = import.meta.env.VITE_RENDER_API;
