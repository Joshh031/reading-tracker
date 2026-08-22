import { generateText } from 'ai';

function cleanText(s='') {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<!\[CDATA\[|\]\]>/g,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/\s+/g,' ')
    .trim();
}

function meta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return cleanText(m[1]);
  }
  return '';
}

async function fetchText(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ReadingLog/1.1)',
      'accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,text/plain;q=0.9,*/*;q=0.8'
    }
  });
  if (!r.ok) throw new Error(`Could not fetch source (${r.status})`);
  return { text: await r.text(), finalUrl: r.url || url };
}

async function fetchJson(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'ReadingLog/1.1' } });
  if (!r.ok) throw new Error(`Could not fetch catalog (${r.status})`);
  return r.json();
}

function appleIds(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('podcasts.apple.com')) return null;
    const collection = (u.pathname.match(/id(\d+)/)||[])[1] || '';
    const episode = u.searchParams.get('i') || '';
    return collection && episode ? { collection, episode } : null;
  } catch { return null; }
}

function xmlTag(block, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m = block.match(new RegExp(`<${safe}[^>]*>([\\s\\S]*?)<\\/${safe}>`,'i'));
  return m?.[1] ? cleanText(m[1]) : '';
}

function transcriptFromRssItem(item, baseUrl) {
  const m = item.match(/<(?:podcast:)?transcript\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
  if (!m?.[1]) return '';
  try { return new URL(m[1], baseUrl).href; } catch { return m[1]; }
}

async function resolveApple(url) {
  const ids = appleIds(url);
  if (!ids) return null;

  const api = `https://itunes.apple.com/lookup?id=${encodeURIComponent(ids.collection)}&entity=podcastEpisode&limit=200&country=US`;
  const data = await fetchJson(api);
  const results = Array.isArray(data?.results) ? data.results : [];
  const show = results.find(x => x.wrapperType === 'collection' || x.kind === 'podcast') || {};
  const episode = results.find(x => String(x.trackId || '') === ids.episode && x.kind === 'podcast-episode');
  if (!episode) throw new Error('Apple returned the show, but not this exact episode.');

  let transcriptUrl = '';
  let transcript = '';
  const feedUrl = show.feedUrl || episode.feedUrl || '';

  if (feedUrl) {
    try {
      const feed = await fetchText(feedUrl);
      const items = [...feed.text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]);
      const targetTitle = cleanText(episode.trackName || '').toLowerCase();
      const item = items.find(block => {
        const title = xmlTag(block,'title').toLowerCase();
        return title && targetTitle && title === targetTitle;
      }) || items.find(block => cleanText(block).toLowerCase().includes(targetTitle.slice(0,80)));

      if (item) {
        transcriptUrl = transcriptFromRssItem(item, feed.finalUrl);
        if (transcriptUrl) {
          try {
            const tr = await fetchText(transcriptUrl);
            transcript = cleanText(tr.text).slice(0,120000);
            if (transcript.length < 500) transcript = '';
          } catch { transcript = ''; }
        }
      }
    } catch {}
  }

  return {
    verified: true,
    verificationNote: 'Matched directly to the Apple Podcasts episode ID.',
    url,
    podcast: episode.collectionName || show.collectionName || '',
    episodeTitle: episode.trackName || '',
    description: cleanText(episode.description || episode.shortDescription || ''),
    image: episode.artworkUrl600 || episode.artworkUrl100 || show.artworkUrl600 || '',
    publishedDate: episode.releaseDate || '',
    durationMs: episode.trackTimeMillis || 0,
    feedUrl,
    transcriptUrl,
    transcript,
  };
}

function findTranscriptUrl(html, baseUrl) {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const m of links) {
    const label = cleanText(m[2]).toLowerCase();
    const href = m[1];
    if (label.includes('transcript') || href.toLowerCase().includes('transcript')) {
      try { return new URL(href, baseUrl).href; } catch {}
    }
  }
  return '';
}

function guessPodcastAndEpisode(title='') {
  const parts = title.split(/\s+[|–—-]\s+/).map(s=>s.trim()).filter(Boolean);
  if (parts.length >= 2) return { episodeTitle: parts[0], podcast: parts[parts.length - 1] };
  return { episodeTitle: title, podcast: '' };
}

