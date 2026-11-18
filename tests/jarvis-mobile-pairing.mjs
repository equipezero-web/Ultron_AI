import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../modules/jarvis-mobile-pairing.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const style = readFileSync(new URL("../modules/jarvis-mobile-pairing.css", import.meta.url), "utf8");
const elements = new Map();

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.hidden = false;
    this.textContent = "";
    this.parent = null;
    this.className = "";
    this.scrollCalled = false;
  }
  set id(id) { this._id = id; elements.set(id, this); }
  get id() { return this._id; }
  append(...items) {
    for (const item of items) {
      item.parent = this;
      this.children.push(item);
    }
  }
  prepend(item) { item.parent = this; this.children.unshift(item); }
  before(item) {
    const siblings = this.parent?.children;
    if (!siblings) throw new Error("Element has no parent");
    item.parent = this.parent;
    siblings.splice(siblings.indexOf(this), 0, item);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  scrollIntoView() { this.scrollCalled = true; }
  replaceChildren(...items) { this.children = items; }
  querySelector(selector) {
    if (selector === ".jarvis-cc-live") return this.children.find(x => x.className === "jarvis-cc-live") || null;
    return null;
  }
}

const slot = new FakeElement("section");
slot.id = "jarvis-cc-input-slot";
const topbar = new FakeElement("div");
topbar.className = "jarvis-cc-top";
const live = new FakeElement("span");
live.className = "jarvis-cc-live";
topbar.append(live);
const session = new FakeElement("strong");
session.id = "bridge-session-state";
const document = {
  listeners: {},
  addEventListener(name, callback) { this.listeners[name] = callback; },
  readyState: "complete",
  getElementById: id => elements.get(id) || null,
  querySelector: selector => selector === ".jarvis-cc-top" ? topbar : null,
  createElement: tag => new FakeElement(tag),
  createTextNode: text => ({ textContent: text })
};
let calls = 0;
let copied = "";
let adoptedCode = null;
let clock = 1000000;
class FakeDate extends Date { static now() { return clock; } }
const readinessEvents = {};
const window = {
  addEventListener(name, listener) { readinessEvents[name] = listener; },
  ULTRON_MOBILE_LINK: { adoptPairingCode(code, ttl) { adoptedCode = {code, ttl}; } },
  ULTRON_DEVICES: { startPairing: async (type, name) => {
    calls++;
    assert.equal(type, "mobile");
    assert.equal(name, "Ultron Mobile Bridge");
    return { code: "004321", expiresInSeconds: 600 };
  }}
};
const navigator = { clipboard: { writeText: async value => { copied = value; } } };
vm.runInNewContext(source, { document, window, navigator, Date: FakeDate });

assert.equal(typeof readinessEvents["jarvis:command-center-ready"], "function");
readinessEvents["jarvis:command-center-ready"]();
const card = document.getElementById("jarvis-mobile-pair-card");
const primary = document.getElementById("btn-jarvis-pair-mobile");
const top = document.getElementById("btn-jarvis-mobile-pair-top");
assert.ok(card && primary && top, "Both entrypoints and the inline code panel must exist");
assert.match(index, /id="btn-pair-mobile"[^>]*>PAREAR CELULAR</);
assert.match(index, /jarvis-mobile-pairing\.js/);
assert.match(index, /jarvis-mobile-pairing\.css/);
assert.match(style, /min-height:44px/);

await primary.listeners.click();
assert.equal(calls, 1);
assert.deepEqual(adoptedCode, {code: "004321", ttl: 600});
assert.equal(document.getElementById("jarvis-mobile-pair-code").textContent, "004321");
// Repeated clicks reuse the same unexpired code (avoid 11 ghost records).
await primary.listeners.click();
assert.equal(calls, 1);
const legacy = new FakeElement("button");
legacy.id = "btn-pair-mobile";
let intercepted = false;
document.listeners.pointerdown({target:legacy,stopImmediatePropagation(){intercepted = true;}});
assert.equal(intercepted, true);
await document.listeners.click({target:legacy,preventDefault(){intercepted = true;},stopImmediatePropagation(){intercepted = true;}});
assert.equal(intercepted, true);
assert.equal(calls, 1, "Old CONNECT CELULAR must not spawn competing sessions");
const result = card.children.find(x => x.className === "jarvis-mobile-pair-result");
assert.equal(result.hidden, false);
const actions = card.children.find(x => x.className === "jarvis-mobile-pair-actions");
const copyButton = actions.children[1];
await copyButton.listeners.click();
assert.equal(copied, "004321");
assert.match(document.getElementById("jarvis-mobile-pair-status").textContent, /copiado/i);

// After expiration, a real new pairing request is permitted.
clock += 11 * 60 * 1000;
window.ULTRON_DEVICES.startPairing = async () => { throw new Error("Gateway indisponível"); };
await primary.listeners.click();
assert.equal(result.hidden, true);
assert.match(document.getElementById("jarvis-mobile-pair-status").textContent, /Gateway indisponível/);
assert.equal(copyButton.hidden, true);

vm.runInNewContext(source, { document, window, navigator, Date: FakeDate });
assert.equal(slot.children.filter(x => x.id === "jarvis-mobile-pair-card").length, 1);
console.log("JARVIS mobile pairing PASS: visible buttons, valid six-digit code, copy, offline error, no duplicate UI.");
