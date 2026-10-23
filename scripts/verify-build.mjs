import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import handler from "../.vercel/output/functions/__server.func/index.mjs";

// Exercise the actual deployable bundle, including Firebase's native dependency tree.
const routes = JSON.parse(await readFile('.vercel/output/config.json', 'utf8')).routes;
assert.ok(routes.some(r => r.src === '/api/(.*)' && r.dest === '/__server'), 'API routes must reach the compiled server');
assert.ok(routes.filter(r => r.headers && !r.dest).every(r => r.continue === true), 'Header rules must not shadow the API or assets');
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
  console.log(
    "Deployable server: startup, HTTP routing, private access denial, PWA shell and private worker configuration passed.",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
