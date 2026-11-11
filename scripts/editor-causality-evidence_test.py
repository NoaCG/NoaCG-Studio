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
