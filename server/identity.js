import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import { readSource, readJson } from "./net.js";
import { VaultError } from "./errors.js";
export const clean = (value) =>
  cheerio
    .load(String(value || ""), null, false)
    .text()
    .replace(/\s+/g, " ")
    .trim();
export const normalize = (value) =>
  clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const array = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
export function appleIdentity(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new VaultError(
      "INVALID_URL",
      "Paste an Apple Podcasts episode URL.",
      400,
    );
  }
  const showId = url.pathname.match(/\/id(\d+)(?:\/|$)/)?.[1],
    episodeId = url.searchParams.get("i");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "podcasts.apple.com" ||
    url.username ||
    url.password ||
    !showId ||
    !/^\d+$/.test(episodeId || "")
  )
    throw new VaultError(
      "UNSUPPORTED_LINK",
      "Use an exact Apple Podcasts episode link including its i= episode ID.",
      400,
    );
  return {
    showId,
    episodeId,
    key: "apple:" + episodeId,
    id: "apple-" + episodeId,
    url: `https://podcasts.apple.com/podcast/id${showId}?i=${episodeId}`,
  };
}
export function parseFeed(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new VaultError("UNSAFE_XML", "RSS entities are not accepted.");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false,
    trimValues: true,
  });
  const rss = parser.parse(xml)?.rss?.channel;
  if (!rss)
    throw new VaultError(
      "INVALID_RSS",
      "Publisher did not return an RSS feed.",
    );
  return {
    title: clean(rss.title),
    link: rss.link,
    items: array(rss.item).map((item) => ({
      title: clean(item.title),
      guid: typeof item.guid === "object" ? item.guid["#text"] : item.guid,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : "",
      description: clean(item["content:encoded"] || item.description),
      descriptionHtml: item["content:encoded"] || item.description || "",
      link: typeof item.link === "string" ? item.link : "",
      audioUrl: item.enclosure?.["@url"] || "",
      audioBytes: Number(item.enclosure?.["@length"] || 0),
      transcripts: array(item["podcast:transcript"])
        .map((t) => ({
          url: t["@url"],
          type: t["@type"] || "",
          language: t["@language"] || "",
          rel: t["@rel"] || "",
        }))
        .filter((t) => t.url),
    })),
  };
}
export function matchFeedEpisode(episode, items) {
  const candidates = items.filter((item) => {
    const dateDiff = Math.abs(
      Date.parse(item.publishedAt) - Date.parse(episode.publishedAt),
    );
    const dateOk = Number.isFinite(dateDiff) && dateDiff <= 36 * 3600_000;
    return (
      (episode.audioUrl && item.audioUrl === episode.audioUrl) ||
      (normalize(item.title) === normalize(episode.title) && dateOk)
    );
  });
  if (candidates.length !== 1)
    throw new VaultError(
      "RSS_IDENTITY_UNRESOLVED",
      `Expected one exact RSS match; found ${candidates.length}. No neighboring episode was used.`,
    );
  return candidates[0];
}
export async function resolveEpisode(url, io = { readJson, readSource }) {
  const identity = appleIdentity(url);
  // The direct episode lookup often returns zero results. Collection lookup is a
  // necessary independent fallback, not an error to silently abandon.
  const result = await io.readJson(
    `https://itunes.apple.com/lookup?id=${identity.showId}&entity=podcastEpisode&limit=200&country=US`,
  );
  const show = (result.results || []).find(
    (x) => x.kind === "podcast" && String(x.collectionId) === identity.showId,
  );
  let entry = (result.results || []).find(
    (x) =>
      x.kind === "podcast-episode" && String(x.trackId) === identity.episodeId,
  );
  if (!entry) {
    const direct = await io.readJson(
      `https://itunes.apple.com/lookup?id=${identity.episodeId}&country=US`,
    );
    entry = (direct.results || []).find(
      (x) =>
        x.kind === "podcast-episode" &&
        String(x.trackId) === identity.episodeId,
    );
  }
  if (!show || !entry)
    throw new VaultError(
      "APPLE_IDENTITY_UNRESOLVED",
      "Apple did not expose this exact episode in its metadata. No substitute episode was selected.",
      422,
      true,
    );
  if (String(entry.collectionId) !== identity.showId)
    throw new VaultError(
      "IDENTITY_MISMATCH",
      "Apple episode and show IDs do not match.",
      409,
    );
  const episode = {
    ...identity,
    title: entry.trackName,
    show: entry.collectionName || show.collectionName,
    publishedAt: entry.releaseDate,
    description: clean(entry.description || entry.shortDescription),
    image: entry.artworkUrl600 || show.artworkUrl600 || "",
    durationSeconds: Math.round((entry.trackTimeMillis || 0) / 1000),
    feedUrl: show.feedUrl,
    audioUrl: entry.episodeUrl || "",
    identityBasis: "Apple exact episode ID",
    guests: [],
  };
  const feed = await io.readSource(show.feedUrl);
  const parsedFeed = parseFeed(feed.text),
    match = matchFeedEpisode(episode, parsedFeed.items);
  return {
    ...episode,
    showWebsite: parsedFeed.link || "",
    rssGuid: match.guid || "",
    publisherUrl: match.link,
    audioUrl: match.audioUrl || episode.audioUrl,
    audioBytes: match.audioBytes,
    transcriptSources: match.transcripts,
    description: match.description || episode.description,
    descriptionHtml: match.descriptionHtml,
    identityBasis: "Apple episode ID + unique RSS title/date or audio match",
  };
}
