import type { NextRequest } from "next/server";
import { requireUser, readToken } from "@/lib/auth";
import ExtensionSession from "@/models/ExtensionSession";
import { ok, fail, handler, cors } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  const payload = await readToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (payload?.scope !== "extension" || !payload.sid) return fail("Authenticate the extension again.", 401);
  const now = new Date();
  const result = await ExtensionSession.updateOne(
    { _id: payload.sid, userId: user._id, expiresAt: { $gt: now } },
    { $set: { lastUsedAt: now, expiresAt: new Date(+now + 3 * 86_400_000) } }
  );
  if (!result.matchedCount) return fail("Authenticate the extension again.", 401);
  return ok({ lastUsedAt: +now });
});

export const DELETE = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  const payload = await readToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (payload?.scope !== "extension" || !payload.sid) return fail("Authenticate the extension again.", 401);
  await ExtensionSession.deleteOne({ _id: payload.sid, userId: user._id });
  return ok({ signedOut: true });
});
