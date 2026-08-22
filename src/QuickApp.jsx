import { useEffect, useMemo, useState } from 'react';
import { loadCloudState, saveCloudState } from './firebase';

const KEYS={entries:'rt_entries',books:'rt_current_books',library:'rt_library'};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const read=(k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch{return f}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const baseEntry=()=>({readingMinutes:0,arabicStudied:false,geoRead:false,geoSubject:'',dailyTakeaway:'',podcastEntries:[]});
const normalize=e=>({...baseEntry(),...(e||{}),podcastEntries:Array.isArray(e?.podcastEntries)?e.podcastEntries:[]});
const meaningful=e=>{const n=normalize(e);return n.readingMinutes>=45||n.arabicStudied||n.geoRead||n.podcastEntries.length>0||!!n.dailyTakeaway.trim()};

export default function QuickApp(){
  const date=today();
  const [view,setView]=useState('today');
  const [loaded,setLoaded]=useState(false);
  const [entries,setEntries]=useState({});
  const [books,setBooks]=useState({physical:'',audible:''});
  const [library,setLibrary]=useState([]);
  const [link,setLink]=useState('');
  const [analyzing,setAnalyzing]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [sync,setSync]=useState('local');

  useEffect(()=>{
    const local={entries:read(KEYS.entries,{}),currentBooks:read(KEYS.books,{physical:'',audible:''}),library:read(KEYS.library,[])};
    setEntries(local.entries);setBooks(local.currentBooks);setLibrary(local.library);
    (async()=>{try{const cloud=await loadCloudState();if(cloud){
      const merged={...local.entries,...(cloud.entries||{})};setEntries(merged);write(KEYS.entries,merged);
      if(cloud.currentBooks){setBooks(cloud.currentBooks);write(KEYS.books,cloud.currentBooks)}
      if(cloud.library){setLibrary(cloud.library);write(KEYS.library,cloud.library)}
      setSync('synced');
    }}catch{setSync('offline')}setLoaded(true)})();
  },[]);

  const entry=normalize(entries[date]);
  async function patch(p){const next={...entry,...p};const all={...entries,[date]:next};setEntries(all);write(KEYS.entries,all);setSync('saving');try{await saveCloudState({entries:{[date]:next}});setSync('synced')}catch{setSync('offline')}}

  async function analyzeLink(){
    if(!link.trim())return;
    setAnalyzing(true);setError('');
    try{
      const r=await fetch('/api/podcast',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:link.trim()})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not analyze link');
      const item={id:`${Date.now()}`,url:data.url||link,podcast:data.podcast||'',episodeTitle:data.episodeTitle||'',guest:data.guest||'',summary:data.summary||'',bullets:data.bullets||[],transcriptFound:!!data.transcriptFound,transcriptUrl:data.transcriptUrl||'',summaryBasis:data.summaryBasis||'metadata',takeaway:''};
      await patch({podcastEntries:[...entry.podcastEntries,item]});setLink('');
    }catch(e){setError(e.message||'Could not analyze this link.')}finally{setAnalyzing(false)}
  }

  async function removePodcast(id){await patch({podcastEntries:entry.podcastEntries.filter(p=>p.id!==id)})}
  async function updatePodcast(id,p){await patch({podcastEntries:entry.podcastEntries.map(x=>x.id===id?{...x,...p}:x)})}
  async function saveBooks(next){setBooks(next);write(KEYS.books,next);try{await saveCloudState({currentBooks:next});setSync('synced')}catch{setSync('offline')}}

  const allDates=Object.keys(entries).sort().reverse();
  const streak=useMemo(()=>{let s=0;const d=new Date();d.setHours(12,0,0,0);if(!meaningful(entries[date]))d.setDate(d.getDate()-1);while(true){const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(meaningful(entries[k])){s++;d.setDate(d.getDate()-1)}else break}return s},[entries,date]);
  const results=useMemo(()=>{const q=query.trim().toLowerCase();if(q.length<2)return[];const out=[];for(const d of allDates){const e=normalize(entries[d]);for(const p of e.podcastEntries){const hay=[p.podcast,p.episodeTitle,p.guest,p.summary,p.takeaway,...(p.bullets||[])].join(' ').toLowerCase();if(hay.includes(q))out.push({date:d,type:'Podcast',title:[p.podcast,p.episodeTitle].filter(Boolean).join(' · '),text:p.takeaway||p.summary})}if([e.dailyTakeaway,e.geoSubject].join(' ').toLowerCase().includes(q))out.push({date:d,type:'Daily insight',title:e.geoSubject||'Learning day',text:e.dailyTakeaway})}for(const b of library){if([b.title,b.author,b.review].join(' ').toLowerCase().includes(q))out.push({date:b.dateFinished||'',type:'Book',title:b.title,text:b.review||b.author})}return out},[query,entries,library,allDates]);

  if(!loaded)return <div className="loading">LOADING…</div>;
  return <div className="app"><style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@600;700&display=swap');
    *{box-sizing:border-box}html,body,#root{margin:0;min-height:100%;background:#08090b;color:#efeee9}body{font-family:'DM Mono',monospace}.app{max-width:720px;margin:auto;min-height:100vh;padding-bottom:90px}
    header{padding:24px 18px 14px;border-bottom:1px solid #1f232a;background:linear-gradient(#111319,#08090b)}h1{font:700 30px 'Playfair Display',serif;margin:0}.sub{font-size:10px;color:#737b87;letter-spacing:.16em;margin-top:5px}
    nav{display:flex;position:sticky;top:0;z-index:4;background:#08090bf2;backdrop-filter:blur(12px);border-bottom:1px solid #1c2026}nav button{flex:1;background:none;border:0;color:#59616c;padding:13px 4px;font:10px 'DM Mono';letter-spacing:.12em}nav button.on{color:#d5b06a;border-bottom:1px solid #d5b06a}
    main{padding:16px}.card{background:#111319;border:1px solid #222730;border-radius:15px;padding:16px;margin-bottom:12px}.gold{border-color:#4b402c;background:linear-gradient(145deg,#17140e,#111319)}.label{font-size:9px;letter-spacing:.16em;color:#d5b06a;text-transform:uppercase;margin-bottom:9px}.muted{color:#727a85;font-size:11px;line-height:1.55}.title{font:600 19px 'Playfair Display',serif}.row{display:flex;gap:8px}.row>*{flex:1}
    input,textarea{width:100%;border:1px solid #2b313a;background:#0a0c10;color:#eee;border-radius:10px;padding:11px 12px;font:13px 'DM Mono';outline:none}textarea{resize:vertical}input:focus,textarea:focus{border-color:#8d7549}.btn{border:1px solid #343a43;background:#181b21;color:#d7dae0;border-radius:10px;padding:11px 12px;font:10px 'DM Mono';letter-spacing:.08em}.btn.primary{background:#d5b06a;border-color:#d5b06a;color:#121212;font-weight:600}.btn.tiny{padding:7px 9px;font-size:9px}.minutes{display:flex;gap:6px;flex-wrap:wrap}.minutes button{min-width:50px}.minutes button.on{background:#314c38;border-color:#42624a;color:#86cf96}.toggle{display:flex;justify-content:space-between;align-items:center;gap:12px}.switch{width:44px;height:25px;border-radius:20px;background:#242a32;position:relative}.switch:after{content:'';position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#777;transition:.15s}.switch.on{background:#314c38}.switch.on:after{left:22px;background:#86cf96}
    .pod{border-top:1px solid #242932;padding-top:14px;margin-top:14px}.pod:first-of-type{border-top:0}.badge{display:inline-block;font-size:9px;padding:4px 7px;border-radius:20px;background:#20252c;color:#8d96a3;margin:5px 6px 0 0}.badge.good{background:#18301e;color:#86cf96}.summary{font:13px Georgia,serif;line-height:1.6;color:#cfd1d4;margin:10px 0}.bullets{margin:8px 0 0;padding-left:18px;color:#9ba2ab;font-size:11px;line-height:1.6}.take{margin-top:12px;border-color:#5b4b30}.status{font-size:9px;color:#69717c}.status.synced{color:#86cf96}.status.saving{color:#d5b06a}.big{font:700 27px 'Playfair Display',serif}.result{padding:12px 2px;border-bottom:1px solid #20242a}.type{font-size:9px;color:#d5b06a;letter-spacing:.12em}.date{font-size:9px;color:#59616a}.loading{min-height:100vh;display:grid;place-items:center;background:#08090b;color:#666;font:11px 'DM Mono'}
  `}</style>
  <header><div className="row" style={{alignItems:'end'}}><div><h1>Reading Log</h1><div className="sub">CAPTURE WHAT MATTERS · IN UNDER 4 MINUTES</div></div><div style={{textAlign:'right'}}><div className="big">{streak}</div><div className="muted">day streak</div><div className={`status ${sync}`}>● {sync.toUpperCase()}</div></div></div></header>
  <nav>{[['today','TODAY'],['search','SEARCH'],['books','BOOKS']].map(([k,l])=><button key={k} className={view===k?'on':''} onClick={()=>setView(k)}>{l}</button>)}</nav>
  <main>
  {view==='today'&&<>
    <div className="card gold"><div className="label">Fast podcast capture</div><div className="title">Paste the episode link</div><div className="muted" style={{margin:'5px 0 12px'}}>I’ll fill the episode, guest and synopsis, and automatically look for a transcript. You add the insight that mattered to you.</div><div className="row"><input value={link} onChange={e=>setLink(e.target.value)} onKeyDown={e=>e.key==='Enter'&&analyzeLink()} placeholder="Apple Podcasts, Spotify, YouTube, episode page…"/><button className="btn primary" disabled={analyzing} onClick={analyzeLink}>{analyzing?'ANALYZING…':'AUTOFILL'}</button></div>{error&&<div style={{color:'#d98686',fontSize:11,marginTop:9}}>{error}</div>}</div>

    {entry.podcastEntries.map(p=><div className="card pod" key={p.id}><div className="row" style={{alignItems:'start'}}><div><div className="label">🎙 {p.podcast||'Podcast'}</div><div className="title">{p.episodeTitle||'Episode'}</div>{p.guest&&<div className="muted" style={{marginTop:4}}>with {p.guest}</div>}</div><button className="btn tiny" style={{flex:'0 0 auto'}} onClick={()=>removePodcast(p.id)}>REMOVE</button></div><div><span className={`badge ${p.transcriptFound?'good':''}`}>{p.transcriptFound?'✓ TRANSCRIPT FOUND':'DESCRIPTION SUMMARY'}</span>{p.url&&<span className="badge">LINK SAVED</span>}</div>{p.summary&&<div className="summary">{p.summary}</div>}{p.bullets?.length>0&&<ul className="bullets">{p.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul>}<textarea className="take" rows={3} placeholder="My most important takeaway…" value={p.takeaway||''} onChange={e=>updatePodcast(p.id,{takeaway:e.target.value})}/></div>)}

    <div className="card"><div className="label">📖 Reading</div><div className="row" style={{marginBottom:10}}><div><div className="muted">Physical</div><div className="title">{books.physical||'Not set'}</div></div><div><div className="muted">Audible</div><div className="title">{books.audible||'Not set'}</div></div></div><div className="minutes">{[0,15,30,45,60,90].map(m=><button key={m} className={`btn ${entry.readingMinutes===m?'on':''}`} onClick={()=>patch({readingMinutes:m})}>{m===0?'NONE':`${m} MIN`}</button>)}</div></div>

    <div className="row"><div className="card toggle" onClick={()=>patch({arabicStudied:!entry.arabicStudied})}><div><div className="label">🌙 Arabic</div><div className="muted">{entry.arabicStudied?'Done today':'Tap when done'}</div></div><div className={`switch ${entry.arabicStudied?'on':''}`}/></div><div className="card toggle" onClick={()=>patch({geoRead:!entry.geoRead})}><div><div className="label">🌐 Geopol</div><div className="muted">{entry.geoRead?'Read today':'Tap when read'}</div></div><div className={`switch ${entry.geoRead?'on':''}`}/></div></div>

    <div className="card"><div className="label">🧠 One thing worth remembering today</div><textarea rows={4} placeholder="Optional. One sentence is enough." value={entry.dailyTakeaway} onChange={e=>patch({dailyTakeaway:e.target.value})}/></div>
    <div className="muted" style={{textAlign:'center',padding:'5px'}}>{meaningful(entry)?'✓ Learning day captured':'Nothing is mandatory. Capture only what happened.'}</div>
  </>}
  {view==='search'&&<><div className="card"><div className="label">Search your knowledge base</div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nvidia, China, private credit…"/></div>{results.map((r,i)=><div className="result" key={i}><div className="row"><div className="type">{r.type.toUpperCase()}</div><div className="date" style={{textAlign:'right'}}>{r.date}</div></div><div className="title" style={{fontSize:16,marginTop:5}}>{r.title}</div><div className="muted" style={{marginTop:5}}>{r.text}</div></div>)}</>}
  {view==='books'&&<><div className="card"><div className="label">Current books</div><div className="muted">Physical</div><input value={books.physical||''} onChange={e=>saveBooks({...books,physical:e.target.value})} placeholder="Current physical book" style={{margin:'5px 0 12px'}}/><div className="muted">Audible</div><input value={books.audible||''} onChange={e=>saveBooks({...books,audible:e.target.value})} placeholder="Current audiobook" style={{marginTop:5}}/></div><div className="label" style={{margin:'18px 3px 7px'}}>Library</div>{library.map(b=><div className="result" key={b.id||b.title}><div className="title">{b.title}</div><div className="muted">{[b.author,b.genre,b.dateFinished].filter(Boolean).join(' · ')}</div>{b.review&&<div className="summary">{b.review}</div>}</div>)}</>}
  </main></div>
}
