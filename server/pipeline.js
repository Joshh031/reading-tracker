import { appleIdentity, resolveEpisode } from "./identity.js";
import { discoverTranscript } from "./transcript.js";
import {
  thirdPartyTranscript,
  youtubeTranscript,
  submitTranscription,
  pollTranscription,
} from "./providers.js";
import { analyzeEpisode, indexReview, reviewItems } from "./analysis.js";
import { problem, VaultError } from "./errors.js";
import { terminal } from "./states.js";
export { terminal } from "./states.js";
export function pipeline(store, dependencies = {}) {
  const dep = {
    resolveEpisode,
    discoverTranscript,
    thirdPartyTranscript,
    youtubeTranscript,
    submitTranscription,
    pollTranscription,
    analyzeEpisode,
    indexReview,
    ...dependencies,
  };
  return {
    async add(uid, url) {
      const identity = appleIdentity(url);
      const existing = await store.get(uid, identity.id);
      if (existing) return { created: false, episode: existing };
      await store.budget(uid, "imports", 10);
      return store.create(uid, identity.id, {
        id: identity.id,
        canonicalKey: identity.key,
        url: identity.url,
        status: "queued",
        stage: "resolve",
        attempts: 0,
        events: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reflection: {
          raw: "",
          organized: "",
          questions: [],
          listenedPercent: null,
          version: 0,
        },
      });
    },
    async process(uid, id, { retry = false } = {}) {
      let current = await store.get(uid, id);
      if (!current)
        throw new VaultError("NOT_FOUND", "Episode not found.", 404);
      if (current.status === "ready" && !(retry && current.indexingWarning))
        return current;
      if (terminal.has(current.status) && !retry) return current;
      if (current.nextAttemptAt > Date.now() && !retry) return current;
      if (current.attempts >= 5 && !retry)
        throw new VaultError(
          "RETRY_LIMIT",
          "Automatic retry limit reached; inspect the last error before another attempt.",
          409,
        );
      const e = await store.acquire(uid, id);
      if (!e) return current;
      // An explicit retry starts a new bounded batch; automatic retries never reset it.
      if (retry) {
        e.attempts = 0;
        if (e.status === "ready" && e.indexingWarning) e.stage = "index";
      }
      let patch = {},
        events = [...(e.events || [])];
      try {
        if (retry) await store.budget(uid, "manualRetries", 10);
        if (e.stage === "resolve") {
          const metadata = await dep.resolveEpisode(e.url);
          patch = { metadata, status: "discovering", stage: "discover" };
        } else if (e.stage === "discover") {
          const found = await dep.discoverTranscript(e.metadata);
          events.push(...found.attempts);
          let transcript = found.transcript;
          if (!transcript) {
            for (const source of [
              "thirdPartyTranscript",
              "youtubeTranscript",
            ]) {
              try {
                transcript = await dep[source](e.metadata);
                if (transcript) break;
              } catch (err) {
                events.push({ stage: source, ...problem(err) });
              }
            }
          }
          if (transcript) {
            const meta = await store.saveTranscript(uid, id, transcript);
            patch = {
              transcript: meta,
              stage:
                transcript.completeness === "likely_complete"
                  ? "analyze"
                  : "transcribe",
              status:
                transcript.completeness === "likely_complete"
                  ? "analyzing"
                  : "transcription_pending",
            };
          } else
            patch = e.metadata.audioUrl
              ? { stage: "transcribe", status: "transcription_pending" }
              : {
                  status: "needs_source",
                  lastError: {
                    code: "NO_TRANSCRIPT_OR_AUDIO",
                    message:
                      "No verified transcript or exact-episode audio was found.",
                    retryable: true,
                  },
                };
        } else if (e.stage === "transcribe") {
          if (e.submissionPending && !e.transcriptionJobId)
            throw new VaultError(
              "TRANSCRIPTION_SUBMISSION_UNCERTAIN",
              "A prior submission may have reached the provider. Reconcile it before resubmitting to avoid duplicate charges.",
              409,
            );
          await store.budget(
            uid,
            "transcriptionJobs",
            Number(process.env.KV_MAX_TRANSCRIPTIONS_PER_DAY || 2),
          );
          // Durable guard for the network ambiguity window: never automatically pay twice.
          await store.update(uid, id, { submissionPending: true });
          let job;
          try {
            job = await dep.submitTranscription(e.metadata);
          } catch (error) {
            if (
              [
                "TRANSCRIPTION_NOT_CONFIGURED",
                "AUDIO_DURATION_LIMIT",
                "AUDIO_SIZE_LIMIT",
                "UNSAFE_URL",
                "UNSAFE_ADDRESS",
              ].includes(error.code) ||
              /^PROVIDER_4(?!08)\d\d$/.test(error.code || "")
            )
              await store.update(uid, id, { submissionPending: false });
            throw error;
          }
          patch = {
            transcriptionJobId: job.id,
            submissionPending: false,
            stage: "poll_transcription",
            status: "transcribing",
            nextAttemptAt: Date.now() + 20_000,
          };
        } else if (e.stage === "poll_transcription") {
          const transcript = await dep.pollTranscription(
            e.metadata,
            e.transcriptionJobId,
          );
          if (!transcript)
            patch = {
              status: "transcribing",
              nextAttemptAt: Date.now() + 20_000,
            };
          else {
            const meta = await store.saveTranscript(uid, id, transcript);
            patch = { transcript: meta, status: "analyzing", stage: "analyze" };
          }
        } else if (e.stage === "analyze") {
          await store.budget(
            uid,
            "analyses",
            Number(process.env.KV_MAX_ANALYSES_PER_DAY || 10),
          );
          const transcript = await store.transcript(uid, id, e.transcript),
            analysis = await dep.analyzeEpisode(e.metadata, transcript);
          patch = { analysis, status: "indexing", stage: "index" };
        } else if (e.stage === "index") {
          const searchIndex = await dep.indexReview(e.analysis);
          patch = {
            searchIndex,
            status: "ready",
            stage: "complete",
            indexingWarning: null,
          };
        }
        events.push({
          stage: e.stage,
          status: patch.status,
          at: new Date().toISOString(),
        });
        await store.release(uid, id, e.lease, {
          ...patch,
          events: events.slice(-60),
          lastError: patch.lastError || null,
          attempts: 0,
          nextAttemptAt: patch.nextAttemptAt || 0,
        });
      } catch (error) {
        // The verified review and full-text search remain usable when embeddings fail.
        if (e.stage === "index" && e.analysis) {
          await store.release(uid, id, e.lease, {
            searchIndex: reviewItems(e.analysis),
            status: "ready",
            stage: "complete",
            indexingWarning: problem(error),
            lastError: null,
            attempts: 0,
            nextAttemptAt: 0,
            events: [
              ...events,
              {
                stage: "index",
                ...problem(error),
                at: new Date().toISOString(),
              },
            ].slice(-60),
          });
          return store.get(uid, id);
        }
        console.error(
          JSON.stringify({
            event: "vault_processing_error",
            episodeId: id,
            stage: e.stage,
            code: error.code || "UNEXPECTED_ERROR",
          }),
        );
        const configured = /_NOT_CONFIGURED|RULES_UNVERIFIED/.test(
          error.code || "",
        );
        const attempts = (e.attempts || 0) + 1;
        const status = configured
          ? "needs_configuration"
          : error.code === "PARTIAL_TRANSCRIPT" ||
              error.code === "EVIDENCE_REVIEW_FAILED"
            ? "needs_review"
            : error.retryable && attempts < 5
              ? "retry_wait"
              : "failed";
        events.push({
          stage: e.stage,
          ...problem(error),
          at: new Date().toISOString(),
        });
        await store.release(uid, id, e.lease, {
          status,
          lastError: problem(error),
          attempts: configured ? 0 : attempts,
          events: events.slice(-60),
          nextAttemptAt: error.retryable
            ? Date.now() + Math.min(300_000, 2 ** attempts * 5000)
            : 0,
        });
      }
      return store.get(uid, id);
    },
  };
}
