import { paidProcessingEnabled } from "../processing-policy.js";
import { gatewayCredential } from "../providers.js";
import { waitUntil } from "@vercel/functions";
import { continueInBackground } from "../background.js";
import { scheduleEpisode } from "../scheduler.js";
import { authenticate, safeOrigin } from "../auth.js";
import { firestoreStore } from "../store.js";
import { service, writeActions } from "../service.js";
import { problem } from "../errors.js";
import { manageConnection } from "../connections.js";
export const config = { maxDuration: 240 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET")
    return res.status(200).json({
      service: "Knowledge Vault",
      version: 2,
      environment: process.env.VERCEL_ENV || "local",
      storageConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      storageRulesVerified: process.env.KV_STORAGE_RULES_VERIFIED === "true",
      processingMode: paidProcessingEnabled() ? "provider" : "chatgpt",
      paidProcessingEnabled: paidProcessingEnabled(),
      analysisConfigured:
        paidProcessingEnabled() && Boolean(await gatewayCredential()),
      dailyTrackerConfigured:
        process.env.VERCEL_ENV === "production" &&
        process.env.KV_DAILY_TRACKER_ENABLED === "true",
      transcriptionConfigured:
        paidProcessingEnabled() &&
        Boolean(process.env.ASSEMBLYAI_API_KEY) &&
        process.env.KV_TRANSCRIPTION_ENABLED === "true",
    });
  if (req.method !== "POST")
    return res.status(405).json({
      error: { code: "METHOD_NOT_ALLOWED", message: "POST required" },
    });
  try {
    safeOrigin(req);
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (Buffer.byteLength(JSON.stringify(body)) > 50_000)
      return res.status(413).json({
        error: { code: "BODY_TOO_LARGE", message: "Request exceeds 50 KB." },
      });
    const { action, ...input } = body,
      user = await authenticate(
        req,
        writeActions.has(action) ? "write" : "read",
      );
    // Metadata diagnostics work without database access; private records never do.
    const store = action === "resolve" ? null : firestoreStore();
    if (
      ["connections", "connection_create", "connection_revoke"].includes(action)
    )
      return res
        .status(200)
        .json(await manageConnection(action, input, user, store));
    const result = await service(action, input, user.uid, store);
    if (["add", "process"].includes(action)) {
      try {
        result.workflowRunId = await scheduleEpisode(
          store,
          user.uid,
          result.episode.id,
        );
      } catch {
        result.schedulingWarning =
          "Durable worker unavailable; processing will resume from saved progress.";
        await store.update(user.uid, result.episode.id, {
          schedulingError: result.schedulingWarning,
        });
        continueInBackground(waitUntil, store, user.uid, result.episode.id);
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error.name === "ZodError" || error instanceof SyntaxError)
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Request fields are invalid.",
        },
      });
    return res.status(error.status || 500).json({ error: problem(error) });
  }
}
