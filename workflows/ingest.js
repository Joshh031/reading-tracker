import { createHook, sleep } from "workflow";
import { advanceEpisode, suspendEpisode } from "../server/worker.js";

export async function ingestEpisode(uid, id, lockToken) {
  "use workflow";
  const lock = createHook({ token: lockToken });
  try {
    const conflict = await lock.getConflict();
    if (conflict) return { status: "duplicate", runId: conflict.runId };
    console.log("vault_workflow_started", id);
    // Bounded to roughly one hour of transcription polling, with no live HTTP request.
    for (let iteration = 0; iteration < 120; iteration++) {
      const state = await advanceEpisode(uid, id);
      if (state.done) return { status: state.status };
      if (state.delayMs) await sleep(state.delayMs);
    }
    return await suspendEpisode(uid, id);
  } finally {
    lock.dispose();
  }
}
