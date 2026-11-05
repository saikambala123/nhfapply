import crypto from "node:crypto";
import { requireUser, signToken } from "@/lib/auth";
import ExtensionSession from "@/models/ExtensionSession";
import User from "@/models/User";
import { ok, fail, handler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Called only inside the dashboard tab's isolated extension world. Credentials
// are returned directly to the worker, never through the DOM or page messages.
export const POST = handler(async (req: Request) => {
  if (req.headers.get("origin") !== new URL(req.url).origin) return fail("Invalid origin.", 403);
  const user = await requireUser();
  await rateLimit("extension-authenticate", `${user._id}:${clientIp(req)}`, { limit: 20, windowSec: 900 });
  const { state } = await req.json();
  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) return fail("Invalid authentication request.");
  const sid = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  await ExtensionSession.create({ _id: sid, userId: user._id, lastUsedAt: now, expiresAt: new Date(+now + 3 * 86_400_000) });
  await User.updateOne({ _id: user._id }, { $set: { extensionSeenAt: now, extensionAuthenticatedAt: now } });
  const token = await signToken({ sub: String(user._id), email: user.email, scope: "extension", sv: Number(user.sessionVersion ?? 0), sid }, "extension");
  const response = ok({ token, state });
  response.headers.set("Cache-Control", "no-store");
  return response;
});
