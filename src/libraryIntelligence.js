const STOP=new Set('the and for with from that this have what when where into about your their they them was were has had who why how can could would should are its our not but all any more less than then over under between after before onto did does said says say'.split(' '));
export const tokenize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>2&&!STOP.has(x));
export const sourceLabel=r=>r.transcriptFound?'Transcript supported':/show notes|publisher/i.test([r.summaryBasis,r.insightSource].join(' '))?'Publisher notes':r.url?'Saved note + link':'Saved note only';
export function topicAtlas(records){
 const counts=new Map();
 records.forEach(r=>{const topics=(r.topics||[]).length?r.topics:[];topics.forEach(t=>{const v=String(t).trim();if(v)counts.set(v,(counts.get(v)||0)+1)})});
 return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([name,count])=>({name,count}));
}
export function relatedEpisodes(target,records,max=4){
 const seed=new Set(tokenize([target.episodeTitle,target.guest,(target.topics||[]).join(' '),target.takeaway1].join(' ')));
 return records.filter(r=>r!==target).map(r=>({record:r,score:tokenize([r.episodeTitle,r.guest,(r.topics||[]).join(' '),r.takeaway1].join(' ')).filter(t=>seed.has(t)).length})).filter(r=>r.score>=2).sort((a,b)=>b.score-a.score).slice(0,max).map(r=>r.record);
}
export function toMarkdown(records,query){
 const lines=['# Knowledge Vault — '+(query||'Archive'),'','Source-linked listening notes','',''];
 records.forEach(r=>{lines.push('## '+(r.episodeTitle||'Untitled'),'**Show:** '+(r.podcast||'Unknown')+' · **Guest:** '+(r.guest||'Unknown')+' · **Logged:** '+r.date,'**Source quality:** '+sourceLabel(r));if(r.url)lines.push('**Episode:** '+r.url);for(const insight of [r.takeaway1,r.takeaway2,...(r.investorInsights||[])].filter(Boolean))lines.push('- '+insight);lines.push('')});return lines.join('\n');
}
