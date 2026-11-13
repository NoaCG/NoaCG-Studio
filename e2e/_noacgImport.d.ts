// The door specs use inside `page.evaluate` to reach the page's own modules: the dev server
// answers it with the browser's own import, the e2e build from its registry (src/app/e2eModules.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a module namespace, as import() gave
declare function __noacgImport(path: string): Promise<any>;
