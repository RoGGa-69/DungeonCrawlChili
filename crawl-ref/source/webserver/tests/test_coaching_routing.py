"""Run with python3 webserver/tests/test_coaching_routing.py from source/.

Exercise the real socket routing method without requiring a running server.
"""
import ast
import json
from pathlib import Path
import unittest


class CoachingRoutingTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[1] / "webtiles/process_handler.py"
        tree = ast.parse(source.read_text())
        handler = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                       and node.name == "CrawlProcessHandler")
        method = next(node for node in handler.body if isinstance(node, ast.FunctionDef)
                      and node.name == "_on_socket_message")
        namespace = {"json_decode": json.loads}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), "exec"), namespace)
        self.route = namespace["_on_socket_message"]
        self.process = None
        self.username = "Player"
        self.sent = []

    def send_to_user(self, username, message, **data):
        self.sent.append((username, message, data))

    def test_dump_is_sent_only_to_playing_account(self):
        prompt = "Known inventory\n<untrusted notes>"
        self.route(self, "*" + json.dumps({"msg": "coaching_context", "prompt": prompt}))
        self.assertEqual(self.sent, [("Player", "coaching_context", {"prompt": prompt})])

    def test_invalid_and_oversized_context_is_ignored(self):
        for value in (None, 3, ["dump"], "x" * (1024 * 1024 + 1)):
            self.route(self, "*" + json.dumps({"msg": "coaching_context", "prompt": value}))
        self.assertEqual(self.sent, [])



# Test the actual recording methods with isolated files and a fake IOLoop.
class AutomaticRecordingTests(unittest.TestCase):
    def setUp(self):
        import importlib.util
        import os
        import shutil
        import struct
        import tempfile
        from types import SimpleNamespace
        source = Path(__file__).resolve().parents[1] / 'webtiles/process_handler.py'
        tree = ast.parse(source.read_text())
        handler = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'CrawlProcessHandler')
        methods = [n for n in handler.body if isinstance(n, ast.FunctionDef) and n.name in
                   ('_read_postmortem_recording', '_request_postmortem_recording')]
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        decoder = source.parents[2] / 'dat/coaching/ttyrec-transcript.py'
        shutil.copyfile(decoder, self.root / 'ttyrec_transcript.py')
        self.ttyrec_filename = str(self.root / 'session.ttyrec')
        data = b'\x1b[2J\x1b[1;1HYou die...'
        Path(self.ttyrec_filename).write_bytes(struct.pack('<III', 100, 0, len(data)) + data)
        self.client_path = str(self.root)
        self.username = 'Player'
        self.sent = []
        self.flushed = False
        self.process = SimpleNamespace(flush_ttyrec=lambda: setattr(self, 'flushed', True))
        self.logger = SimpleNamespace(warning=lambda *a, **kw: None)
        self.executor_calls = 0
        owner = self
        class Loop:
            def run_in_executor(self, executor, function, *args):
                from concurrent.futures import Future
                owner.executor_calls += 1
                result = Future()
                try: result.set_result(function(*args))
                except Exception as error: result.set_exception(error)
                return result
            def add_future(self, future, callback): callback(future)
        namespace = {'os': os, 'importlib': __import__('importlib'),
                     'IOLoop': SimpleNamespace(current=lambda: Loop())}
        exec(compile(ast.Module(body=methods, type_ignores=[]), str(source), 'exec'), namespace)
        self._read_postmortem_recording = lambda *args: namespace['_read_postmortem_recording'](self, *args)
        self.request = lambda key: namespace['_request_postmortem_recording'](self, key)

    def tearDown(self): self.directory.cleanup()
    def send_to_user(self, username, message, **data): self.sent.append((username, message, data))

    def test_flushes_and_sends_real_transcript_only_to_player(self):
        self.request(5)
        self.assertTrue(self.flushed)
        self.assertEqual(self.executor_calls, 1)
        username, kind, data = self.sent[0]
        self.assertEqual((username, kind, data['request_id']), ('Player', 'postmortem_recording', 5))
        self.assertIn('You die...', data['transcript'])
        self.assertNotIn('error', data)

    def test_reopening_analysis_reuses_recording_conversion(self):
        self.request(5)
        self.request(6)
        self.assertEqual(self.executor_calls, 1)
        self.assertEqual([data['request_id'] for _, _, data in self.sent], [5, 6])

    def test_missing_recording_reports_error_without_morgue_fallback(self):
        Path(self.ttyrec_filename).unlink()
        self.request(6)
        self.assertIn('error', self.sent[0][2])
        self.assertNotIn('transcript', self.sent[0][2])

    def test_reconnected_process_uses_its_inprogress_lock(self):
        self.ttyrec_filename = None
        self._find_lock = lambda: '/inprogress/Player:session.ttyrec'
        self.config_path = lambda key: str(self.root)
        self.request(7)
        self.assertIn('You die...', self.sent[0][2]['transcript'])

if __name__ == "__main__": unittest.main()
