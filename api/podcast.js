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
  const r = await fetch(url, {
    redirect:'follow',
    headers:{
      'user-agent':'Mozilla/5.0 (compatible; ReadingLog/1.4)',
      'accept':'text/html,application/xml,text/plain,*/*'
    }
  });
  if (!r.ok) throw new Error(`Could not fetch source (${r.status})`);
  return {text:await r.text(),finalUrl:r.url||url};
}

async function fetchJson(url) {
  const r = await fetch(url,{redirect:'follow',headers:{'user-agent':'ReadingLog/1.4'}});
  if(!r.ok) throw new Error(`Could not fetch catalog (${r.status})`);
  return r.json();
}

function appleIds(url){
  try{
    const u=new URL(url);
    if(!u.hostname.endsWith('podcasts.apple.com')) return null;
    const collection=(u.pathname.match(/id(\d+)/)||[])[1]||'';
    const episode=u.searchParams.get('i')||'';
    return collection&&episode?{collection,episode}:null;
  }catch{return null}
}

function xmlTag(block,tag){
  const safe=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=block.match(new RegExp(`<${safe}[^>]*>([\\s\\S]*?)<\\/${safe}>`,'i'));
  return m?.[1]?cleanText(m[1]):'';
}

function transcriptFromRssItem(item,baseUrl){
  const m=item.match(/<(?:podcast:)?transcript\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
  if(!m?.[1])return'';
  try{return new URL(m[1],baseUrl).href}catch{return m[1]}
}

async function resolveApple(url){
  const ids=appleIds(url);if(!ids)return null;
  const api=`https://itunes.apple.com/lookup?id=${encodeURIComponent(ids.collection)}&entity=podcastEpisode&limit=200&country=US`;
  const data=await fetchJson(api);
  const results=Array.isArray(data?.results)?data.results:[];
  const show=results.find(x=>x.wrapperType==='collection'||x.kind==='podcast')||{};
  const episode=results.find(x=>String(x.trackId||'')===ids.episode&&x.kind==='podcast-episode');
  if(!episode)throw new Error('Apple returned the show, but not this exact episode.');

  let transcriptUrl='',transcript='';
  const feedUrl=show.feedUrl||episode.feedUrl||'';
  if(feedUrl){
    try{
      const feed=await fetchText(feedUrl);
      const items=[...feed.text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]);
      const target=cleanText(episode.trackName||'').toLowerCase();
      const item=items.find(b=>xmlTag(b,'title').toLowerCase()===target)||items.find(b=>cleanText(b).toLowerCase().includes(target.slice(0,80)));
      if(item){
        transcriptUrl=transcriptFromRssItem(item,feed.finalUrl);
        if(transcriptUrl){
          try{
            const tr=await fetchText(transcriptUrl);
            transcript=cleanText(tr.text).slice(0,150000);
            if(transcript.length<500)transcript='';
          }catch{}
        }
      }
    }catch{}
  }

  return {
    verified:true,
    verificationNote:'Matched directly to the Apple Podcasts episode ID.',
    url,
    podcast:episode.collectionName||show.collectionName||'',
    episodeTitle:episode.trackName||'',
    description:cleanText(episode.description||episode.shortDescription||''),
    image:episode.artworkUrl600||episode.artworkUrl100||show.artworkUrl600||'',
    publishedDate:episode.releaseDate||'',
    durationMs:episode.trackTimeMillis||0,
    feedUrl,transcriptUrl,transcript
  };
}

const STOP=new Set(['the','and','that','with','from','this','will','what','when','who','why','are','for','into','about','your','their','they','have','has','was','were','but','not','you','its','how','can','should','would','could','our','out','all']);
const INSIGHT_KEYS=['billion','million','months','years','october','march','valuation','credit','debt','margin','profit','saas','cloud','model','security','china','microsoft','meta','apple','hyperscaler','neocloud','continuous','learning','open source','bubble','correction','capital','gpu','compute','router','fireworks','baseten','private equity','demand','dislocation'];

function words(s=''){
  return s.toLowerCase().replace(/[^a-z0-9%$ ]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!STOP.has(w));
}
function titleTokens(s=''){return [...new Set(words(s))].slice(0,28)}
function scoreText(s=''){
  const l=s.toLowerCase();
  return INSIGHT_KEYS.reduce((n,k)=>n+(l.includes(k)?2:0),0)+(/\d/.test(s)?3:0)+(s.includes('$')||s.includes('%')?2:0);
}
function sentences(s=''){
  return cleanText(s).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>=45&&x.length<=750&&!x.endsWith('?'));
}
function sentenceSimilarity(a,b){
  const A=new Set(words(a)),B=new Set(words(b));
  let common=0;for(const w of A)if(B.has(w))common++;
  return common;
}

