// A sub-module of the package, imported relatively: proves in-package imports resolve under the
// output stage's network policy.
export function formatScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n).padStart(2, '0') : '--';
}
