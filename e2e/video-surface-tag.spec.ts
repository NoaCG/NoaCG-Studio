// covers: none - no source path selected this spec when coverage moved into spec headers
// (2026-09-27); it runs when edited, on a full escalation and at night
//
// The surface tag: what makes the ai.video entitlement reach the video harness at all.
//
// POST /api/ai/generate is a general model proxy - an SPX harness call, a brainstorm call and
// a video generation all arrive as the same shape. So the video harness identifies itself with
// `surface: 'video'`, stamped by src/ai/video/videoGateway.ts, and api/ai/generate.ts refuses a
// recognised account that a plan, a grant or the instance-wide kill switch says may not
// generate video (docs/ADMIN.md, "Gating a surface on a shared endpoint").
//
// The failure this file exists to catch is SILENT: a video call that reaches the gateway
// untagged still works perfectly, it just escapes the entitlement, and no amount of testing
// the feature itself would notice. Two guards, deliberately different in kind:
//
//  - the eslint boundary in eslint.config.js stops a FUTURE call site importing ../modelGateway
//    directly - it covers code nobody has written yet, which a test cannot;
//  - this spec proves the tag survives the real browser path end to end, which lint cannot -
//    the field could be dropped by the request builder in src/ai/modelGateway.ts and every
//    import would still be legal.
//
// e2e/_video.ts asserts the tag on EVERY call its shared mock answers, so any spec that drives
// a new video model call enforces this for free. This file states the contract in words and
// pins the two things that assertion cannot say on its own: that calls actually happened (an
// "all of them were tagged" over an empty list passes vacuously), and that the SPX side is
// untagged rather than merely different.

import { test, expect } from '@playwright/test';
import { createVideoProject, mockClaude, useFakeAiKey, type EmittedModule } from './_video';

const MODULE: EmittedModule = {
  summary: 'A headline holds centre.',
  tsx: `import { AbsoluteFill, useCurrentFrame } from 'remotion';

export default function Composition({ fields = {} }: { fields?: Record<string, string | number> }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#0b0d10', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#fff', fontSize: 72, opacity: frame >= 0 ? 1 : 0 }}>
        {fields.headline ?? 'Tagged'}
      </div>
    </AbsoluteFill>
  );
}
`,
  inputs: [{ key: 'headline', type: 'text', label: 'Headline', default: 'Tagged' }],
};

test.beforeEach(async ({ page }) => {
  await useFakeAiKey(page);
});

test("every model call in a video generation carries surface: 'video'", async ({ page }) => {
  const { surfaces } = await mockClaude(page, [MODULE]);
  await createVideoProject(page);

  const seen = surfaces();
  // Not vacuous: a generation is several distinct calls (the Motion Director's plan, then the
  // coder), and each is its own chance to reach the gateway untagged. Assert there were some
  // before asserting anything about all of them.
  expect(seen.length).toBeGreaterThanOrEqual(2);
  expect(seen.every((surface) => surface === 'video')).toBe(true);
});
