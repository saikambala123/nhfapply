import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// Exercise the actual route handlers and token validation with an in-memory
// persistence adapter. This is not a live MongoDB or browser integration test.
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
const user = { _id: "user-1", email: "user@example.test", sessionVersion: 0 };
const records = new Map();
let cookie;
const sessions = {
  async create(record) { records.set(record._id, record); },
  async exists(filter) {
    const record = records.get(filter._id);
    return record && String(record.userId) === String(filter.userId) && +record.expiresAt > +filter.expiresAt.$gt ? { _id: record._id } : null;
  },
  async updateOne(filter, update) {
    if (!(await this.exists(filter))) return { matchedCount: 0 };
    Object.assign(records.get(filter._id), update.$set);
    return { matchedCount: 1 };
  },
  async deleteOne(filter) {
    const record = records.get(filter._id);
    if (record?.userId === filter.userId) records.delete(filter._id);
  },
};
async function compile(path, deps) {
  const text = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    assert.ok(id in deps, `Unexpected import: ${id}`);
    return deps[id];
  }, module, module.exports);
  return module.exports;
}
const auth = await compile("src/lib/auth.ts", {
  jose: { SignJWT, jwtVerify }, bcryptjs: {},
  "next/headers": { cookies: () => ({ get: () => cookie ? { value: cookie } : undefined }) },
  "next/navigation": { redirect() { throw Error("redirect"); } },
  "./db": { withDbRetry: async (fn) => fn() },
  "@/models/User": { findById: () => ({ select: () => ({ lean: async () => user }) }) },
  "@/models/ExtensionSession": sessions,
});
const api = {
  ok: (data) => Response.json({ ok: true, data }),
  fail: (error, status = 400) => Response.json({ ok: false, error }, { status }),
  cors: () => new Response(null, { status: 204 }),
  handler: (fn) => async (...args) => { try { return await fn(...args); } catch (error) { if (error instanceof auth.HttpError) return Response.json({ error: error.message }, { status: error.status }); throw error; } },
};
const authenticate = await compile("src/app/api/extension/authenticate/route.ts", {
  "node:crypto": crypto, "@/lib/auth": auth, "@/models/ExtensionSession": sessions,
  "@/models/User": { updateOne: async () => ({ matchedCount: 1 }) },
  "@/lib/api": api, "@/lib/rate-limit": { rateLimit: async () => {}, clientIp: () => "127.0.0.1" },
});
const activity = await compile("src/app/api/extension/activity/route.ts", {
  "@/lib/auth": auth, "@/models/ExtensionSession": sessions, "@/lib/api": api,
});
const state = crypto.randomBytes(32).toString("hex");
const request = (origin = "https://dashboard.test", value = state) => new Request("https://dashboard.test/api/extension/authenticate", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ state: value }),
});
assert.equal((await authenticate.POST(request())).status, 401);
cookie = await auth.signToken({ sub: user._id, email: user.email, scope: "web", sv: 0 });
assert.equal((await authenticate.POST(request("https://attacker.test"))).status, 403);
assert.equal((await authenticate.POST(request("https://dashboard.test", "invalid"))).status, 400);
const response = await authenticate.POST(request());
assert.equal(response.status, 200);
assert.equal(response.headers.get("Cache-Control"), "no-store");
const { data } = await response.json();
assert.equal(data.state, state);
const payload = await auth.readToken(data.token);
assert.equal(payload.scope, "extension");
assert.ok(payload.sid);
assert.ok(records.has(payload.sid));
cookie = undefined;
const bearer = () => new Request("https://dashboard.test/api/extension/activity", { method: "POST", headers: { Authorization: `Bearer ${data.token}` } });
assert.equal((await auth.getCurrentUser(bearer()))._id, user._id);
const record = records.get(payload.sid);
record.expiresAt = new Date(Date.now() + 60_000);
assert.equal((await activity.POST(bearer())).status, 200);
assert.ok(+record.expiresAt > Date.now() + 2.9 * 86_400_000);
record.expiresAt = new Date(Date.now() - 1);
assert.equal(await auth.getCurrentUser(bearer()), null);
assert.equal((await activity.POST(bearer())).status, 401);
record.expiresAt = new Date(Date.now() + 60_000);
user.sessionVersion = 1;
assert.equal(await auth.getCurrentUser(bearer()), null);
user.sessionVersion = 0;
assert.equal((await activity.DELETE(bearer())).status, 200);
assert.equal(await auth.getCurrentUser(bearer()), null);
const legacyToken = await auth.signToken({ sub: user._id, email: user.email, scope: "extension", sv: 0 });
assert.equal(await auth.getCurrentUser(new Request("https://dashboard.test", { headers: { Authorization: `Bearer ${legacyToken}` } })), null);
console.log("Authentication API and session validation assertions passed");
