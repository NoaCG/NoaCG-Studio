import os, pathlib, subprocess

spec = os.environ['DIAG_SPEC']
assert spec in ['relay-cold-boot', 'publish-guard']
p = pathlib.Path('e2e/configured/' + spec + '.spec.ts')
if spec == 'relay-cold-boot' and os.environ['DIAG_INJECT'] == 'true':
    s = p.read_text()
    s = s.replace("  await signIn(page);", """  let releaseResolve!: () => void;
  const resolveHeld = new Promise<void>(r => { releaseResolve = r; });
  let sends = 0;
  let resendDone = false;
  await page.route('**/rest/v1/rpc/control_show_resolve', async route => {
    const response = await route.fetch();
    await resolveHeld;
    await route.fulfill({ response });
  });
  await page.route('**/rest/v1/rpc/control_send_many', async route => {
    sends += 1;
    const response = await route.fetch();
    if (sends === 1) {
      await route.abort('failed');
      releaseResolve();
    } else {
      await route.fulfill({ response });
      resendDone = true;
    }
  });
  await signIn(page);""", 1)
    s = s.replace('  // THE SHAPE THE RULE READS', "  await expect.poll(() => resendDone).toBe(true);\n  expect(sends).toBe(2);\n\n  // THE SHAPE THE RULE READS", 1)
    p.write_text(s)
if spec == 'publish-guard' and os.environ['DIAG_INJECT'] == 'true':
    s = p.read_text()
    needle = "  const refused = (await published(page, showId, STRAP))!;"
    injection = """  if (test.info().retry === 0) {
    await page.route('**/rest/v1/control_shows?**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET' || url.searchParams.get('select') !== 'output') return route.continue();
      await route.fulfill({ status: 500, json: { code: '57014', message: 'canceling statement due to statement timeout' } });
    });
  }
"""
    assert needle in s
    p.write_text(s.replace(needle, injection + needle, 1))
result = subprocess.run(['timeout', '300s', 'npm', 'run', 'test:e2e:live', '--', 'e2e/configured/' + spec + '.spec.ts', '--trace=retain-on-failure'])
raise SystemExit(result.returncode)
