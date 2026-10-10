define(["require"], function (require) {
    "use strict";
    var MAX_BYTES = 50 * 1024 * 1024;
    function transcript(buffer) {
        if (buffer.byteLength > MAX_BYTES) throw new Error("Recording exceeds the 50 MiB limit.");
        var view = new DataView(buffer), bytes = new Uint8Array(buffer);
        var rows = [], x = 0, y = 0, saved = [0, 0], pending = "", unsupported = false;
        function blank() { return Array(160).fill(" "); }
        for (var r = 0; r < 50; r++) rows.push(blank());
        function feed(text) {
            text = pending + text; pending = "";
            for (var i = 0; i < text.length; i++) {
                var c = text[i];
                if (c === "\x1b") {
                    if (i + 1 >= text.length) { pending = text.slice(i); break; }
                    if (text[i+1] === "[") {
                        var match = /^\x1b\[([0-?]*)([ -/]*)([@-~])/.exec(text.slice(i));
                        if (!match) { pending = text.slice(i).slice(-4096); break; }
                        var a = match[1].replace(/^\?/, "").split(";").map(function (v) { return /^\d+$/.test(v) ? Number(v) : 0; });
                        var n = a[0] || 1, op = match[3];
                        if (op === "H" || op === "f") { y = (a[0] || 1)-1; x = (a[1] || 1)-1; }
                        else if (op === "A") y -= n;
                        else if (op === "B") y += n;
                        else if (op === "C") x += n;
                        else if (op === "D") x -= n;
                        else if (op === "G") x = n-1;
                        else if (op === "d") y = n-1;
                        else if (op === "J") {
                            if (a[0] === 2 || a[0] === 3) rows = rows.map(blank);
                            else if (a[0] === 0) { rows[y].fill(" ", x); for (r=y+1; r<50; r++) rows[r] = blank(); }
                            else if (a[0] === 1) { for (r=0; r<y; r++) rows[r] = blank(); rows[y].fill(" ", 0, x+1); }
                        } else if (op === "K") rows[y].fill(" ", a[0] === 0 ? x : 0, a[0] === 1 ? x+1 : 160);
                        else if (op === "s") saved = [x, y];
                        else if (op === "u") { x = saved[0]; y = saved[1]; }
                        else if ("mhlrt".indexOf(op) < 0) unsupported = true;
                        x = Math.max(0, Math.min(159, x)); y = Math.max(0, Math.min(49, y));
                        i += match[0].length-1; continue;
                    }
                    if (text[i+1] === "]" || text[i+1] === "P") {
                        var end = /\x07|\x1b\\/.exec(text.slice(i+2));
                        if (!end) { pending = text.slice(i).slice(-4096); break; }
                        i += 1 + end.index + end[0].length; continue;
                    }
                    if (text[i+1] === "(" || text[i+1] === ")") {
                        if (i+2 >= text.length) { pending = text.slice(i); break; }
                        i += 2; continue;
                    }
                    if (text[i+1] === "7") saved = [x, y];
                    else if (text[i+1] === "8") { x = saved[0]; y = saved[1]; }
                    else unsupported = true;
                    i++; continue;
                }
                if (c === "\r") x = 0;
                else if (c === "\n") { y++; if (y >= 50) { rows.shift(); rows.push(blank()); y=49; } }
                else if (c === "\b") x = Math.max(0, x-1);
                else if (c === "\t") x = Math.min(159, (Math.floor(x/8)+1)*8);
                else if (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) { rows[y][x] = c; x = Math.min(159, x+1); }
            }
        }
        var decoder = new TextDecoder("utf-8"), offset = 0, count = 0, start, last, previous = "", excerpts = [], history = [], stride = 1, changed = 0;
        while (offset < buffer.byteLength) {
            if (offset+12 > buffer.byteLength) throw new Error("Truncated ttyrec header.");
            var sec = view.getUint32(offset, true), usec = view.getUint32(offset+4, true), size = view.getUint32(offset+8, true);
            offset += 12;
            if (usec >= 1000000 || size > MAX_BYTES || offset+size > buffer.byteLength)
                throw new Error("Invalid or truncated ttyrec frame. Choose an uncompressed .ttyrec file.");
            var now = sec + usec/1000000;
            if (start === undefined) start = now;
            feed(decoder.decode(bytes.subarray(offset, offset+size), {stream:true}));
            offset += size; count++;
            if (count > 500000) throw new Error("Recording contains too many frames.");
            var current = rows.map(function (row) { return row.join("").replace(/ +$/, ""); }).join("\n").trimEnd();
            if (current && current !== previous) {
                changed++;
                var snapshot = [count, "[+" + Math.max(0, now-start).toFixed(3) + "s, output frame " + count + "]\n" + current];
                excerpts.push(snapshot);
                if (excerpts.length > 40) excerpts.shift();
                if ((changed-1) % stride === 0) {
                    history.push(snapshot);
                    if (history.length > 80) { history = history.filter(function (_, i) { return i % 2 === 0; }); stride *= 2; }
                }
                previous = current;
            }
            last = now;
        }
        if (!count) throw new Error("The recording is empty.");
        var snapshots = new Map(history.concat(excerpts));
        excerpts = Array.from(snapshots.keys()).sort(function (a, b) { return a-b; }).map(function (key) { return snapshots.get(key); });
        while (excerpts.join("").length > 120000 && excerpts.length > 1) excerpts.shift();
        return "Best-effort terminal screen excerpts, NOT player keypresses or game turns. " + count
            + " output frames; duration " + Math.max(0, last-start).toFixed(3) + "s. " + excerpts.length
            + " sampled changed screens are included, with finer detail at the end; omitted screens create gaps. Partial terminal updates may appear as intermediate screens. "
            + "Coordinates/colors and some terminal operations are lost. "
            + (unsupported ? "Unsupported terminal operations occurred. " : "")
            + "Do not treat timestamps as turn durations or infer actions not shown.\n\n" + excerpts.join("\n\n");
    }
    function read(buffer) {
        if (typeof Worker !== "function")
            return Promise.resolve().then(function () { return transcript(buffer); });
        return new Promise(function (resolve, reject) {
            var worker = new Worker(require.toUrl("ttyrec-worker.js"));
            var timer = setTimeout(function () {
                worker.terminate(); reject(new Error("Recording conversion timed out."));
            }, 15000);
            worker.onmessage = function (event) {
                clearTimeout(timer); worker.terminate();
                if (event.data.error) reject(new Error(event.data.error));
                else resolve(event.data.transcript);
            };
            worker.onerror = function () {
                clearTimeout(timer); worker.terminate(); reject(new Error("Recording decoder could not start."));
            };
            worker.postMessage(buffer, [buffer]);
        });
    }
    return { transcript: transcript, read: read };
});
