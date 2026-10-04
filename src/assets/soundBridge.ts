import type { AssetFile } from '../model/types';

/** Encoded bytes cross the existing isolated-frame boundary only during Prepare. */
export function soundBridgeJs(assets: AssetFile[]): string {
  const paths = assets.filter(a => a.audio).map(a => a.path);
  if (!paths.length) return '';
  return `(function () {
  var paths = ${JSON.stringify(paths)}, pending = {}, serial = 0;
  window.noacgLoadSound = function (path) {
    if (paths.indexOf(path) < 0) return fetch(window.noacgResolveSound ? window.noacgResolveSound(path) : path).then(function (r) { if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer(); });
    return new Promise(function (resolve, reject) {
      var id = ++serial;
      var timer = setTimeout(function () { delete pending[id]; reject(new Error('Sound preparation timed out. Retry Prepare.')); }, 15000);
      pending[id] = function (message) { clearTimeout(timer); delete pending[id]; if (message.error) reject(new Error(message.error)); else resolve(message.bytes); };
      parent.postMessage({ type: 'noacg-sound-load', id: id, path: path }, '*');
    });
  };
  window.noacgSoundRetain = function (path, bytes) {
    return new Promise(function (resolve,reject) {
      var id = ++serial;
      var timer = setTimeout(function () { delete pending[id]; reject(new Error('Sound memory check timed out.')); },15000);
      pending[id] = function (message) { clearTimeout(timer); delete pending[id]; if (message.error) reject(new Error(message.error)); else resolve(); };
      parent.postMessage({ type: 'noacg-sound-retain', id: id, path: path, bytes: bytes }, '*');
    });
  };
  window.noacgSoundReport = function (status) { parent.postMessage({ type: 'noacg-sound-status', status: status }, '*'); };
  window.addEventListener('message', function (ev) {
    if (ev.source === parent && ev.data && ev.data.type === 'noacg-sound-bytes' && pending[ev.data.id]) pending[ev.data.id](ev.data);
  });
})();`;
}
