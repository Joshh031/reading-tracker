import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("API imports when the runtime disables CommonJS require(ESM)", () => {
  execFileSync(
    process.execPath,
    [
      "--no-experimental-require-module",
      "--input-type=module",
      "-e",
      "await import('./api/vault.js')",
    ],
    { cwd: process.cwd() },
  );
});
test("patched JWKS parser still exports the correct RSA public key", async () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture",
    alg: "RS256",
    use: "sig",
  };
  const { retrieveSigningKeys } = require("jwks-rsa/src/utils.js");
  const keys = await retrieveSigningKeys([jwk]);
  assert.equal(keys[0].kid, "fixture");
  assert.equal(
    keys[0].getPublicKey().trim(),
    publicKey.export({ type: "spki", format: "pem" }).trim(),
  );
});

test("background work persists progress across stages and stops on blocked state", async () => {
  const { drainEpisode } = await import("../server/background.js");
  let count = 0,
    episode = { status: "queued", stage: "resolve" };
  await drainEpisode({ get: async () => episode }, "u", "apple-123", {
    jobs: {
      process: async () => {
        count++;
        episode =
          count === 1
            ? { status: "discovering", stage: "discover" }
            : { status: "needs_configuration", stage: "analyze" };
      },
    },
  });
  assert.equal(count, 2);
});
test("background work leaves long delayed jobs durable without spinning", async () => {
  const { drainEpisode } = await import("../server/background.js");
  let count = 0;
  await drainEpisode(
    {
      get: async () => ({
        status: "retry_wait",
        stage: "resolve",
        nextAttemptAt: Date.now() + 300000,
      }),
    },
    "u",
    "apple-123",
    { jobs: { process: async () => count++ } },
  );
  assert.equal(count, 0);
});
