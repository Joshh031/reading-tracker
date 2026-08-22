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
  const r = await fetch(url, { redirect:'follow', headers:{'user-agent':'Mozilla/5.0 (compatible; ReadingLog/1.2)','accept':'text/html,application/xml,text/plain,*/*'} });
  if (!r.ok) throw new Error(`Could not fetch source (${r.status})`);
  return {text:await r.text(),finalUrl:r.url||url};
}
async function fetchJson(url) {
  const r = await fetch(url,{redirect:'follow',headers:{'user-agent':'ReadingLog/1.2'}});
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
function splitUseful(text=''){
  const sentences=text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>=70&&s.length<=650);
  const keys=['%','$','billion','million','months','years','october','march','buy','short','valuation','credit','debt','margin','profit','saas','cloud','model','security','china','microsoft','meta','apple','hyperscaler','neocloud','continuous learning','open source'];
  return sentences.map(s=>({s,score:keys.reduce((n,k)=>n+(s.toLowerCase().includes(k)?1:0),0)+(\d/.test(s)?2:0)})).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score).map(x=>x.s);
}
async function enrichPublic(source){
  const slug=slugify(source.episodeTitle);
  if(!slug)return null;
  const candidates=[`https://bidclub.ai/e/${slug}`];
  for(const u of candidates){
    try{
      const page=await fetchText(u);const html=page.text;
      const titleText=cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
      const key=source.episodeTitle.toLowerCase().split(/\s+/).slice(0,7).join(' ');
      if(key&&!cleanText(html).toLowerCase().includes(key.slice(0,45)))continue;
      const lis=[...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>cleanText(m[1])).filter(x=>x.length>90&&x.length<1800);
      let pool=[];for(const li of lis.slice(0,8))pool.push(...splitUseful(li));
      if(pool.length<4)pool.push(...splitUseful(cleanText(html).slice(0,80000)));
      const seen=new Set(),insights=[];for(const s of pool){const k=s.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,80);if(!seen.has(k)){seen.add(k);insights.push(s)}if(insights.length===6)break}
      if(insights.length){return {sourceUrl:page.finalUrl,sourceName:'BidClub public transcript/summary',insights,titleText,fullText:cleanText(html).slice(0,140000)}};
    }catch{}
  }
  return null;
}
function guestFromDescription(d=''){const m=d.match(/^([A-Z][A-Za-z .'-]{2,80})\s+(?:is|joins|joined|has been|was)\b/);return m?.[1]?.trim()||''}
function guestRoleFromDescription(d='',guest=''){if(!guest)return'';const first=d.split(/(?<=[.!?])\s+/)[0]||'';const m=first.match(new RegExp(`${guest.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+is\\s+the\\s+([^,.]+(?:,[^.]*)?)`,'i'));return m?.[1]?.trim()||''}
function guestContextFromDescription(d='',guest=''){const ss=d.split(/(?<=[.!?])\s+/).filter(Boolean);return ss.slice(0,3).join(' ').slice(0,600)}
function bottomLine(insights=[]){if(!insights.length)return'';return insights[0].length>300?insights[0].slice(0,297)+'…':insights[0]}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const url=String(req.body?.url||'').trim();if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Paste a valid episode link.'});
  try{
    const source=appleIds(url)?await resolveApple(url):null;if(!source)throw new Error('For now, paste an Apple Podcasts episode link.');
    const guest=guestFromDescription(source.description);const role=guestRoleFromDescription(source.description,guest);const publicSource=await enrichPublic(source);
    const insights=publicSource?.insights||[];
    return res.status(200).json({verified:source.verified,verificationNote:source.verificationNote,url:source.url,podcast:source.podcast,episodeTitle:source.episodeTitle,guest,guestRole:role,guestContext:guestContextFromDescription(source.description,guest),whyGuestMatters:role?`A senior ${role} offering firsthand perspective on the markets and companies discussed.`:'',otherGuests:[],investorInsights:insights,oneLine:bottomLine(insights),description:source.description,image:source.image,publishedDate:source.publishedDate,durationMs:source.durationMs,transcriptFound:Boolean(source.transcript||publicSource),transcriptUrl:source.transcriptUrl||publicSource?.sourceUrl||'',summaryBasis:source.transcript?'publisher transcript':publicSource?'public transcript/summary':'description',insightSource:publicSource?.sourceName||'',insightsAvailable:insights.length>0});
  }catch(e){console.error('podcast_handler_error',e?.message||String(e));return res.status(500).json({error:e?.message||'Could not analyze this episode link.'})}
}
