// Run with node webserver/tests/coaching.test.js from source/.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
    constructor(tag = "div") {
        this.tag = tag;
        this.handlers = {};
        this.nodes = [];
        this.attrs = {};
        this[0] = this;
    }
    on(names, callback) {
        for (const name of names.split(" ")) this.handlers[name.split(".")[0]] = callback;
        return this;
    }
    off() { this.handlers = {}; return this; }
    prop(name, value) { this.attrs[name] = value; return this; }
    attr(values, value) {
        Object.assign(this.attrs, typeof values === "string" ? { [values]: value } : values);
        return this;
    }
    text(value) { this.label = value; return this; }
    val(value) { this.value = value; return this; }
    css(values) { Object.assign(this.attrs, values); return this; }
    appendTo(parent) { parent.nodes.push(this); return this; }
    children() { return this.more || (this.more = new Element()); }
    empty() { this.nodes = []; return this; }
    show() { this.visible = true; return this; }
    hide() { this.visible = false; return this; }
    select() { this.selected = true; }
    focus() { this.focused = true; }
    setSelectionRange(start, end) { this.selection = [start, end]; }
    blur() {}
    is(selector) { return this.tag === selector; }
    trigger(type, event = {}) {
        event = Object.assign({ type, target: this, preventDefault() {},
            stopPropagation() {}, stopImmediatePropagation() {} }, event);
        return this.handlers[type]?.call(this, event);
    }
}

function fixture({ watching = false, clipboardFails = false, legacyCopy = false, fetchFails = false } = {}) {
    const document = new Element("document");
    document.execCommand = () => legacyCopy;
    const launch = new Element("button");
    const messages = [], copied = [], opened = [], handlers = {}, immediate = {}, fetched = [];
    const $ = value => value instanceof Element ? value : value === "#coaching-help" ? launch :
        new Element(value.replace(/[<>]/g, ""));
    let module;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../game_data/static/coaching.js"), "utf8"), {
        document, navigator: { clipboard: { writeText(text) {
            copied.push(text);
            return clipboardFails ? Promise.reject(new Error("Denied")) : Promise.resolve();
        } } },
        window: { open(...args) { opened.push(args); } },
        fetch(url) {
            fetched.push(url);
            return fetchFails ? Promise.reject(new Error("Unavailable")) :
                Promise.resolve({ ok: true, text: () => Promise.resolve("Fresh live morgue: HP 12/55") });
        },
        define(dependencies, factory) {
            module = factory($, { register_handlers(map) { Object.assign(handlers, map); },
                register_immediate_handlers(map) { Object.assign(immediate, map); },
                send_message(type, data) { messages.push({ type, data }); } },
                { is_watching: () => watching });
        }
    });
    return { document, launch, messages, copied, opened, handlers, immediate, fetched, module };
}

async function main() {
    const player = fixture();
    player.document.trigger("game_init");
    player.launch.trigger("click");
    assert.equal(player.messages[0].data.keycode, -500);
    const dump = "Coach this live dump: HP 12/55\nNotes: <script>not markup</script>";
    player.handlers.coaching_context({ prompt: dump });
    const popup = new Element();
    player.module.install_controls(popup);
    popup.more.nodes.find(node => node.label === "Copy and open ChatGPT [B]").trigger("click");
    await Promise.resolve();
    assert.equal(player.copied[0], dump);
    assert.equal(player.opened[0][0], "https://chatgpt.com/");
    assert.equal(player.opened[0][2], "noopener,noreferrer");
    assert.equal(popup.more.nodes.find(node => node.tag === "textarea").value, dump);
    popup.trigger("keydown", { key: "c" });
    await Promise.resolve();
    assert.equal(player.copied.length, 2);
    assert.equal(player.opened.length, 1);
    player.document.trigger("game_cleanup");
    const next = new Element();
    player.module.install_controls(next);
    assert.equal(next.more.nodes.length, 1, "Show a status instead of reusing another game's dump");

    const blocked = fixture({ clipboardFails: true });
    blocked.handlers.coaching_context({ prompt: dump });
    const manualPopup = new Element();
    blocked.module.install_controls(manualPopup);
    manualPopup.trigger("keydown", { key: "c" });
    await Promise.resolve();
    const textarea = manualPopup.more.nodes.find(node => node.tag === "textarea");
    assert.equal(textarea.visible, true);
    assert.equal(textarea.selected, true);
    assert.equal(textarea.attrs.readonly, true);
    assert.equal(textarea.focused, true);
    assert.deepEqual(textarea.selection, [0, dump.length]);

    const shared = fixture();
    assert.equal(shared.immediate.dump({ url: "/morgue/Player/Player" }), false);
    shared.module.install_controls(new Element());
    // A fresh popup can replace the previous one while the morgue is loading.
    const sharedPopup = new Element();
    shared.module.install_controls(sharedPopup);
    for (let index = 0; index < 8; index++) await Promise.resolve();
    assert.equal(shared.fetched[0], "/morgue/Player/Player.txt");
    sharedPopup.trigger("keydown", { key: "c" });
    assert.ok(shared.copied[0].includes("Fresh live morgue: HP 12/55"));

    const safari = fixture({ legacyCopy: true });
    safari.handlers.coaching_context({ prompt: dump });
    const safariPopup = new Element();
    safari.module.install_controls(safariPopup);
    safariPopup.trigger("keydown", { key: "b" });
    assert.equal(safari.opened.length, 1);
    assert.equal(safari.copied.length, 0, "Prefer synchronous copy before opening a new tab");

    const failed = fixture({ fetchFails: true });
    failed.immediate.dump({ url: "/morgue/Player/Player" });
    const failedPopup = new Element();
    failed.module.install_controls(failedPopup);
    for (let index = 0; index < 8; index++) await Promise.resolve();
    assert.ok(failedPopup.more.nodes[0].label.includes("Could not load"));

    const watcher = fixture({ watching: true });
    watcher.document.trigger("game_init");
    watcher.launch.trigger("click");
    assert.equal(watcher.launch.attrs.disabled, true);
    assert.equal(watcher.messages.length, 0);
    watcher.handlers.coaching_context({ prompt: dump });
    const watcherPopup = new Element();
    watcher.module.install_controls(watcherPopup);
    assert.equal(watcherPopup.more, undefined);
    console.log("Webtiles coaching checks passed: launch, exact copy, browser open, keyboard, fallback, privacy.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
