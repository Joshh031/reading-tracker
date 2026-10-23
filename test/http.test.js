import test from "node:test";
import assert from "node:assert/strict";
import app from "../server/http.js";

test("HTTP API enforces authentication, body limits, and JSON-RPC envelopes", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(base + "/api/vault");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, "Knowledge Vault");
    assert.equal(health.headers.get("cache-control"), "private, no-store");
    for (const action of ["list", "add", "reflect"]) {
      const r = await fetch(base + "/api/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      assert.equal(r.status, 401);
    }
    const malformed = await fetch(base + "/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, -32600);
    const huge = await fetch(base + "/api/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", url: "x".repeat(60_000) }),
    });
    assert.equal(huge.status, 413);
    const invalid = await fetch(base + "/api/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      (await fetch(base + "/api/verify", { method: "POST" })).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
