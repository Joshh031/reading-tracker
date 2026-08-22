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

async function fetchText(url) {
  const r = await fetch(url, { redirect:'follow', headers:{'user-agent':'Mozilla/5.0 (compatible; ReadingLog/1.3)','accept':'text/html,application/xml,text/plain,*/*'} });
  if (!r.ok) throw new Error(`Could not fetch source (${r.status})`);
  return {text:await r.text(),finalUrl:r.url||url};
}
async function fetchJson(url) {
  const r = await fetch(url,{redirect:'follow',headers:{'user-agent':'ReadingLog/1.3'}});
  if(!r.ok) throw new Error(`Could not fetch catalog (${r.status})`);
  return r.json();
}
function appleIds(url){try{const u=new URL(url);if(!u.hostname.endsWith('podcasts.apple.com'))return null;const collection=(u.pathname.match(/id(\d+)/)||[])[1]||'';const episode=u.searchParams.get('i')||'';return collection&&episode?{collection,episode}:null}catch{return null}}
function xmlTag(block,tag){const safe=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=block.match(new RegExp(`<${safe}[^>]*>([\\s\\S]*?)<\\/${safe}>`,'i'));return m?.[1]?cleanText(m[1]):''}
function transcriptFromRssItem(item,baseUrl){const m=item.match(/<(?:podcast:)?transcript\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);if(!m?.[1])return'';try{return new URL(m[1],baseUrl).href}catch{return m[1]}}

async function resolveApple(url){
  const ids=appleIds(url);if(!ids)return null;
  const api=`https://itunes.apple.com/lookup?id=${encodeURIComponent(ids.collection)}&entity=podcastEpisode&limit=200&country=US`;
  const data=await fetchJson(api);const results=Array.isArray(data?.results)?data.results:[];
  const show=results.find(x=>x.wrapperType==='collection'||x.kind==='podcast')||{};
  const episode=results.find(x=>String(x.trackId||'')===ids.episode&&x.kind==='podcast-episode');
  if(!episode)throw new Error('Apple returned the show, but not this exact episode.');
  let transcriptUrl='',transcript='';const feedUrl=show.feedUrl||episode.feedUrl||'';
  if(feedUrl){try{const feed=await fetchText(feedUrl);const items=[...feed.text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]);const target=cleanText(episode.trackName||'').toLowerCase();const item=items.find(b=>xmlTag(b,'title').toLowerCase()===target)||items.find(b=>cleanText(b).toLowerCase().includes(target.slice(0,80)));if(item){transcriptUrl=transcriptFromRssItem(item,feed.finalUrl);if(transcriptUrl){try{const tr=await fetchText(transcriptUrl);transcript=cleanText(tr.text).slice(0,150000);if(transcript.length<500)transcript=''}catch{}}}}catch{}}
  return {verified:true,verificationNote:'Matched directly to the Apple Podcasts episode ID.',url,podcast:episode.collectionName||show.collectionName||'',episodeTitle:episode.trackName||'',description:cleanText(episode.description||episode.shortDescription||''),image:episode.artworkUrl600||episode.artworkUrl100||show.artworkUrl600||'',publishedDate:episode.releaseDate||'',durationMs:episode.trackTimeMillis||0,feedUrl,transcriptUrl,transcript};
}

