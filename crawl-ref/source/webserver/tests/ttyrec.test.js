const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let decoder;
vm.runInNewContext(fs.readFileSync(__dirname + '/../game_data/static/ttyrec.js', 'utf8'), {
    TextDecoder, define(_, factory) { decoder = factory(); }
});
function frame(text, sec=100, usec=0) {
    const data = Buffer.isBuffer(text) ? text : Buffer.from(text);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(sec, 0); header.writeUInt32LE(usec, 4); header.writeUInt32LE(data.length, 8);
    return Buffer.concat([header, data]);
}
function convert(bytes) { return decoder.transcript(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.length)); }
const recording = Buffer.concat([
    frame('\x1b[2J\x1b[1;1HHP: 20/30\r\nAn orc hits you.'),
    frame('\x1b[1;', 101), frame('1HHP: 10/30\x1b[K', 101, 500000),
    frame(Buffer.from([13, 10, 82, 195]), 102), frame(Buffer.from([169, 115, 117, 109, 195, 169]), 103)
]);
const text = convert(recording);
assert(text.includes('HP: 10/30')); assert(text.includes('Résumé')); assert(!text.includes('\x1b'));
assert(text.includes('[+1.500s, output frame 3]'));
const sampled = convert(Buffer.concat(Array.from({length:1000}, (_, i) => frame('\x1b[2J\x1b[1;1HScreen '+i, 100+i))));
assert(sampled.includes('Screen 0\n')); assert(sampled.includes('Screen 999'));
assert((sampled.match(/output frame/g) || []).length <= 120);
assert(sampled.includes('omitted screens create gaps'));
for (const data of [Buffer.alloc(0), Buffer.from('123'), frame('hello').subarray(0, 15), frame('', 1, 1000000)])
    assert.throws(() => convert(data));
assert.throws(() => decoder.transcript(new ArrayBuffer(50*1024*1024+1)));
console.log('Ttyrec checks passed: redraws, split escape/UTF-8, chronology sampling, fatal tail, invalid/oversized input.');
// Exercise the actual worker entry point with the same decoder and malformed input.
const replies = [];
const worker = { TextDecoder, postMessage(message) { replies.push(message); } };
worker.self = worker;
const context = vm.createContext(worker);
worker.importScripts = name => vm.runInContext(fs.readFileSync(__dirname + '/../game_data/static/' + name, 'utf8'), context);
vm.runInContext(fs.readFileSync(__dirname + '/../game_data/static/ttyrec-worker.js', 'utf8'), context);
worker.onmessage({data: recording.buffer.slice(recording.byteOffset, recording.byteOffset+recording.length)});
assert.equal(replies[0].transcript, text);
worker.onmessage({data: new ArrayBuffer(3)});
assert(replies[1].error.includes('Truncated'));
console.log('Ttyrec worker checks passed: readable output and safe malformed-file errors.');

// A versioned game module must resolve its worker beside itself, not in the lobby.
let workerDecoder, workerUrl;
vm.runInNewContext(fs.readFileSync(__dirname + '/../game_data/static/ttyrec.js', 'utf8'), {
    TextDecoder, Promise,
    define(_, factory) { workerDecoder = factory({ toUrl(name) {
        assert.equal(name, './ttyrec-worker.js');
        return '/gamedata/chili/ttyrec-worker.js';
    } }); },
    Worker: class {
        constructor(url) { workerUrl = url; }
        postMessage() { this.onmessage({data: {transcript: 'decoded'}}); }
        terminate() {}
    },
    setTimeout() { return 1; }, clearTimeout() {}
});
workerDecoder.read(new ArrayBuffer(12)).then(text => {
    assert.equal(workerUrl, '/gamedata/chili/ttyrec-worker.js');
    assert.equal(text, 'decoded');
    console.log('Versioned game worker path check passed.');
});
