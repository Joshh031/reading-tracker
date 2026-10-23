import test from "node:test";
import assert from "node:assert/strict";
import { firestoreStore } from "../server/store.js";
import { pipeline } from "../server/pipeline.js";
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw Error(
    "Run only against the Firestore emulator. Production tests are prohibited.",
  );
process.env.FIREBASE_PROJECT_ID = "demo-knowledge-vault";
test("Firestore persists, deduplicates, isolates users, and detects conflicting reflection edits", async () => {
  const store = firestoreStore(),
    jobs = pipeline(store),
    url = "https://podcasts.apple.com/podcast/id123?i=456",
    uid = "test-" + Date.now();
  const a = await Promise.all([jobs.add(uid, url), jobs.add(uid, url)]);
  assert.equal(a.filter((x) => x.created).length, 1);
  assert.equal((await store.list(uid)).length, 1);
  assert.equal(await store.get(uid + "-other", "apple-456"), null);
  await store.saveReflection(
    uid,
    "apple-456",
    {
      raw: "Only half listened. My own reflection.",
      listenedPercent: 50,
      organized: "",
      questions: [],
    },
    0,
  );
  await assert.rejects(
    () => store.saveReflection(uid, "apple-456", { raw: "stale" }, 0),
    (e) => e.code === "REFLECTION_CONFLICT",
  );
  const reopened = firestoreStore();
  assert.equal(
    (await reopened.get(uid, "apple-456")).reflection.raw,
    "Only half listened. My own reflection.",
  );
  const transcript = {
    hash: "test-hash",
    segments: Array.from({ length: 1000 }, (_, i) => ({
      id: "s" + i,
      text: "A synthetic transcript segment. ".repeat(25),
      speaker: "Test speaker",
      start: i,
      end: i + 1,
    })),
  };
  const meta = await store.saveTranscript(uid, "apple-456", transcript);
  assert.ok(meta.chunks > 1);
  assert.deepEqual(
    (await reopened.transcript(uid, "apple-456", meta)).segments,
    transcript.segments,
  );
  const leases = await Promise.all([
    store.acquire(uid, "apple-456"),
    store.acquire(uid, "apple-456"),
  ]);
  assert.equal(leases.filter(Boolean).length, 1);
  await store.release(uid, "apple-456", leases.find(Boolean).lease, {
    status: "ready",
  });
  assert.equal((await store.get(uid, "apple-456")).status, "ready");
  assert.equal(
    (await store.syncDaily(uid, "apple-456", "2026-10-23")).status,
    "preview_disabled",
  );
});
test("Firestore client API rejects unauthenticated archive reads", async () => {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-knowledge-vault/databases/(default)/documents/knowledgeVaultPreviewUsers/test/episodes/apple-456`;
  const response = await fetch(url);
  assert.equal(response.status, 403);
});

test("ChatGPT review persists in Firestore and preserves a concurrent journal edit", async () => {
  const { service } = await import("../server/service.js");
  const store = firestoreStore(),
    uid = "chat-review-" + Date.now(),
    id = "apple-789";
  await pipeline(store).add(
    uid,
    "https://podcasts.apple.com/podcast/id123?i=789",
  );
  const quote = "Electricity availability can constrain new infrastructure.";
  const t = {
    hash: "synthetic-review-hash",
    completeness: "likely_complete",
    wordCount: 1000,
    source: {
      url: "https://example.com/fixture",
      quality: "Synthetic test fixture",
    },
    segments: [{ id: "s1", text: quote, start: 10, speaker: "Fixture guest" }],
  };
  const meta = await store.saveTranscript(uid, id, t);
  await store.update(uid, id, {
    transcript: meta,
    metadata: { title: "Synthetic episode", description: "" },
  });
  const point = {
    title: "Power",
    text: "This is a synthetic integration-test interpretation. ".repeat(5),
    citations: [{ segmentId: "s1", quote }],
  };
  const review = {
    executiveBottomLine: point,
    takeaways: Array(5).fill(point),
    guests: [],
    claims: Array(5).fill({
      ...point,
      speaker: null,
      topic: "Power",
      subtopic: "Infrastructure",
      stance: "not_established",
      stanceReason: "Risk alone",
      kind: "opinion",
      horizon: null,
    }),
    investmentImplications: [point],
    shareableInsights: Array(3).fill(point),
    openQuestions: [],
    topics: ["Power"],
    limitations: ["Synthetic test"],
  };
  const payload = { id, transcriptHash: t.hash, expectedVersion: 0, review };
  const original = store.transcript.bind(store);
  store.transcript = async (...args) => {
    const result = await original(...args);
    await store.saveReflection(
      uid,
      id,
      {
        raw: "Concurrent listening note",
        organized: "",
        questions: [],
        listenedPercent: 50,
      },
      0,
    );
    store.transcript = original;
    return result;
  };
  await service("save_review", payload, uid, store);
  const reopened = firestoreStore();
  assert.equal(
    (await reopened.get(uid, id)).reflection.raw,
    "Concurrent listening note",
  );
  assert.equal(
    (await service("save_review", payload, uid, reopened)).episode.analysis
      .version,
    1,
  );
  assert.equal((await reopened.get(uid, id)).searchIndex.length, 5);
  await assert.rejects(
    () => service("save_review", payload, uid + "-other", reopened),
    (e) => e.code === "NOT_FOUND",
  );
});
