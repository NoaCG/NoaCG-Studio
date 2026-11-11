"""Read existing #2295 diagnostic artifacts; never run tests or decide causality."""
import collections
import hashlib
import io
import json
import os
from pathlib import Path
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = 'NoaCG/NoaCG-Studio'
INITIAL_SHA = '81f782eaebf00e35a41ccec0eba5d2272a629dc0'
EXTENSION_SHA = 'bc4bf841964449e113da5fa45eefc76c9ebde315'
COMPLETION_SHA = '5688142041b4a60e19647bd08b01f4ac61208e0d'
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'endurance-output'
LIMIT = 200 * 1024 * 1024
DEADLINE = time.monotonic() + 15 * 60

def remaining_timeout():
    left = DEADLINE - time.monotonic()
    assert left > 0, '15-minute reader ceiling'
    return min(30, left)


def alarm_expired(*_):
    raise TimeoutError('15-minute reader ceiling')


def original_trace_resolved(trace):
    return bool(trace.get('traces')) and any(t.get('readings') for t in trace['traces'])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def bounded(response, limit=LIMIT):
    chunks = []
    size = 0
    while True:
        remaining_timeout()
        block = response.read(min(1024 * 1024, limit - size + 1))
        if not block:
            break
        size += len(block)
        assert size <= limit, 'download exceeds bound'
        chunks.append(block)
    return b''.join(chunks)


def request_api(endpoint, archive=False):
    remaining_timeout()
    assert endpoint.startswith('repos/' + REPO + '/actions/'), 'unexpected API scope'
    req = urllib.request.Request('https://api.github.com/' + endpoint, headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json', 'User-Agent': 'NoaCG-causality-reader',
    })
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=remaining_timeout()) as response:
            data = bounded(response, LIMIT if archive else 16 * 1024 * 1024)
    except urllib.error.HTTPError as error:
        if not archive or error.code not in (301, 302, 303, 307, 308):
            raise RuntimeError('GitHub API HTTP ' + str(error.code)) from None
        url = error.headers.get('Location', '')
        parsed = urllib.parse.urlparse(url)
        assert parsed.scheme == 'https' and parsed.hostname and (
            parsed.hostname.endswith('.blob.core.windows.net') or
            parsed.hostname.endswith('.githubusercontent.com') or
            parsed.hostname.endswith('.github.com')
        ), 'unexpected artifact storage origin'
        # New request, new opener: NEVER forward the GitHub job token to storage.
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'NoaCG-causality-reader'}), timeout=remaining_timeout()) as response:
            data = bounded(response)
    return data if archive else json.loads(data)


def checked_zip(data):
    remaining_timeout()
    archive = zipfile.ZipFile(io.BytesIO(data))
    entries = archive.infolist()
    assert len(entries) <= 20000, 'too many archive entries'
    assert len({entry.filename for entry in entries}) == len(entries), 'duplicate archive names'
    assert sum(entry.file_size for entry in entries) <= 1024 * 1024 * 1024, 'decompressed size bound'
    assert all(entry.file_size <= LIMIT for entry in entries), 'entry size bound'
    return archive


def safe_text(value):
    text = str(value)
    text = re.sub(r'https?://[^\s]+', '<url>', text)
    text = re.sub(r'eyJ[A-Za-z0-9_.-]+', '<jwt>', text)
    text = ''.join(c if c >= ' ' and c not in '\x7f\u2028\u2029' else ' ' for c in text)
    # stdout cannot become an Actions command, even when it came from an assertion.
    return text.replace('::', ': :').replace('%', '%25')[:1000]


def report_cases(suites):
    rows = []
    for suite in suites:
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                rows.append({'title': spec['title'], 'results': test['results']})
        rows.extend(report_cases(suite.get('suites', [])))
    return rows


