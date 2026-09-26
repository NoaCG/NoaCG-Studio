// A hand-written OGraf v1 Graphic from "a third party": plain DOM, no NoaCG conventions. It reads
// its own package three ways - a relative module import, an image and a JSON file resolved
// against import.meta.url - so a spec can see that the package's own scope stays reachable
// while everything outside it is refused. Its state is written onto the board's data attributes
// for the spec to read.
import { formatScore } from './lib/format.mjs';

const STYLE = `
  .board { position: absolute; left: 120px; bottom: 120px; display: flex; align-items: center; gap: 18px;
           padding: 16px 24px; background: #0d1b2a; color: #fff; font: 700 40px/1 system-ui, sans-serif;
           border-radius: 10px; opacity: 0; transition: opacity .2s; }
  .board[data-on="true"] { opacity: 1; }
  .board[data-tint="gold"] { background: #7a5a00; }
  .board[data-tint="silver"] { background: #5c6670; }
  .board img { width: 48px; height: 48px; }
  .board .round { font-size: 24px; color: #9fb3c8; }
`;

export default class ResultsBoard extends HTMLElement {
  constructor() {
    super();
    this._data = { headline: 'Results', score: 0 };
    this._labels = [];
    this._step = -1;
    this._root = null;
  }

  _render() {
    if (!this._root) return;
    this._root.querySelector('.headline').textContent = String(this._data.headline);
    this._root.querySelector('.score').textContent = formatScore(this._data.score);
    this._root.querySelector('.round').textContent = this._step >= 0 ? this._labels[this._step] || '' : '';
    this._root.dataset.step = String(this._step);
  }

  async load(params) {
    Object.assign(this._data, (params && params.data) || {});
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.appendChild(style);
    const root = document.createElement('div');
    root.className = 'board';
    root.dataset.on = 'false';
    root.innerHTML = '<img alt=""><span class="headline"></span><span class="score"></span><span class="round"></span>';
    this.appendChild(root);
    this._root = root;

    const img = root.querySelector('img');
    const imageLoaded = new Promise((resolve) => {
      img.onload = () => resolve('loaded');
      img.onerror = () => resolve('failed');
    });
    img.src = new URL('./assets/mark.svg', import.meta.url).href;
    try {
      const res = await fetch(new URL('./data/labels.json', import.meta.url));
      this._labels = (await res.json()).steps;
      root.dataset.labels = 'loaded';
    } catch {
      root.dataset.labels = 'failed';
    }
    root.dataset.image = await imageLoaded;
    this._render();
    return { statusCode: 200 };
  }

  async dispose() {
    this.innerHTML = '';
    this._root = null;
    this._step = -1;
    return { statusCode: 200 };
  }

  async playAction(params) {
    if (!this._root) return { statusCode: 409, statusMessage: 'not loaded' };
    const p = params || {};
    const target = p.goto != null && p.goto >= 0 ? p.goto : this._step + (p.delta != null ? p.delta : 1);
    if (target >= 3) {
      this._root.dataset.on = 'false';
      this._step = -1;
      this._render();
      return { statusCode: 200, currentStep: undefined };
    }
    this._step = Math.max(0, target);
    this._root.dataset.on = 'true';
    this._render();
    return { statusCode: 200, currentStep: this._step };
  }

  async stopAction() {
    if (!this._root) return { statusCode: 409, statusMessage: 'not loaded' };
    this._root.dataset.on = 'false';
    this._step = -1;
    this._render();
    return { statusCode: 200 };
  }

  async updateAction(params) {
    if (!this._root) return { statusCode: 409, statusMessage: 'not loaded' };
    Object.assign(this._data, (params && params.data) || {});
    this._render();
    return { statusCode: 200 };
  }

  async customAction(params) {
    if (!this._root) return { statusCode: 409, statusMessage: 'not loaded' };
    if (params && params.id === 'highlight') {
      const tint = params.payload && params.payload.tint === 'silver' ? 'silver' : 'gold';
      this._root.dataset.tint = tint;
      return { statusCode: 200 };
    }
    return { statusCode: 400, statusMessage: `no such action "${params && params.id}"` };
  }
}
