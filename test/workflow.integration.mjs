import { test, expect } from "vitest";
import { start, getRun } from "workflow/api";
import { waitForSleep } from "@workflow/vitest";
import { firestoreStore } from "../server/store.js";
import { ingestEpisode } from "../workflows/ingest.js";

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_PROJECT_ID?.startsWith("demo-")
)
  throw Error(
    "Workflow integration tests require an isolated demo Firestore emulator.",
  );

test("durable workflow wakes after a saved delay and preserves the review when embeddings are unavailable", async () => {
  const uid = "workflow-test-" + Date.now(),
    id = "apple-456",
    store = firestoreStore();
  await store.create(uid, id, {
    id,
    status: "retry_wait",
    stage: "index",
    attempts: 0,
    createdAt: new Date().toISOString(),
    nextAttemptAt: Date.now() + 300_000,
    reflection: { raw: "My half-listened recollection.", version: 1 },
    analysis: {
      claims: [
        {
          title: "Synthetic electricity fixture",
          text: "Synthetic fixture: electricity constraints are a risk, not a bearish conclusion.",
          topic: "AI infrastructure",
          subtopic: "Power",
          speaker: "Test guest",
          stance: "not_established",
          stanceReason: "Fixture only discusses risks.",
          horizon: null,
          kind: "opinion",
          citations: [],
        },
      ],
    },
  });
  const run = await start(ingestEpisode, [uid, id, "test:" + uid]);
  const sleepId = await waitForSleep(run);
  expect((await store.get(uid, id)).status).toBe("retry_wait");
  // Another request edits the journal while the durable worker is asleep.
  await store.saveReflection(
    uid,
    id,
    {
      raw: "Updated listener note during background processing.",
      organized: "",
      listenedPercent: 50,
      questions: [],
    },
    1,
  );
  await store.update(uid, id, { nextAttemptAt: 0 });
  await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
  expect(await run.returnValue).toEqual({ status: "ready" });
  const reopened = await firestoreStore().get(uid, id);
  expect(reopened.reflection.raw).toContain("Updated listener note");
  expect(reopened.searchIndex[0].stance).toBe("not_established");
  expect(reopened.indexingWarning).toBeNull();
  expect(await store.get(uid + "-other", id)).toBeNull();
});
