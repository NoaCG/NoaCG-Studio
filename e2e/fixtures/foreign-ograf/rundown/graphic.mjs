// A hand-written OGraf v1 Graphic with three steps. Every value it is given is written onto its
// root as it came (`data-values`, JSON, so a number stays a number), with where it is (`data-step`)
// and whether it is up (`data-on`). Its Take is refused (503) while its data's `fail` is "yes".
// `mark` writes its argument. Read by e2e/configured/ograf-rundown.spec.ts.
export default class RundownCard extends HTMLElement {
  constructor() {
    super();
    this._data = {};
    this._step = -1;
    this._root = null;
  }

  _show() {
    const r = this._root;
    r.dataset.values = JSON.stringify(this._data);
    r.dataset.step = String(this._step);
    r.dataset.on = String(this._step >= 0);
    r.textContent = this._step >= 0 ? `${this._data.headline || ''} ${this._data.score === undefined ? '' : this._data.score}`.trim() : '';
    r.style.opacity = this._step >= 0 ? '1' : '0';
  }

  async load(params) {
    Object.assign(this._data, (params && params.data) || {});
    this._root = document.createElement('div');
    this._root.className = 'card';
    this._root.style.cssText = 'position:absolute;left:120px;bottom:120px;padding:24px 40px;background:#12355b;color:#fff;font:600 56px/1.2 sans-serif;border-radius:8px';
    this.appendChild(this._root);
    this._show();
    return { statusCode: 200 };
  }

  async dispose() {
    this._root.remove();
    return { statusCode: 200 };
  }

  async updateAction(params) {
    Object.assign(this._data, (params && params.data) || {});
    this._show();
    return { statusCode: 200 };
  }

  async playAction(params) {
    if (this._data.fail === 'yes') return { statusCode: 503, statusMessage: 'not ready' };
    const p = params || {};
    const target = typeof p.goto === 'number' ? p.goto : this._step + (typeof p.delta === 'number' ? p.delta : 1);
    if (target < 0 || target > 2) return { statusCode: 400, statusMessage: 'no such step' };
    this._step = target;
    this._show();
    return { statusCode: 200, currentStep: target };
  }

  async stopAction() {
    this._step = -1;
    this._show();
    return { statusCode: 200 };
  }

  async customAction(params) {
    if (params && params.id === 'mark') {
      this._root.dataset.mark = String((params.payload && params.payload.v) || '');
      return { statusCode: 200 };
    }
    return { statusCode: 404, statusMessage: 'no such action' };
  }
}
