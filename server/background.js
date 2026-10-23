import { pipeline, terminal } from "./pipeline.js";
// Best-effort bounded drain, backed by durable state and transactional leases.
// A delayed/failed job can always resume through work/process after the window.
export async function drainEpisode(
  store,
  uid,
  id,
  {
    milliseconds = 220_000,
    jobs = pipeline(store),
    now = Date.now,
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const deadline = now() + milliseconds;
  for (let steps = 0; steps < 12; steps++) {
    const e = await store.get(uid, id);
    if (!e || terminal.has(e.status)) return;
    if (e.leaseUntil > now()) return;
    const reserve =
      e.stage === "analyze"
        ? 135_000
        : e.stage === "discover"
          ? 165_000
          : 45_000;
    const delay = Math.max(0, (e.nextAttemptAt || 0) - now());
    if (delay + reserve > deadline - now()) return;
    if (delay) await pause(delay);
    await jobs.process(uid, id);
  }
}
export function continueInBackground(waitUntil, store, uid, id) {
  waitUntil(
    drainEpisode(store, uid, id).catch((error) =>
      console.error(
        JSON.stringify({
          event: "vault_background_error",
          episodeId: id,
          code: error.code || "UNEXPECTED_ERROR",
        }),
      ),
    ),
  );
}
