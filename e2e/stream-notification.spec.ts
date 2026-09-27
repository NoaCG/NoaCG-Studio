// covers: src/templates/**

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
});

test('event notifications queue complete payloads and support hold, replay, skip and snap recovery', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { validateMachine } = await import('/src/blocks/animMachine.ts');

    const template = variantById('sn01')!.create({});
    const data = parseAnimData(template.js)!;
    const main = data.machine!.groups[0];
    const path = main.defaultPath!;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(frame);
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('notification iframe failed to load'));
      frame.srcdoc = composeDocument(template);
    });

    const win = frame.contentWindow as unknown as {
      document: Document;
      gsap: { globalTimeline: { timeScale(value: number): void } };
      queueNotification(payload: Record<string, string>): number;
      noacgDispatch(event: string): { progress?(value: number): void } | null;
      noacgSnap(assignments: Record<string, string> | null, options?: { timers?: boolean }): void;
      noacgMachineState(): { groups: Record<string, string> };
      notificationQueue: Array<Record<string, string>>;
    };
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const state = () => win.noacgMachineState().groups.main;
    const actor = () => win.document.getElementById('f1')?.textContent ?? '';
    const waitFor = async (read: () => string, wanted: string, budget = 3000) => {
      for (let waited = 0; waited < budget; waited += 20) {
        if (read() === wanted) return read();
        await sleep(20);
      }
      return read();
    };
    const finish = (timeline: { progress?(value: number): void } | null) => {
      timeline?.progress?.(1);
      return !!timeline;
    };

    win.gsap.globalTimeline.timeScale(20);
    const firstQueueDepth = win.queueNotification({
      eventLabel: 'NEW FOLLOWER',
      actor: 'first-viewer',
      amount: '',
      message: 'First event',
      avatar: '',
    });
    const secondQueueDepth = win.queueNotification({
      eventLabel: 'RAID INCOMING',
      actor: 'raid-captain',
      amount: '48 VIEWERS',
      message: 'Second event',
      avatar: '',
    });

    const reachedTimedHold = await waitFor(state, path[1]);
    const firstActor = actor();
    win.noacgDispatch('hold');
    const reachedManualHold = await waitFor(state, 'manual-hold');
    const holdAccepted = reachedManualHold === 'manual-hold';

    // A manual hold outlives the ordinary six-second dwell even on an accelerated timeline.
    await sleep(450);
    const stayedHeld = state();
    const heldActor = actor();

    // Replay re-runs the entrance with the same payload and does not consume the FIFO.
    const replayAccepted = finish(win.noacgDispatch('replay'));
    const replayState = await waitFor(state, path[0]);
    const replayActor = actor();
    await waitFor(state, path[1]);

    // Skip runs the real Out step. Its authored end callback starts the next snapshot.
    const skipAccepted = finish(win.noacgDispatch('skip'));
    const secondActor = await waitFor(actor, 'raid-captain');
    const secondState = state();

    // SNAP is the recovery path: no transition animation and no queue item is consumed.
    win.noacgSnap({ main: 'manual-hold' }, { timers: false });
    const snappedHeld = state();
    const snappedActor = actor();
    win.noacgSnap(null, { timers: false });
    const snappedOff = state();
    const queueAfterSnap = win.notificationQueue.length;

    frame.remove();
    return {
      stepNames: data.steps.map((step) => step.name),
      validation: validateMachine(data),
      controls: data.machine!.controls?.map((control) => control.event),
      firstQueueDepth,
      secondQueueDepth,
      reachedTimedHold,
      firstActor,
      holdAccepted,
      reachedManualHold,
      stayedHeld,
      heldActor,
      replayAccepted,
      replayState,
      replayActor,
      skipAccepted,
      secondActor,
      secondState,
      snappedHeld,
      snappedActor,
      snappedOff,
      queueAfterSnap,
    };
  });

  expect(result.stepNames).toEqual(['Enter', 'Hold', 'Out']);
  expect(result.validation).toEqual({ errors: [], warnings: [] });
  expect(result.controls).toEqual(['hold', 'resume', 'replay', 'skip']);
  expect(result.firstQueueDepth).toBe(0);
  expect(result.secondQueueDepth).toBe(1);
  expect(result.reachedTimedHold).not.toBe('off');
  expect(result.firstActor).toBe('first-viewer');
  expect(result.holdAccepted).toBe(true);
  expect(result.reachedManualHold).toBe('manual-hold');
  expect(result.stayedHeld).toBe('manual-hold');
  expect(result.heldActor).toBe('first-viewer');
  expect(result.replayAccepted).toBe(true);
  expect(result.replayState).not.toBe('manual-hold');
  expect(result.replayActor).toBe('first-viewer');
  expect(result.skipAccepted).toBe(true);
  expect(result.secondActor).toBe('raid-captain');
  expect(result.secondState).not.toBe('off');
  expect(result.snappedHeld).toBe('manual-hold');
  expect(result.snappedActor).toBe('raid-captain');
  expect(result.snappedOff).toBe('off');
  expect(result.queueAfterSnap).toBe(0);
});

test('all four stream-notification designs create with the shared direct field contract', async ({ page }) => {
  const rows = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return variantsFor('stream-notification').map((variant) => {
      const template = variant.create({});
      const data = parseAnimData(template.js)!;
      return {
        id: variant.id,
        type: template.type,
        fields: template.fields.map((field) => `${field.field}:${field.ftype}`),
        direct: template.fields.every((field) => template.html.includes(`id="${field.field}"`)),
        hasQueue: template.js.includes('function queueNotification'),
        hasMachine: !!data.machine,
      };
    });
  });

  expect(rows).toHaveLength(4);
  for (const row of rows) {
    expect(row.type).toBe('stream-notification');
    expect(row.fields).toEqual([
      'f0:textfield',
      'f1:textfield',
      'f2:textfield',
      'f3:textarea',
      'f4:filelist',
    ]);
    expect(row.direct).toBe(true);
    expect(row.hasQueue).toBe(true);
    expect(row.hasMachine).toBe(true);
  }
});

test('all four stream-notification designs pass the live runtime bench', async ({ page }) => {
  test.setTimeout(120_000);
  const rows = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { benchTemplateRuntime } = await import('/src/validation/runtimeBench.ts');
    const results = [];
    for (const variant of variantsFor('stream-notification')) {
      const bench = await benchTemplateRuntime(variant.create({}));
      results.push({
        id: variant.id,
        ok: bench.ok,
        errors: bench.errors.map((issue) => `${issue.rule}: ${issue.message}`),
        warnings: bench.warnings.map((issue) => `${issue.rule}: ${issue.message}`),
      });
    }
    return results;
  });

  expect(rows).toHaveLength(4);
  for (const row of rows) {
    expect(row.errors, `${row.id} runtime errors`).toEqual([]);
    expect(row.ok, `${row.id} did not pass the runtime bench: ${row.warnings.join('; ')}`).toBe(true);
  }
});
