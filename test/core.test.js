import test from "node:test";
import assert from "node:assert/strict";
import {
  appleIdentity,
  parseFeed,
  matchFeedEpisode,
  resolveEpisode,
} from "../server/identity.js";
import { publicAddress, publicUrl } from "../server/net.js";
import {
  embeddedTranscriptSources,
  parseTranscript,
  transcriptRecord,
  discoverTranscript,
} from "../server/transcript.js";
import { validateReview } from "../server/analysis.js";
import { pipeline } from "../server/pipeline.js";
import { rank, legacySearchEpisodes, researchBrief } from "../server/search.js";
import { rootCollection } from "../server/store.js";
import { authenticate } from "../server/auth.js";
import { service } from "../server/service.js";
import { VaultError } from "../server/errors.js";

const apple = "https://podcasts.apple.com/us/podcast/test/id123?i=456";
const episode = {
  episodeId: "456",
  showId: "123",
  title: "An exact episode",
  show: "Test show",
  publishedAt: "2026-10-23T10:00:00Z",
  durationSeconds: 120,
  transcriptSources: [],
  audioUrl: "https://audio.example.com/456.mp3",
  identityBasis: "test fixture",
};
const transcript = transcriptRecord(
  parseTranscript(
    "Speaker A: " +
      "Power constraints can delay infrastructure investment. ".repeat(60),
  ),
  episode,
  { url: "https://publisher.example.com/transcript", kind: "test" },
);
function reviewFixture() {
  const p = {
    title: "Power constraints",
    text:
      "Power constraints can delay infrastructure investment. " +
      "This is a synthetic fixture used solely to exercise source citation validation. ".repeat(
        3,
      ),
    citations: [
      {
        segmentId: "s1",
        quote: "Power constraints can delay infrastructure investment.",
      },
    ],
  };
  return {
    executiveBottomLine: p,
    takeaways: Array.from({ length: 5 }, () => structuredClone(p)),
    guests: [],
    claims: Array.from({ length: 5 }, () => ({
      ...structuredClone(p),
      speaker: null,
      topic: "AI infrastructure",
      subtopic: "Electricity",
      stance: "not_established",
      stanceReason: "Risk discussion alone does not establish direction.",
      kind: "opinion",
      horizon: null,
    })),
    investmentImplications: [p],
    shareableInsights: [p, p, p],
    openQuestions: [],
    topics: ["AI infrastructure"],
    limitations: ["Synthetic test data"],
  };
}
export function memoryStore() {
  const data = new Map(),
    texts = new Map(),
    budgets = {};
  return {
    data,
    async get(uid, id) {
      return structuredClone(data.get(uid + "/" + id) || null);
    },
    async create(uid, id, e) {
      const k = uid + "/" + id;
      if (data.has(k))
        return { created: false, episode: await this.get(uid, id) };
      data.set(k, structuredClone(e));
      return { created: true, episode: e };
    },
    async update(uid, id, p) {
      const k = uid + "/" + id;
      data.set(k, { ...data.get(k), ...p });
      return this.get(uid, id);
    },
    async list(uid) {
      return [...data]
        .filter(([k]) => k.startsWith(uid + "/"))
        .map(([, v]) => structuredClone(v));
    },
    async acquire(uid, id) {
      const e = data.get(uid + "/" + id);
      if (e.lease) return null;
      e.lease = "lease";
      return structuredClone(e);
    },
    async release(uid, id, lease, p) {
      assert.equal(data.get(uid + "/" + id).lease, lease);
      return this.update(uid, id, { ...p, lease: null });
    },
    async saveTranscript(uid, id, t) {
      texts.set(uid + "/" + id, t);
      const { segments, ...meta } = t;
      return meta;
    },
    async transcript(uid, id) {
      return texts.get(uid + "/" + id);
    },
    async budget(uid, kind, limit) {
      const k = uid + "/" + kind;
      if ((budgets[k] || 0) >= limit)
        throw new VaultError("DAILY_LIMIT", "Daily limit", 429);
      budgets[k] = (budgets[k] || 0) + 1;
    },
    async saveReflection(uid, id, r, v) {
      const e = data.get(uid + "/" + id);
      if (e.reflection.version !== v)
        throw new VaultError("REFLECTION_CONFLICT", "Conflict", 409);
      e.reflection = { ...r, version: v + 1 };
      return e.reflection;
    },
    async legacy() {
      return null;
    },
  };
}
test("canonical identity ignores country, slug and campaign parameters", () => {
  assert.equal(
    appleIdentity(apple).id,
    appleIdentity(
      "https://podcasts.apple.com/gb/podcast/different/id123?utm_source=test&i=456",
    ).id,
  );
  assert.throws(() =>
    appleIdentity("https://evilpodcasts.apple.com/podcast/id123?i=456"),
  );
  assert.throws(() =>
    appleIdentity("https://podcasts.apple.com/podcast/id123"),
  );
});
test("SSRF rejects private networks, credentials, ports and IPv6 forms", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.3",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  for (const url of [
    "http://example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://user:pass@example.com",
    "https://example.com:8080",
    "https://x.internal",
  ])
    assert.throws(() => publicUrl(url));
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("RSS preserves transcript tags and rejects XML entities", () => {
  const f = parseFeed(
    '<rss><channel><title>Show</title><item><title>Title &amp; episode</title><pubDate>Fri, 23 Oct 2026 10:00:00 GMT</pubDate><enclosure url="https://cdn.example.com/a.mp3" length="100"/><podcast:transcript url="https://cdn.example.com/t.vtt" type="text/vtt"/></item></channel></rss>',
  );
  assert.equal(f.items[0].transcripts[0].type, "text/vtt");
  assert.equal(f.items[0].title, "Title & episode");
  assert.throws(() => parseFeed("<!DOCTYPE rss><rss/>"));
});
test("RSS refuses a same-title episode from a different date or an ambiguous match", () => {
  const good = { title: episode.title, publishedAt: episode.publishedAt };
  assert.deepEqual(
    matchFeedEpisode(episode, [
      { title: episode.title, publishedAt: "2025-10-23" },
      good,
    ]),
    good,
  );
  assert.throws(() =>
    matchFeedEpisode(episode, [
      { title: episode.title, publishedAt: "2025-10-23" },
    ]),
  );
  assert.throws(() => matchFeedEpisode(episode, [good, good]));
});
test("collection lookup resolves exact ID even when direct lookup is empty", async () => {
  let direct = false;
  const e = await resolveEpisode(apple, {
    readJson: async (url) => {
      if (url.includes("id=456")) {
        direct = true;
        return { results: [] };
      }
      return {
        results: [
          {
            kind: "podcast",
            collectionId: 123,
            collectionName: "Show",
            feedUrl: "https://example.com/rss",
          },
          {
            kind: "podcast-episode",
            trackId: 456,
            collectionId: 123,
            trackName: episode.title,
            releaseDate: episode.publishedAt,
          },
        ],
      };
    },
    readSource: async () => ({
      text: `<rss><channel><item><title>${episode.title}</title><pubDate>${episode.publishedAt}</pubDate></item></channel></rss>`,
    }),
  });
  assert.equal(e.episodeId, "456");
  assert.equal(direct, false);
});
test("neighboring Apple episode never substitutes for requested ID", async () => {
  await assert.rejects(
    () =>
      resolveEpisode(apple, {
        readJson: async () => ({
          results: [
            { kind: "podcast", collectionId: 123 },
            { kind: "podcast-episode", trackId: 999, collectionId: 123 },
          ],
        }),
        readSource: async () => {
          throw Error("must not fetch RSS");
        },
      }),
    (e) => e.code === "APPLE_IDENTITY_UNRESOLVED",
  );
});
test("VTT preserves timestamps and speakers", () => {
  const t = parseTranscript(
    "WEBVTT\n\n00:01:02.500 --> 00:01:05.000\n<v Jane Doe>Power is constrained.\n\n00:01:06.000 --> 00:01:10.000\n<v John>It depends on the region.",
    "text/vtt",
  );
  assert.equal(t[0].start, 62.5);
  assert.equal(t[0].speaker, "Jane Doe");
  assert.equal(t[1].end, 70);
});
test("SRT and JSON preserve timing without inventing identities", () => {
  assert.equal(
    parseTranscript("1\n00:00:01,000 --> 00:00:03,000\nHello world.")[0].start,
    1,
  );
  const t = parseTranscript(
    JSON.stringify({ segments: [{ body: "Hello", startTime: 3, endTime: 5 }] }),
    "json",
  );
  assert.equal(t[0].speaker, null);
  assert.equal(t[0].end, 5);
});
test("partial source is labeled partial, not a full review", () => {
  const t = transcriptRecord(
    parseTranscript("Words from an excerpt. ".repeat(60)),
    { ...episode, durationSeconds: 7200 },
    { url: "https://example.com" },
  );
  assert.equal(t.completeness, "partial");
});
test("publisher episode title mismatch cannot produce a transcript", async () => {
  const r = await discoverTranscript(
    { ...episode, publisherUrl: "https://example.com/old" },
    {
      readSource: async () => ({
        text:
          '<h1>Unrelated conversation</h1><div id="transcript">' +
          "An unrelated sentence. ".repeat(100) +
          "</div>",
        url: "https://example.com/old",
      }),
    },
  );
  assert.equal(r.transcript, null);
  assert.equal(r.attempts[0].code, "PUBLISHER_IDENTITY_MISMATCH");
});
test("citation validation rejects fabricated text and nonexistent segments", () => {
  assert.ok(validateReview(reviewFixture(), transcript));
  let r = reviewFixture();
  r.takeaways[0].citations[0].quote = "This statement does not exist anywhere.";
  assert.throws(
    () => validateReview(r, transcript),
    (e) => e.code === "INVALID_CITATION",
  );
  r = reviewFixture();
  r.takeaways[0].citations[0].segmentId = "s999";
  assert.throws(() => validateReview(r, transcript));
});
test("duplicate concurrent imports converge to one episode and do not overwrite reflection", async () => {
  const s = memoryStore(),
    p = pipeline(s);
  const r = await Promise.all([p.add("u", apple), p.add("u", apple)]);
  assert.equal(r.filter((x) => x.created).length, 1);
  await s.update("u", "apple-456", {
    reflection: { raw: "My own thought", version: 1 },
  });
  await p.add("u", apple);
  assert.equal(
    (await s.get("u", "apple-456")).reflection.raw,
    "My own thought",
  );
});
test("real service lifecycle resolves, retrieves, analyzes, indexes, and retains reflection", async () => {
  const s = memoryStore(),
    review = reviewFixture();
  const p = pipeline(s, {
    resolveEpisode: async () => episode,
    discoverTranscript: async () => ({ transcript, attempts: [] }),
    analyzeEpisode: async () => review,
    indexReview: async () => [
      {
        text: "Power constraints",
        stance: "not_established",
        embedding: [1, 0],
      },
    ],
  });
  await p.add("u", apple);
  await s.saveReflection(
    "u",
    "apple-456",
    { raw: "Half listened", listenedPercent: 50 },
    0,
  );
  for (let i = 0; i < 4; i++) await p.process("u", "apple-456");
  const e = await s.get("u", "apple-456");
  assert.equal(e.status, "ready");
  assert.equal(e.reflection.raw, "Half listened");
  assert.equal(e.analysis.takeaways.length, 5);
  assert.equal((await s.list("other")).length, 0);
  assert.equal(
    (await service("export", {}, "u", s)).episodes[0].fullTranscript.wordCount,
    transcript.wordCount,
  );
});
test("worker lease prevents concurrent paid analysis", async () => {
  let count = 0;
  const s = memoryStore(),
    p = pipeline(s, {
      analyzeEpisode: async () => {
        count++;
        await new Promise((r) => setTimeout(r, 20));
        return reviewFixture();
      },
    });
  await p.add("u", apple);
  await s.update("u", "apple-456", {
    metadata: episode,
    stage: "analyze",
    transcript,
  });
  await s.saveTranscript("u", "apple-456", transcript);
  await Promise.all([p.process("u", "apple-456"), p.process("u", "apple-456")]);
  assert.equal(count, 1);
});
test("missing transcription credentials is explicit and recoverable", async () => {
  const s = memoryStore(),
    p = pipeline(s, {
      submitTranscription: async () => {
        throw new VaultError(
          "TRANSCRIPTION_NOT_CONFIGURED",
          "Configure provider",
          503,
        );
      },
    });
  await p.add("u", apple);
  await s.update("u", "apple-456", { metadata: episode, stage: "transcribe" });
  const e = await p.process("u", "apple-456");
  assert.equal(e.status, "needs_configuration");
  assert.equal(e.submissionPending, false);
  assert.equal(e.attempts, 0);
});
test("uncertain paid job submission is not automatically submitted twice", async () => {
  let count = 0;
  const s = memoryStore(),
    p = pipeline(s, {
      submitTranscription: async () => {
        count++;
        throw Error("network timeout after remote submission");
      },
    });
  await p.add("u", apple);
  await s.update("u", "apple-456", { metadata: episode, stage: "transcribe" });
  await p.process("u", "apple-456");
  await p.process("u", "apple-456", { retry: true });
  assert.equal(count, 1);
  assert.equal(
    (await s.get("u", "apple-456")).lastError.code,
    "TRANSCRIPTION_SUBMISSION_UNCERTAIN",
  );
});
test("reflection edits detect conflicting versions and never change analysis", async () => {
  const s = memoryStore(),
    p = pipeline(s);
  await p.add("u", apple);
  await s.update("u", "apple-456", { analysis: { sentinel: true } });
  await service(
    "reflect",
    {
      id: "apple-456",
      raw: "I disagree",
      listenedPercent: 25,
      expectedVersion: 0,
    },
    "u",
    s,
  );
  await assert.rejects(
    () =>
      service(
        "reflect",
        {
          id: "apple-456",
          raw: "stale",
          listenedPercent: 50,
          expectedVersion: 0,
        },
        "u",
        s,
      ),
    (e) => e.code === "REFLECTION_CONFLICT",
  );
  assert.deepEqual((await s.get("u", "apple-456")).analysis, {
    sentinel: true,
  });
});
test("search retains topic-specific stance and provenance", () => {
  const e = {
    id: "apple-456",
    url: apple,
    metadata: episode,
    searchIndex: [
      {
        id: "c1",
        text: "Power constraints create risks to AI infrastructure.",
        speaker: "A guest",
        topic: "AI infrastructure",
        stance: "not_established",
        embedding: [1, 0],
        citations: [{ segmentId: "s1" }],
      },
    ],
  };
  const r = rank("AI infrastructure", [e], [1, 0]);
  assert.equal(r[0].stance, "not_established");
  assert.equal(r[0].episodeId, "apple-456");
  assert.equal(r[0].citations[0].segmentId, "s1");
});
test("preview storage cannot target production", () => {
  const old = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  assert.equal(rootCollection(), "knowledgeVaultPreviewUsers");
  process.env.VERCEL_ENV = "production";
  assert.throws(
    () => rootCollection(),
    (e) => e.code === "PRODUCTION_DISABLED",
  );
  if (old) process.env.VERCEL_ENV = old;
  else delete process.env.VERCEL_ENV;
});
test("private archive requires credentials", async () => {
  await assert.rejects(
    () => authenticate({ headers: {} }),
    (e) => e.status === 401,
  );
});

