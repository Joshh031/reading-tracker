// Work around auth0/node-jwks-rsa#507 on Vercel's CommonJS loader without
// downgrading jose. Keep the patch narrow and fail installation if it drifts.
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(path.dirname(require.resolve("jwks-rsa")), "utils.js");
const original = fs.readFileSync(file, "utf8");
const marker = "  const jose = await import('jose'); // KV ESM compatibility";
if (!original.includes(marker)) {
  if (
    !original.includes("const jose = require('jose');") ||
    !original.includes("async function retrieveSigningKeys(jwks) {")
  ) {
    throw new Error(
      "jwks-rsa changed: review whether the Vercel ESM compatibility patch is still needed.",
    );
  }
  fs.writeFileSync(
    file,
    original
      .replace("const jose = require('jose');\n", "")
      .replace(
        "async function retrieveSigningKeys(jwks) {",
        "async function retrieveSigningKeys(jwks) {\n" + marker,
      ),
  );
}
const passport = path.join(path.dirname(file), "integrations/passport.js");
const source = fs.readFileSync(passport, "utf8");
if (!source.includes(marker)) {
  if (
    !source.includes("const jose = require('jose');") ||
    !source.includes("return function secretProvider(req, rawJwtToken, cb) {")
  )
    throw new Error("Review jwks-rsa passport ESM patch.");
  fs.writeFileSync(
    passport,
    source
      .replace("const jose = require('jose');\n", "")
      .replace(
        "return function secretProvider(req, rawJwtToken, cb) {",
        "return async function secretProvider(req, rawJwtToken, cb) {",
      )
      .replace("    try {\n", "    try {\n    " + marker + "\n"),
  );
}