def trial_result(archive, prefix, expected, kind):
    def read(name):
        return json.loads(archive.read(prefix + name))
    trial, report, job = read('trial.json'), read('report.json'), read('queue-result.json')
    rows = report_cases(report.get('suites', []))
    stats = report['stats']
    assert report['config']['workers'] == 1 and len(rows) == expected
    assert stats['skipped'] == 0 and stats['flaky'] == 0
    assert stats['expected'] + stats['unexpected'] == expected and not report.get('errors')
    assert all(len(r['results']) == 1 and r['results'][0]['retry'] == 0 and r['results'][0]['status'] in ('passed', 'failed', 'timedOut') for r in rows)
    assert job['state'] in ('done', 'failed') and ((job['exitCode'] == 0) == (stats['unexpected'] == 0))
    assert job['kind'] == 'sweep'
    assert b'stopped and re-queued as browser work' not in archive.read(prefix + 'queue.log')
    assert trial['kind'] == kind and trial['failed'] == (stats['unexpected'] > 0)
    failures = []
    for row in rows:
        first = row['results'][0]
        if first['status'] != 'passed':
            failures.append({'title': safe_text(row['title']), 'status': first['status'], 'errors': [safe_text(e.get('message', e)) for e in first.get('errors', [])]})
    return {k: trial[k] for k in ('pair', 'arm', 'source', 'failed', 'job')} | {'cases': len(rows), 'failures': failures}


def validate_manifest(manifest):
    primary = [x for x in manifest if x.get('condition', 'primary') == 'primary']
    completion = [x for x in manifest if x.get('condition') == 'completion-01']
    expected = {('clock', 1, i) for i in range(1, 13)} | {('operator', c, i) for c in range(1, 6) for i in range(1, 5)}
    assert len(manifest) == 33 and len({x['runId'] for x in manifest}) == 33
    assert len(primary) == 32 and len(completion) == 1
    assert {(x['kind'], x['cohort'], x['batch']) for x in primary} == expected
    for item in primary:
        assert item['sha'] == (INITIAL_SHA if item['cohort'] == 1 else EXTENSION_SHA)
        suffix = '' if item['cohort'] == 1 else f'-c{item["cohort"]}'
        assert item['ref'] == f'codex/editor-causality-20261111-{item["kind"]}{suffix}-{item["batch"]:02}'
    item = completion[0]
    assert (item['kind'], item['cohort'], item['batch'], item['sha']) == ('operator', 4, 3, COMPLETION_SHA)
    assert item['ref'] == 'codex/editor-causality-20261111-operator-c4-03-completion-01'
    assert all(isinstance(x['runId'], int) and x['runId'] > 0 for x in manifest)


def expected_observations(item):
    if item.get('condition', 'primary') == 'completion-01':
        return [(pair, arm) for pair in range(41, 46) for arm in ('parent', 'landing')] + [(46, 'parent')]
    assert item.get('condition', 'primary') == 'primary'
    size = 5 if item['kind'] == 'clock' else 15
    start = (item['batch'] - 1) * size
    return [(pair, arm) for pair in range(start + 1, start + size + 1) for arm in ('parent', 'landing')]


def receipt_inventory(archive, prefix):
    # Diagnostic only: presence/raw outcomes do NOT qualify an incomplete invocation.
    names = set(archive.namelist())
    wanted = ['intent.json', 'admission.log', 'queue-identity.json', 'queue-result.json', 'queue.log', 'report.json', 'trial.json', 'test-results/.last-run.json']
    result = {'available': [name for name in wanted if prefix + name in names]}
    for name in ['queue-result.json', 'report.json', 'test-results/.last-run.json']:
        if prefix + name not in names:
            continue
        try:
            value = json.loads(archive.read(prefix + name))
            if name == 'queue-result.json':
                result['queue'] = {key: value.get(key) for key in ['id', 'state', 'kind', 'exitCode']}
            elif name == 'report.json':
                result['rawReport'] = {'workers': value.get('config', {}).get('workers'), 'stats': value.get('stats'), 'caseStatuses': [row.get('results') and [{'status': r.get('status'), 'retry': r.get('retry')} for r in row['results']] for row in report_cases(value.get('suites', []))][:30], 'globalErrors': len(value.get('errors', []))}
            else:
                result['lastRun'] = {'status': value.get('status'), 'failedTestCount': len(value.get('failedTests', []))}
        except (ValueError, KeyError) as error:
            result[name] = {'parseError': type(error).__name__}
    return result


