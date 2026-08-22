function cleanText(s='') {
  return String(s)
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

async function fetchJson(url) {
  const r = await fetch(url, {
    redirect:'follow',
    headers:{
      'user-agent':'ReadingLog/1.5',
      'accept':'application/json,text/plain,*/*'
    }
  });
  if (!r.ok) throw new Error(`Could not fetch JSON source (${r.status})`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, {
    redirect:'follow',
    headers:{'user-agent':'ReadingLog/1.5','accept':'application/xml,text/plain,*/*'}
  });
  if (!r.ok) throw new Error(`Could not fetch source (${r.status})`);
  return {text:await r.text(),finalUrl:r.url||url};
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
  const ids=appleIds(url); if(!ids) return null;
  const api=`https://itunes.apple.com/lookup?id=${encodeURIComponent(ids.collection)}&entity=podcastEpisode&limit=200&country=US`;
  const data=await fetchJson(api);
  const results=Array.isArray(data?.results)?data.results:[];
  const show=results.find(x=>x.wrapperType==='collection'||x.kind==='podcast')||{};
  const episode=results.find(x=>String(x.trackId||'')===ids.episode&&x.kind==='podcast-episode');
  if(!episode) throw new Error('Apple returned the show, but not this exact episode.');

  let transcriptUrl='', transcript='';
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
            if(transcript.length<500) transcript='';
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
    feedUrl, transcriptUrl, transcript
  };
}

const STOP=new Set(['the','and','that','with','from','this','will','what','when','who','why','are','for','into','about','your','their','they','have','has','was','were','but','not','you','its','how','can','should','would','could','our','out','all','episode']);
const SIGNAL=['billion','million','months','years','october','march','valuation','credit','debt','margin','profit','saas','cloud','model','security','china','microsoft','meta','apple','hyperscaler','neocloud','continuous','learning','open source','bubble','correction','capital','gpu','compute','router','fireworks','baseten','private equity','demand','dislocation','treasur','markup','short','buy','hold'];

function words(s=''){
  return String(s).toLowerCase().replace(/[^a-z0-9%$ ]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!STOP.has(w));
}
function titleTokens(s=''){return [...new Set(words(s))].slice(0,30)}
function scoreSignal(s=''){
  const l=String(s).toLowerCase();
  return SIGNAL.reduce((n,k)=>n+(l.includes(k)?2:0),0)+(/\d/.test(s)?3:0)+(l.includes('$')||l.includes('%')?2:0);
}
function declarativeSentences(s=''){
  return String(s)
    .replace(/^[-*#>\s]+/gm,'')
    .replace(/\[(.*?)\]\([^)]*\)/g,'$1')
    .split(/(?<=[.!?])\s+/)
    .map(x=>x.replace(/\s+/g,' ').trim())
    .filter(x=>x.length>=45&&x.length<=800&&!x.endsWith('?'));
}
function similarity(a,b){
  const A=new Set(words(a)), B=new Set(words(b));
  let n=0; for(const w of A) if(B.has(w)) n++;
  return n;
}

function normalizeSearchResults(data){
  if(Array.isArray(data)) return data;
  for(const k of ['results','episodes','items','data']) if(Array.isArray(data?.[k])) return data[k];
  return [];
}

function resultScore(item,source,guest){
  const hay=[item?.title,item?.title_orig,item?.dek,item?.summary,item?.people,item?.show,item?.show_id].flat().filter(Boolean).join(' ').toLowerCase();
  const tokens=titleTokens(source.episodeTitle);
  let score=tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0);
  if(guest&&hay.includes(guest.toLowerCase())) score+=10;
  if(hay.includes('20vc')) score+=2;
  const appleDate=String(source.publishedDate||'').slice(0,10);
  const itemDate=String(item?.date||item?.published_at||'').slice(0,10);
  if(appleDate&&itemDate&&appleDate===itemDate) score+=8;
  return score;
}

async function findBidClubEpisode(source,guest){
  const queries=[guest, source.episodeTitle.split('|')[0].slice(0,110), '20VC '+guest].filter(Boolean);
  let best=null;
  for(const q of queries){
    try{
      const data=await fetchJson(`https://bidclub.ai/api/v1/search?q=${encodeURIComponent(q)}`);
      for(const item of normalizeSearchResults(data)){
        const slug=item?.slug||item?.episode_slug||item?.id||'';
        if(!slug) continue;
        const score=resultScore(item,source,guest);
        if(!best||score>best.score) best={item,slug,score};
      }
    }catch(e){console.log('bidclub_search_error',q,e?.message||String(e))}
  }
  if(!best||best.score<8){
    console.log('bidclub_no_match',{guest,title:source.episodeTitle,bestScore:best?.score||0});
    return null;
  }
  try{
    const detail=await fetchJson(`https://bidclub.ai/api/v1/episodes/${encodeURIComponent(best.slug)}`);
    console.log('bidclub_match',{slug:best.slug,score:best.score,title:detail?.title||best.item?.title||''});
    return {...best.item,...detail,slug:best.slug};
  }catch(e){
    console.log('bidclub_detail_error',best.slug,e?.message||String(e));
    return null;
  }
}