function extractHrefCandidates(html=''){
  const out=[];
  const re=/href=["']([^"']*\/e\/[^"'#?]+)["']/gi;
  for(const m of html.matchAll(re)){
    let href=m[1];
    try{href=new URL(href,'https://bidclub.ai/').href}catch{continue}
    const i=m.index||0;
    const context=cleanText(html.slice(Math.max(0,i-1800),Math.min(html.length,i+2600)));
    out.push({href,context});
  }
  return out;
}

async function discoverBidClubUrl(source){
  try{
    const home=await fetchText('https://bidclub.ai/');
    const tokens=titleTokens(source.episodeTitle);
    const guest=(source.description.match(/^([A-Z][A-Za-z .'-]{2,80})\s+(?:is|joins|joined|has been|was)\b/)||[])[1]||'';
    let best=null;
    for(const c of extractHrefCandidates(home.text)){
      const lower=c.context.toLowerCase();
      let score=tokens.reduce((n,t)=>n+(lower.includes(t)?1:0),0);
      if(guest&&lower.includes(guest.toLowerCase()))score+=5;
      if(lower.includes('20vc'))score+=1;
      if(!best||score>best.score)best={...c,score};
    }
    if(best&&best.score>=6)return best.href;
  }catch(e){console.log('bidclub_discovery_error',e?.message||String(e))}
  return '';
}

function relatedBundle(seed,pool){
  const used=new Set([seed]);
  const bundle=[seed];
  const ranked=pool
    .filter(s=>s!==seed)
    .map(s=>({s,rel:sentenceSimilarity(seed,s),score:scoreText(s)}))
    .filter(x=>x.rel>=2||x.score>=4)
    .sort((a,b)=>(b.rel*4+b.score)-(a.rel*4+a.score));
  for(const x of ranked){
    if(used.has(x.s))continue;
    bundle.push(x.s);used.add(x.s);
    if(bundle.length===4)break;
  }
  return bundle.length>=3?bundle.join(' '):'';
}

function deepTakeawaysFromHtml(html=''){
  const blocks=[];
  for(const m of html.matchAll(/<(?:li|p)[^>]*>([\s\S]*?)<\/(?:li|p)>/gi)){
    const t=cleanText(m[1]);
    if(t.length>=80)blocks.push(t);
  }
  const pool=[...new Set(blocks.flatMap(sentences))]
    .filter(s=>scoreText(s)>=2)
    .slice(0,220);
  const seeds=[...pool].sort((a,b)=>scoreText(b)-scoreText(a));
  const out=[];
  for(const seed of seeds){
    if(out.some(x=>sentenceSimilarity(seed,x)>=6))continue;
    const bundled=relatedBundle(seed,pool);
    if(bundled&&sentences(bundled).length>=3&&bundled.length>=260)out.push(bundled);
    if(out.length===5)break;
  }
  return out;
}

async function enrichPublic(source){
  const discovered=await discoverBidClubUrl(source);
  if(!discovered)return null;
  try{
    const page=await fetchText(discovered);
    const text=cleanText(page.text).toLowerCase();
    const tokens=titleTokens(source.episodeTitle).slice(0,10);
    const matchCount=tokens.reduce((n,t)=>n+(text.includes(t)?1:0),0);
    if(matchCount<5)return null;
    const insights=deepTakeawaysFromHtml(page.text);
    console.log('bidclub_enrichment',{url:page.finalUrl,matchCount,insightCount:insights.length});
    if(insights.length){
      return {sourceUrl:page.finalUrl,sourceName:'BidClub public transcript/summary',insights};
    }
  }catch(e){console.log('bidclub_fetch_error',e?.message||String(e))}
  return null;
}

function guestFromDescription(d=''){
  const m=d.match(/^([A-Z][A-Za-z .'-]{2,80})\s+(?:is|joins|joined|has been|was)\b/);
  return m?.[1]?.trim()||'';
}
function guestRoleFromDescription(d='',guest=''){
  if(!guest)return'';
  const first=d.split(/(?<=[.!?])\s+/)[0]||'';
  const esc=guest.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=first.match(new RegExp(`${esc}\\s+is\\s+the\\s+([^,.]+(?:,[^.]*)?)`,'i'));
  return m?.[1]?.trim()||'';
}
function guestContextFromDescription(d=''){
  return d.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3).join(' ').slice(0,700);
}
function bottomLine(insights=[]){
  if(!insights.length)return'';
  const s=sentences(insights[0])[0]||insights[0];
  return s.length>320?s.slice(0,317)+'…':s;
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const url=String(req.body?.url||'').trim();
  if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Paste a valid episode link.'});
  try{
    const source=appleIds(url)?await resolveApple(url):null;
    if(!source)throw new Error('For now, paste an Apple Podcasts episode link.');
    const guest=guestFromDescription(source.description);
    const role=guestRoleFromDescription(source.description,guest);
    const publicSource=await enrichPublic(source);
    const insights=publicSource?.insights||[];
    return res.status(200).json({
      verified:source.verified,
      verificationNote:source.verificationNote,
      url:source.url,
      podcast:source.podcast,
      episodeTitle:source.episodeTitle,
      guest,
      guestRole:role,
      guestContext:guestContextFromDescription(source.description),
      whyGuestMatters:role?`A senior ${role} offering firsthand perspective on the markets and companies discussed.`:'',
      otherGuests:[],
      investorInsights:insights,
      oneLine:bottomLine(insights),
      description:source.description,
      image:source.image,
      publishedDate:source.publishedDate,
      durationMs:source.durationMs,
      transcriptFound:Boolean(source.transcript||publicSource),
      transcriptUrl:source.transcriptUrl||publicSource?.sourceUrl||'',
      summaryBasis:source.transcript?'publisher transcript':publicSource?'public transcript/summary':'description',
      insightSource:publicSource?.sourceName||'',
      insightsAvailable:insights.length>0,
      insightFormat:'3-5 core takeaways, minimum 3 sentences each'
    });
  }catch(e){
    console.error('podcast_handler_error',e?.message||String(e));
    return res.status(500).json({error:e?.message||'Could not analyze this episode link.'});
  }
}
