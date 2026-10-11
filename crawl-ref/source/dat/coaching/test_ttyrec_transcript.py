import bz2
import gzip
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('ttyrec', Path(__file__).with_name('ttyrec-transcript.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def frame(text, sec=100, usec=0):
    data = text.encode() if isinstance(text, str) else text
    return struct.pack('<III', sec, usec, len(data)) + data

class TranscriptTests(unittest.TestCase):
    def test_cursor_redraws_and_split_utf8_escape_sequences(self):
        data = frame('\x1b[2J\x1b[1;1HHP: 20/30\r\nAn orc hits you.')
        data += frame('\x1b[1;', 101) + frame('1HHP: 10/30\x1b[K', 101, 500000)
        data += frame(b'\r\nR\xc3', 102) + frame(b'\xa9sum\xc3\xa9', 103)
        text = module.transcript(data)
        self.assertIn('HP: 10/30', text)
        self.assertIn('Résumé', text)
        self.assertIn('[+1.500s, output frame 3]', text)
        self.assertNotIn('\x1b', text)
        self.assertIn('NOT player keypresses', text)

    def test_sampling_retains_early_play_and_fatal_tail(self):
        data = b''.join(frame(f'\x1b[2J\x1b[1;1HScreen {i}', 100+i) for i in range(1000))
        text = module.transcript(data)
        self.assertIn('Screen 0\n', text)
        self.assertIn('Screen 999', text)
        self.assertIn('omitted screens create gaps', text)
        self.assertLessEqual(text.count('output frame'), 120)
        self.assertLess(len(text), module.MAX_TEXT + 1000)

    def test_rejects_empty_truncated_or_invalid_frames(self):
        for data in (b'', b'123', struct.pack('<III', 1, 1000000, 0), frame('hello')[:-1]):
            with self.subTest(data=data), self.assertRaises(ValueError): module.transcript(data)

    def test_compressed_files_and_missing_path(self):
        with tempfile.TemporaryDirectory() as directory:
            for extension, encode in (('.ttyrec', lambda data:data), ('.gz', gzip.compress), ('.bz2', bz2.compress)):
                path = Path(directory, 'run'+extension)
                path.write_bytes(encode(frame('You die...')))
                self.assertIn('You die...', module.read_recording(path))
            with self.assertRaises(OSError): module.read_recording(Path(directory, 'missing'))

if __name__ == '__main__': unittest.main()
