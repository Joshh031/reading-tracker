import { generateText } from 'ai';

function cleanText(s='') {
  return s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}
function meta(html,key){
  const ps=[new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i'),new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["'][^>]*>`,'i'),new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i')];
  for(const p of ps){const m=html.match(p);if(m?.[1])return cleanText(m[1])}return '';
}
function findTranscriptUrl(html,baseUrl){
  for(const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const label=cleanText(m[2]).toLowerCase(),href=m[1];
    if(label.includes('transcript')||href.toLowerCase().includes('transcript')){try{return new URL(href,baseUrl).href}catch{}}
  }return '';
}
async function fetchText(url){
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; ReadingLog/1.1)','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}});
  if(!r.ok)throw new Error(`Could not fetch episode page (${r.status})`);
  return{text:await r.text(),finalUrl:r.url||url};
}
function guessPodcastAndEpisode(title=''){
  const parts=title.split(/\s+[|–—-]\s+/).map(s=>s.trim()).filter(Boolean);
  return parts.length>=2?{episodeTitle:parts[0],podcast:parts[parts.length-1]}:{episodeTitle:title,podcast:''};
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const url=String(req.body?.url||'').trim();
  if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Paste a valid episode link.'});
  try{
    const page=await fetchText(url),html=page.text;
    const ogTitle=meta(html,'og:title')||meta(html,'twitter:title')||cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
    const description=meta(html,'og:description')||meta(html,'description')||meta(html,'twitter:description');
    const image=meta(html,'og:image')||meta(html,'twitter:image');
    const guessed=guessPodcastAndEpisode(ogTitle);
    let transcriptUrl=findTranscriptUrl(html,page.finalUrl),transcript='';
    if(transcriptUrl){try{const t=await fetchText(transcriptUrl);transcript=cleanText(t.text).slice(0,120000);if(transcript.length<500)transcript=''}catch{transcript=''}}
    const sourceText=transcript||description;
    let ai=null;
    if(sourceText&&sourceText.length>80){
      try{
        const {text}=await generateText({model:'openai/gpt-5.4-mini',prompt:`You are building a private podcast intelligence log for an investment professional who wants differentiated discussion points to bring to portfolio managers. The unit of value is the GUEST, not the host or the episode title.\n\nExact episode page title: ${ogTitle}\nExact episode page description: ${description}\nEvidence basis: ${transcript?'full/partial transcript':'episode description only'}\nEvidence text:\n${sourceText.slice(0,100000)}\n\nFirst verify that the supplied material describes this exact episode. Then identify the primary guest or guests. Distinguish guests from the host. Prioritize the senior expert whose views are the reason to listen.\n\nExtract only claims supported by the supplied evidence. Never infer a person's views from an agenda question alone. If the description merely asks a question and the answer is not present, do not turn the question into a claimed view. If the exact episode or guest cannot be verified, set verified=false and explain why in verificationNote.\n\nThe investorInsights should be 4-6 PM-worthy points stated crisply. Prefer: concrete forecasts and timing calls; variant views; market structure; valuations; capital allocation; company/subsector views; second-order effects; useful numbers, thresholds and time horizons. Avoid generic topic summaries. Every bullet should answer: what did this guest actually say that is worth repeating to a PM?\n\nReturn ONLY valid JSON:\n{\n  "verified":true,\n  "verificationNote":"short note",\n  "podcast":"show name",\n  "episodeTitle":"exact episode title without show name",\n  "guest":"primary guest name",\n  "otherGuests":["other meaningful guests, excluding host"],\n  "guestRole":"title and firm/organization, only if supported",\n  "guestContext":"1-2 sentences on why this guest is worth listening to, using only supported credentials",\n  "whyGuestMatters":"one concise investor-relevance sentence",\n  "investorInsights":["4-6 specific guest-derived PM-worthy insights"],\n  "oneLine":"one-sentence bottom line on the guest's most important market view"\n}`});
        ai=JSON.parse(text.replace(/```json|```/g,'').trim());
      }catch{}
    }
    return res.status(200).json({
      url:page.finalUrl,podcast:ai?.podcast||guessed.podcast,episodeTitle:ai?.episodeTitle||guessed.episodeTitle,
      guest:ai?.guest||'',otherGuests:Array.isArray(ai?.otherGuests)?ai.otherGuests:[],guestRole:ai?.guestRole||'',guestContext:ai?.guestContext||'',whyGuestMatters:ai?.whyGuestMatters||'',
      investorInsights:Array.isArray(ai?.investorInsights)?ai.investorInsights.slice(0,6):[],oneLine:ai?.oneLine||'',verified:ai?.verified===true,verificationNote:ai?.verificationNote||'',
      description,image,transcriptFound:Boolean(transcript),transcriptUrl:transcriptUrl||'',summaryBasis:transcript?'transcript':(description?'description':'metadata')
    });
  }catch(e){return res.status(500).json({error:e?.message||'Could not analyze this episode link.'})}
}