def read_batch(item):
    run_id = item['runId']
    run = request_api(f'repos/{REPO}/actions/runs/{run_id}')
    expected_sha = COMPLETION_SHA if item.get('condition') == 'completion-01' else INITIAL_SHA if item['cohort'] == 1 else EXTENSION_SHA
    assert run['head_sha'] == item['sha'] == expected_sha and run['head_branch'] == item['ref']
    assert run['event'] == 'workflow_dispatch' and run['run_attempt'] == 1
    assert run['status'] == 'completed', 'primary run not terminal; no replacement or inferred pass'
    artifacts = request_api(f'repos/{REPO}/actions/runs/{run_id}/artifacts?per_page=100')
    assert artifacts['total_count'] <= 100
    found = [a for a in artifacts['artifacts'] if a['name'] == f'endurance-{run_id}']
    assert len(found) == 1 and not found[0]['expired'], 'missing or ambiguous artifact'
    data = request_api(f'repos/{REPO}/actions/artifacts/{found[0]["id"]}/zip', archive=True)
    (OUT / f'original-{run_id}.zip').write_bytes(data)
    archive = checked_zip(data)
    environment = json.loads(archive.read('environment.json'))
    assert environment['head'] == item['sha'] and int(environment['run']) == run_id and environment['attempt'] == 1
    assert environment['kind'] == item['kind'] and environment['index'] == item['batch'] and environment.get('cohort', 1) == item['cohort']
    kind = item['kind']
    condition = item.get('condition', 'primary')
    assert environment.get('completion', 'primary') == condition
    rows, unresolved = [], []
    for pair, arm in expected_observations(item):
        remaining_timeout()
        prefix = f'pair-{pair:03}-{arm}/'
        try:
            trial = trial_result(archive, prefix, 24 if kind == 'clock' else 2, kind)
            assert trial['pair'] == pair and trial['arm'] == arm
            assert trial['source'] == environment['plan'][kind][arm]
            raw_trial = json.loads(archive.read(prefix + 'trial.json'))
            assert raw_trial.get('cohort', 1) == item['cohort'] and raw_trial.get('condition', 'primary') == condition
            trial.update(cohort=item['cohort'], condition=condition, plannedPair=(item['cohort'] - 1) * 60 + pair, observationId=f'{run_id}:{pair}:{arm}', pairId=f'{run_id}:{pair}')
            rows.append(trial)
        except (AssertionError, KeyError, ValueError) as error:
            unresolved.append({'pair': pair, 'arm': arm, 'error': safe_text(type(error).__name__ + ': ' + str(error)), 'receiptInventory': receipt_inventory(archive, prefix)})
    return {'kind': kind, 'cohort': item['cohort'], 'batch': item['batch'], 'condition': condition, 'run': run_id, 'conclusion': run['conclusion'], 'artifact': found[0]['id'], 'zipSha256': hashlib.sha256(data).hexdigest(), 'rows': rows, 'unresolved': unresolved}


def original_clock_trace():
    run = 43020316776
    listing = request_api(f'repos/{REPO}/actions/runs/{run}/artifacts?per_page=100')
    artifact = [a for a in listing['artifacts'] if a['id'] == 13854769457]
    assert len(artifact) == 1 and artifact[0]['name'] == 'test-results-15' and not artifact[0]['expired']
    data = request_api(f'repos/{REPO}/actions/artifacts/13854769457/zip', archive=True)
    (OUT / 'original-clock-failure.zip').write_bytes(data)
    archive = checked_zip(data)
    traces = []
    for name in archive.namelist():
        remaining_timeout()
        if name.endswith('/trace.zip') and 'output-debate-clock' in name:
            trace = checked_zip(archive.read(name))
            calls, readings = {}, []
            for member in trace.namelist():
                remaining_timeout()
                if not member.endswith('.trace'):
                    continue
                for line in trace.read(member).decode().splitlines():
                    remaining_timeout()
                    event = json.loads(line)
                    if event.get('type') == 'before' and event.get('method') == 'textContent':
                        calls[event['callId']] = safe_text(event.get('params', {}).get('selector', ''))
                    if event.get('type') == 'after' and event.get('callId') in calls:
                        value = event.get('result', {}).get('value')
                        if isinstance(value, str) and re.fullmatch(r'\d{2}:\d{2}', value):
                            readings.append({'selector': calls[event['callId']], 'time': event.get('endTime'), 'value': value})
            traces.append({'name': safe_text(name), 'readings': readings[-160:]})
    return {'run': run, 'artifact': 13854769457, 'zipSha256': hashlib.sha256(data).hexdigest(), 'traces': traces}


