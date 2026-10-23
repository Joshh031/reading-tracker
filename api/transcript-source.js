// Finds canonical RSS transcript or audio sources for an exact Apple episode.
// Does not download audio, transcribe it, or claim transcript verification.
const xmlText=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g,' ').trim();
const attr=(tag,name)=>(tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\\']([^"\\']+)["\\']','i'))||[])[1]||'';
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!/(^localhost$|\.local$|^127\.|^10\.|^192\.168\.|^169\.254\.)/.test(u.hostname)&&!u.hostname.includes(':')?u.toString():null}catch{return null}};
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(8500)});if(!r.ok)throw Error('Apple lookup unavailable');return r.json()}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 try{
 const u=new URL(String(req.body?.url||''));if(u.hostname!=='podcasts.apple.com')return res.status(400).json({error:'Apple Podcasts link required'});
 const showId=(u.pathname.match(/id(\d+)/)||[])[1],episodeId=u.searchParams.get('i');if(!showId||!episodeId)return res.status(400).json({error:'Episode and show IDs required'});
 const [show,episode]=await Promise.all([json('https://itunes.apple.com/lookup?id='+showId+'&country=US'),json('https://itunes.apple.com/lookup?id='+episodeId+'&country=US')]);
 const meta=(episode.results||[]).find(x=>String(x.trackId)===episodeId&&x.kind==='podcast-episode');
 const collection=(show.results||[]).find(x=>String(x.collectionId)===showId);
 if(!meta||!collection) return res.status(404).json({status:'identity_unresolved',episodeId,showId});
 if(meta.collectionId&&String(meta.collectionId)!==showId)return res.status(409).json({error:'Episode/show mismatch'});
 const feedUrl=safeUrl(collection.feedUrl);if(!feedUrl)return res.status(200).json({status:'feed_unavailable',episodeId,title:meta.trackName});
 const feedResponse=await fetch(feedUrl,{signal:AbortSignal.timeout(11000),headers:{accept:'application/rss+xml,application/xml,text/xml'}});
 if(!feedResponse.ok)return res.status(200).json({status:'feed_unavailable',title:meta.trackName,episodeId});
 const xml=(await feedResponse.text()).slice(0,6000000);
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(x=>x[1]);
 const norm=s=>xmlText(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const title=norm(meta.trackName);const matched=items.filter(item=>{const t=(item.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)||[])[1]||'';return norm(t)===title});
 if(matched.length!==1)return res.status(200).json({status:'rss_episode_unmatched',title:meta.trackName,episodeId,matchingItems:matched.length});
 const item=matched[0];
 const transcriptTags=[...item.matchAll(/<(?:podcast:transcript|transcript)\b[^>]*>/gi)].map(m=>m[0]);
 const transcriptUrls=transcriptTags.map(t=>({url:safeUrl(attr(t,'url')),type:attr(t,'type')})).filter(x=>x.url);
 const enclosure=(item.match(/<enclosure\b[^>]*>/i)||[])[0]||'';
 const audioUrl=safeUrl(attr(enclosure,'url'));
 return res.status(200).json({status:transcriptUrls.length?'transcript_url_available':audioUrl?'audio_available_for_transcription':'no_source',episodeId,title:meta.trackName,publishedDate:meta.releaseDate||'',transcriptUrls,audioUrl,matchedBy:'exact Apple ID + exact RSS title',note:'Audio is not transcribed; third-party transcription requires permitted audio access and credentials.'});
 }catch(e){return res.status(422).json({status:'resolution_error',error:String(e?.message||e)})}
}
