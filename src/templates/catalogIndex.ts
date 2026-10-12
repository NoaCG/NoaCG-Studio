// THE CATALOG INDEX: what a chat client may pick from the catalog, as one static JSON file
// (docs/REMOTE_MCP_PLAN.md, key decision 7).
//
// The remote MCP connector's `noacg_catalog` tool answers from this file, never from the type
// registry itself: the registry imports every design builder (megabytes, and some of it wants a
// browser), while a serverless function only needs the declarations - which types exist, which
// designs each has, the fields a recipe fills, and the palettes and fonts a recipe may name.
//
// GENERATED, NEVER HAND-KEPT. scripts/catalogIndexPlugin.mjs builds it from the live registry
// through Vite's SSR loader: the dev and preview servers answer it at CATALOG_INDEX_PATH, and
// `vite build` writes it into dist/, so a design added to the registry is in the index on the
// next build and a removed one is gone. The builder (catalogIndexBuild.ts) is typed against the
// registry's own types, so a renamed declaration fails `tsc` rather than shipping an index that
// silently lost a field.
//
// THIS FILE IMPORTS NOTHING: api/ imports the shape from here and reads the file over HTTP from
// its own deployment, and api/'s DOM-less typecheck must never reach the registry.

/** Where the dev server, the preview server and the deployment serve the index. */
export const CATALOG_INDEX_PATH = '/catalog-index.json';

export interface CatalogField {
  /** The LOGICAL key a recipe's values use (the scaffold's `values`). */
  key: string;
  label: string;
  kind: string;
  /** Absent for an ordinary text line; `logo`, `data` or `hidden` otherwise. */
  role?: string;
  /** The values a `select` field accepts. */
  options?: string[];
}

export interface CatalogDesign {
  id: string;
  name: string;
  description: string;
  style: string;
  /** The design's own palette and font ids, the ones it ships with. */
  palette: string;
  font: string;
}

export interface CatalogType {
  id: string;
  name: string;
  description: string;
  category: string;
  fields: CatalogField[];
  designs: CatalogDesign[];
}

export interface CatalogIndex {
  version: 1;
  categories: Array<{ id: string; name: string }>;
  types: CatalogType[];
  palettes: Array<{ id: string; name: string; accent: string; text: string; panel: string; styles: string[] }>;
  fonts: Array<{ id: string; family: string; styles: string[] }>;
}
