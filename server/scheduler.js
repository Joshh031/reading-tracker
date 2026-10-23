import { createHash } from "node:crypto";
import { start, getRun } from "workflow/api";
import { ingestEpisode } from "../workflows/ingest.js";
import { terminal } from "./pipeline.js";
import { rootCollection } from "./store.js";

export async function scheduleEpisode(store, uid, id) {
  const episode = await store.get(uid, id);
  if (!episode || terminal.has(episode.status)) return null;
  if (episode.workflowRunId) {
    try {
      const status = await getRun(episode.workflowRunId).status;
      if (status === "pending" || status === "running")
        return episode.workflowRunId;
    } catch {
      /* A previous run may have expired; persisted episode state is authoritative. */
    }
  }
  const lock = createHash("sha256")
    .update(`${rootCollection()}/${uid}/${id}`)
    .digest("hex");
  const run = await start(ingestEpisode, [uid, id, `vault:${lock}`]);
  await store.update(uid, id, {
    workflowRunId: run.runId,
    schedulingError: null,
  });
  return run.runId;
}
