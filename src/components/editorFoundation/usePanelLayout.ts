import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultPanelLayout, readPanelLayout, encodePanelLayout, PANEL_LAYOUT_KEY, type PanelLayout } from '../../model/editorPanelLayout';
import { fitPanelLayout, type PanelSize } from './panelLayout';

export function usePanelLayout(projectOpen: boolean, authoringId: string) {
  const root = useRef<HTMLElement>(null);
  const [retained, setRetained] = useState(() => {
    try { return readPanelLayout(localStorage.getItem(PANEL_LAYOUT_KEY), window.innerHeight).sizes; }
    catch { return defaultPanelLayout(window.innerHeight); }
  });
  const [draft, setDraft] = useState<PanelLayout | null>(null);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight, chrome: 114, canvasChrome: 99 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const chrome = ['.ef-header', '.ef-document-strip', '.ef-status'].reduce((sum, selector) => sum + (element.querySelector(selector)?.getBoundingClientRect().height ?? 0), 6);
      const canvas = element.querySelector('.ef-canvas'), viewport = element.querySelector('.ef-viewport');
      const canvasChrome = canvas && viewport ? canvas.getBoundingClientRect().height - viewport.getBoundingClientRect().height : 0;
      const next = { width: element.clientWidth, height: element.clientHeight, chrome, canvasChrome };
      setBounds(old => old.width === next.width && old.height === next.height && old.chrome === next.chrome && old.canvasChrome === next.canvasChrome ? old : next);
    };
    const observer = new ResizeObserver(measure);
    // Pane width, font settlement and changing group/error rows can change inner chrome.
    observer.observe(element);
    for (const child of element.querySelectorAll('.ef-header, .ef-document-strip, .ef-status, .ef-canvas, .ef-canvas > *')) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [authoringId]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANEL_LAYOUT_KEY), encoded = encodePanelLayout(raw, retained);
      if (encoded !== null && encoded !== raw) localStorage.setItem(PANEL_LAYOUT_KEY, encoded);
    }
    catch { /* Storage refusal leaves the current layout usable. */ }
  }, [retained]);
  const resize = (key: PanelSize, value: number, commit: boolean) => {
    if (commit) { setRetained(old => ({ ...old, [key]: value })); setDraft(null); }
    else setDraft(old => ({ ...(old ?? retained), [key]: value }));
  };
  const cancel = useCallback(() => setDraft(null), []);
  return { root, ...fitPanelLayout(draft ?? retained, bounds.width, bounds.height, bounds.chrome, projectOpen, bounds.canvasChrome), resize,
    cancel, reset: () => { setDraft(null); setRetained(defaultPanelLayout(bounds.height)); } };
}
