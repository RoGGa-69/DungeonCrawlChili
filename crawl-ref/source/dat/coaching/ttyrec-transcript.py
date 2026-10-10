"""Bounded, best-effort terminal screen excerpts from ttyrec (not an action log)."""
import bz2
from collections import deque
import gzip
import json
from pathlib import Path
import re
import struct
import sys

MAX_BYTES = 50 * 1024 * 1024
MAX_TEXT = 120000

class Screen:
    def __init__(self):
        self.rows = [[' '] * 160 for _ in range(50)]
        self.x = self.y = 0
        self.saved = (0, 0)
        self.pending = ''
        self.unsupported = False

    def feed(self, text):
        text = self.pending + text
        self.pending = ''
        i = 0
        while i < len(text):
            ch = text[i]
            if ch == '\x1b':
                if i + 1 == len(text):
                    self.pending = text[i:]; break
                if text[i+1] == '[':
                    match = re.match(r'\x1b\[([0-?]*)([ -/]*)([@-~])', text[i:])
                    if not match:
                        self.pending = text[i:][-4096:]; break
                    raw, intermediate, op = match.groups()
                    args = [int(v) if v.isdigit() else 0 for v in raw.lstrip('?').split(';')]
                    n = args[0] or 1
                    if op in 'Hf': self.y, self.x = (args[0] or 1)-1, (args[1] if len(args)>1 and args[1] else 1)-1
                    elif op == 'A': self.y -= n
                    elif op == 'B': self.y += n
                    elif op == 'C': self.x += n
                    elif op == 'D': self.x -= n
                    elif op == 'G': self.x = n-1
                    elif op == 'd': self.y = n-1
                    elif op == 'J':
                        if args[0] in (2, 3): self.rows = [[' '] * 160 for _ in range(50)]
                        elif args[0] == 0:
                            self.rows[self.y][self.x:] = [' '] * (160-self.x)
                            for row in range(self.y+1, 50): self.rows[row] = [' '] * 160
                        elif args[0] == 1:
                            for row in range(self.y): self.rows[row] = [' '] * 160
                            self.rows[self.y][:self.x+1] = [' '] * (self.x+1)
                    elif op == 'K':
                        a, b = (0, 160) if args[0] == 2 else ((0, self.x+1) if args[0] == 1 else (self.x, 160))
                        self.rows[self.y][a:b] = [' '] * (b-a)
                    elif op == 's': self.saved = (self.x, self.y)
                    elif op == 'u': self.x, self.y = self.saved
                    elif op not in 'mhlrt': self.unsupported = True
                    self.x = max(0, min(159, self.x)); self.y = max(0, min(49, self.y))
                    i += len(match.group()); continue
                if text[i+1] in ']P':
                    match = re.search(r'\x07|\x1b\\', text[i+2:])
                    if not match:
                        self.pending = text[i:][-4096:]; break
                    i += 2 + match.end(); continue
                if text[i+1] in '()':
                    if i+2 >= len(text): self.pending = text[i:]; break
                    i += 3; continue
                if text[i+1] == '7': self.saved = (self.x, self.y)
                elif text[i+1] == '8': self.x, self.y = self.saved
                else: self.unsupported = True
                i += 2; continue
            if ch == '\r': self.x = 0
            elif ch == '\n':
                self.y += 1
                if self.y >= 50: self.rows.pop(0); self.rows.append([' '] * 160); self.y = 49
            elif ch == '\b': self.x = max(0, self.x-1)
            elif ch == '\t': self.x = min(159, (self.x//8+1)*8)
            elif ord(ch) >= 32 and ord(ch) != 127:
                self.rows[self.y][self.x] = ch
                self.x = min(159, self.x+1)
            i += 1

    def text(self):
        return '\n'.join(''.join(row).rstrip() for row in self.rows).rstrip()


def transcript(data):
    if len(data) > MAX_BYTES: raise ValueError('Recording exceeds the 50 MiB limit.')
    screen = Screen()
    import codecs
    decoder = codecs.getincrementaldecoder('utf-8')('replace')
    excerpts = deque(maxlen=40)
    history = []
    stride = 1
    changed = 0
    offset = count = 0
    start = last = None
    previous = ''
    while offset < len(data):
        if offset+12 > len(data): raise ValueError('Truncated ttyrec header.')
        sec, usec, size = struct.unpack_from('<III', data, offset)
        offset += 12
        if usec >= 1000000 or size > MAX_BYTES or offset+size > len(data):
            raise ValueError('Invalid or truncated ttyrec frame; use an uncompressed standard ttyrec.')
        now = sec + usec/1000000
        if start is None: start = now
        screen.feed(decoder.decode(data[offset:offset+size]))
        offset += size; count += 1
        if count > 500000: raise ValueError('Recording contains too many frames.')
        current = screen.text()
        if current and current != previous:
            changed += 1
            snapshot = (count, f'[+{max(0, now-start):.3f}s, output frame {count}]\n{current}')
            excerpts.append(snapshot)
            if (changed-1) % stride == 0:
                history.append(snapshot)
                if len(history) > 80:
                    history = history[::2]
                    stride *= 2
            previous = current
        last = now
    if not count: raise ValueError('The recording is empty.')
    snapshots = dict(history + list(excerpts))
    excerpts = [snapshots[key] for key in sorted(snapshots)]
    while sum(len(v) for v in excerpts) > MAX_TEXT and len(excerpts)>1: excerpts.pop(0)
    note = ('Best-effort terminal screen excerpts, NOT player keypresses or game turns. '
            f'{count} output frames; duration {max(0, last-start):.3f}s. '
            f'{len(excerpts)} sampled changed screens are included, with finer detail at the end; omitted screens create gaps. '
            'Partial terminal updates may appear as intermediate screens. Coordinates/colors and some terminal operations are lost. '
            + ('Unsupported terminal operations occurred. ' if screen.unsupported else '')
            + 'Do not treat timestamps as turn durations or infer actions not shown.\n\n')
    return note + '\n\n'.join(excerpts)


def read_recording(path):
    path = Path(path).expanduser()
    opener = bz2.open if path.suffix == '.bz2' else gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rb') as stream: data = stream.read(MAX_BYTES+1)
    return transcript(data)

if __name__ == '__main__':
    try: result = {'transcript': read_recording(sys.argv[1])}
    except (OSError, ValueError, EOFError) as error: result = {'error': str(error)}
    Path(sys.argv[2]).write_text(json.dumps(result), encoding='utf-8')
