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
