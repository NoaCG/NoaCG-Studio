import { writeFileSync } from 'node:fs';
export default class {
  tests = [];
  steps = {};
  onBegin(config) { this.workers = config.workers; this.start = Date.now(); }
  onStepEnd(test, result, step) {
    if (step.parent) return;
    const kind = step.title.startsWith('page.goto') ? 'navigation'
      : step.title.includes('home-page') ? 'home-readiness' : step.category;
    const bucket = this.steps[kind] ||= { count: 0, ms: 0 };
    bucket.count++; bucket.ms += step.duration;
  }
  onTestEnd(test, result) {
    this.tests.push({ file: test.location.file.split('/').pop(), title: test.title, status: result.status, expected: test.expectedStatus, ms: result.duration, retry: result.retry });
  }
  onEnd(result) {
    const data = { arm: process.env.PILOT_ARM, workers: this.workers, status: result.status, elapsedMs: Date.now()-this.start, tests: this.tests, steps: this.steps };
    writeFileSync('pilot.json', JSON.stringify(data, null, 2));
    console.log('PILOT', JSON.stringify({ ...data, tests: this.tests.length }));
  }
}
