import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

const source = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const idle = 3 * 86_400_000;
async function boot(initial = {}) {
  const data = structuredClone(initial);
  const events = {};
  const tabs = new Map();
  let time = Date.now();
  let status = 200;
  let injections = 0;
  const calls = [];
  const session = { user: { id: "u1", email: "user@example.test" }, profiles: [], responses: [], activeProfileId: "" };
  class Clock extends Date { static now() { return time; } }
  const chrome = {
    storage: { local: {
      get(keys, cb) { cb(Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, data[k]]))); },
      set(values, cb) { Object.assign(data, values); cb?.(); },
      remove(keys, cb) { [].concat(keys).forEach((k) => delete data[k]); cb?.(); },
    } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    runtime: { onMessage: { addListener(fn) { events.message = fn; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    tabs: {
      create: async ({ url }) => { const tab = { id: tabs.size + 1, url }; tabs.set(tab.id, tab); return tab; },
      update: async (id, values) => { Object.assign(tabs.get(id), values); return tabs.get(id); },
      get: async (id) => tabs.get(id), query: async () => [], sendMessage() {},
      onUpdated: { addListener(fn) { events.updated = fn; } }, onActivated: { addListener(fn) { events.activated = fn; } }, onRemoved: { addListener() {} },
    },
    scripting: { executeScript: async ({ args }) => {
      injections++;
      return [{ result: { data: { token: "new-token", state: args[1] } } }];
    } },
    commands: { onCommand: { addListener() {} } },
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status === 200, status, json: async () => ({ data: session, error: "Unauthorized" }) };
  };
  const context = vm.createContext({ chrome, fetch, crypto: webcrypto, console, Date: Clock, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval });
  vm.runInContext(source, context);
  return {
    data, tabs, calls,
    send: (message, sender = {}) => new Promise((resolve) => events.message(message, sender, resolve)),
    advance: (ms) => { time += ms; },
    status: (value) => { status = value; },
    complete: (id) => vm.runInContext(`completeAuthentication(${id})`, context),
    injections: () => injections,
  };
}
let passed = 0;
async function check(name, test) {
  await test(); passed++; console.log(`  ok  ${name}`);
}
await check("Authenticate opens the configured dashboard without a code", async () => {
  const h = await boot();
  assert.equal((await h.send({ type: "APPLI_FILL_AUTHENTICATE", apiBase: "https://dashboard.test" })).ok, true);
  assert.equal(h.tabs.get(1).url, "https://dashboard.test/dashboard");
  assert.match(h.data.pendingAuth.state, /^[a-f0-9]{64}$/);
  assert.equal(h.data.token, undefined);
  await h.complete(1);
  assert.equal(h.data.token, "new-token");
  assert.ok(h.data.session.user);
  assert.equal(h.data.pendingAuth, undefined);
  assert.equal((await h.send({ type: "APPLI_FILL_CONSUME_WELCOME" })).data.show, true);
  assert.equal((await h.send({ type: "APPLI_FILL_CONSUME_WELCOME" })).data.show, false);
});
await check("an unrelated tab or origin cannot complete authentication", async () => {
  const h = await boot();
  await h.send({ type: "APPLI_FILL_AUTHENTICATE", apiBase: "https://dashboard.test" });
  await h.complete(22);
  h.tabs.get(1).url = "https://attacker.test/dashboard";
  await h.complete(1);
  assert.equal(h.injections(), 0);
  assert.equal(h.data.token, undefined);
});
await check("content scripts cannot start authentication or sign the user out", async () => {
  const h = await boot({ token: "valid", lastActivityAt: Date.now() });
  assert.equal((await h.send({ type: "APPLI_FILL_AUTHENTICATE" }, { tab: { id: 1 } })).ok, false);
  assert.equal((await h.send({ type: "APPLI_FILL_LOGOUT" }, { tab: { id: 1 } })).ok, false);
  assert.equal(h.data.token, "valid");
});
await check("insecure remote dashboard URLs are rejected", async () => {
  const h = await boot();
  assert.equal((await h.send({ type: "APPLI_FILL_AUTHENTICATE", apiBase: "http://dashboard.test" })).ok, false);
  assert.equal(h.tabs.size, 0);
});
await check("three days of inactivity expire the session before returning cached profile data", async () => {
  const h = await boot({ token: "valid", lastActivityAt: Date.now(), session: { user: { id: "u1" } }, sessionAt: Date.now() });
  h.advance(idle);
  assert.equal((await h.send({ type: "APPLI_FILL_GET_SESSION" })).ok, false);
  assert.equal(h.data.token, undefined);
  assert.equal(h.data.session, undefined);
  assert.equal(h.calls.length, 0);
});
await check("background tab refreshes do not extend the inactivity window", async () => {
  const h = await boot({ token: "valid", lastActivityAt: Date.now() });
  const before = h.data.lastActivityAt;
  h.advance(86_400_000);
  await h.send({ type: "APPLI_FILL_GET_SESSION" }, { tab: { id: 5 } });
  assert.equal(h.data.lastActivityAt, before);
});
await check("daily popup use keeps the session signed in beyond three days", async () => {
  const h = await boot({ token: "valid", lastActivityAt: Date.now() });
  for (let day = 0; day < 5; day++) {
    h.advance(86_400_000);
    assert.equal((await h.send({ type: "APPLI_FILL_GET_SESSION" })).ok, true);
  }
  assert.equal(h.data.token, "valid");
});
await check("a revoked token never returns stale cached data", async () => {
  const h = await boot({ token: "valid", lastActivityAt: Date.now(), session: { user: { id: "u1" } }, sessionAt: Date.now() });
  h.status(401);
  assert.equal((await h.send({ type: "APPLI_FILL_GET_SESSION", force: true })).ok, false);
  assert.equal(h.data.session, undefined);
});
await check("a new login after logout replays the welcome animation", async () => {
  const h = await boot();
  for (let cycle = 0; cycle < 2; cycle++) {
    await h.send({ type: "APPLI_FILL_AUTHENTICATE", apiBase: "https://dashboard.test" });
    await h.complete(cycle + 1);
    assert.equal((await h.send({ type: "APPLI_FILL_CONSUME_WELCOME" })).data.show, true);
    await h.send({ type: "APPLI_FILL_LOGOUT" });
    assert.equal(h.data.token, undefined);
  }
});
await check("an abandoned authentication expires after ten minutes", async () => {
  const h = await boot();
  await h.send({ type: "APPLI_FILL_AUTHENTICATE", apiBase: "https://dashboard.test" });
  h.advance(10 * 60_000);
  await h.complete(1);
  assert.equal(h.data.token, undefined);
  assert.equal(h.data.pendingAuth, undefined);
});
console.log(`\n${passed} authentication checks passed`);