async function resolveGeneric(url) {
  const page = await fetchText(url);
  const html = page.text;
  const ogTitle = meta(html, 'og:title') || meta(html, 'twitter:title') || cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const description = meta(html, 'og:description') || meta(html, 'description') || meta(html, 'twitter:description');
  const image = meta(html, 'og:image') || meta(html, 'twitter:image');
  const guessed = guessPodcastAndEpisode(ogTitle);
  let transcriptUrl = findTranscriptUrl(html, page.finalUrl);
  let transcript = '';
  if (transcriptUrl) {
    try {
      const t = await fetchText(transcriptUrl);
      transcript = cleanText(t.text).slice(0,120000);
      if (transcript.length < 500) transcript = '';
    } catch { transcript = ''; }
  }
  return {
    verified: Boolean(ogTitle && description),
    verificationNote: ogTitle ? 'Matched from episode-page metadata.' : 'Could not confidently verify this episode.',
    url: page.finalUrl,
    podcast: guessed.podcast,
    episodeTitle: guessed.episodeTitle,
    description,
    image,
    publishedDate: '',
    durationMs: 0,
    transcriptUrl,
    transcript,
  };
}

async function analyzeWithAI(source) {
  const sourceText = source.transcript || source.description;
  if (!sourceText || sourceText.length < 80) return null;

  try {
    const { text } = await generateText({
      model: 'openai/gpt-5.4-mini',
      prompt: `You are preparing a podcast entry for a senior public-markets investor who wants differentiated insights to discuss with portfolio managers. Be guest-first, not episode-title-first.

Exact podcast: ${source.podcast}
Exact episode: ${source.episodeTitle}
Published description: ${source.description}
Source type: ${source.transcript ? 'full or partial transcript' : 'episode description only'}
Source text:
${sourceText.slice(0,100000)}

Return ONLY valid JSON with this exact shape:
{
  "podcast":"show name",
  "episodeTitle":"exact episode title",
  "primaryGuest":"the principal guest whose views are the reason to listen; empty if uncertain",
  "guestRole":"current or relevant senior role/firm from the supplied source only; empty if unsupported",
  "guestContext":"1-2 concise sentences explaining why this guest is credible or worth listening to, using only supported facts",
  "whyGuestMatters":"one short sentence on why this guest's perspective is relevant to an investor",
  "otherGuests":["other substantive guests, excluding host"],
  "investorInsights":["4-6 specific, differentiated, PM-worthy insights actually stated by the guest"],
  "oneLine":"one concise bottom line that captures the guest's most important market view"
}

Rules:
- Never infer an answer from an agenda question. A topic heading like 'Will the AI bubble burst?' is NOT evidence the guest thinks it will.
- Every investor insight must be supported by the supplied source. Prefer forecasts, time horizons, numbers, variant views, company/subsector opinions, market structure, capital allocation, and second-order implications.
- If the source is description-only and does not reveal the guest's actual view on a topic, omit that topic rather than guess.
- Do not identify the host as the primary guest unless the episode truly has no guest.
- If guest identity is ambiguous, leave primaryGuest blank.
- Do not invent credentials, investments, company views, numbers, or timing.
- If fewer than 4 supported insights exist, return fewer. Accuracy beats completeness.`,
    });
    return JSON.parse(text.replace(/```json|```/g,'').trim());
  } catch (e) {
    console.error('podcast_ai_error', e?.message || String(e));
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Paste a valid episode link.' });

  try {
    const source = appleIds(url) ? await resolveApple(url) : await resolveGeneric(url);
    const ai = await analyzeWithAI(source);

    const fallbackGuestMatch = source.description.match(/^([A-Z][A-Za-z .'-]{2,80})\s+(?:is|joins|joined|has been|was)\b/);
    const fallbackGuest = fallbackGuestMatch?.[1]?.trim() || '';

    return res.status(200).json({
      verified: source.verified,
      verificationNote: source.verificationNote,
      url: source.url,
      podcast: ai?.podcast || source.podcast || '',
      episodeTitle: ai?.episodeTitle || source.episodeTitle || '',
      guest: ai?.primaryGuest || fallbackGuest,
      guestRole: ai?.guestRole || '',
      guestContext: ai?.guestContext || '',
      whyGuestMatters: ai?.whyGuestMatters || '',
      otherGuests: Array.isArray(ai?.otherGuests) ? ai.otherGuests.slice(0,4) : [],
      investorInsights: Array.isArray(ai?.investorInsights) ? ai.investorInsights.slice(0,6) : [],
      oneLine: ai?.oneLine || '',
      description: source.description || '',
      image: source.image || '',
      publishedDate: source.publishedDate || '',
      durationMs: source.durationMs || 0,
      transcriptFound: Boolean(source.transcript),
      transcriptUrl: source.transcriptUrl || '',
      summaryBasis: source.transcript ? 'transcript' : (source.description ? 'description' : 'metadata')
    });
  } catch (e) {
    console.error('podcast_handler_error', e?.message || String(e));
    return res.status(500).json({ error: e?.message || 'Could not analyze this episode link.' });
  }
}
