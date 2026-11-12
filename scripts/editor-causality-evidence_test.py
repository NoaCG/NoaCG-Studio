import importlib.util
import io
from pathlib import Path
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('editor-causality-evidence.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

class ReaderTests(unittest.TestCase):
    def test_manifest_binds_all_cohorts_to_literal_heads_refs_and_unique_native_ids(self):
        import copy
        import json
        manifest = json.loads(Path(__file__).with_name('editor-causality-evidence-runs.json').read_text())
        reader.validate_manifest(manifest)
        for field, value in [('sha', '0' * 40), ('ref', 'main'), ('cohort', 6), ('runId', manifest[1]['runId'])]:
            changed = copy.deepcopy(manifest)
            changed[0][field] = value
            with self.assertRaises(AssertionError):
                reader.validate_manifest(changed)
        with self.assertRaises(AssertionError):
            reader.validate_manifest(manifest[:-1])

    def test_partial_receipt_inventory_reports_raw_presence_without_qualifying_it(self):
        import json
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('pair-041-parent/report.json', json.dumps({'config': {'workers': 1}, 'stats': {'expected': 2}, 'suites': []}))
            archive.writestr('pair-041-parent/test-results/.last-run.json', json.dumps({'status': 'passed', 'failedTests': []}))
        result = reader.receipt_inventory(reader.checked_zip(data.getvalue()), 'pair-041-parent/')
        self.assertEqual(result['available'], ['report.json', 'test-results/.last-run.json'])
        self.assertNotIn('queue', result)
        self.assertNotIn('qualified', result)
        self.assertEqual(result['rawReport']['stats']['expected'], 2)

    def test_completion_read_plan_is_exactly_five_pairs_and_one_parent(self):
        import json
        manifest = json.loads(Path(__file__).with_name('editor-causality-evidence-runs.json').read_text())
        item = next(x for x in manifest if x.get('condition') == 'completion-01')
        rows = reader.expected_observations(item)
        self.assertEqual(len(rows), 11)
        self.assertEqual(sum(a == 'parent' for _, a in rows), 6)
        self.assertEqual(sum(a == 'landing' for _, a in rows), 5)
        self.assertEqual(rows[-1], (46, 'parent'))
        wrong = [dict(x) for x in manifest]
        wrong[-1]['sha'] = reader.EXTENSION_SHA
        with self.assertRaises(AssertionError): reader.validate_manifest(wrong)
        wrong[-1]['sha'] = reader.COMPLETION_SHA
        wrong[-1]['ref'] = 'codex/editor-causality-20261111-operator-c4-03-completion-02'
        with self.assertRaises(AssertionError): reader.validate_manifest(wrong)

    def test_summary_retains_unmatched_observations_without_pairing_across_workers(self):
        def row(run, pair, arm, failed=False):
            return {'observationId': f'{run}:{pair}:{arm}', 'pairId': f'{run}:{pair}', 'arm': arm, 'failed': failed}
        original = [row(1, 1, 'parent'), row(1, 1, 'landing', True), row(1, 2, 'parent', True), row(1, 2, 'landing'), row(1, 3, 'landing')]
        completed = [row(2, 3, 'parent'), row(2, 3, 'landing'), row(2, 4, 'parent', True)]
        results = [{'kind': 'operator', 'rows': original, 'unresolved': [{'receiptInventory': {'available': ['intent.json', 'report.json']}}, {'receiptInventory': {'available': []}}]}, {'kind': 'operator', 'rows': completed, 'unresolved': []}]
        summary = reader.summarize_results(results)
        self.assertEqual(summary['operator']['arms'], {'parent': {'qualified': 4, 'failed': 2}, 'landing': {'qualified': 4, 'failed': 1}})
        self.assertEqual(summary['operator']['completeWithinWorkerPairs'], 3)
        self.assertEqual(set(summary['operator']['unpairedObservationIds']), {'1:3:landing', '2:4:parent'})
        self.assertEqual(summary['originalUnqualifiedAttempts'], 1)
        self.assertEqual(summary['originalUnadmittedSlots'], 1)
        partial_completion = {'kind': 'operator', 'condition': 'completion-01', 'rows': [], 'unresolved': [{'receiptInventory': {'available': ['intent.json']}}, {'receiptInventory': {'available': []}}]}
        partial_summary = reader.summarize_results(results + [partial_completion])
        self.assertEqual(partial_summary['originalUnqualifiedAttempts'], 1)
        self.assertEqual(partial_summary['originalUnadmittedSlots'], 1)
        self.assertEqual(partial_summary['completionUnqualifiedAttempts'], 1)
        self.assertEqual(partial_summary['completionUnadmittedSlots'], 1)
        results[-1]['rows'].append(original[0])
        with self.assertRaises(AssertionError): reader.summarize_results(results)

    def test_original_trace_completion_requires_observed_clock_readings(self):
        for trace in [{}, {'traces': []}, {'traces': [{'readings': []}]}]:
            self.assertFalse(reader.original_trace_resolved(trace))
        self.assertTrue(reader.original_trace_resolved({'traces': [{'readings': [{'value': '05:02'}]}]}))

    def test_deadline_refuses_new_requests_and_archive_parsing(self):
        with patch.object(reader.time, 'monotonic', return_value=reader.DEADLINE + 1), patch.object(reader.urllib.request, 'build_opener') as network:
            with self.assertRaises(AssertionError):
                reader.request_api('repos/NoaCG/NoaCG-Studio/actions/runs/1')
            with self.assertRaises(AssertionError):
                reader.checked_zip(b'')
            network.assert_not_called()
        with patch.object(reader.time, 'monotonic', return_value=reader.DEADLINE - 2):
            self.assertEqual(reader.remaining_timeout(), 2)
        with self.assertRaises(TimeoutError):
            reader.alarm_expired()

    def test_duplicate_archive_entries_are_rejected(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('trial.json', '{}')
            archive.writestr('trial.json', '{}')
        with self.assertRaises(AssertionError):
            reader.checked_zip(data.getvalue())

    def test_oversize_input_is_refused(self):
        with self.assertRaises(AssertionError):
            reader.bounded(io.BytesIO(b'123456'), limit=5)

    def test_printed_assertions_cannot_execute_commands_or_expose_urls_and_jwt(self):
        value = reader.safe_text('\n::error::https://example.test/signed?secret=value eyJsecret.foo\x1b[31m%0A')
        self.assertNotIn('::', value)
        self.assertNotIn('secret', value)
        self.assertNotIn('\n', value)
        self.assertNotIn('\x1b', value)
        self.assertIn('%250A', value)


    def completion_log_fixture(self):
        import json
        step = {'started_at': '2026-11-11T20:13:22Z', 'completed_at': '2026-11-11T20:21:08Z'}
        rows = [{'pair': pair, 'arm': arm, 'job': f'j-{index:04}', 'failed': False, 'stats': {'expected': 2, 'unexpected': 0, 'skipped': 0, 'flaky': 0}} for index, (pair, arm) in enumerate(reader.COMPLETION_ORDER, 1)]
        def encode(records):
            lines = ['2026-11-11T20:13:22.5606017Z ' + line for line in ['##[group]Run npm run "$SCRIPT" -- --minutes "$MINUTES"', '  SCRIPT: endurance:editor-causality', '  MINUTES: 75']]
            lines += ['2026-11-11T20:14:00.0000000Z ' + json.dumps(r) for r in records[:-1]]
            if records:
                lines.append('2026-11-11T20:21:08.3501917Z ' + json.dumps(records[-1]))
            lines.append('2026-11-11T20:21:08.3652521Z ##[group]Run [ -n "$NOACG_STACK_PROJECT" ] || exit 0')
            return ('\n'.join(lines) + '\n').encode()
        return step, rows, encode

    def test_completion_log_requires_all_guarded_records_exact_order_types_and_jobs(self):
        import copy
        step, rows, encode = self.completion_log_fixture()
        self.assertEqual(reader.completion_log_records(encode(rows), step), rows)
        malformed = []
        malformed += [rows[:-1], rows + rows[:1], list(reversed(rows))]
        for key, value in [('pair', True), ('failed', 0), ('failed', True), ('job', rows[1]['job']), ('job', 'unsafe'), ('arm', 'unknown')]:
            bad = copy.deepcopy(rows); bad[0][key] = value; malformed.append(bad)
        for key, value in [('expected', True), ('unexpected', 1), ('skipped', 1), ('flaky', 1)]:
            bad = copy.deepcopy(rows); bad[0]['stats'][key] = value; malformed.append(bad)
        for bad in malformed:
            with self.assertRaises((AssertionError, KeyError)): reader.completion_log_records(encode(bad), step)
        with self.assertRaises(AssertionError): reader.completion_log_records(encode(rows).replace(b'endurance:editor-causality', b'other'), step)
        with self.assertRaises(AssertionError): reader.completion_log_records(encode(rows), {'started_at': '2026-11-11T21:00:00Z', 'completed_at': '2026-11-11T21:10:00Z'})


    def test_completion_fractional_final_record_is_bounded_by_actual_step_not_next_step(self):
        import json
        step, rows, encode = self.completion_log_fixture()
        data = encode(rows)
        self.assertEqual(len(reader.completion_log_records(data, step)), 11)
        # Even a plausible record in the next step's same rounded second cannot fill a gap.
        extra = ('2026-11-11T20:21:08.3700000Z ' + json.dumps(rows[-1]) + '\n').encode()
        self.assertEqual(len(reader.completion_log_records(data + extra, step)), 11)
        with self.assertRaises(AssertionError): reader.completion_log_records(encode(rows[:-1]) + extra, step)
        with self.assertRaises(AssertionError): reader.completion_log_records(data.replace(b'20:21:08.3501917Z', b'20:21:09.0000000Z'), step)
        with self.assertRaises(AssertionError): reader.completion_log_records(data.replace(b'##[group]Run [ -n', b'next step [ -n'), step)
        with self.assertRaises(AssertionError): reader.completion_log_records(data.replace(b'20:21:08.3652521Z', b'20:21:09.3652521Z'), step)

    def test_log_recovery_is_exact_completion_only_and_retains_failed_upload_status(self):
        import copy
        import json
        import tempfile
        item = json.loads(Path(__file__).with_name('editor-causality-evidence-runs.json').read_text())[-1]
        step, rows, encode = self.completion_log_fixture()
        run = {'id': reader.COMPLETION_RUN, 'repository': {'full_name': reader.REPO}, 'path': '.github/workflows/endurance.yml', 'workflow_id': 390372433, 'status': 'in_progress', 'conclusion': None}
        job = {'id': reader.COMPLETION_JOB, 'run_id': reader.COMPLETION_RUN, 'run_attempt': 1, 'head_sha': reader.COMPLETION_SHA, 'head_branch': item['ref'], 'name': 'endurance:editor-causality for 75 min', 'status': 'in_progress', 'conclusion': None, 'steps': [
            dict(step, name='Run', status='completed', conclusion='success'),
            {'name': 'Start the local Supabase stack', 'conclusion': 'success'},
            {'name': 'Take the local stack down and prove it gone', 'conclusion': 'success'},
            {'name': 'Keep the receipts', 'status': 'completed', 'conclusion': 'failure'}]}
        empty = {'total_count': 0, 'artifacts': []}
        with tempfile.TemporaryDirectory() as directory, patch.object(reader, 'OUT', Path(directory)):
            with patch.object(reader, 'request_api', side_effect=[job, encode(rows)]):
                result = reader.read_completion_log(item, run, empty)
            self.assertEqual(len(result['rows']), 11)
            self.assertEqual(result['status'], 'in_progress'); self.assertIsNone(result['conclusion'])
            self.assertEqual(result['uploadConclusion'], 'failure')
            self.assertEqual(result['qualification'], 'guarded-producer-log')
            self.assertEqual(result['unresolved'], [])
            self.assertTrue((Path(directory) / 'completion-original-job.log').exists())
            for field, value in [('runId', 1), ('sha', reader.INITIAL_SHA), ('condition', 'primary')]:
                bad = dict(item); bad[field] = value
                with patch.object(reader, 'request_api') as network, self.assertRaises(AssertionError):
                    reader.read_completion_log(bad, run, empty)
                network.assert_not_called()
            for field, value in [('run_attempt', 2), ('head_sha', reader.INITIAL_SHA), ('run_id', 1)]:
                bad = dict(job); bad[field] = value
                with patch.object(reader, 'request_api', return_value=bad), self.assertRaises(AssertionError):
                    reader.read_completion_log(item, run, empty)
            for name in ['Run', 'Keep the receipts']:
                bad = copy.deepcopy(job)
                next(s for s in bad['steps'] if s['name'] == name)['conclusion'] = None
                with patch.object(reader, 'request_api', return_value=bad), self.assertRaises(AssertionError):
                    reader.read_completion_log(item, run, empty)
            with patch.object(reader, 'request_api') as network, self.assertRaises(AssertionError):
                reader.read_completion_log(item, run, {'total_count': 1, 'artifacts': [{}]})
            network.assert_not_called()

    def test_token_is_only_sent_to_github_api_not_storage_redirect(self):
        import urllib.error
        import urllib.request
        seen = []
        class Api:
            def open(self, request, timeout):
                seen.append(request)
                raise urllib.error.HTTPError(request.full_url, 302, 'Found', {'Location': 'https://result.blob.core.windows.net/signed'}, None)
        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *_): self.close()
        def storage(request, timeout):
            seen.append(request)
            return Response(b'zip')
        with patch.dict(reader.os.environ, {'GH_TOKEN': 'fixture-token'}), patch.object(urllib.request, 'build_opener', return_value=Api()), patch.object(urllib.request, 'urlopen', side_effect=storage):
            self.assertEqual(reader.request_api('repos/NoaCG/NoaCG-Studio/actions/artifacts/1/zip', archive=True), b'zip')
        self.assertEqual(seen[0].get_header('Authorization'), 'Bearer fixture-token')
        self.assertIsNone(seen[1].get_header('Authorization'))
        with self.assertRaises(AssertionError):
            reader.request_api('repos/unrelated/owner/actions/runs/1')

if __name__ == '__main__':
    unittest.main()
