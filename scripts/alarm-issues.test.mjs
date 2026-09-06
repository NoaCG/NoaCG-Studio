import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describeAlarms, describeHours, formatAlarms, isAlarmTitle } from './alarm-issues.mjs';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-06T08:00:00Z');
const ago = (hours) => new Date(NOW - hours * HOUR).toISOString();

/**
 * Every rolling-alarm title .github/workflows/ actually files, read out of the workflows rather
 * than copied into a list here.
 *
 * Copying them is what a hand-kept list does, and it is exactly how the first version of this
 * file covered five alarms out of seven: the suffix rule looked complete, and the two titles that
 * do not end in "is red" (deploy-verify's and nightly-drift's) were simply never thought about.
 * Reading the workflows means adding an alarm in a shape nobody anticipated fails HERE, loudly,
 * in `npm run build`, rather than going quietly unreported for however long it takes somebody to
 * notice an alarm they never saw.
 */
function workflowAlarmTitles() {
  const dir = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
  const titles = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    // The three shapes the workflows use: a shell `TITLE="..."`, an `ISSUE_TITLE:` env value, and
    // a bare `title:` in an inline gh-api payload. All three are alarms here; nothing else in
    // these files uses a title key, which is what makes reading them this bluntly safe.
    for (const m of text.matchAll(/^\s*(?:ISSUE_)?(?:TITLE|title)(?:=|:\s*)"?([^"\n]+?)"?\s*$/gm)) {
      const title = m[1].trim();
      // Skip anything interpolated - a title built from an expression is not a literal to check.
      if (title && !title.includes('${{') && !title.includes('$')) titles.add(title);
    }
  }
  return [...titles];
}

test('the workflows really do file rolling alarms, so the check below means something', () => {
  const titles = workflowAlarmTitles();
  assert.ok(titles.length >= 5, `expected several alarm titles in .github/workflows/, found ${titles.length}`);
  assert.ok(titles.includes('CI is red on main'));
});

test('every rolling alarm the workflows file is recognised as one', () => {
  for (const title of workflowAlarmTitles()) {
    assert.equal(isAlarmTitle(title), true, `unrecognised alarm title: ${title}`);
  }
});

// The two that do not end in "is red", named because the suffix rule alone missed them and they
// are the alarms about something having gone QUIET - the most expensive kind to not be told about.
test('an alarm that fires about silence is recognised too', () => {
  assert.equal(isAlarmTitle('Production is not running the latest main commit'), true);
  assert.equal(isAlarmTitle('Nightly sweep has not run'), true);
});

test('an ordinary issue is never swept up as an alarm', () => {
  for (const title of [
    'North Star 2027',
    'The take button is red on the dark theme',
    'is redirected to the wrong page',
    '',
    null,
  ]) {
    assert.equal(isAlarmTitle(title), false, JSON.stringify(title));
  }
});

test('alarms are picked out of the open issues, oldest break first', () => {
  const alarms = describeAlarms(
    [
      { number: 57, title: 'Hosted-latency suite is red', url: 'u57', createdAt: ago(2), updatedAt: ago(1) },
      { number: 48, title: 'North Star 2027', url: 'u48', createdAt: ago(200), updatedAt: ago(9) },
      { number: 56, title: 'CI is red on main', url: 'u56', createdAt: ago(9), updatedAt: ago(3) },
    ],
    NOW,
  );
  assert.deepEqual(alarms.map((a) => a.number), [56, 57]);
  assert.equal(alarms[0].openHours, 9);
  assert.equal(alarms[0].quietHours, 3);
});

test('an unreadable timestamp costs the age, never the alarm', () => {
  const [alarm] = describeAlarms([{ number: 1, title: 'CI is red on main', createdAt: 'soon' }], NOW);
  assert.equal(alarm.number, 1);
  assert.equal(alarm.openHours, null);
  assert.equal(describeHours(alarm.openHours), '');
});

test('a break is aged at the resolution it is worth reading', () => {
  assert.equal(describeHours(0), 'under an hour');
  assert.equal(describeHours(9), '9h');
  assert.equal(describeHours(47), '47h');
  assert.equal(describeHours(48), '2d');
});

test('nothing open prints nothing at all', () => {
  assert.deepEqual(formatAlarms([]), []);
  assert.deepEqual(formatAlarms([], { asOfMinutes: 40 }), []);
});

test('an open alarm names itself, its age and the link, and says it blocks no landing', () => {
  const lines = formatAlarms(describeAlarms(
    [{ number: 56, title: 'Configured (authenticated) E2E suite is red', url: 'https://x/56', createdAt: ago(9), updatedAt: ago(1) }],
    NOW,
  ));
  assert.match(lines[0], /^RED ON MAIN: 1 rolling alarm open - /);
  assert.equal(lines[1], '  #56  Configured (authenticated) E2E suite is red  - open 9h');
  assert.equal(lines[2], '      https://x/56');
  assert.match(lines.at(-1), /gates on ci\.yml alone/);
});

test('two alarms are counted in the plural', () => {
  const lines = formatAlarms(describeAlarms(
    [
      { number: 56, title: 'CI is red on main', createdAt: ago(9), updatedAt: ago(1) },
      { number: 57, title: 'Hosted-latency suite is red', createdAt: ago(2), updatedAt: ago(1) },
    ],
    NOW,
  ));
  assert.match(lines[0], /^RED ON MAIN: 2 rolling alarms open - /);
});

// A stale answer is worth printing, but only if it admits its age - otherwise an alarm closed
// twenty minutes ago reads as still open and somebody goes looking for a break that is fixed.
test('a stale read stamps how old it is, and a fresh one does not', () => {
  const alarms = describeAlarms([{ number: 56, title: 'CI is red on main', createdAt: ago(9) }], NOW);
  assert.match(formatAlarms(alarms, { asOfMinutes: 40 })[0], /read 40 min ago/);
  // Specific, because "already" in the headline contains the letters of "read".
  assert.doesNotMatch(formatAlarms(alarms, { asOfMinutes: 0 })[0], /read \d+ min ago/);
  assert.doesNotMatch(formatAlarms(alarms, { asOfMinutes: null })[0], /read \d+ min ago/);
});
