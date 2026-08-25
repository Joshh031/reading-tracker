import { useEffect, useState } from 'react';
import QuickAppV7 from './QuickAppV7.jsx';
import { loadCloudState, saveCloudState } from './firebase';

const ENTRIES_KEY='rt_entries';
const readEntries=()=>{try{return JSON.parse(localStorage.getItem(ENTRIES_KEY)||'{}')||{}}catch{return {}}};
const writeEntries=v=>{try{localStorage.setItem(ENTRIES_KEY,JSON.stringify(v))}catch{}};

function podcastKey(p={}){
  try{const u=new URL(p.url||'');const id=u.searchParams.get('i');if(id)return `apple:${id}`}catch{}
  return `${(p.podcast||'').toLowerCase()}|${(p.episodeTitle||'').toLowerCase()}|${(p.guest||'').toLowerCase()}`;
}
function mergePodcast(a={},b={}){
  const aInsights=Array.isArray(a.investorInsights)?a.investorInsights:[];
  const bInsights=Array.isArray(b.investorInsights)?b.investorInsights:[];
  const richer=bInsights.length>aInsights.length?b:a;
  const other=richer===a?b:a;
  return {
    ...other,...richer,
    id:a.id||b.id||String(Date.now()),
    investorInsights:richer.investorInsights||other.investorInsights||[],
    takeaway:a.takeaway||b.takeaway||'',
    review:a.review==='accepted'||b.review==='accepted'?'accepted':(a.review||b.review||'pending'),
    reviewNote:a.reviewNote||b.reviewNote||''
  };
}
function mergePodcasts(...lists){
  const m=new Map();
  for(const list of lists)for(const p of (Array.isArray(list)?list:[])){
    const k=podcastKey(p);m.set(k,m.has(k)?mergePodcast(m.get(k),p):p);
  }
  return [...m.values()];
}
function mergeDay(a={},b={}){
  return {
    ...a,...b,
    readingMinutes:Math.max(Number(a.readingMinutes||0),Number(b.readingMinutes||0)),
    arabicStudied:Boolean(a.arabicStudied||b.arabicStudied),
    geoRead:Boolean(a.geoRead||b.geoRead),
    dailyTakeaway:a.dailyTakeaway||b.dailyTakeaway||'',
    podcastEntries:mergePodcasts(a.podcastEntries,b.podcastEntries)
  };
}
function mergeEntries(...sources){
  const out={};
  for(const src of sources)for(const [date,day] of Object.entries(src||{}))out[date]=out[date]?mergeDay(out[date],day):mergeDay({},day);
  return out;
}
function podcastCount(entries={}){
  return Object.values(entries).reduce((n,d)=>n+(Array.isArray(d?.podcastEntries)?d.podcastEntries.length:0),0);
}
function decodeBackup(code){
  const raw=atob(code.trim());
  const text=decodeURIComponent(Array.from(raw).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
  return JSON.parse(text);
}

export default function QuickAppV8(){
  const recoveryMode=new URLSearchParams(window.location.search).get('recover')==='1';
  const [ready,setReady]=useState(false),[code,setCode]=useState(''),[status,setStatus]=useState('');

  useEffect(()=>{(async()=>{
    const local=readEntries();
    try{
      const cloud=await loadCloudState();
      const merged=mergeEntries(local,cloud?.entries||{});
      writeEntries(merged);
      if(JSON.stringify(merged)!==JSON.stringify(cloud?.entries||{}))await saveCloudState({entries:merged});
    }catch{}
    setReady(true);
  })()},[]);

  async function recover(){
    if(!code.trim())return;
    setStatus('Merging preview history…');
    try{
      const backup=decodeBackup(code);
      const incoming=backup.rt_entries||backup.entries||{};
      const local=readEntries();
      let cloud={};
      try{cloud=(await loadCloudState())?.entries||{}}catch{}
      const before=podcastCount(mergeEntries(local,cloud));
      const merged=mergeEntries(local,cloud,incoming);
      writeEntries(merged);
      await saveCloudState({entries:merged});
      const added=Math.max(0,podcastCount(merged)-before);
      setStatus(`Recovered ${added} podcast${added===1?'':'s'}. Nothing already in production was removed.`);
    }catch(e){setStatus('That backup code could not be read. Copy it again from the preview and retry.');}
  }

  if(recoveryMode)return <div style={{minHeight:'100vh',background:'#08090b',color:'#efeee9',padding:'28px 18px',fontFamily:'monospace'}}><div style={{maxWidth:720,margin:'0 auto'}}><div style={{color:'#d5b06a',fontSize:11,letterSpacing:2,marginBottom:8}}>READING LOG RECOVERY</div><h1 style={{fontFamily:'Georgia,serif',fontSize:30,margin:'0 0 12px'}}>Restore preview podcasts</h1><p style={{color:'#9aa1aa',lineHeight:1.6,fontSize:13}}>On the old preview, tap <b>COPY BACKUP CODE</b>. Paste that code here. The app will merge it with production and Firebase. Existing production entries will be preserved.</p><textarea value={code} onChange={e=>setCode(e.target.value)} rows={8} placeholder="Paste backup code…" style={{width:'100%',background:'#111319',color:'#eee',border:'1px solid #343a43',borderRadius:12,padding:12,fontFamily:'monospace'}}/><button onClick={recover} style={{width:'100%',marginTop:10,padding:13,border:0,borderRadius:10,background:'#d5b06a',color:'#111',fontWeight:700}}>MERGE RECOVERED DATA</button>{status&&<div style={{marginTop:12,color:status.startsWith('Recovered')?'#86cf96':'#d5b06a',fontSize:12,lineHeight:1.5}}>{status}</div>}<button onClick={()=>window.location.href='/'} style={{width:'100%',marginTop:10,padding:12,border:'1px solid #343a43',borderRadius:10,background:'#181b21',color:'#ddd'}}>OPEN READING LOG</button></div></div>;
  if(!ready)return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#08090b',color:'#777',fontFamily:'monospace'}}>SYNCING HISTORY…</div>;
  return <QuickAppV7/>;
}
