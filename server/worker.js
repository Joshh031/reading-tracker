import { firestoreStore } from "./store.js";
import { pipeline } from "./pipeline.js";
import { terminal } from "./states.js";

export function workerState(episode, now = Date.now()) {
  if (!episode || terminal.has(episode.status))
    return { done: true, status: episode?.status || "missing", delayMs: 0 };
  return {
    done: false,
    status: episode.status,
    delayMs: Math.max(
      0,
      (episode.nextAttemptAt || 0) - now,
      (episode.leaseUntil || 0) - now,
    ),
  };
}

export async function advanceEpisode(uid, id) {
  "use step";
  console.log("vault_worker_advance", id);
  const store = firestoreStore();
  const before = workerState(await store.get(uid, id));
  if (before.done || before.delayMs) return before;
  const episode = await pipeline(store).process(uid, id);
  return workerState(episode);
}

export async function suspendEpisode(uid, id) {
  "use step";
  console.warn("vault_worker_limit", id);
  const store = firestoreStore(),
    episode = await store.get(uid, id);
  if (episode && !terminal.has(episode.status)) {
    await store.update(uid, id, {
      status: "needs_review",
      lastError: {
        code: "WORKFLOW_POLL_LIMIT",
        message:
          "Processing reached its polling limit. Retry resumes the existing job without submitting audio again.",
        retryable: true,
      },
    });
  }
  return { status: "needs_review" };
}