function slugify(s=''){return s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48).replace(/-$/,'')}
const INSIGHT_KEYS=['%','$','billion','million','months','years','october','march','buy','short','valuation','credit','debt','margin','profit','saas','cloud','model','security','china','microsoft','meta','apple','hyperscaler','neocloud','continuous learning','open source','bubble','correction','capital','gpu','compute'];
function scoreText(s=''){const l=s.toLowerCase();return INSIGHT_KEYS.reduce((n,k)=>n+(l.includes(k)?1:0),0)+(/\d/.test(s)?2:0)}
function sentences(s=''){return s.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean)}
function isDeepTakeaway(s=''){
  const ss=sentences(s);
  return ss.length>=3 && s.length>=240 && s.length<=1800 && scoreText(s)>=3;
}
function normalizeTakeaway(s=''){
  const ss=sentences(cleanText(s)).filter(x=>x.length>25);
  if(ss.length<3)return'';
  return ss.slice(0,5).join(' ');
}
function deepTakeawaysFromHtml(html=''){
  const candidates=[];
  for(const m of html.matchAll(/<(?:li|p)[^>]*>([\s\S]*?)<\/(?:li|p)>/gi)){
    const t=cleanText(m[1]);
    if(isDeepTakeaway(t))candidates.push({text:normalizeTakeaway(t),score:scoreText(t)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const out=[],seen=[];
  for(const c of candidates){
    if(!c.text)continue;
    const sig=c.text.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(Boolean).slice(0,18);
    const overlap=seen.some(prev=>sig.filter(w=>prev.includes(w)).length>=10);
    if(overlap)continue;
    out.push(c.text);seen.push(sig);
    if(out.length===5)break;
  }
  return out;
}
async function enrichPublic(source){
  const slug=slugify(source.episodeTitle);if(!slug)return null;
  for(const u of [`https://bidclub.ai/e/${slug}`]){
    try{
      const page=await fetchText(u),html=page.text;
      const key=source.episodeTitle.toLowerCase().split(/\s+/).slice(0,7).join(' ');
      if(key&&!cleanText(html).toLowerCase().includes(key.slice(0,45)))continue;
      const insights=deepTakeawaysFromHtml(html);
      if(insights.length)return {sourceUrl:page.finalUrl,sourceName:'BidClub public transcript/summary',insights,fullText:cleanText(html).slice(0,140000)};
    }catch{}
  }
  return null;
}
function guestFromDescription(d=''){const m=d.match(/^([A-Z][A-Za-z .'-]{2,80})\s+(?:is|joins|joined|has been|was)\b/);return m?.[1]?.trim()||''}
function guestRoleFromDescription(d='',guest=''){if(!guest)return'';const first=d.split(/(?<=[.!?])\s+/)[0]||'';const m=first.match(new RegExp(`${guest.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+is\\s+the\\s+([^,.]+(?:,[^.]*)?)`,'i'));return m?.[1]?.trim()||''}
function guestContextFromDescription(d=''){const ss=d.split(/(?<=[.!?])\s+/).filter(Boolean);return ss.slice(0,3).join(' ').slice(0,700)}
function bottomLine(insights=[]){if(!insights.length)return'';const s=sentences(insights[0])[0]||insights[0];return s.length>320?s.slice(0,317)+'…':s}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const url=String(req.body?.url||'').trim();if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Paste a valid episode link.'});
  try{
    const source=appleIds(url)?await resolveApple(url):null;if(!source)throw new Error('For now, paste an Apple Podcasts episode link.');
    const guest=guestFromDescription(source.description),role=guestRoleFromDescription(source.description,guest),publicSource=await enrichPublic(source),insights=publicSource?.insights||[];
    return res.status(200).json({verified:source.verified,verificationNote:source.verificationNote,url:source.url,podcast:source.podcast,episodeTitle:source.episodeTitle,guest,guestRole:role,guestContext:guestContextFromDescription(source.description),whyGuestMatters:role?`A senior ${role} offering firsthand perspective on the markets and companies discussed.`:'',otherGuests:[],investorInsights:insights,oneLine:bottomLine(insights),description:source.description,image:source.image,publishedDate:source.publishedDate,durationMs:source.durationMs,transcriptFound:Boolean(source.transcript||publicSource),transcriptUrl:source.transcriptUrl||publicSource?.sourceUrl||'',summaryBasis:source.transcript?'publisher transcript':publicSource?'public transcript/summary':'description',insightSource:publicSource?.sourceName||'',insightsAvailable:insights.length>0,insightFormat:'3-5 core takeaways, minimum 3 sentences each'});
  }catch(e){console.error('podcast_handler_error',e?.message||String(e));return res.status(500).json({error:e?.message||'Could not analyze this episode link.'})}
}
