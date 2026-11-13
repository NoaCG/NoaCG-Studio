// E5 local setup/trace markers. This module has NOT qualified native timing in Cloud.
// Run only in a fresh disposable local browser profile; never load into production work.
export async function loadF4() {
  const manifest = await (await fetch('/docs/work-specs/editor-r1-5/e5c/artifact-manifest.json')).json();
  const path = 'docs/research/editor-design-review-2026-09-17/f4-noacg.json';
  const bytes = await (await fetch('/' + path)).arrayBuffer();
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (sha256 !== manifest.fixtures.find(f => f.path === path)?.sha256) throw new Error('F4 fixture hash mismatch.');
  const fixture = JSON.parse(new TextDecoder().decode(bytes));
  // Validate the complete fixed-fixture contract before importing/writing the store.
  const data = (await import('/src/blocks/editorAnimation.ts')).animationSource(fixture);
  const layers = Object.values(data.steps[0].layers);
  const keys = layers.reduce((n, l) => n + Object.values(l).reduce((a, track) => a + track.length, 0), 0);
  const properties = [...new Set(layers.flatMap(l => Object.keys(l)))].sort();
  if (layers.length !== 30 || keys !== 300 || JSON.stringify(properties) !== JSON.stringify(['opacity', 'x'])) throw new Error('Expected exactly 30 layers and 300 X/opacity keys.');
  const S = (await import('/src/store/templateStore.ts')).useTemplateStore;
  S.getState().applyTemplate(fixture, { resetSampleData: true });
  S.getState().setSelectedParts([]);
  return { sha256, layers: layers.length, keys, properties };
}
export function install(device = {}) {
  window.e5Native?.dispose();
  const rows = [], settings = { timeOrigin: performance.timeOrigin, startedUtc: new Date().toISOString(), innerWidth, innerHeight, dpr: devicePixelRatio, visualScale: visualViewport?.scale, device };
  let id = 0;
  const record = event => {
    const marker = 'E5_NATIVE_' + ++id;
    const row = { marker, type: event.type, at: performance.now(), epochAt: performance.timeOrigin + performance.now(), eventTimeStamp: event.timeStamp, isTrusted: event.isTrusted, x: event.clientX, y: event.clientY, key: event.key };
    rows.push(row); performance.mark(marker); console.timeStamp(marker);
  };
  const kinds = ['pointerdown', 'pointermove', 'pointerup', 'keydown'];
  kinds.forEach(kind => document.addEventListener(kind, record, true));
  const button = document.createElement('button');
  button.textContent = 'E5 calibration';
  button.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647;background:#ff00ff;color:black;width:140px;height:40px';
  button.onclick = () => { button.style.background = button.style.background === 'rgb(255, 0, 255)' ? '#00ff00' : '#ff00ff'; performance.mark('E5_CALIBRATION_' + id); console.timeStamp('E5_CALIBRATION_' + id); };
  document.body.append(button);
  const api = {
    settings, rows,
    hideCalibration() { button.remove(); },
    showCalibration() { document.body.append(button); },
    download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ settings, endedUtc: new Date().toISOString(), rows }, null, 2)], { type: 'application/json' })); a.download = 'e5-native-events.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); },
    dispose() { kinds.forEach(kind => document.removeEventListener(kind, record, true)); button.remove(); },
  };
  window.e5Native = api;
  return settings;
}
