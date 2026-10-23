// Non-destructive, repeatable copy of a private export into the isolated trial.
// Dry-run by default. Never targets the existing project or overwrites records.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isDeepStrictEqual } from "node:util";

const [file, uid, mode] = process.argv.slice(2);
if (!file || !/^[A-Za-z0-9_-]+$/.test(uid || ""))
  throw Error(
    "Usage: node scripts/trial-copy.mjs export.json ownerUid [--apply]",
  );
if (mode && mode !== "--apply") throw Error("Unknown mode");
const archive = JSON.parse(await readFile(file, "utf8"));
if (archive.schemaVersion !== 1 || !Array.isArray(archive.episodes))
  throw Error("Unsupported export");
const hash = (v) => createHash("sha256").update(v).digest("hex");
const records = [];
const ids = new Set();
for (const episode of archive.episodes) {
  if (!/^apple-\d+$/.test(episode.id) || ids.has(episode.id))
    throw Error("Invalid or duplicate identity");
  ids.add(episode.id);
  const { fullTranscript, ...record } = episode;
  const path = `knowledgeVaultPreviewUsers/${uid}/episodes/${episode.id}`;
  if (fullTranscript) {
    if (
      hash(fullTranscript.segments.map((s) => s.text).join("\n")) !==
      fullTranscript.hash
    )
      throw Error("Transcript checksum mismatch");
    if (String(fullTranscript.episodeId) !== episode.id.slice(6))
      throw Error("Transcript episode mismatch");
    const { segments, ...meta } = fullTranscript;
    const buckets = [];
    let bucket = [],
      size = 0;
    for (const segment of segments) {
      const n = Buffer.byteLength(JSON.stringify(segment));
      if (n > 300000) throw Error("Oversized transcript segment");
      if (size + n > 300000) {
        buckets.push(bucket);
        bucket = [];
        size = 0;
      }
      bucket.push(segment);
      size += n;
    }
    if (bucket.length) buckets.push(bucket);
    record.transcript = { ...meta, chunks: buckets.length };
    buckets.forEach((segments, i) =>
      records.push({
        path: `${path}/transcripts/${meta.hash}-${i}`,
        data: { segments },
      }),
    );
  }
  // Retain the exported episode exactly, including journal and processing history.
  // Retry/resume is a separate, authenticated application action after verification.
  records.push({ path, data: record });
}
if (archive.legacy)
  records.push({ path: "readingTracker/joshh031", data: archive.legacy });
if (records.length > 450) throw Error("Copy exceeds bounded transaction size");
const manifest = {
  episodes: ids.size,
  documents: records.length,
  sourceHash: hash(JSON.stringify(archive)),
};
if (!mode) {
  console.log(JSON.stringify({ mode: "dry-run", ...manifest }));
  process.exit(0);
}
const credentials = JSON.parse(
  await readFile(process.env.KV_TRIAL_KEY_FILE, "utf8"),
);
if (credentials.project_id !== "knowledge-vault-trial")
  throw Error("Only the isolated trial project is permitted");
const app = initializeApp({ credential: cert(credentials) });
const db = getFirestore(app, "(default)");
await db.runTransaction(async (tx) => {
  const refs = records.map((r) => db.doc(r.path));
  const snapshots = await tx.getAll(...refs);
  // Check every destination before writing any. Refuse conflicts, never overwrite.
  snapshots.forEach((s, i) => {
    if (s.exists && !isDeepStrictEqual(s.data(), records[i].data))
      throw Error(`Destination conflict: ${records[i].path}`);
  });
  snapshots.forEach((s, i) => {
    if (!s.exists) tx.create(refs[i], records[i].data);
  });
});
for (const record of records) {
  const saved = await db.doc(record.path).get();
  if (!saved.exists || !isDeepStrictEqual(saved.data(), record.data))
    throw Error("Readback mismatch");
}
const episodes = await db
  .collection(`knowledgeVaultPreviewUsers/${uid}/episodes`)
  .get();
if (episodes.size !== ids.size)
  throw Error("Destination episode count differs");
console.log(JSON.stringify({ mode: "copied-and-verified", ...manifest }));
await db.terminate();
await deleteApp(app);
