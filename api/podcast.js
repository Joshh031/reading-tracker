import { generateText } from 'ai';

function cleanText(s='') {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
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

async function fetchText(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ReadingLog/1.0)',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!r.ok) throw new Error(`Could not fetch episode page (${r.status})`);
  return { text: await r.text(), finalUrl: r.url || url };
}

function guessPodcastAndEpisode(title='') {
  const parts = title.split(/\s+[|–—-]\s+/).map(s=>s.trim()).filter(Boolean);
  if (parts.length >= 2) return { episodeTitle: parts[0], podcast: parts[parts.length - 1] };
  return { episodeTitle: title, podcast: '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Paste a valid episode link.' });

  try {
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
        transcript = cleanText(t.text).slice(0, 120000);
        if (transcript.length < 500) transcript = '';
      } catch { transcript = ''; }
    }

    const sourceText = transcript || description;
    let ai = null;
    if (sourceText && sourceText.length > 80) {
      try {
        const { text } = await generateText({
          model: 'openai/gpt-5.4-mini',
          prompt: `You are extracting podcast metadata and producing a concise factual synopsis for a personal reading log.\n\nEpisode page title: ${ogTitle}\nPage description: ${description}\nSource type: ${transcript ? 'full/partial transcript' : 'episode description only'}\nSource text:\n${sourceText.slice(0, 100000)}\n\nReturn ONLY valid JSON with these keys:\n{\n  "podcast":"podcast/show name, or empty string if uncertain",\n  "episodeTitle":"episode title without show name, or empty string if uncertain",\n  "guest":"main guest(s), or empty string",\n  "summary":"2-4 sentences, concise and factual",\n  "bullets":["3 short key topics or arguments"]\n}\nDo not invent details that are not supported by the supplied source.`,
        });
        const clean = text.replace(/```json|```/g,'').trim();
        ai = JSON.parse(clean);
      } catch {}
    }

    return res.status(200).json({
      url: page.finalUrl,
      podcast: ai?.podcast || guessed.podcast,
      episodeTitle: ai?.episodeTitle || guessed.episodeTitle,
      guest: ai?.guest || '',
      description,
      image,
      transcriptFound: Boolean(transcript),
      transcriptUrl: transcriptUrl || '',
      summary: ai?.summary || description || '',
      bullets: Array.isArray(ai?.bullets) ? ai.bullets.slice(0,3) : [],
      summaryBasis: transcript ? 'transcript' : (description ? 'description' : 'metadata')
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Could not analyze this episode link.' });
  }
}
