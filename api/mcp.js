import { waitUntil } from "@vercel/functions";
import { continueInBackground } from "../server/background.js";
import { scheduleEpisode } from "../server/scheduler.js";
import { authenticate, safeOrigin } from "../server/auth.js";
import { firestoreStore } from "../server/store.js";
import { service, writeActions } from "../server/service.js";
import { problem } from "../server/errors.js";
export const config = { maxDuration: 240 };
const tools = [
  [
    "add",
    "Add an exact podcast URL to the private archive. Returns durable ID and ingestion status. Does not record listening completion.",
    { url: { type: "string" } },
    ["url"],
  ],
  [
    "get",
    "Read episode metadata, analysis, reflection and processing status.",
    { id: { type: "string" } },
    ["id"],
  ],
  [
    "process",
    "Advance or retry saved ingestion. Call until ready or blocked; preserve and report exact errors.",
    { id: { type: "string" }, retry: { type: "boolean" } },
    ["id"],
  ],
  [
    "search",
    "Search source-backed archive claims by topic, guest or concept.",
    { query: { type: "string" } },
    ["query"],
  ],
  [
    "research",
    "Synthesize a research brief across saved episodes with attribution and citations.",
    { query: { type: "string" } },
    ["query"],
  ],
  [
    "reflect",
    "Save listener notes separately from guest claims. Read get first for reflection version; preserves raw notes.",
    {
      id: { type: "string" },
      raw: { type: "string" },
      organized: { type: "string" },
      questions: { type: "array", items: { type: "string" } },
      listenedPercent: { type: ["number", "null"] },
      expectedVersion: { type: "integer" },
    },
    ["id", "raw", "listenedPercent", "expectedVersion"],
  ],
  ["list", "List the private archive.", {}, []],
].map(([action, description, properties, required]) => ({
  name: "vault_" + action,
  description,
  inputSchema: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: !writeActions.has(action),
    destructiveHint: false,
    idempotentHint: action === "add" || !writeActions.has(action),
    openWorldHint: ["add", "process"].includes(action),
  },
}));
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "GET") return res.status(405).end();
  if (req.method === "DELETE") return res.status(405).end();
  if (req.method !== "POST") return res.status(405).end();
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON" },
    });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    body.jsonrpc !== "2.0" ||
    typeof body.method !== "string"
  )
    return res
      .status(400)
      .json({
        jsonrpc: "2.0",
        id: body?.id ?? null,
        error: { code: -32600, message: "Invalid JSON-RPC request" },
      });
  if (Buffer.byteLength(JSON.stringify(body)) > 50_000)
    return res
      .status(413)
      .json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32600, message: "Request exceeds 50 KB" },
      });
  try {
    safeOrigin(req);
    const user = await authenticate(
      req,
      body?.method === "tools/call" &&
        writeActions.has(String(body.params?.name).replace(/^vault_/, ""))
        ? "write"
        : "read",
    );
    if (body.method?.startsWith("notifications/")) return res.status(202).end();
    const reply = (result) =>
      res.status(200).json({ jsonrpc: "2.0", id: body.id, result });
    if (body.method === "initialize")
      return reply({
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "knowledge-vault", version: "2.0.0" },
      });
    if (body.method === "ping") return reply({});
    if (body.method === "tools/list") return reply({ tools });
    if (body.method === "tools/call") {
      const t = tools.find((t) => t.name === body.params?.name);
      if (!t)
        return res.status(200).json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32602, message: "Unknown tool" },
        });
      try {
        const store = firestoreStore(),
          action = t.name.replace(/^vault_/, "");
        const result = await service(
          action,
          body.params.arguments || {},
          user.uid,
          store,
        );
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
        return reply({
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        });
      } catch (error) {
        return reply({
          isError: true,
          content: [{ type: "text", text: JSON.stringify(problem(error)) }],
        });
      }
    }
    return res.status(200).json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32601, message: "Method not found" },
    });
  } catch (error) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return res.status(error.status || 500).json({ error: problem(error) });
  }
}
