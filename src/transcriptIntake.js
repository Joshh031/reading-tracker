// Deterministic transcript intake, deliberately not represented as AI analysis.
// Stores only selected evidence snippets, not large copyrighted transcripts.
const STOP=new Set(['this','that','with','from','have','were','they','their','there','which','about','into','when','what','where','would','could','should','will','just','your','than','then','them','been','also','said','says']);
export function transcriptPreview(raw,topic=''){
 const text=String(raw||'').replace(/\r/g,'').trim();
 if(text.length<250)return {status:'too_short',lines:[],wordCount:text.split(/\s+/).filter(Boolean).length};
 const lines=text.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>60).slice(0,2000);
 const words=text.split(/\s+/).filter(Boolean);
 const topicWords=topic.toLowerCase().split(/\W+/).filter(x=>x.length>3);
 const scored=lines.map((line,index)=>{
   const numerical=/\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|trillion|basis points)\b/i.test(line);
   const score=topicWords.filter(t=>line.toLowerCase().includes(t)).length*5+(numerical?3:0)+(/\b(because|however|but|therefore|for example|the reason|in my view)\b/i.test(line)?2:0);
   return {line,index,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,6).sort((a,b)=>a.index-b.index);
 const keywords=new Map();for(const x of words){const k=x.toLowerCase().replace(/[^a-z]/g,'');if(k.length<5||STOP.has(k))continue;keywords.set(k,(keywords.get(k)||0)+1)}
 return {status:'ready',wordCount:words.length,lines:scored.map(x=>x.line.slice(0,420)),keywords:[...keywords].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0])};
}
