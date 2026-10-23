import { getVercelOidcToken } from "@vercel/oidc";
import { readJson, readSource, publicUrl } from "./net.js";
import { VaultError } from "./errors.js";
import { normalize } from "./identity.js";
import { parseTranscript, transcriptRecord } from "./transcript.js";
export async function gatewayCredential() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    return await getVercelOidcToken();
  } catch {
    return null;
  }
}
const providerError = (r) =>
  new VaultError(
    "PROVIDER_" + r.status,
    "Processing provider returned HTTP " + r.status,
    502,
    r.status === 429 || r.status >= 500,
  );

// Only explicitly authorized third-party adapters are used. No scraped subscriber API.
export async function thirdPartyTranscript(episode) {
  if (!process.env.KV_TRANSCRIPT_ADAPTER_URL) return null;
  const base = publicUrl(process.env.KV_TRANSCRIPT_ADAPTER_URL);
  const result = await readJson(base.href, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + process.env.KV_TRANSCRIPT_ADAPTER_KEY,
    },
    body: JSON.stringify({
      episodeId: episode.episodeId,
      showId: episode.showId,
      title: episode.title,
      publishedAt: episode.publishedAt,
    }),
    maxBytes: 3_000_000,
  });
  if (!result.transcript) return null;
  const exact =
    result.episodeId === episode.episodeId && result.showId === episode.showId;
  const match =
    normalize(result.title) === normalize(episode.title) &&
    normalize(result.show) === normalize(episode.show) &&
    Math.abs(
      Date.parse(result.publishedAt) - Date.parse(episode.publishedAt),
    ) <=
      36 * 3600_000;
  if (!exact && !match)
    throw new VaultError(
      "TRANSCRIPT_IDENTITY_MISMATCH",
      "Third-party transcript did not match the exact episode.",
    );
  return transcriptRecord(
    parseTranscript(
      typeof result.transcript === "string"
        ? result.transcript
        : JSON.stringify(result.transcript),
      result.type,
    ),
    episode,
    {
      url: publicUrl(result.sourceUrl).href,
      kind: "authorized_third_party",
      quality: "authorized third-party transcript",
      identityBasis: exact
        ? "Exact provider episode/show IDs"
        : "Exact title/show and publication date",
    },
  );
}
// YouTube caption downloads require authorized OAuth access to that video's captions.
export async function youtubeTranscript(episode) {
  if (!process.env.YOUTUBE_CAPTIONS_ACCESS_TOKEN) return null;
  const urls = [
    episode.publisherUrl,
    ...(episode.descriptionHtml || "").matchAll(
      /https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/g,
    ),
  ]
    .map((x) => (Array.isArray(x) ? x[0] : x))
    .filter(Boolean);
  const link = urls.find((x) => /youtu\.be|youtube\.com/.test(x));
  if (!link) return null;
  const u = new URL(link),
    videoId =
      u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
  if (!/^[\w-]{11}$/.test(videoId || "")) return null;
  const headers = {
    authorization: "Bearer " + process.env.YOUTUBE_CAPTIONS_ACCESS_TOKEN,
  };
  const video = await readJson(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
    { headers },
  );
  const snippet = video.items?.[0]?.snippet;
  if (
    !snippet ||
    (normalize(snippet.title) !== normalize(episode.title) &&
      !snippet.description?.includes("i=" + episode.episodeId))
  )
    throw new VaultError(
      "YOUTUBE_IDENTITY_MISMATCH",
      "Video could not be tied to the exact episode.",
    );
  const captions = await readJson(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`,
    { headers },
  );
  const track =
    captions.items?.find((x) => x.snippet?.language === "en") ||
    captions.items?.[0];
  if (!track) return null;
  const r = await readSource(
    `https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(track.id)}?tfmt=vtt`,
    { headers, maxBytes: 3_000_000 },
  );
  return transcriptRecord(parseTranscript(r.text, "text/vtt"), episode, {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    kind: "youtube_authorized_captions",
    quality: "authorized YouTube captions",
    identityBasis: "Linked video with exact title or Apple episode ID",
  });
}
async function assembly(path, body) {
  const r = await fetch("https://api.assemblyai.com/v2/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw providerError(r);
  return r.json();
}
export async function submitTranscription(episode) {
  if (
    !process.env.ASSEMBLYAI_API_KEY ||
    process.env.KV_TRANSCRIPTION_ENABLED !== "true"
  )
    throw new VaultError(
      "TRANSCRIPTION_NOT_CONFIGURED",
      "Audio is available. Enable the bounded transcription provider to continue.",
      503,
    );
  const maxSeconds = Number(process.env.KV_MAX_AUDIO_SECONDS || 7200),
    maxBytes = Number(process.env.KV_MAX_AUDIO_BYTES || 250_000_000);
  if (!episode.durationSeconds || episode.durationSeconds > maxSeconds)
    throw new VaultError(
      "AUDIO_DURATION_LIMIT",
      "Audio duration is unknown or exceeds the configured maximum.",
    );
  if (episode.audioBytes > maxBytes)
    throw new VaultError(
      "AUDIO_SIZE_LIMIT",
      "Episode audio exceeds the configured size limit.",
    );
  await readSource(episode.audioUrl, {
    method: "HEAD",
    maxBytes,
    timeout: 15_000,
  });
  // audio_end_at is a hard provider-side cap even if publisher metadata is wrong.
  return assembly("transcript", {
    audio_url: publicUrl(episode.audioUrl).href,
    speech_models: ["universal-2"],
    speaker_labels: true,
    audio_end_at: maxSeconds * 1000,
  });
}
export async function pollTranscription(episode, jobId) {
  const result = await assembly("transcript/" + encodeURIComponent(jobId));
  if (result.status === "error")
    throw new VaultError(
      "TRANSCRIPTION_FAILED",
      "Speech-to-text provider could not process this audio.",
      502,
      false,
    );
  if (result.status !== "completed") return null;
  const segments = (result.utterances || []).map((x, i) => ({
    id: "s" + (i + 1),
    text: x.text,
    start: x.start / 1000,
    end: x.end / 1000,
    speaker: x.speaker ? `Speaker ${x.speaker}` : null,
  }));
  return transcriptRecord(
    segments.length ? segments : parseTranscript(result.text),
    episode,
    {
      url: episode.audioUrl,
      kind: "audio_transcription",
      quality: "machine transcript; speaker identities unverified",
      identityBasis: episode.identityBasis,
      provider: "AssemblyAI",
      jobId,
      model: result.speech_model_used || "universal-2",
    },
  );
}

export async function jsonModel(system, input, { maxTokens = 12000 } = {}) {
  const key = await gatewayCredential();
  if (!key)
    throw new VaultError(
      "ANALYSIS_NOT_CONFIGURED",
      "AI Gateway credentials are required for transcript analysis.",
      503,
    );
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.KV_ANALYSIS_MODEL || "openai/gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw providerError(r);
  const result = await r.json();
  if (result.choices?.[0]?.finish_reason === "length")
    throw new VaultError(
      "ANALYSIS_TRUNCATED",
      "Analysis exceeded its output limit.",
      502,
      true,
    );
  return {
    data: JSON.parse(result.choices[0].message.content),
    usage: result.usage,
    model: result.model,
  };
}
export async function embeddings(texts) {
  const key = await gatewayCredential();
  if (!key)
    throw new VaultError(
      "SEMANTIC_NOT_CONFIGURED",
      "Semantic search requires AI Gateway.",
      503,
    );
  const r = await fetch("https://ai-gateway.vercel.sh/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: texts,
      dimensions: 256,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw providerError(r);
  const d = await r.json();
  return d.data.sort((a, b) => a.index - b.index).map((x) => x.embedding);
}