function markdownSections(md=''){
  const lines=String(md).split(/\r?\n/);
  const sections=[];
  let title='', body=[];
  const flush=()=>{const text=body.join(' ').replace(/\s+/g,' ').trim();if(text)sections.push({title,text});body=[]};
  for(const line of lines){
    const h=line.match(/^#{1,4}\s+(.+)/);
    if(h){flush();title=h[1].trim();continue}
    const b=line.match(/^\s*[-*]\s+(.+)/);
    if(b){body.push(b[1].trim());continue}
    if(line.trim()) body.push(line.trim());
  }
  flush();
  return sections;
}

function buildDeepTakeaways(episode){
  const tldr=String(episode?.tldr_md||episode?.tldr||'');
  const digest=String(episode?.digest_md||episode?.digest||'');
  const transcript=String(episode?.transcript_md||episode?.transcript||'');
  const candidates=[];

  for(const sec of [...markdownSections(tldr),...markdownSections(digest)]){
    const ss=declarativeSentences(sec.text);
    if(ss.length>=3){
      const text=ss.slice(0,5).join(' ');
      candidates.push({text,score:scoreSignal(text)+(sec.title?2:0)});
    }
  }

  // If a strong digest section is only 1-2 sentences, expand it with nearby transcript sentences on the same topic.
  const transcriptPool=declarativeSentences(transcript).filter(s=>scoreSignal(s)>=2).slice(0,800);
  for(const sec of [...markdownSections(tldr),...markdownSections(digest)]){
    const base=declarativeSentences(sec.text);
    if(!base.length||base.length>=3) continue;
    const seed=base.join(' ');
    const related=transcriptPool
      .map(s=>({s,rel:similarity(seed,s),score:scoreSignal(s)}))
      .filter(x=>x.rel>=2)
      .sort((a,b)=>(b.rel*5+b.score)-(a.rel*5+a.score));
    const combo=[...base];
    for(const x of related){if(!combo.includes(x.s))combo.push(x.s);if(combo.length>=4)break}
    if(combo.length>=3){
      const text=combo.slice(0,5).join(' ');
      candidates.push({text,score:scoreSignal(text)+3});
    }
  }

  candidates.sort((a,b)=>b.score-a.score);
  const out=[];
  for(const c of candidates){
    if(c.text.length<240) continue;
    if(out.some(prev=>similarity(prev,c.text)>=14)) continue;
    out.push(c.text);
    if(out.length===5) break;
  }
  return out;
}

function guestFromDescription(d=''){
  const m=String(d).match(/^([A-Z][A-Za-z .'-]{2,80})\s+(?:is|joins|joined|has been|was)\b/);
  return m?.[1]?.trim()||'';
}
function guestRoleFromDescription(d='',guest=''){
  if(!guest)return'';
  const first=String(d).split(/(?<=[.!?])\s+/)[0]||'';
  const esc=guest.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=first.match(new RegExp(`${esc}\\s+is\\s+the\\s+([^,.]+(?:,[^.]*)?)`,'i'));
  return m?.[1]?.trim()||'';
}
function guestContextFromDescription(d=''){
  return String(d).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3).join(' ').slice(0,700);
}
function bottomLine(insights=[]){
  if(!insights.length)return'';
  const first=declarativeSentences(insights[0])[0]||insights[0];
  return first.length>340?first.slice(0,337)+'…':first;
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
    const bidclub=await findBidClubEpisode(source,guest);
    const insights=bidclub?buildDeepTakeaways(bidclub):[];
    console.log('podcast_result',{guest,bidclubSlug:bidclub?.slug||'',insightCount:insights.length});

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
      transcriptFound:Boolean(source.transcript||bidclub?.transcript_md||bidclub?.transcript),
      transcriptUrl:source.transcriptUrl||(bidclub?.slug?`https://bidclub.ai/e/${bidclub.slug}`:''),
      summaryBasis:bidclub?'BidClub TLDR/digest/transcript':source.transcript?'publisher transcript':'description',
      insightSource:bidclub?'BidClub API':'',
      insightsAvailable:insights.length>0,
      insightFormat:'3-5 core takeaways, minimum 3 sentences each'
    });
  }catch(e){
    console.error('podcast_handler_error',e?.message||String(e));
    return res.status(500).json({error:e?.message||'Could not analyze this episode link.'});
  }
}