def summarize_results(results):
    summary = {}
    seen = set()
    for kind in ('clock', 'operator'):
        rows = [row for batch in results if batch['kind'] == kind for row in batch.get('rows', [])]
        groups = {}
        for row in rows:
            assert row['observationId'] not in seen, 'duplicate qualified observation'
            seen.add(row['observationId'])
            group = groups.setdefault(row['pairId'], {})
            assert row['arm'] not in group, 'duplicate arm in within-worker pair'
            group[row['arm']] = row
        pairs = [g for g in groups.values() if set(g) == {'parent', 'landing'}]
        unpaired = [r['observationId'] for g in groups.values() if len(g) == 1 for r in g.values()]
        summary[kind] = {'arms': {arm: {'qualified': sum(r['arm'] == arm for r in rows), 'failed': sum(r['arm'] == arm and r['failed'] for r in rows)} for arm in ('parent', 'landing')}, 'completeWithinWorkerPairs': len(pairs), 'unpairedObservationIds': unpaired, 'discordance': {'parentOnlyFailure': sum(g['parent']['failed'] and not g['landing']['failed'] for g in pairs), 'landingOnlyFailure': sum(g['landing']['failed'] and not g['parent']['failed'] for g in pairs), 'bothFailed': sum(g['parent']['failed'] and g['landing']['failed'] for g in pairs)}}
    for label, condition in [('original', 'primary'), ('completion', 'completion-01')]:
        unresolved = [u for b in results if b.get('condition', 'primary') == condition and isinstance(b.get('unresolved'), list) for u in b['unresolved']]
        summary[label + 'UnqualifiedAttempts'] = sum(bool(u.get('receiptInventory', {}).get('available')) for u in unresolved)
        summary[label + 'UnadmittedSlots'] = sum(not u.get('receiptInventory', {}).get('available') for u in unresolved)
    summary['note'] = 'Qualified observations only; original missing terminal receipts stay unqualified. No causal verdict; a failed original workflow is not turned green.'
    return summary


def main():
    assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_REPOSITORY') == REPO
    assert os.environ.get('GITHUB_REF_NAME') == 'codex/editor-causality-evidence-reader-20261111'
    assert os.environ.get('GITHUB_RUN_ATTEMPT') == '1'
    manifest = json.loads((ROOT / 'scripts/editor-causality-evidence-runs.json').read_text())
    validate_manifest(manifest)
    OUT.mkdir(exist_ok=True)
    signal.signal(signal.SIGALRM, alarm_expired)
    signal.setitimer(signal.ITIMER_REAL, max(0.001, DEADLINE - time.monotonic()))
    results = []
    for item in manifest:
        try:
            result = read_batch(item)
        except Exception as error:
            result = {'kind': item['kind'], 'cohort': item['cohort'], 'batch': item['batch'], 'run': item['runId'], 'unresolved': safe_text(type(error).__name__)}
        results.append(result)
        (OUT / 'analysis.json').write_text(json.dumps(results, indent=2) + '\n')
        print('MEASUREMENT ' + json.dumps(result), flush=True)
    summary = summarize_results(results)
    (OUT / 'qualified-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print('QUALIFIED_SUMMARY ' + json.dumps(summary), flush=True)
    try:
        trace = original_clock_trace()
        assert original_trace_resolved(trace), 'required original clock trace/readings missing'
        (OUT / 'original-clock-trace-summary.json').write_text(json.dumps(trace, indent=2) + '\n')
        print('ORIGINAL_TRACE ' + json.dumps(trace), flush=True)
    except Exception as error:
        trace = {'unresolved': type(error).__name__}
        (OUT / 'original-clock-trace-summary.json').write_text(json.dumps(trace, indent=2) + '\n')
        print('ORIGINAL_TRACE_UNRESOLVED ' + type(error).__name__, flush=True)
    signal.setitimer(signal.ITIMER_REAL, 0)
    if trace.get('unresolved') or any(x.get('unresolved') for x in results):
        sys.exit(1)

if __name__ == '__main__':
    main()
