import { createHash, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "./store.js";
import { VaultError } from "./errors.js";
export async function authenticate(req, scope = "read") {
  const token = String(req.headers.authorization || "").replace(
    /^Bearer /i,
    "",
  );
  if (!token)
    throw new VaultError(
      "UNAUTHENTICATED",
      "Sign in to your private archive.",
      401,
    );
  const keys = JSON.parse(process.env.KV_API_KEYS_JSON || "[]");
  const hash = createHash("sha256").update(token).digest("hex");
  for (const entry of keys) {
    if (
      typeof entry.hash === "string" &&
      entry.hash.length === 64 &&
      timingSafeEqual(Buffer.from(hash), Buffer.from(entry.hash))
    ) {
      if (entry.expiresAt && Date.parse(entry.expiresAt) < Date.now()) break;
      if (!entry.scopes?.includes(scope))
        throw new VaultError(
          "FORBIDDEN",
          "This connection does not have the required permission.",
          403,
        );
      return { uid: entry.uid, method: "api_key" };
    }
  }
  let user;
  try {
    user = await getAuth(adminApp()).verifyIdToken(token);
  } catch {
    throw new VaultError(
      "UNAUTHENTICATED",
      "Your sign-in expired. Sign in again.",
      401,
    );
  }
  if (!user.email_verified || user.firebase?.sign_in_provider === "anonymous")
    throw new VaultError(
      "FORBIDDEN",
      "Use a verified account to open your archive.",
      403,
    );
  const allowed = (process.env.KV_ALLOWED_UIDS || "")
    .split(",")
    .filter(Boolean);
  if (!allowed.includes(user.uid))
    throw new VaultError(
      "ACCOUNT_NOT_ENABLED",
      "This account has not been enabled for Knowledge Vault.",
      403,
    );
  return { uid: user.uid, method: "firebase" };
}
export function safeOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  if (new URL(origin).host !== host)
    throw new VaultError(
      "ORIGIN_REJECTED",
      "Cross-origin browser requests are not permitted.",
      403,
    );
}
