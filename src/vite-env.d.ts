/// <reference types="vite/client" />

/** True only in the e2e build (`vite build --mode e2e`, vite.config.ts). Absent in Node tests, so
 *  read it as `typeof __NOACG_E2E__ === 'boolean' && __NOACG_E2E__`. */
declare const __NOACG_E2E__: boolean | undefined;

declare module '*?raw' {
  const content: string;
  export default content;
}
