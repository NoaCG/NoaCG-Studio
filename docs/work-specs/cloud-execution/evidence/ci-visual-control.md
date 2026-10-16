# Ubuntu CI snapshot control

Source: main `55d01c993188d66e61f3ab9ccbe64e7d41cf06bd`, [CI 38886446699](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38886446699).
Whole decoded job logs were fetched through the connected GitHub log interface.
The successful jobs executed the same snapshot cases that failed in the Debian cloud run.
This establishes a runtime-dependent result, not the precise underlying font/library cause.

[Shard 7 job 116930201092](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38886446699/job/116930201092):

```text
2026-10-16T10:32:58.4379378Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/Ubuntu2404-Readme.md
2026-10-16T10:44:51.4624022Z [162/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › index chrome at desktop
2026-10-16T10:44:51.9972496Z [163/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › ograf chrome at desktop
2026-10-16T10:44:52.9303888Z [164/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › privacy chrome at desktop
2026-10-16T10:44:53.3290614Z [165/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › terms chrome at desktop
2026-10-16T10:44:53.7259525Z [166/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › docs chrome at desktop
2026-10-16T10:44:54.3391035Z [167/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › downloads chrome at desktop
2026-10-16T10:44:54.7882632Z [168/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › whats-new chrome at desktop
2026-10-16T10:44:55.2042013Z [169/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › roadmap chrome at desktop
2026-10-16T10:44:55.5847847Z [170/245] [chromium] › e2e/public-chrome-baseline.spec.ts:65:3 › ograf page at desktop
2026-10-16T10:44:56.4253064Z [171/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › index chrome at phone
2026-10-16T10:44:56.8724729Z [172/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › ograf chrome at phone
2026-10-16T10:44:57.7223750Z [173/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › privacy chrome at phone
2026-10-16T10:44:58.0691845Z [174/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › terms chrome at phone
2026-10-16T10:44:58.4181443Z [175/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › docs chrome at phone
2026-10-16T10:44:58.9836367Z [176/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › downloads chrome at phone
2026-10-16T10:44:59.3699999Z [177/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › whats-new chrome at phone
2026-10-16T10:44:59.7353509Z [178/245] [chromium] › e2e/public-chrome-baseline.spec.ts:54:5 › roadmap chrome at phone
2026-10-16T10:45:00.0850938Z [179/245] [chromium] › e2e/public-chrome-baseline.spec.ts:65:3 › ograf page at phone
  209 passed (16.5m)
```

[Shard 10 job 116930201069](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38886446699/job/116930201069):

```text
2026-10-16T10:42:23.9047359Z [152/214] [chromium] › e2e/playout-baseline.spec.ts:178:3 › graphics only, at 1920x1080
2026-10-16T10:42:28.8277279Z [153/214] [chromium] › e2e/playout-baseline.spec.ts:197:3 › graphics and server cues, at 1920x1080
2026-10-16T10:42:33.5576854Z [154/214] [chromium] › e2e/playout-baseline.spec.ts:214:3 › folders, at 1920x1080
2026-10-16T10:42:39.5894509Z [155/214] [chromium] › e2e/playout-baseline.spec.ts:178:3 › graphics only, at 1366x768
2026-10-16T10:42:44.3167782Z [156/214] [chromium] › e2e/playout-baseline.spec.ts:197:3 › graphics and server cues, at 1366x768
2026-10-16T10:42:49.0499675Z [157/214] [chromium] › e2e/playout-baseline.spec.ts:214:3 › folders, at 1366x768
  165 passed (16.1m)
```
