import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { aliasPinnedChromium } from './cloud-session-setup.mjs';

/** A browsers folder shaped like the cloud image's: build 1194 in the old `chrome-linux` layout. */
function imageWith1194() {
  const dir = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  for (const [folder, exe] of [['chromium', 'chrome'], ['chromium_headless_shell', 'headless_shell']]) {
    const bin = join(dir, `${folder}-1194`, 'chrome-linux');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, exe), '');
    writeFileSync(join(bin, 'icudtl.dat'), '');
    writeFileSync(join(dir, `${folder}-1194`, 'INSTALLATION_COMPLETE'), '');
  }
  return dir;
}

test('a missing pinned build is pointed at the image build, under the new layout names', () => {
  const dir = imageWith1194();
  try {
    const linked = aliasPinnedChromium(dir, { chromium: '1228', 'chromium-headless-shell': '1228' });
    assert.deepEqual(linked, ['chromium-1228 -> chromium-1194', 'chromium_headless_shell-1228 -> chromium_headless_shell-1194']);
    // The executables Playwright 1228 launches, and the files beside them.
    assert.equal(readlinkSync(join(dir, 'chromium-1228', 'chrome-linux64', 'chrome')), join(dir, 'chromium-1194', 'chrome-linux', 'chrome'));
    assert.equal(
      readlinkSync(join(dir, 'chromium_headless_shell-1228', 'chrome-headless-shell-linux64', 'chrome-headless-shell')),
      join(dir, 'chromium_headless_shell-1194', 'chrome-linux', 'headless_shell'),
    );
    assert.ok(existsSync(join(dir, 'chromium-1228', 'chrome-linux64', 'icudtl.dat')));
    assert.ok(existsSync(join(dir, 'chromium-1228', 'INSTALLATION_COMPLETE')));
    // Idempotent: a second session start finds nothing to do.
    assert.deepEqual(aliasPinnedChromium(dir, { chromium: '1228', 'chromium-headless-shell': '1228' }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pinned build the image really has is left alone, and a missing folder is not an error', () => {
  const dir = imageWith1194();
  try {
    assert.deepEqual(aliasPinnedChromium(dir, { chromium: '1194', 'chromium-headless-shell': '1194' }), []);
    assert.deepEqual(aliasPinnedChromium(join(dir, 'nope'), { chromium: '1228' }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
