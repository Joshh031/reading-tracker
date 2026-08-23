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
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'ReadingLog/1.6','accept':'application/json,text/plain,*/*'}});
  if(!r.ok) throw new Error(`Could not fetch JSON source (${r.status})`);
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

async function resolveApple(url){
  const ids=appleIds(url); if(!ids) return null;
  const data=await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(ids.collection)}&entity=podcastEpisode&limit=200&country=US`);
  const results=Array.isArray(data?.results)?data.results:[];
  const show=results.find(x=>x.wrapperType==='collection'||x.kind==='podcast')||{};
  const episode=results.find(x=>String(x.trackId||'')===ids.episode&&x.kind==='podcast-episode');
  if(!episode) throw new Error('Apple returned the show, but not this exact episode.');
  return {
    verified:true,
    verificationNote:'Matched directly to the Apple Podcasts episode ID.',
    url,
    podcast:episode.collectionName||show.collectionName||'',
    episodeTitle:episode.trackName||'',
    description:cleanText(episode.description||episode.shortDescription||''),
    image:episode.artworkUrl600||episode.artworkUrl100||show.artworkUrl600||'',
    publishedDate:episode.releaseDate||'',
    durationMs:episode.trackTimeMillis||0
  };
}

function guestFromDescription(d=''){
  const s=String(d).trim();
  const comma=s.match(/^([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,4}),\s+/);
  if(comma) return comma[1].trim();
  const verb=s.match(/^([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,4})\s+(?:is|joins|joined|has been|was)\b/);
  return verb?.[1]?.trim()||'';
}

function guestRoleFromDescription(d='',guest=''){
  if(!guest) return '';
  const s=String(d);
  const esc=guest.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const comma=s.match(new RegExp(`^${esc},\\s+([^,.]+(?:,[^.]*)?)\\s*,?\\s+(?:joins|joined|is|was)\\b`,'i'));
  if(comma) return comma[1].trim();
  const isThe=s.match(new RegExp(`^${esc}\\s+is\\s+the\\s+([^,.]+(?:,[^.]*)?)`,'i'));
  return isThe?.[1]?.trim()||'';
}

function guestContextFromDescription(d=''){
  return String(d).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3).join(' ').slice(0,900);
}

const STOP=new Set(['the','and','that','with','from','this','will','what','when','who','why','are','for','into','about','your','their','they','have','has','was','were','but','not','you','its','how','can','should','would','could','our','out','all','episode','podcast','today','discuss']);
const GENERIC=new Set(['market','markets','stock','stocks','investor','investors','economy','economic','capital','money','business','venture','technology','tech','current','future','world']);
const SIGNAL=['billion','million','months','years','october','march','valuation','credit','debt','margin','profit','saas','cloud','model','security','china','microsoft','meta','apple','hyperscaler','neocloud','continuous','learning','open source','bubble','correction','gpu','compute','router','fireworks','baseten','private equity','demand','dislocation','treasur','markup','short','buy','hold','yield','deficit','breadth','rotation','immigration','labor','ipo','rebalanc'];

function words(s=''){
  return String(s).toLowerCase().replace(/[^a-z0-9%$ ]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!STOP.has(w));
}
function titleTokens(s=''){
  return [...new Set(words(s).filter(w=>!GENERIC.has(w)))].slice(0,35);
}
function overlapRatio(a,b){
  const A=new Set(titleTokens(a)),B=new Set(titleTokens(b));
  if(!A.size||!B.size) return 0;
  let common=0; for(const w of A) if(B.has(w)) common++;
  return common/Math.min(A.size,B.size);
}
function dateDiffDays(a,b){
  const A=Date.parse(a||''),B=Date.parse(b||'');
  if(!Number.isFinite(A)||!Number.isFinite(B)) return null;
  return Math.abs(A-B)/86400000;
}
function scoreSignal(s=''){
  const l=String(s).toLowerCase();
  return SIGNAL.reduce((n,k)=>n+(l.includes(k)?2:0),0)+(/\d/.test(s)?3:0)+(l.includes('$')||l.includes('%')?2:0);
}
function declarativeSentences(s=''){
  return String(s).replace(/^[-*#>\s]+/gm,'').replace(/\[(.*?)\]\([^)]*\)/g,'$1').split(/(?<=[.!?])\s+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length>=45&&x.length<=900&&!x.endsWith('?'));
}
function similarity(a,b){
  const A=new Set(words(a)),B=new Set(words(b));let n=0;for(const w of A)if(B.has(w))n++;return n;
}
function normalizeSearchResults(data){
  if(Array.isArray(data)) return data;
  for(const k of ['results','episodes','items','data']) if(Array.isArray(data?.[k])) return data[k];
  return [];
}
function candidateText(x){
  return [x?.title,x?.title_orig,x?.dek,x?.summary,x?.people,x?.show,x?.show_id,x?.tldr_md,x?.tldr,x?.digest_md,x?.digest].flat().filter(Boolean).join(' ');
}
function candidateDate(x){return x?.date||x?.published_at||x?.publishedAt||x?.release_date||x?.releaseDate||''}

async function findBidClubEpisode(source,guest){
  const queries=[guest,source.episodeTitle.split('|')[0].slice(0,120),`${source.podcast} ${guest}`].filter(Boolean);
  const raw=new Map();
  for(const q of queries){
    try{
      const data=await fetchJson(`https://bidclub.ai/api/v1/search?q=${encodeURIComponent(q)}`);
      for(const item of normalizeSearchResults(data)){
        const slug=item?.slug||item?.episode_slug||item?.id||'';
        if(slug&&!raw.has(slug)) raw.set(slug,item);
      }
    }catch(e){console.log('bidclub_search_error',q,e?.message||String(e))}
  }

  const evaluated=[];
  for(const [slug,item] of [...raw.entries()].slice(0,16)){
    let detail={};
    try{detail=await fetchJson(`https://bidclub.ai/api/v1/episodes/${encodeURIComponent(slug)}`)}catch{}
    const full={...item,...detail,slug};
    const hay=candidateText(full).toLowerCase();
    const guestMatch=guest?hay.includes(guest.toLowerCase()):false;
    const title=full?.title||full?.title_orig||'';
    const titleSim=overlapRatio(source.episodeTitle,title);
    const diff=dateDiffDays(source.publishedDate,candidateDate(full));
    const dateOk=diff==null?null:diff<=2;

    let valid=false;
    if(guest){
      valid=guestMatch && (dateOk!==false) && (titleSim>=0.18 || dateOk===true);
    }else{
      valid=(dateOk===true) && titleSim>=0.6;
    }
    const score=(guestMatch?100:0)+(dateOk===true?35:0)+Math.round(titleSim*50);
    evaluated.push({slug,title,guestMatch,titleSim:Number(titleSim.toFixed(2)),dateDiff:diff==null?null:Number(diff.toFixed(1)),valid,score,full});
  }

  evaluated.sort((a,b)=>b.score-a.score);
  console.log('bidclub_candidates',evaluated.slice(0,5).map(({slug,title,guestMatch,titleSim,dateDiff,valid,score})=>({slug,title,guestMatch,titleSim,dateDiff,valid,score})));
  const best=evaluated.find(x=>x.valid);
  if(!best){console.log('bidclub_no_verified_match',{guest,title:source.episodeTitle,date:source.publishedDate});return null}
  console.log('bidclub_verified_match',{slug:best.slug,guest,title:best.title,titleSim:best.titleSim,dateDiff:best.dateDiff});
  return best.full;
}

