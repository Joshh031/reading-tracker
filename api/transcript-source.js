// Server-side transcript discovery for one exact Apple Podcasts episode.
// No guessed guest, no transcript claim without fetched text, no full-text redistribution.
const clean=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const attribute=(tag,name)=>{const match=tag.match(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)||[];for(const item of match){const bits=item.trim().match(/^([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')$/);if(bits&&bits[1].toLowerCase()===name.toLowerCase())return clean(bits[2]??bits[3]);}return '';};
const allowedUrl=value=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const host=u.hostname.toLowerCase();if(!host.includes('.')||/^(localhost|.*\.localhost|.*\.local)$/.test(host)||/^(10|127|0|169\.254|192\.168)\./.test(host)||host.includes(':'))return null;return u.toString()}catch{return null}};
const normalize=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function readJson(url){const r=await fetch(url,{signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('Apple metadata request failed');return r.json();}
async function limitedText(url,limit=4500000){const r=await fetch(url,{signal:AbortSignal.timeout(11000),redirect:'error'});if(!r.ok)throw Error('Source response unavailable');const declared=Number(r.headers.get('content-length')||0);if(declared>limit)throw Error('Source too large');const text=await r.text();if(text.length>limit)throw Error('Source too large');return text;}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 try{
  const link=new URL(String(req.body?.url||''));if(link.hostname!=='podcasts.apple.com')return res.status(400).json({error:'Apple Podcasts episode URL required'});
  const showId=(link.pathname.match(/id(\d+)/)||[])[1],episodeId=link.searchParams.get('i');
  if(!showId||!/^\d+$/.test(episodeId||''))return res.status(400).json({error:'Show and episode IDs required'});
  const [showData,episodeData]=await Promise.all([readJson('https://itunes.apple.com/lookup?id='+showId+'&country=US'),readJson('https://itunes.apple.com/lookup?id='+episodeId+'&country=US')]);
  const show=(showData.results||[]).find(x=>String(x.collectionId)===showId);
  const episode=(episodeData.results||[]).find(x=>String(x.trackId)===episodeId&&x.kind==='podcast-episode');
  if(!show||!episode)return res.status(200).json({status:'identity_unresolved',episodeId});
  if(episode.collectionId&&String(episode.collectionId)!==showId)return res.status(409).json({error:'Episode/show ID mismatch'});
  const base={episodeId,title:episode.trackName,podcast:episode.collectionName||show.collectionName,publishedDate:episode.releaseDate||'',matchedBy:'Apple exact episode ID'};
  const feed=allowedUrl(show.feedUrl);
  if(!feed)return res.status(200).json({...base,status:'rss_feed_unavailable'});
  let xml;try{xml=await limitedText(feed)}catch{return res.status(200).json({...base,status:'rss_feed_unavailable'});}
  const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  const target=normalize(episode.trackName);
  const matching=items.filter(item=>{const tag=(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';return normalize(tag)===target});
  if(matching.length!==1)return res.status(200).json({...base,status:'rss_episode_unmatched',matchingItems:matching.length});
  const item=matching[0];
  const sources=[...item.matchAll(/<(?:podcast:transcript|transcript)\b[^>]*\/?\s*>/gi)].map(m=>({url:allowedUrl(attribute(m[0],'url')),type:attribute(m[0],'type')})).filter(x=>x.url);
  const enclosure=(item.match(/<enclosure\b[^>]*\/?\s*>/i)||[])[0]||'';
  const audioUrl=allowedUrl(attribute(enclosure,'url'));
  let preview=null;
  for(const source of sources.slice(0,2)){
   try{
    const raw=await limitedText(source.url,1500000);
    let body=raw;
    if(/json/.test(source.type)){const parsed=JSON.parse(raw);const segments=Array.isArray(parsed)?parsed:(parsed.segments||parsed.transcript||[]);body=Array.isArray(segments)?segments.map(x=>typeof x==='string'?x:(x.text||x.content||'')).join(' '):'';}
    body=body.replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    const words=body.split(/\s+/).filter(Boolean);
    if(words.length>100){preview={wordCount:words.length,excerpt:words.slice(0,140).join(' '),sourceUrl:source.url};break;}
   }catch{}
  }
  return res.status(200).json({...base,status:preview?'transcript_verified':sources.length?'transcript_link_found':audioUrl?'audio_available_for_transcription':'no_source',transcriptUrls:sources,transcriptPreview:preview,audioAvailable:Boolean(audioUrl),note:'Apple in-app transcript text is not exposed by this endpoint. No audio was transcribed.'});
 }catch(err){return res.status(422).json({status:'resolution_error',error:String(err?.message||err)})}
}
