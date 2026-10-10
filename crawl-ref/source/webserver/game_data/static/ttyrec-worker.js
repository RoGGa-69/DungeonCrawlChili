// Same decoder as the client, in a worker to keep large recordings off the UI thread.
"use strict";
var decoder;
self.define = function (_, factory) { decoder = factory(null); };
importScripts("ttyrec.js");
self.onmessage = function (event) {
    try { self.postMessage({ transcript: decoder.transcript(event.data) }); }
    catch (error) { self.postMessage({ error: error.message }); }
};
