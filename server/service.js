import { paidProcessingEnabled } from "./processing-policy.js";
import { reviewContext, saveChatReview } from "./chat-review.js";
import { terminal } from "./states.js";
import { z } from "zod";
import { resolveEpisode } from "./identity.js";
import { discoverTranscript } from "./transcript.js";
import { organizeReflection } from "./analysis.js";
import { pipeline } from "./pipeline.js";
import { searchArchive, researchBrief } from "./search.js";
import { VaultError, problem } from "./errors.js";
export const writeActions = new Set([
  "save_review",
  "add",
  "process",
  "reflect",
  "organize",
  "sync_daily",
  "work",
]);
const id = z.string().regex(/^apple-\d+$/);
export function publicEpisode(e) {
  if (!e) return null;
  const { searchIndex, lease, leaseUntil, submissionPending, ...rest } = e;
  return rest;
}
export async function service(action, input, uid, store) {
  const jobs = pipeline(store);
  if (action === "review_context") return reviewContext(store, uid, input);
  if (action === "save_review")
    return { episode: publicEpisode(await saveChatReview(store, uid, input)) };
  if (action === "resolve") {
    const { url } = z.object({ url: z.string().url() }).parse(input);
    const episode = await resolveEpisode(url);
    const d = await discoverTranscript(episode);
    return {
      episode,
      transcript: d.transcript
        ? {
            wordCount: d.transcript.wordCount,
            source: d.transcript.source,
            coverage: d.transcript.coverage,
            completeness: d.transcript.completeness,
          }
        : null,
      attempts: d.attempts,
      audioAvailable: Boolean(episode.audioUrl),
    };
  }
  if (action === "add") {
    const { url } = z.object({ url: z.string().url() }).parse(input);
    const result = await jobs.add(uid, url);
    return { ...result, episode: publicEpisode(result.episode) };
  }
  if (action === "list")
    return {
      episodes: (await store.list(uid)).map((e) => ({
        id: e.id,
        url: e.url,
        metadata: e.metadata,
        status: e.status,
        stage: e.stage,
        createdAt: e.createdAt,
        nextAttemptAt: e.nextAttemptAt,
        lastError: e.lastError,
        reflection: e.reflection,
        analysis: e.analysis
          ? {
              executiveBottomLine: e.analysis.executiveBottomLine,
              guests: e.analysis.guests,
            }
          : null,
      })),
    };
  if (action === "get") {
    const value = await store.get(uid, id.parse(input.id));
    if (!value) throw new VaultError("NOT_FOUND", "Episode not found.", 404);
    return { episode: publicEpisode(value) };
  }
  if (action === "process")
    return {
      episode: publicEpisode(
        await jobs.process(uid, id.parse(input.id), {
          retry: input.retry === true,
        }),
      ),
    };
  if (action === "transcript") {
    const data = z
      .object({ id, offset: z.number().int().min(0).default(0) })
      .parse(input);
    const e = await store.get(uid, data.id);
    if (!e) throw new VaultError("NOT_FOUND", "Episode not found.", 404);
    const t = await store.transcript(uid, data.id, e.transcript);
    if (!t) return { segments: [], source: null, nextOffset: null };
    return {
      segments: t.segments.slice(data.offset, data.offset + 100),
      source: t.source,
      nextOffset:
        data.offset + 100 < t.segments.length ? data.offset + 100 : null,
    };
  }
  if (action === "search" || action === "research") {
    const { query, semantic } = z
      .object({
        query: z.string().min(1).max(1500),
        semantic: z.boolean().default(true),
      })
      .parse(input);
    const r = await searchArchive(store, uid, query, { semantic });
    if (action === "research" && !paidProcessingEnabled())
      return {
        ...r,
        answer: null,
        citations: [],
        synthesisMode: "chatgpt",
        instructions:
          "Synthesize these records in this conversation. Attribute every conclusion to the returned episode and source. Distinguish listener memory and unverified interpretations from guest statements. State evidence gaps. Do not infer bearishness from risk discussion alone.",
      };
    if (action === "research") {
      await store.budget(uid, "briefs", 20);
      try {
        return await researchBrief(r);
      } catch (error) {
        return {
          ...r,
          answer: null,
          citations: [],
          researchError: problem(error),
        };
      }
    }
    return r;
  }
  if (action === "organize") {
    const { raw } = z
      .object({ raw: z.string().min(1).max(12000) })
      .parse(input);
    if (!paidProcessingEnabled())
      return {
        organized: raw.trim().replace(/\r\n/g, "\n"),
        questions: [],
        method: "format_only",
        message:
          "Original wording preserved. Ask ChatGPT to organize the ideas without adding facts.",
      };
    await store.budget(uid, "reflectionEdits", 30);
    return organizeReflection(raw);
  }
  if (action === "reflect") {
    const value = z
      .object({
        id,
        raw: z.string().max(12000),
        organized: z.string().max(16000).default(""),
        questions: z.array(z.string().max(1000)).max(20).default([]),
        listenedPercent: z.number().min(0).max(100).nullable(),
        expectedVersion: z.number().int().min(0),
      })
      .parse(input);
    const { id: episodeId, expectedVersion, ...reflection } = value;
    return {
      reflection: await store.saveReflection(
        uid,
        episodeId,
        reflection,
        expectedVersion,
      ),
    };
  }
  if (action === "legacy") return { legacy: await store.legacy(uid) };
  if (action === "export") {
    const episodes = await store.list(uid);
    const archive = [];
    for (const e of episodes)
      archive.push({
        ...publicEpisode(e),
        fullTranscript: await store.transcript(uid, e.id, e.transcript),
      });
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      episodes: archive,
      legacy: await store.legacy(uid),
    };
  }
  if (action === "sync_daily") {
    const value = z
      .object({ id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(input);
    if (!(await store.get(uid, value.id)))
      throw new VaultError("NOT_FOUND", "Episode not found.", 404);
    return store.syncDaily(uid, value.id, value.date);
  }
  if (action === "work") {
    const candidates = (await store.list(uid))
      .filter(
        (e) =>
          !terminal.has(e.status) &&
          (!e.nextAttemptAt || e.nextAttemptAt <= Date.now()),
      )
      .slice(0, 2);
    const result = [];
    for (const e of candidates)
      result.push(publicEpisode(await jobs.process(uid, e.id)));
    return { episodes: result };
  }
  throw new VaultError("UNKNOWN_ACTION", "Unknown archive operation.", 400);
}