function markdownSections(md=''){
  const lines=String(md).split(/\r?\n/),sections=[];let title='',body=[];
  const flush=()=>{const text=body.join(' ').replace(/\s+/g,' ').trim();if(text)sections.push({title,text});body=[]};
  for(const line of lines){const h=line.match(/^#{1,4}\s+(.+)/);if(h){flush();title=h[1].trim();continue}const b=line.match(/^\s*[-*]\s+(.+)/);if(b){body.push(b[1].trim());continue}if(line.trim())body.push(line.trim())}
  flush();return sections;
}

function buildDeepTakeaways(episode){
  const tldr=String(episode?.tldr_md||episode?.tldr||''),digest=String(episode?.digest_md||episode?.digest||''),transcript=String(episode?.transcript_md||episode?.transcript||'');
  const candidates=[];
  const sections=[...markdownSections(tldr),...markdownSections(digest)];
  for(const sec of sections){const ss=declarativeSentences(sec.text);if(ss.length>=3){const text=ss.slice(0,5).join(' ');candidates.push({text,score:scoreSignal(text)+(sec.title?2:0)})}}
  const pool=declarativeSentences(transcript).filter(s=>scoreSignal(s)>=2).slice(0,900);
  for(const sec of sections){const base=declarativeSentences(sec.text);if(!base.length||base.length>=3)continue;const seed=base.join(' ');const related=pool.map(s=>({s,rel:similarity(seed,s),score:scoreSignal(s)})).filter(x=>x.rel>=2).sort((a,b)=>(b.rel*5+b.score)-(a.rel*5+a.score));const combo=[...base];for(const x of related){if(!combo.includes(x.s))combo.push(x.s);if(combo.length>=4)break}if(combo.length>=3){const text=combo.slice(0,5).join(' ');candidates.push({text,score:scoreSignal(text)+3})}}
  candidates.sort((a,b)=>b.score-a.score);const out=[];
  for(const c of candidates){if(c.text.length<240)continue;if(out.some(prev=>similarity(prev,c.text)>=14))continue;out.push(c.text);if(out.length===5)break}
  return out;
}

function bottomLine(insights=[]){const first=declarativeSentences(insights[0]||'')[0]||insights[0]||'';return first.length>340?first.slice(0,337)+'…':first}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const url=String(req.body?.url||'').trim();
  if(!/^https?:\/\//i.test(url)) return res.status(400).json({error:'Paste a valid episode link.'});
  try{
    const source=appleIds(url)?await resolveApple(url):null;
    if(!source) throw new Error('For now, paste an Apple Podcasts episode link.');
    const guest=guestFromDescription(source.description),role=guestRoleFromDescription(source.description,guest);
    const bidclub=await findBidClubEpisode(source,guest);
    const insights=bidclub?buildDeepTakeaways(bidclub):[];
    console.log('podcast_result_v2',{guest,bidclubSlug:bidclub?.slug||'',insightCount:insights.length});
    return res.status(200).json({
      verified:source.verified,verificationNote:source.verificationNote,url:source.url,podcast:source.podcast,episodeTitle:source.episodeTitle,
      guest,guestRole:role,guestContext:guestContextFromDescription(source.description),whyGuestMatters:role?`A senior ${role} offering firsthand perspective on the markets and companies discussed.`:'',otherGuests:[],
      investorInsights:insights,oneLine:bottomLine(insights),description:source.description,image:source.image,publishedDate:source.publishedDate,durationMs:source.durationMs,
      transcriptFound:Boolean(bidclub?.transcript_md||bidclub?.transcript),transcriptUrl:bidclub?.slug?`https://bidclub.ai/e/${bidclub.slug}`:'',summaryBasis:bidclub?'Verified BidClub TLDR/digest/transcript':'description',insightSource:bidclub?'BidClub API · guest/date/title verified':'',insightsAvailable:insights.length>0,insightFormat:'3-5 core takeaways, minimum 3 sentences each'
    });
  }catch(e){console.error('podcast_handler_error_v2',e?.message||String(e));return res.status(500).json({error:e?.message||'Could not analyze this episode link.'})}
}
