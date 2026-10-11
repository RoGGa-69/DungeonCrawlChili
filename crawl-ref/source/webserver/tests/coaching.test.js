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
    val(value) { if (value === undefined) return this.value; this.value = value; return this; }
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

function fixture({ watching = false, clipboardFails = false, legacyCopy = false, fetchFails = false,
    storage = {}, storageFails = false } = {}) {
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
        window: { open(...args) { opened.push(args); }, localStorage: {
            getItem(key) { if (storageFails) throw new Error("Disabled"); return storage[key]; },
            setItem(key, value) { if (storageFails) throw new Error("Disabled"); storage[key] = value; }
        } },
        fetch(url) {
            fetched.push(url);
            return fetchFails ? Promise.reject(new Error("Unavailable")) :
                Promise.resolve({ ok: true, text: () => Promise.resolve("Fresh live morgue: HP 12/55") });
        },
        define(dependencies, factory) {
            assert(dependencies.includes("./ttyrec"), "decoder must load from the versioned game directory");
            module = factory($, { register_handlers(map) { Object.assign(handlers, map); },
                register_immediate_handlers(map) { Object.assign(immediate, map); },
                send_message(type, data) { messages.push({ type, data }); } },
                { is_watching: () => watching }, { transcript() { return "Decoded recording: An orc hits you. You die..."; } });
        }
    });
    return { document, launch, messages, copied, opened, handlers, immediate, fetched, module };
}

