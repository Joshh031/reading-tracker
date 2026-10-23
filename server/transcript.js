import * as cheerio from 'cheerio';
import { clean,array,digest,normalize } from './identity.js';
import { readSource } from './net.js';
import { VaultError } from './errors.js';
const seconds=v=>{if(v==null||v==='')return null;if(typeof v==='number')return v;const p=String(v).replace(',','.').split(':').map(Number);return p.every(Number.isFinite)?p.reduce((s,x)=>s*60+x,0):null;};
export function parseTranscript(raw,type='') {
  let segments=[];
  if(/json/i.test(type)||/^\s*[\[{]/.test(raw)) {
    const parsed=JSON.parse(raw);
    // Publisher-hosted Deepgram exports (also used by PodcastAI portals).
    const alternative=parsed.results?.channels?.[0]?.alternatives?.[0];
    const deepgram=alternative?.paragraphs?.paragraphs?.map(p=>({text:(p.sentences||[]).map(s=>s.text).join(' '),speaker:p.speaker==null?null:`Speaker ${p.speaker}`,start:p.start,end:p.end}));
    const parts=array(Array.isArray(parsed)?parsed:parsed.segments||parsed.utterances||deepgram||parsed.transcript);
    segments=parts.map(s=>typeof s==='string'?{text:s}:{text:s.text||s.body||s.content||'',speaker:s.speaker||s.speaker_name||null,start:seconds(s.startTime??s.start),end:seconds(s.endTime??s.end)});
  } else if(/-->/m.test(raw)) {
    for(const block of raw.replace(/\r/g,'').split(/\n\s*\n/)) {
      const lines=block.split('\n'),index=lines.findIndex(x=>x.includes('-->'));if(index<0)continue;
      const [start,end]=lines[index].split('-->').map(x=>seconds(x.trim().split(/\s/)[0]));
      const body=lines.slice(index+1).join(' '),speaker=body.match(/<v\s+([^>]+)>/)?.[1]||body.match(/^([^:<>]{2,45}):\s/)?.[1]||null;
      segments.push({text:clean(body.replace(/<v\s+[^>]+>/g,'')),start,end,speaker});
    }
  } else {
    segments=raw.split(/\n+/).map(line=>{const m=line.trim().match(/^(?:\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)\]?\s*)?(?:([A-Za-z][\w .’'-]{1,50}):\s*)?([\s\S]+)$/);return m?{start:seconds(m[1]),end:null,speaker:m[2]||null,text:clean(m[3])}:null;}).filter(Boolean);
  }
  // Split long plain paragraphs so references and embeddings have useful granularity.
  segments=segments.filter(s=>s.text?.trim()).flatMap(s=>{const parts=s.text.match(/[\s\S]{1,1600}(?:\s|$)/g)||[s.text];return parts.map(text=>({...s,text:text.trim()}));});
  return segments.map((s,i)=>({id:'s'+(i+1),text:s.text,start:s.start??null,end:s.end??null,speaker:s.speaker?String(s.speaker):null}));
}
export function transcriptRecord(segments,episode,source) {
  const text=segments.map(s=>s.text).join('\n'),wordCount=text.split(/\s+/).filter(Boolean).length;
  if(wordCount<200)throw new VaultError('TRANSCRIPT_TOO_SHORT','Source contains fewer than 200 words; it cannot support a full review.');
  const timed=segments.filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start).sort((a,b)=>a.start-b.start);let covered=0,last=0;for(const segment of timed){covered+=Math.max(0,segment.end-Math.max(last,segment.start));last=Math.max(last,segment.end);}
  const expected=episode.durationSeconds||0;
  const coverage=expected?(timed.length?Math.min(1,covered/expected):Math.min(1,wordCount/(expected/60*90))):null;
  return {version:1,segments,wordCount,hash:digest(text),source:{...source,retrievedAt:new Date().toISOString()},coverage,completeness:coverage==null?'unknown':coverage>=.75?'likely_complete':'partial',episodeId:episode.episodeId};
}
export function embeddedTranscriptSources(html,episode) {
  const $=cheerio.load(html),found=[];
  $('script[type="application/json"],script[type="application/ld+json"]').each((_,el)=>{
    let data;try{data=JSON.parse($(el).text());}catch{return;}
    const flat=Array.isArray(data)&&$(el).attr('id')==='__NUXT_DATA__';
    const deref=v=>flat&&Number.isInteger(v)&&v>=0?data[v]:v;
    const objects=flat?data:[data];
    for(const item of objects){if(!item||typeof item!=='object'||Array.isArray(item))continue;
      const url=deref(item.transcriptURL||item.transcriptUrl||item.transcript_url);
      const title=deref(item.title||item.name),apple=deref(item.appleEpisodeID||item.appleEpisodeId),publishedAt=deref(item.publishedAt||item.datePublished);
      if(typeof url!=='string'||!/^https:\/\//.test(url))continue;
      let exact=String(apple)===episode.episodeId;try{exact=exact||new URL(String(apple)).searchParams.get('i')===episode.episodeId;}catch{}
      if(apple&&!exact)continue;
      if(!exact&&!(normalize(title)===normalize(episode.title)&&Math.abs(Date.parse(publishedAt)-Date.parse(episode.publishedAt))<=36*3600_000))continue;
      const speakers=array(deref(item.speakers)).map(ref=>{const s=deref(ref);return s?{name:deref(s.name),order:deref(s.order),role:deref(s.host)?'host':'guest'}:null;}).filter(s=>s&&typeof s.name==='string'&&Number.isInteger(s.order));
      found.push({url,type:'application/json',speakers});
    }
  });return found;
}
function publisherTranscript(html) {
  const $=cheerio.load(html);$('script,style,nav,footer,header').remove();
  const explicit=$('[itemprop="transcript"],#transcript,.transcript,.podcast-transcript,[data-testid="transcript"]').first();
  if(explicit.length){explicit.find('br').replaceWith('\n');explicit.find('p').append('\n');return explicit.text();}
  const heading=$('h1,h2,h3,h4,strong,b').filter((_,el)=>/^((full|episode)\s+)?transcript\s*:?.*$/i.test($(el).text().trim())).first();
  if(!heading.length)return '';
  const container=heading.is('strong,b')?heading.parent():heading;
  const parts=[];let node=container.next();
  while(node.length&&!node.is('footer,nav,h1,h2')) {parts.push(node.text());node=node.next();}
  return parts.join('\n');
}
export async function discoverTranscript(episode,io={readSource}) {
  const attempts=[];
  for(const source of (episode.transcriptSources||[]).slice(0,5)) {
    try { const r=await io.readSource(source.url,{maxBytes:3_000_000});const segments=parseTranscript(r.text,source.type);return {transcript:transcriptRecord(segments,episode,{url:r.url,kind:'publisher_rss',quality:'publisher transcript',identityBasis:episode.identityBasis}),attempts}; }
    catch(e){attempts.push({stage:'rss_transcript',url:source.url,code:e.code||'SOURCE_FAILED'});}
  }
  const $desc=cheerio.load(episode.descriptionHtml||'');
  const links=$desc('a[href]').map((_,el)=>({url:$desc(el).attr('href'),text:$desc(el).text(),context:$desc(el).parent().text()})).get();
  const pages=[...links.filter(x=>/transcript|show notes/i.test(x.context+' '+x.url)).map(x=>x.url),episode.publisherUrl,episode.showWebsite,...links.filter(x=>/podcast|network/i.test(x.context)).map(x=>x.url)].filter(x=>/^https:\/\//.test(x||''));
  const visited=new Set();
  for(let pageIndex=0;pageIndex<pages.length&&visited.size<8;pageIndex++) {
    const url=pages[pageIndex];if(visited.has(url))continue;visited.add(url);
    try {
      const r=await io.readSource(url,{maxBytes:4_000_000}),$=cheerio.load(r.text);
      // A feed-linked exact episode page is provenance. A homepage is never accepted.
      const pageTitle=normalize($('h1').first().text()||$('title').text());
      const episodeWords=normalize(episode.title).split(' ').filter(t=>t.length>3);
      const matched=episodeWords.filter(t=>pageTitle.includes(t)).length/Math.max(1,episodeWords.length);
      const pageAppleLinks=$('a[href]').map((_,el)=>$(el).attr('href')).get().filter(h=>h.includes('podcasts.apple.com')&&h.includes('i='));
      const pageIds=[...new Set(pageAppleLinks.map(h=>{try{return new URL(h).searchParams.get('i')}catch{return null}}).filter(Boolean))];
      const exactLink=pageIds.length===1&&pageIds[0]===episode.episodeId;
      const embedded=embeddedTranscriptSources(r.text,episode);
      const published=$('meta[property="article:published_time"],meta[itemprop="datePublished"]').attr('content')||$('time[datetime]').first().attr('datetime');
      const dateConflict=published&&Math.abs(Date.parse(published)-Date.parse(episode.publishedAt))>36*3600_000;
      const strongTitle=matched>=.9&&!dateConflict&&pageIds.length<=1&&(!pageIds.length||exactLink);
      if(!exactLink&&!embedded.length&&!strongTitle){
        // Publisher index -> exact episode, bounded to links already on that page.
        const candidates=$('a[href]').map((_,el)=>({url:$(el).attr('href'),text:normalize($(el).text())})).get().filter(x=>episodeWords.filter(t=>x.text.includes(t)).length/Math.max(1,episodeWords.length)>.65).slice(0,3);
        for(const c of candidates){const next=new URL(c.url,r.url);if(next.protocol==='https:'&&next.hostname===new URL(r.url).hostname)pages.push(next.href);}
        throw new VaultError('PUBLISHER_IDENTITY_MISMATCH','Publisher page does not identify the exact episode.');
      }
      for(const source of embedded){
        const body=await io.readSource(source.url,{maxBytes:6_000_000});
        const segments=parseTranscript(body.text,source.type).map(segment=>{const order=Number(segment.speaker?.match(/^Speaker (\d+)$/)?.[1]),speaker=source.speakers.find(s=>s.order===order);return speaker?{...segment,speaker:speaker.name,speakerRole:speaker.role}:segment;});
        return {transcript:transcriptRecord(segments,episode,{url:body.url,kind:'publisher_embedded',quality:source.speakers.length?'publisher-hosted machine transcript with publisher speaker mapping':'publisher-hosted machine transcript; speaker IDs unverified',identityBasis:'Verified publisher page + episode-matched embedded transcript URL'}),attempts};
      }
      const transcriptText=publisherTranscript(r.text);
      if(transcriptText){return {transcript:transcriptRecord(parseTranscript(transcriptText),episode,{url:r.url,kind:'publisher_page',quality:'publisher transcript',identityBasis:exactLink?'Publisher exact Apple episode link':'RSS-linked episode page + title agreement'}),attempts};}
      const download=$('a[href]').map((_,el)=>({url:new URL($(el).attr('href'),r.url).href,text:$(el).text()})).get().filter(x=>/transcript/i.test(x.text)||/\.(vtt|srt|txt)(\?|$)/i.test(x.url)).slice(0,3);
      for(const d of download){const body=await io.readSource(d.url,{maxBytes:3_000_000});if(/html/i.test(body.headers?.['content-type']||''))continue;return {transcript:transcriptRecord(parseTranscript(body.text),episode,{url:body.url,kind:'publisher_download',quality:'publisher transcript',identityBasis:'Transcript linked from verified episode page'}),attempts};}
      attempts.push({stage:'publisher',url:r.url,code:'NO_TRANSCRIPT_ON_PAGE'});
    }catch(e){attempts.push({stage:'publisher',url,code:e.code||'SOURCE_FAILED'});}
  }
  return {transcript:null,attempts};
}
