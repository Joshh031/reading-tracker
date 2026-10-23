// Evidence-led comparative brief. No claim is invented: every item carries a saved note and episode.
const POS=/\b(bullish|buy|upside|benefit|opportunity|tailwind|underestimated|durable growth|accelerating demand)\b/i;
const NEG=/\b(bearish|sell|downside|risk|overvalued|bubble|unsustainable|headwind|overhyped|skeptical|skeptic)\b/i;
const STORY=/\b(anecdote|story|remember|recalled|firsthand|in my experience|for example|case study)\b/i;
const NOTABLE=/\b(\d+(?:\.\d+)?%|\$\d+|million|billion|trillion|counterintuitive|surprising|underestimated|firsthand)\b/i;
export function buildEvidenceBrief(query,episodes){
 const terms=String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
 const scored=episodes.map((episode,i)=>{
   const texts=[episode.takeaway1,episode.takeaway2,...(episode.investorInsights||[])].filter(Boolean);
   const hits=texts.filter(text=>terms.some(t=>text.toLowerCase().includes(t)));
   const meta=[episode.podcast,episode.episodeTitle,episode.guest,(episode.topics||[]).join(' ')].join(' ').toLowerCase();
   return {episode,index:i,hits:hits.length?hits:(terms.some(t=>meta.includes(t))?texts:[]),score:hits.length*3+terms.filter(t=>meta.includes(t)).length};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,50);
 const claims=scored.flatMap(({episode,hits})=>hits.map(text=>{
   const positive=POS.test(text),negative=NEG.test(text);
   return {text,guest:episode.guest||'Guest not recorded',show:episode.podcast||'Unknown show',title:episode.episodeTitle||'Untitled episode',url:episode.url||'',date:episode.date||'',label:positive&&!negative?'Constructive language':negative&&!positive?'Cautionary language':positive&&negative?'Mixed language':'Position not established',anecdote:STORY.test(text),notable:NOTABLE.test(text),basis:episode.summaryBasis||episode.insightSource||'Saved note; transcript verification unavailable'};
 }));
 const groups=Object.fromEntries(['Constructive language','Cautionary language','Mixed language','Position not established'].map(name=>[name,claims.filter(x=>x.label===name)]));
 const guests=[...new Set(claims.map(x=>x.guest).filter(x=>x!=='Guest not recorded'))];
 return {query,groups,claims,guests,episodes:scored.length,anecdotes:claims.filter(x=>x.anecdote),shareable:claims.filter(x=>x.notable)};
}
export function formatBrief(brief){
 const lines=['KNOWLEDGE VAULT — '+brief.query.toUpperCase(),brief.episodes+' source episodes; '+brief.guests.length+' named guests','', 'Classification is text-based, not a verified assessment of the guest.'];
 for(const [category,items] of Object.entries(brief.groups)){
 lines.push('',category.toUpperCase());if(!items.length)lines.push('No evidence in saved notes.');
 for(const item of items)lines.push('- '+item.guest+' ('+item.show+', '+item.date+'): '+item.text+'\n  '+(item.url||'No episode URL saved'));
 }
 return lines.join('\n');
}
