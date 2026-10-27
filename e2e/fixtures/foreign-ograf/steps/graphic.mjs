// A hand-written OGraf v1 Graphic with a DYNAMIC step count (stepCount -1): how many steps it has
// is its data's `count`, which an update changes while it airs. The step named by `loop` starts an
// animation loop that never ends and never answers its playAction, as a held step that keeps
// moving. `hold` answers only once `release` comes; `reject` refuses. Everything it did is written
// onto its root's data attributes for e2e/foreign-ograf-sandbox.spec.ts to read.
export default class StepWalk extends HTMLElement {
  constructor() {
    super();
    this._data = { count: 3, loop: -1 };
    this._step = -1;
    this._held = [];
    this._root = null;
    this._frames = 0;
  }

  _show() {
    const r = this._root;
    r.dataset.step = this._step === null ? 'end' : String(this._step);
    r.dataset.count = String(this._data.count);
    r.dataset.held = String(this._held.length);
  }

  async load(params) {
    Object.assign(this._data, (params && params.data) || {});
    this._root = document.createElement('div');
    this._root.className = 'walk';
    this._root.dataset.frames = '0';
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

  playAction(params) {
    const p = params || {};
    const from = this._step === null ? -1 : this._step;
    const target = typeof p.goto === 'number' && p.goto >= 0 ? p.goto : from + (typeof p.delta === 'number' ? p.delta : 1);
    if (target < 0) return Promise.resolve({ statusCode: 400, statusMessage: 'no step before the first' });
    this._root.dataset.skip = String(p.skipAnimation === true);
    if (target >= this._data.count) {
      this._step = null;
      this._show();
      return Promise.resolve({ statusCode: 200 });
    }
    this._step = target;
    this._show();
    if (target !== this._data.loop) return Promise.resolve({ statusCode: 200, currentStep: target });
    // The held step's loop: it runs for as long as the step is held, and its answer never comes.
    const tick = () => {
      this._frames += 1;
      this._root.dataset.frames = String(this._frames);
      if (this._step === target) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return new Promise(() => {});
  }

  async stopAction() {
    this._step = -1;
    this._show();
    return { statusCode: 200 };
  }

  customAction(params) {
    const id = params && params.id;
    if (id === 'hold') {
      return new Promise((resolve) => {
        this._held.push(resolve);
        this._show();
      });
    }
    if (id === 'release') {
      for (const resolve of this._held.splice(0)) resolve({ statusCode: 200 });
      this._show();
      return Promise.resolve({ statusCode: 200 });
    }
    if (id === 'reject') return Promise.resolve({ statusCode: 409, statusMessage: 'not now' });
    if (id === 'mark') {
      this._root.dataset.mark = String((params.payload && params.payload.v) || '');
      return Promise.resolve({ statusCode: 200 });
    }
    return Promise.resolve({ statusCode: 404, statusMessage: 'no such action' });
  }
}
