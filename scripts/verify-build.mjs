import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import handler from "../.vercel/output/functions/__server.func/index.mjs";

// Exercise the actual deployable bundle, including Firebase's native dependency tree.
const routes = JSON.parse(
  await readFile(".vercel/output/config.json", "utf8"),
).routes;
assert.ok(
  routes.some((r) => r.src === "/api/(.*)" && r.dest === "/__server"),
  "API routes must reach the compiled server",
);
assert.ok(
  routes.filter((r) => r.headers && !r.dest).every((r) => r.continue === true),
  "Header rules must not shadow the API or assets",
);
const config = JSON.parse(
  await readFile(
    ".vercel/output/functions/.well-known/workflow/v1/flow.func/.vc-config.json",
    "utf8",
  ),
);
assert.equal(config.experimentalTriggers[0].type, "queue/v2beta");
await import("../.vercel/output/functions/.well-known/workflow/v1/flow.func/index.mjs");
const server = createServer(handler);
// Vercel supplies a per-invocation socket; avoid sharing a native keep-alive socket.
server.maxRequestsPerSocket = 1;
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const health = await fetch(base + "/api/vault");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "Knowledge Vault");
  assert.equal(health.headers.get("cache-control"), "private, no-store");
  const denied = await fetch(base + "/api/vault", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "list" }),
  });
  assert.equal(denied.status, 401);
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Knowledge Vault/);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    assert.ok(
      process.env.FIREBASE_PROJECT_ID?.startsWith("demo-"),
      "Compiled persistence checks only run against a demo emulator",
    );
    const { firestoreStore } = await import("../server/store.js");
    const store = firestoreStore(),
      uid = "compiled-test-" + Date.now(),
      token = randomBytes(32).toString("hex");
    process.env.KV_API_KEYS_JSON = JSON.stringify([
      {
        uid,
        hash: createHash("sha256").update(token).digest("hex"),
        scopes: ["read", "write"],
      },
    ]);
    await store.create(uid, "apple-987", {
      id: "apple-987",
      status: "ready",
      stage: "complete",
      createdAt: new Date().toISOString(),
      reflection: { version: 0, raw: "" },
    });
    const post = async (body) => {
      const response = await fetch(base + "/api/vault", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + token,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    };
    assert.equal((await post({ action: "list" })).episodes.length, 1);
    await post({
      action: "reflect",
      id: "apple-987",
      raw: "Compiled API journal test",
      listenedPercent: 50,
      expectedVersion: 0,
    });
    assert.equal(
      (await store.get(uid, "apple-987")).reflection.raw,
      "Compiled API journal test",
    );
    assert.equal(
      (await post({ action: "search", query: "journal", semantic: false }))
        .results[0].basis,
      "personal reflection; not a guest statement",
    );
    console.log(
      "Compiled API: authenticated Firestore reads, journal persistence and full-text search passed.",
    );
  }
  console.log(
    "Deployable server: startup, HTTP routing, private access denial, PWA shell and private worker configuration passed.",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