async function main() {
    // Analysis must work immediately on a shared server with no custom recording handler.
    const standalone = fixture({ fetchFails: true });
    const standalonePopup = new Element();
    const finalMorgue = "Final morgue\nRECORDING: No ttyrec supplied.\n";
    standalone.module.install_controls(standalonePopup, finalMorgue, true);
    standalonePopup.trigger("keydown", { key: "b" });
    assert.equal(standalone.copied[0], finalMorgue);
    assert.equal(standalone.opened.length, 1);
    assert.equal(standalone.fetched.length, 0);
    assert.equal(standalone.messages.length, 0, "No shared-server recording request is needed");
    assert(!standalone.handlers.postmortem_recording);
    const post = fixture();
    const postPopup = new Element();
    const morgue = "Analyze this run\nBEGIN FINAL MORGUE\nHP: -2/50\nEND FINAL MORGUE\n\nRECORDING: No ttyrec supplied.\n";
    post.module.install_controls(postPopup, morgue, true);
    const upload = postPopup.more.nodes.find(n => n.tag === "label" && n.nodes.some(c => c.tag === "input")).nodes[0];
    upload.files = [{ size: 50, arrayBuffer: () => Promise.resolve(new ArrayBuffer(12)) }];
    upload.trigger("change");
    postPopup.trigger("keydown", { key: "b" });
    assert.equal(post.opened.length, 0, "Do not copy incomplete context while loading");
    await new Promise(resolve => setImmediate(resolve));
    postPopup.trigger("keydown", { key: "c" });
    assert(post.copied[0].includes("BEGIN TTYREC EXCERPTS"));
    assert(post.copied[0].includes("HP: -2/50"));
    assert(!post.copied[0].includes("No ttyrec supplied"));
    upload.files = [{ size: 20, arrayBuffer: () => Promise.reject(new Error("Truncated")) }];
    upload.trigger("change");
    await new Promise(resolve => setImmediate(resolve));
    postPopup.trigger("keydown", { key: "c" });
    assert.equal(post.copied[0], post.copied[1], "Failed upload retains previous context");
    postPopup.more.nodes.find(n => n.label === "Use morgue only").trigger("click");
    postPopup.trigger("keydown", { key: "c" });
    assert.equal(post.copied[2], morgue);
    const player = fixture();
    player.document.trigger("game_init");
    player.launch.trigger("click");
    assert.equal(player.messages[0].data.keycode, -500);
    const dump = "Coach this live dump: HP 12/55\nNotes: <script>not markup</script>";
    // Shared servers need no coaching_context handler or cross-origin fetch.
    const inline = fixture({ fetchFails: true });
    const inlinePopup = new Element();
    inline.module.install_controls(inlinePopup, dump);
    inlinePopup.trigger("keydown", { key: "c" });
    inlinePopup.trigger("keydown", { key: "b" });
    await Promise.resolve();
    assert.deepEqual(inline.copied, [dump, dump]);
    assert.equal(inline.opened.length, 1);
    assert.equal(inline.fetched.length, 0);
    const storage = {};
    const choices = fixture({ storage });
    const choicesPopup = new Element();
    choices.module.install_controls(choicesPopup, dump);
    const selector = choicesPopup.more.nodes.find(node => node.tag === "label").nodes[0];
    assert.deepEqual(selector.nodes.map(node => node.label), ["ChatGPT", "Claude", "Gemini", "Copilot"]);
    assert.equal(selector.val(), "chatgpt");
    for (const [id, name, url] of [
        ["chatgpt", "ChatGPT", "https://chatgpt.com/"],
        ["claude", "Claude", "https://claude.ai/"],
        ["gemini", "Gemini", "https://gemini.google.com/"],
        ["copilot", "Copilot", "https://copilot.microsoft.com/"]
    ]) {
        selector.val(id).trigger("change");
        const button = choicesPopup.more.nodes.find(node => node.label === "Copy and open " + name + " [B]");
        assert.ok(button);
        button.trigger("click");
        choicesPopup.trigger("keydown", { key: "b" });
        await Promise.resolve();
        assert.equal(choices.opened.at(-1)[0], url);
        assert.equal(choices.opened.at(-2)[0], url);
        assert.equal(choices.copied.at(-1), dump);
        assert.ok(choicesPopup.more.nodes[0].label.includes(name));
        const openedBeforeCopy = choices.opened.length;
        choicesPopup.trigger("keydown", { key: "c" });
        await Promise.resolve();
        assert.equal(choices.opened.length, openedBeforeCopy);
    }
    const copiedBeforeSelect = choices.copied.length;
    choicesPopup.trigger("keydown", { key: "c", target: selector });
    assert.equal(choices.copied.length, copiedBeforeSelect, "Native dropdown keys must not copy or open a tab");
    const focusedButton = choicesPopup.more.nodes.find(node => node.label === "Copy and open Copilot [B]");
    for (const type of ["keydown", "keypress"]) {
        for (const [key, which] of [[" ", 32], ["Enter", 13]]) {
            let stopped = false, prevented = false;
            choicesPopup.trigger(type, { key, which, target: focusedButton,
                stopImmediatePropagation() { stopped = true; },
                preventDefault() { prevented = true; } });
            assert.equal(stopped, true, "Space/Enter must not reach the game or scroller");
            assert.equal(prevented, false, "Preserve native keyboard button activation");
        }
    }
    const remembered = fixture({ storage });
    const rememberedPopup = new Element();
    remembered.module.install_controls(rememberedPopup, dump);
    assert.equal(rememberedPopup.more.nodes.find(node => node.tag === "label").nodes[0].val(), "copilot");
    for (const settings of [{ storageFails: true }, { storage: { "coaching-provider": "unknown" } }]) {
        const defaults = fixture(settings);
        const defaultsPopup = new Element();
        defaults.module.install_controls(defaultsPopup, dump);
        defaultsPopup.trigger("keydown", { key: "b" });
        assert.equal(defaults.opened[0][0], "https://chatgpt.com/");
    }
    const pending = fixture();
    pending.immediate.dump({ url: "https://another-host/morgue/Player/Player" });
    const pendingPopup = new Element();
    pending.module.install_controls(pendingPopup);
    pending.module.install_controls(pendingPopup, dump);
    for (let index = 0; index < 8; index++) await Promise.resolve();
    pendingPopup.trigger("keydown", { key: "c" });
    assert.equal(pending.copied[0], dump, "Late HTTP responses cannot replace the popup's exact dump");
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
    watcher.module.install_controls(watcherPopup, dump);
    assert.equal(watcherPopup.more, undefined);
    console.log("Webtiles coaching checks passed: launch, popup context, exact copy, browser open, keyboard, fallback, spectator controls.");
}
main().catch (error => { console.error(error); process.exitCode = 1; });
