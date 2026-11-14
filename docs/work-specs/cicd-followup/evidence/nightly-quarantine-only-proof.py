#!/usr/bin/env python3
"""Fault proof for nightly.yml's covered rule: runs the `covered` step's own bash, and the verdict's
skipped-shards line, against a fake `gh` that answers from canned data, one scenario at a time.

    python3 docs/work-specs/cicd-followup/evidence/nightly-quarantine-only-proof.py [path/to/nightly.yml]

Needs bash and jq. Exits 1 when any scenario's outputs differ from what the rule says.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile

import yaml

WORKFLOW = sys.argv[1] if len(sys.argv) > 1 else '.github/workflows/nightly.yml'
with open(WORKFLOW) as f:
    jobs = yaml.safe_load(f)['jobs']
TRIAGE = next(s for s in jobs['report']['steps'] if s.get('name', '').startswith('Triage failures'))['run']
COVERED = next(s for s in jobs['covered']['steps'] if s.get('id') == 'find')['run']
VERDICT = next(s for s in jobs['verdict']['steps'] if s.get('id') == 'verdict')['run']

SHARDS = 3
QUARANTINED = ['e2e/editor-projects.spec.ts', 'e2e/output-debate-clock.spec.ts', 'e2e/configured/x.spec.ts']

FAKE_GH = r'''#!/usr/bin/env bash
# gh api <path> [--jq <expr>]: the canned answer for the path's first matching key, through jq.
path="$2"; expr="."
while [ $# -gt 0 ]; do [ "$1" = "--jq" ] && expr="$2"; shift; done
key=""
case "$path" in
  *workflows/ci.yml/runs*) key=ci_runs ;;
  *workflows/quarantine.yml/runs*) key=q_runs ;;
  *actions/runs/*/jobs*) key=jobs ;;
  *actions/runs/*/artifacts*) key=artifacts ;;
  *contents/e2e/quarantine.json*) key=quarantine_json ;;
  *git/trees/*) key=on_disk ;;
  *commits/*/status*) key=statuses ;;
esac
[ -f "$GH_FAKE/$key.json" ] || exit 1
jq -r "$expr" "$GH_FAKE/$key.json"
'''


def base(**over):
    """A push run that qualifies, and every quarantined spec green, unless `over` says otherwise."""
    jobs = [{'name': 'CI gate', 'conclusion': 'success'}] + [
        {'name': f'E2E {i}/{SHARDS} (full)', 'conclusion': 'success'} for i in range(1, SHARDS + 1)]
    arts = [{'name': f'blob-report-{i}', 'expired': False} for i in range(1, SHARDS + 1)] + [
        {'name': f'e2e-trace-{i}', 'expired': False} for i in range(1, SHARDS + 1)]
    green = [q for q in QUARANTINED if not q.startswith('e2e/configured/')]
    data = {
        'ci_runs': {'workflow_runs': [{'id': 111, 'status': 'completed', 'conclusion': 'success', 'created_at': 'a'}]},
        'q_runs': {'workflow_runs': [{'id': 222, 'status': 'completed', 'conclusion': 'success', 'created_at': 'a'}]},
        'jobs': {'jobs': jobs},
        'artifacts': {'artifacts': arts},
        'quarantine_json': {'content': base64.b64encode(json.dumps(
            {'version': 1, 'specs': {q: {} for q in QUARANTINED}}).encode()).decode()},
        'on_disk': {'truncated': False, 'tree': [{'path': q} for q in QUARANTINED] + [{'path': 'e2e/other.spec.ts'}, {'path': 'src/a.ts'}]},
        'statuses': {'total_count': len(green), 'statuses': [
            {'state': 'success', 'context': f'noacg/quarantine/{q}'} for q in green]},
    }
    for key, fn in over.items():
        data[key] = fn(data[key])
    return data


def red_status(spec):
    return lambda st: {**st, 'statuses': [
        {**s, 'state': 'failure'} if s['context'] == f'noacg/quarantine/{spec}' else s for s in st['statuses']]}


def red_job(name):
    return lambda j: {'jobs': [{**x, 'conclusion': 'failure'} if x['name'] == name else x for x in j['jobs']]}


EDITOR = 'e2e/editor-projects.spec.ts'
SCENARIOS = [
    ('all green: shards skipped', base(), {'run': '111', 'quarantine': None}),
    ('one quarantined spec red: only it runs', base(statuses=red_status(EDITOR)),
     {'run': '111', 'quarantine': json.dumps([EDITOR], separators=(',', ':'))}),
    ('quarantined status missing: only it runs', base(statuses=lambda st: {
        'total_count': 1, 'statuses': [s for s in st['statuses'] if EDITOR not in s['context']]}),
     {'run': '111', 'quarantine': json.dumps([EDITOR], separators=(',', ':'))}),
    ('a full shard red + quarantined red: full shards',
     base(jobs=red_job(f'E2E 2/{SHARDS} (full)'), statuses=red_status(EDITOR)), {'run': None, 'quarantine': None}),
    ('a full shard red, quarantine green: full shards', base(jobs=red_job(f'E2E 2/{SHARDS} (full)')),
     {'run': None, 'quarantine': None}),
    ('CI gate red + quarantined red: full shards',
     base(jobs=red_job('CI gate'), statuses=red_status(EDITOR)), {'run': None, 'quarantine': None}),
    ('a trace missing + quarantined red: full shards', base(
        artifacts=lambda a: {'artifacts': [x for x in a['artifacts'] if x['name'] != 'e2e-trace-2']},
        statuses=red_status(EDITOR)), {'run': None, 'quarantine': None}),
    ('quarantine run failed + quarantined red: full shards', base(
        q_runs=lambda r: {'workflow_runs': [{**r['workflow_runs'][0], 'conclusion': 'failure'}]},
        statuses=red_status(EDITOR)), {'run': None, 'quarantine': None}),
    ('statuses unreadable (over 100): full shards', base(statuses=lambda st: {**st, 'total_count': 101}),
     {'run': None, 'quarantine': None}),
    ('red quarantined spec deleted from disk: shards skipped',
     base(on_disk=lambda d: {**d, 'tree': [x for x in d['tree'] if x['path'] != EDITOR]}, statuses=red_status(EDITOR)),
     {'run': '111', 'quarantine': None}),
    ('red quarantined spec below e2e/ (the planner never packs it): shards skipped',
     base(quarantine_json=lambda q: {'content': base64.b64encode(json.dumps({'version': 1, 'specs': {
         'e2e/catalog/x.spec.ts': {}}}).encode()).decode()},
          on_disk=lambda d: {**d, 'tree': d['tree'] + [{'path': 'e2e/catalog/x.spec.ts'}]}),
     {'run': '111', 'quarantine': None}),
    ('quarantined status pending: only it runs', base(statuses=lambda st: {**st, 'statuses': [
        {**s, 'state': 'pending'} if EDITOR in s['context'] else s for s in st['statuses']]}),
     {'run': '111', 'quarantine': json.dumps([EDITOR], separators=(',', ':'))}),
    ('file list unreadable + quarantined red: full shards',
     base(on_disk=lambda d: {'message': 'Not Found'}, statuses=red_status(EDITOR)), {'run': None, 'quarantine': None}),
    ('file list cut short + quarantined red: full shards',
     base(on_disk=lambda d: {**d, 'truncated': True}, statuses=red_status(EDITOR)), {'run': None, 'quarantine': None}),
    ('quarantine.json unreadable: full shards', base(quarantine_json=lambda q: {'content': 'not base64 json'}),
     {'run': None, 'quarantine': None}),
]


def outputs(path):
    out = {}
    with open(path) as f:
        for line in f:
            if '=' in line:
                k, v = line.rstrip('\n').split('=', 1)
                out[k] = v
    return out


def run_covered(data):
    with tempfile.TemporaryDirectory() as tmp:
        fake, bin_dir = os.path.join(tmp, 'fake'), os.path.join(tmp, 'bin')
        os.makedirs(fake)
        os.makedirs(bin_dir)
        for key, value in data.items():
            with open(os.path.join(fake, f'{key}.json'), 'w') as f:
                json.dump(value, f)
        gh = os.path.join(bin_dir, 'gh')
        with open(gh, 'w') as f:
            f.write(FAKE_GH)
        os.chmod(gh, 0o755)
        out = os.path.join(tmp, 'out')
        open(out, 'w').close()
        env = {**os.environ, 'PATH': f'{bin_dir}:{os.environ["PATH"]}', 'GH_FAKE': fake, 'GITHUB_OUTPUT': out,
               'GITHUB_SHA': 'abc', 'GH_REPO': 'o/r'}
        log = subprocess.run(['bash', '-c', COVERED], env=env, capture_output=True, text=True, timeout=60)
        return outputs(out), log.stdout + log.stderr


def run_verdict(e2e, run, quarantine):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'out')
        open(out, 'w').close()
        env = {**os.environ, 'GITHUB_OUTPUT': out, 'PLAN_RESULT': 'success', 'E2E_RESULT': e2e,
               'CATALOG_RESULT': 'success', 'GATES_RESULT': 'success', 'REPORT_RESULT': 'success',
               'COVERED_RUN': run, 'COVERED_QUARANTINE': quarantine}
        subprocess.run(['bash', '-c', VERDICT], env=env, check=True)
        return outputs(out).get('green')


bad = 0
for name, data, want in SCENARIOS:
    got, log = run_covered(data)
    ok = all(got.get(k) == v for k, v in want.items())
    bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'} covered: {name} -> run={got.get('run')} quarantine={got.get('quarantine')}")
    if not ok:
        print('     ' + log.replace('\n', '\n     '))

VERDICTS = [
    ('shards skipped, no quarantine list', 'skipped', '111', '', 'true'),
    ('quarantine shard green', 'success', '111', '["e2e/a.spec.ts"]', 'true'),
    ('quarantine shard red', 'failure', '111', '["e2e/a.spec.ts"]', 'false'),
    ('quarantine shard skipped (its plan failed)', 'skipped', '111', '["e2e/a.spec.ts"]', 'false'),
    ('not covered, shards skipped', 'skipped', '', '', 'false'),
]
for name, e2e, run, quarantine, want in VERDICTS:
    got = run_verdict(e2e, run, quarantine)
    ok = got == want
    bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'} verdict: {name} -> green={got}")



def run_triage(covered_shards, quarantine, planned, blobs):
    """The report job's triage step, in a scratch dir; returns the shards it names as missing."""
    repo = os.getcwd()
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, 'all-blob-reports'))
        for b in blobs:
            open(os.path.join(tmp, 'all-blob-reports', b), 'w').close()
        with open(os.path.join(tmp, 'nightly-report.json'), 'w') as f:
            json.dump({'suites': [], 'errors': [], 'stats': {}}, f)
        env = {**os.environ, 'MATRIX': json.dumps({'shardIndex': list(range(1, planned + 1)), 'shardTotal': [planned]}),
               'COVERED_SHARDS': covered_shards, 'QUARANTINE': quarantine}
        # The script's own entry check compares real paths, so it is named by its real path here.
        step = TRIAGE.replace('node scripts/', f"node {os.path.join(repo, 'scripts')}/")
        subprocess.run(['bash', '-c', step], env=env, cwd=tmp, check=True, capture_output=True)
        with open(os.path.join(tmp, 'nightly-triage.json')) as f:
            return json.load(f).get('missingShards')


TRIAGES = [
    ('covered, quarantine shard sent no report', '3', '["e2e/a.spec.ts"]', 1, ['report-1.zip', 'report-2.zip', 'report-3.zip'], [4]),
    ('covered, quarantine shard reported', '3', '["e2e/a.spec.ts"]', 1, ['report-1.zip', 'report-2.zip', 'report-3.zip', 'report-4.zip'], []),
    ('covered, no quarantine list', '3', '', 0, ['report-1.zip', 'report-2.zip', 'report-3.zip'], []),
    ('not covered, shard 2 sent none', '', '', 3, ['report-1.zip', 'report-3.zip'], [2]),
]
for name, covered_shards, quarantine, planned, blobs, want in TRIAGES:
    got = run_triage(covered_shards, quarantine, planned, blobs)
    ok = got == want
    bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'} triage: {name} -> missing={got}")

sys.exit(1 if bad else 0)
