import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultPanelLayout, fitPanelLayout, PANEL_LAYOUT_KEY, parsePanelLayout, type PanelLayout, type PanelSize } from './panelLayout';

export function usePanelLayout(projectOpen: boolean) {
  const root = useRef<HTMLElement>(null);
  const [retained, setRetained] = useState(() => {
    try { return parsePanelLayout(localStorage.getItem(PANEL_LAYOUT_KEY), window.innerHeight); }
    catch { return defaultPanelLayout(window.innerHeight); }
  });
  const [draft, setDraft] = useState<PanelLayout | null>(null);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight, chrome: 114 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const chrome = ['.ef-header', '.ef-document-strip', '.ef-status'].reduce((sum, selector) => sum + (element.querySelector(selector)?.getBoundingClientRect().height ?? 0), 6);
      const next = { width: element.clientWidth, height: element.clientHeight, chrome };
      setBounds(old => old.width === next.width && old.height === next.height && old.chrome === next.chrome ? old : next);
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({ v: 1, sizes: retained })); }
    catch { /* Storage refusal leaves the current layout usable. */ }
  }, [retained]);
  const resize = (key: PanelSize, value: number, commit: boolean) => {
    if (commit) { setRetained(old => ({ ...old, [key]: value })); setDraft(null); }
    else setDraft(old => ({ ...(old ?? retained), [key]: value }));
  };
  const cancel = useCallback(() => setDraft(null), []);
  return { root, ...fitPanelLayout(draft ?? retained, bounds.width, bounds.height, bounds.chrome, projectOpen), resize,
    cancel, reset: () => { setDraft(null); setRetained(defaultPanelLayout(bounds.height)); } };
}
