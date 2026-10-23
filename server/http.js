import express from "express";
import vault from "./routes/vault.js";
import mcp from "./routes/mcp.js";
import verify from "./routes/verify.js";

// Keep the public API unchanged while Nitro compiles the durable worker routes.
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.all(
  ["/api/vault", "/api/podcast", "/api/podcast2", "/api/transcript-source"],
  vault,
);
app.all("/api/mcp", mcp);
app.all("/api/verify", verify);
app.use((error, req, res, next) => {
  res.status(error.type === "entity.too.large" ? 413 : 400).json({
    error: {
      code:
        error.type === "entity.too.large" ? "BODY_TOO_LARGE" : "INVALID_INPUT",
      message: "Request must be valid JSON under 50 KB.",
    },
  });
});
export default app;
