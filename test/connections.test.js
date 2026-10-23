import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { manageConnection } from "../server/connections.js";
test("connection creation stores only a hash, scopes owner access and redacts listing", async () => {
  const rows = new Map();
  let budgeted = false;
  const store = {
    budget: async (uid, kind, limit) => {
      assert.equal(uid, "owner");
      assert.equal(limit, 5);
      budgeted = true;
    },
    createConnection: async (id, data) => rows.set(id, data),
    connections: async (uid) =>
      [...rows]
        .map(([id, data]) => ({ id, ...data }))
        .filter((r) => r.uid === uid),
  };
  const created = await manageConnection(
    "connection_create",
    {},
    { uid: "owner", method: "firebase" },
    store,
  );
  assert.equal(budgeted, true);
  assert.match(created.token, /^kv1_[a-f0-9]{64}$/);
  assert.equal(
    created.id,
    createHash("sha256").update(created.token).digest("hex"),
  );
  assert.equal(JSON.stringify([...rows]).includes(created.token), false);
  assert.deepEqual(rows.get(created.id).scopes, ["read", "write"]);
  assert.ok(Date.parse(created.expiresAt) > Date.now());
  const listing = await manageConnection(
    "connections",
    {},
    { uid: "owner", method: "firebase" },
    store,
  );
  assert.equal(listing.connections[0].uid, undefined);
  assert.equal(listing.connections[0].token, undefined);
  assert.equal(
    (
      await manageConnection(
        "connections",
        {},
        { uid: "other", method: "firebase" },
        store,
      )
    ).connections.length,
    0,
  );
});
test("connector cannot mint, enumerate or revoke credentials", async () => {
  for (const action of [
    "connection_create",
    "connections",
    "connection_revoke",
  ])
    await assert.rejects(
      () =>
        manageConnection(action, {}, { uid: "owner", method: "api_key" }, {}),
      (e) => e.code === "FORBIDDEN",
    );
});