test("a short late excerpt is not mistaken for a complete timed transcript", () => {
  const segments = Array.from({ length: 10 }, (_, i) => ({
    id: "s" + i,
    start: 3500 + i * 2,
    end: 3502 + i * 2,
    text: "Example words from a short excerpt. ".repeat(5),
  }));
  assert.equal(
    transcriptRecord(
      segments,
      { ...episode, durationSeconds: 3600 },
      { url: "https://example.com" },
    ).completeness,
    "partial",
  );
});
test("publisher transcript from a conflicting date is rejected", async () => {
  const html = `<h1>${episode.title}</h1><meta property="article:published_time" content="2025-01-01"><div id="transcript">${"Source words from an old episode. ".repeat(100)}</div>`;
  const result = await discoverTranscript(
    { ...episode, publisherUrl: "https://example.com/old" },
    {
      readSource: async () => ({ text: html, url: "https://example.com/old" }),
    },
  );
  assert.equal(result.transcript, null);
});
test("publisher Deepgram paragraphs retain exact timing and speaker IDs", () => {
  const raw = {
    results: {
      channels: [
        {
          alternatives: [
            {
              paragraphs: {
                paragraphs: [
                  {
                    speaker: 2,
                    start: 5,
                    end: 15,
                    sentences: [{ text: "The exact source words." }],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  };
  const parsed = parseTranscript(JSON.stringify(raw), "json");
  assert.equal(parsed[0].text, "The exact source words.");
  assert.equal(parsed[0].speaker, "Speaker 2");
  assert.equal(parsed[0].start, 5);
  assert.equal(parsed[0].end, 15);
});

test("Nuxt publisher payload resolves compact Apple identities without cross-show substitution", () => {
  const data = [
    {
      title: 1,
      appleEpisodeID: 2,
      publishedAt: 3,
      transcriptURL: 4,
      speakers: 5,
    },
    episode.title,
    "123?i=456",
    episode.publishedAt,
    "https://publisher.example.com/transcript.json",
    [6],
    { name: 7, order: 8, host: 9 },
    "Test Guest",
    0,
    false,
  ];
  const html =
    '<script type="application/json" id="__NUXT_DATA__">' +
    JSON.stringify(data) +
    "</script>";
  const sources = embeddedTranscriptSources(html, episode);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].speakers[0].name, "Test Guest");
  assert.equal(sources[0].speakers[0].role, "guest");
  assert.equal(
    embeddedTranscriptSources(html, { ...episode, showId: "999" }).length,
    0,
  );
});

test("a missing source keeps its diagnostic after the lease is released", async () => {
  const s = memoryStore(),
    p = pipeline(s, {
      discoverTranscript: async () => ({ transcript: null, attempts: [] }),
      thirdPartyTranscript: async () => null,
      youtubeTranscript: async () => null,
    });
  await p.add("u", apple);
  await s.update("u", "apple-456", {
    stage: "discover",
    metadata: { ...episode, audioUrl: null },
  });
  const e = await p.process("u", "apple-456");
  assert.equal(e.status, "needs_source");
  assert.equal(e.lastError.code, "NO_TRANSCRIPT_OR_AUDIO");
});
test("definitive provider rejection permits retry while uncertain submission stays protected", async () => {
  const s = memoryStore();
  let calls = 0;
  const p = pipeline(s, {
    submitTranscription: async () => {
      if (++calls === 1)
        throw new VaultError("PROVIDER_401", "Invalid provider key", 502);
      return { id: "accepted-job" };
    },
  });
  await p.add("u", apple);
  await s.update("u", "apple-456", { stage: "transcribe", metadata: episode });
  assert.equal((await p.process("u", "apple-456")).submissionPending, false);
  const e = await p.process("u", "apple-456", { retry: true });
  assert.equal(e.transcriptionJobId, "accepted-job");
  assert.equal(calls, 2);
});
test("explicit retry recovers exhausted attempts without allowing unlimited automatic retries", async () => {
  const s = memoryStore(),
    p = pipeline(s, { resolveEpisode: async () => episode });
  await p.add("u", apple);
  await s.update("u", "apple-456", { attempts: 5, status: "failed" });
  assert.equal((await p.process("u", "apple-456")).status, "failed");
  const e = await p.process("u", "apple-456", { retry: true });
  assert.equal(e.status, "discovering");
  assert.equal(e.attempts, 0);
});
test("embedding failure preserves the verified review and searchable stance, and can be retried", async () => {
  const s = memoryStore();
  let unavailable = true;
  const p = pipeline(s, {
    indexReview: async () => {
      if (unavailable)
        throw new VaultError("PROVIDER_503", "Unavailable", 502, true);
      return [{ text: "indexed", embedding: [1, 0] }];
    },
  });
  await p.add("u", apple);
  await s.update("u", "apple-456", {
    stage: "index",
    analysis: reviewFixture(),
    metadata: episode,
  });
  const e = await p.process("u", "apple-456");
  assert.equal(e.status, "ready");
  assert.equal(e.analysis.takeaways.length, 5);
  assert.equal(rank("infrastructure", [e])[0].stance, "not_established");
  assert.equal(e.indexingWarning.code, "PROVIDER_503");
  unavailable = false;
  assert.equal(
    (await p.process("u", "apple-456", { retry: true })).indexingWarning,
    null,
  );
});
test("original tracker notes are searchable without being promoted to guest evidence", () => {
  const episodes = legacySearchEpisodes({
    entries: {
      "2026-10-23": {
        podcastEntries: [
          {
            podcast: "Original show",
            episodeTitle: "Saved episode",
            personalNotes: "I remember electricity constraints",
            takeaway: "AI infrastructure might benefit",
          },
        ],
      },
    },
  });
  const notes = rank("electricity", episodes);
  assert.match(notes[0].basis, /personal reflection/);
  const reviews = rank("infrastructure", episodes);
  assert.match(reviews[0].basis, /verification unavailable/);
  assert.equal(reviews[0].stance, "not_established");
});
test("research refuses uncited paragraphs and unsupported synthesis despite valid source IDs", async () => {
  const result = {
    query: "Who is bullish?",
    results: [
      {
        text: "Guest discusses risks without a directional stance.",
        stance: "not_established",
      },
    ],
  };
  await assert.rejects(
    () =>
      researchBrief(result, async () => ({
        data: {
          answer: "A paragraph [r1].\n\nAn unsupported assertion.",
          citations: [{ reference: "r1" }],
        },
      })),
    (e) => e.code === "INVALID_BRIEF_CITATION",
  );
  let calls = 0;
  await assert.rejects(
    () =>
      researchBrief(result, async () => ({
        data:
          ++calls === 1
            ? {
                answer: "The guest is bearish. [r1]",
                citations: [{ reference: "r1" }],
              }
            : {
                supported: false,
                issues: ["Risk was misclassified as bearishness."],
              },
      })),
    (e) => e.code === "BRIEF_EVIDENCE_REVIEW_FAILED",
  );
});
