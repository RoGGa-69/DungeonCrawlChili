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


if __name__ == "__main__":
    unittest.main()
