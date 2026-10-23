import { randomBytes, createHash } from "node:crypto";
import { VaultError } from "./errors.js";
export async function manageConnection(action, input, user, store) {
  // Connector tokens cannot mint, enumerate or revoke other tokens.
  if (user.method !== "firebase")
    throw new VaultError(
      "FORBIDDEN",
      "Manage connections after signing in with Google.",
      403,
    );
  if (action === "connections") {
    const records = await store.connections(user.uid);
    return {
      connections: records.map(
        ({ id, name, expiresAt, revoked, createdAt }) => ({
          id,
          name,
          expiresAt,
          revoked,
          createdAt,
        }),
      ),
    };
  }
  if (action === "connection_revoke") {
    if (!/^[a-f0-9]{64}$/.test(input.id || ""))
      throw new VaultError("INVALID_INPUT", "Invalid connection.", 400);
    await store.revokeConnection(user.uid, input.id);
    return { revoked: true };
  }
  await store.budget(user.uid, "connection_creates", 5);
  const token = "kv1_" + randomBytes(32).toString("hex");
  const id = createHash("sha256").update(token).digest("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await store.createConnection(id, {
    uid: user.uid,
    name: "ChatGPT",
    scopes: ["read", "write"],
    createdAt,
    expiresAt,
    revoked: false,
  });
  return { token, id, expiresAt };
}
