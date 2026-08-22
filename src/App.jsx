import { useEffect, useMemo, useState } from "react";
import { loadCloudState, saveCloudState, syncDailyTracker } from "./firebase";

const GENRES = ["Biography","Business","Economics","Finance","History","Investing","Leadership","Memoir","Philosophy","Politics","Psychology","Science","Self-Help","Technology","Other"];
const DEFAULT_PODCASTS = ["Acquired","All-In Podcast","Big Technology Podcast","a16z Podcast","Capital Allocators","Cheeky Pint","Daur Kesha","Excess Returns","Foreign Affairs","Founders","Goldman Sachs Exchanges","Hidden Brain","Huberman Lab","Invest with the Best","Lex Fridman Podcast","Masters of Business","Odd Lots","Planet Money","The Tim Ferriss Show"];
const KEYS = { entries:"rt_entries", books:"rt_current_books", podcasts:"rt_podcasts", library:"rt_library" };

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function readLocal(key, fallback){ try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function writeLocal(key,val){ try { localStorage.setItem(key,JSON.stringify(val)); } catch {} }
function emptyEntry(){ return { podcastEntries:[{podcast:"",episodeTitle:"",guest:"",takeaway1:"",takeaway2:""}], arabicStudied:false, geoRead:false, geoSubject:"",geoTakeaway:"",readingMinutes:0,readingNote:"" }; }
function normalizeEntry(e={}){
  const pods = e.podcastEntries || (e.podcast ? [{podcast:e.podcast,episodeTitle:e.episodeTitle||"",guest:e.guest||"",takeaway1:e.takeaway1||"",takeaway2:e.takeaway2||""}] : []);
  return { ...emptyEntry(), ...e, podcastEntries: pods.length ? pods.map(p=>({podcast:"",episodeTitle:"",guest:"",takeaway1:"",takeaway2:"",...p})) : emptyEntry().podcastEntries, readingMinutes:Number(e.readingMinutes||0) };
}
function isMeaningful(e){
  if(!e) return false;
  const n=normalizeEntry(e);
  const podcast=n.podcastEntries.some(p=>p.podcast && (p.takeaway1 || p.takeaway2));
  return podcast || n.arabicStudied || (n.geoRead && (n.geoTakeaway || n.geoSubject)) || n.readingMinutes>=45;
}
function fmt(d){ return new Date(`${d}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
function uid(){ return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

export default function App(){
  const today=todayKey();
  const [view,setView]=useState("today");
  const [loaded,setLoaded]=useState(false);
  const [syncState,setSyncState]=useState("local");
  const [entries,setEntries]=useState({});
  const [books,setBooks]=useState({physical:"",audible:""});
  const [podcasts,setPodcasts]=useState(DEFAULT_PODCASTS);
  const [library,setLibrary]=useState([]);
  const [query,setQuery]=useState("");
  const [showFinish,setShowFinish]=useState(null);
  const [finishForm,setFinishForm]=useState({title:"",author:"",format:"Physical",genre:"",rating:0,review:""});
  const [newPodcast,setNewPodcast]=useState("");

  useEffect(()=>{
    const local={ entries:readLocal(KEYS.entries,{}), currentBooks:readLocal(KEYS.books,{physical:"",audible:""}), podcasts:readLocal(KEYS.podcasts,DEFAULT_PODCASTS), library:readLocal(KEYS.library,[]) };
    setEntries(local.entries||{});
    setBooks(local.currentBooks||{physical:"",audible:""});
    setPodcasts(local.podcasts||DEFAULT_PODCASTS);
    setLibrary(local.library||[]);
    (async()=>{
      try{
        const cloud=await loadCloudState();
        if(cloud){
          const mergedEntries={...(local.entries||{}),...(cloud.entries||{})};
          const mergedLibrary=[...(cloud.library||[])];
          setEntries(mergedEntries);
          if(cloud.currentBooks) setBooks(cloud.currentBooks);
          if(cloud.podcasts) setPodcasts(cloud.podcasts);
          if(mergedLibrary.length) setLibrary(mergedLibrary);
          writeLocal(KEYS.entries,mergedEntries);
          if(cloud.currentBooks) writeLocal(KEYS.books,cloud.currentBooks);
          if(cloud.podcasts) writeLocal(KEYS.podcasts,cloud.podcasts);
          if(mergedLibrary.length) writeLocal(KEYS.library,mergedLibrary);
          setSyncState("synced");
        } else {
          await saveCloudState(local);
          setSyncState("synced");
        }
      } catch { setSyncState("offline"); }
      setLoaded(true);
    })();
  },[]);

  const current=normalizeEntry(entries[today]);

  async function updateToday(patch){
    const nextEntry={...current,...patch};
    const nextEntries={...entries,[today]:nextEntry};
    setEntries(nextEntries);
    writeLocal(KEYS.entries,nextEntries);
    setSyncState("saving");
    try{
      await Promise.all([
        saveCloudState({entries:{[today]:nextEntry}}),
        syncDailyTracker(today,nextEntry)
      ]);
      setSyncState("synced");
    }catch{ setSyncState("offline"); }
  }
  async function saveBooks(next){
    setBooks(next); writeLocal(KEYS.books,next); setSyncState("saving");
    try{ await saveCloudState({currentBooks:next}); setSyncState("synced"); }catch{ setSyncState("offline"); }
  }
  async function savePodcasts(next){
    setPodcasts(next); writeLocal(KEYS.podcasts,next);
    try{ await saveCloudState({podcasts:next}); setSyncState("synced"); }catch{ setSyncState("offline"); }
  }
  async function saveLibrary(next){
    setLibrary(next); writeLocal(KEYS.library,next);
    try{ await saveCloudState({library:next}); setSyncState("synced"); }catch{ setSyncState("offline"); }
  }
  function beginFinish(format){
    const title=books[format.toLowerCase()]||"";
    setFinishForm({title,author:"",format,genre:"",rating:0,review:""});
    setShowFinish(format.toLowerCase());
  }
  async function finishBook(){
    if(!finishForm.title.trim()) return;
    const item={...finishForm,id:uid(),dateFinished:today};
    const nextLibrary=[item,...library];
    const nextBooks={...books,[showFinish]:""};
    setShowFinish(null);
    setLibrary(nextLibrary); setBooks(nextBooks);
    writeLocal(KEYS.library,nextLibrary); writeLocal(KEYS.books,nextBooks);
    try{ await saveCloudState({library:nextLibrary,currentBooks:nextBooks}); setSyncState("synced"); }catch{ setSyncState("offline"); }
  }

  const allDates=Object.keys(entries).sort();
  const completed=allDates.filter(d=>isMeaningful(entries[d]));
  const streak=useMemo(()=>{
    let s=0; const date=new Date(); date.setHours(12,0,0,0);
    if(!isMeaningful(entries[today])) date.setDate(date.getDate()-1);
    while(true){
      const k=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      if(isMeaningful(entries[k])) { s++; date.setDate(date.getDate()-1); } else break;
    }
    return s;
  },[entries,today]);

  const searchResults=useMemo(()=>{
    const q=query.trim().toLowerCase(); if(q.length<2) return [];
    const hits=[];
    for(const d of allDates){
      const e=normalizeEntry(entries[d]);
      e.podcastEntries.forEach(p=>{
        const hay=[p.podcast,p.episodeTitle,p.guest,p.takeaway1,p.takeaway2].join(" ").toLowerCase();
        if(hay.includes(q)) hits.push({date:d,type:"Podcast",title:[p.podcast,p.episodeTitle].filter(Boolean).join(" · "),text:[p.guest,p.takeaway1,p.takeaway2].filter(Boolean).join(" — ")});
      });
      if([e.geoSubject,e.geoTakeaway].join(" ").toLowerCase().includes(q)) hits.push({date:d,type:"Geopolitics",title:e.geoSubject||"Geopolitical Futures",text:e.geoTakeaway});
      if((e.readingNote||"").toLowerCase().includes(q)) hits.push({date:d,type:"Reading",title:`${e.readingMinutes} minutes`,text:e.readingNote});
    }
    library.forEach(b=>{
      if([b.title,b.author,b.genre,b.review].join(" ").toLowerCase().includes(q)) hits.push({date:b.dateFinished||"",type:"Book",title:b.title,text:[b.author,b.review].filter(Boolean).join(" — ")});
    });
    return hits;
  },[query,entries,library,allDates]);

  if(!loaded) return <div className="loading">LOADING READING LOG…</div>;

  return <div className="app">
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@600;700&display=swap');
      *{box-sizing:border-box} html,body,#root{margin:0;min-height:100%;background:#08090b;color:#f0eee9}
      body{font-family:DM Mono,monospace}.app{max-width:760px;margin:auto;min-height:100vh;padding-bottom:90px}
      header{padding:24px 20px 14px;border-bottom:1px solid #202329;background:linear-gradient(180deg,#101217,#08090b)}
      h1{font-family:Playfair Display,serif;font-size:31px;margin:0;letter-spacing:-.5px}.sub{color:#777f8c;font-size:11px;margin-top:6px;letter-spacing:.1em}
      nav{display:flex;overflow:auto;padding:0 12px;border-bottom:1px solid #1b1e24;position:sticky;top:0;background:#08090bef;backdrop-filter:blur(12px);z-index:5}
      nav button{background:none;border:0;color:#626a76;padding:14px 10px;font:10px DM Mono;letter-spacing:.14em;white-space:nowrap}nav button.active{color:#d8b36a;border-bottom:1px solid #d8b36a}
      main{padding:18px 16px}.hero{display:grid;grid-template-columns:1.3fr .7fr;gap:10px;margin-bottom:12px}.panel,.card{background:#111319;border:1px solid #22262e;border-radius:14px;padding:16px}
      .stat{font-family:Playfair Display,serif;font-size:30px}.label{font-size:9px;color:#79808c;letter-spacing:.18em;text-transform:uppercase}.accent{color:#d8b36a}.green{color:#78c28a}
      .section{margin-top:14px}.section-title{display:flex;justify-content:space-between;align-items:center;margin:0 2px 8px;font-size:10px;color:#d8b36a;letter-spacing:.16em;text-transform:uppercase}
      input,textarea,select{width:100%;background:#0b0d11;color:#eee;border:1px solid #292e37;border-radius:9px;padding:11px;font:13px DM Mono;outline:none}input:focus,textarea:focus,select:focus{border-color:#8e7446}textarea{resize:vertical}
      .row{display:flex;gap:8px}.row>*{flex:1}.btn{border:1px solid #343a45;background:#171a20;color:#d3d6dc;border-radius:9px;padding:10px 12px;font:10px DM Mono;letter-spacing:.1em}.btn.primary{background:#d8b36a;color:#111;border-color:#d8b36a;font-weight:700}.btn.ghost{background:transparent;color:#818995}.btn.danger{color:#ce7d7d}
      .toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer}.pill{width:44px;height:25px;border-radius:20px;background:#242932;position:relative}.pill:after{content:'';position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#777;transition:.18s}.pill.on{background:#314e39}.pill.on:after{left:22px;background:#78c28a}
      .pod{padding:14px 0;border-top:1px solid #20242b}.pod:first-child{border-top:0;padding-top:0}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mt8{margin-top:8px}.mt12{margin-top:12px}
      .progress{height:6px;border-radius:6px;background:#252a31;overflow:hidden}.progress>div{height:100%;background:#d8b36a}.complete{border-color:#31543b;background:#101a13}.sync{font-size:9px;color:#666}.sync.synced{color:#78c28a}.sync.saving{color:#d8b36a}
      .bookline{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #20242b}.bookline:first-child{border-top:0}.booktitle{font-family:Playfair Display,serif;font-size:17px}.muted{color:#717985;font-size:11px;line-height:1.5}
      .result{padding:13px 2px;border-bottom:1px solid #20242b}.tag{font-size:9px;color:#d8b36a;letter-spacing:.12em}.date{font-size:9px;color:#59616d}.modal{position:fixed;inset:0;background:#000b;display:flex;align-items:flex-end;z-index:20}.sheet{background:#111319;border-top:1px solid #343a45;width:100%;max-width:760px;margin:auto;padding:20px 16px 28px;border-radius:18px 18px 0 0}
      .calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.day{aspect-ratio:1;border:1px solid #20242b;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#454b55;font-size:10px}.day.done{background:#332b1d;color:#d8b36a;border-color:#51452d}
      .loading{min-height:100vh;background:#08090b;color:#777;display:grid;place-items:center;font:11px DM Mono;letter-spacing:.15em}
      @media(max-width:520px){.hero{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}h1{font-size:28px}}
    `}</style>
    <header>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12}}>
        <div><h1>Reading Log</h1><div className="sub">READ • LISTEN • RETAIN</div></div>
        <div className={`sync ${syncState}`}>{syncState==="synced"?"● SYNCED":syncState==="saving"?"● SAVING":"● OFFLINE"}</div>
      </div>
    </header>
    <nav>{[["today","TODAY"],["history","HISTORY"],["library","LIBRARY"],["search","SEARCH"],["settings","SETTINGS"]].map(([k,l])=><button key={k} className={view===k?"active":""} onClick={()=>setView(k)}>{l}</button>)}</nav>
    <main>
      {view==="today" && <>
        <div className="hero">
          <div className={`panel ${isMeaningful(current)?"complete":""}`}><div className="label">Learning day</div><div className={`stat ${isMeaningful(current)?"green":""}`}>{isMeaningful(current)?"Complete":"In progress"}</div><div className="muted">{isMeaningful(current)?"Any substantive learning counts. No podcast required.":"Log reading, a podcast takeaway, Arabic, or Geopolitical Futures."}</div></div>
          <div className="panel"><div className="label">Current streak</div><div className="stat accent">{streak}</div><div className="muted">days</div></div>
        </div>

        <section className="section"><div className="section-title"><span>Current books</span></div><div className="card">
          {[["physical","Physical"],["audible","Audible"]].map(([k,l])=><div className="bookline" key={k}><div><div className="label">{l}</div><div className="booktitle">{books[k]||"Not set"}</div></div><div className="row" style={{flex:"0 0 auto"}}><button className="btn ghost" onClick={()=>{const t=prompt(`Current ${l} book`,books[k]||""); if(t!==null) saveBooks({...books,[k]:t});}}>EDIT</button>{books[k]&&<button className="btn" onClick={()=>beginFinish(l)}>FINISH</button>}</div></div>)}
        </div></section>

        <section className="section"><div className="section-title"><span>Focused reading</span><span>{current.readingMinutes||0} min</span></div><div className="card">
          <div className="row">{[0,15,30,45,60,90].map(m=><button key={m} className={`btn ${current.readingMinutes===m?"primary":""}`} onClick={()=>updateToday({readingMinutes:m})}>{m}</button>)}</div>
          <div className="progress mt12"><div style={{width:`${Math.min(100,(current.readingMinutes||0)/45*100)}%`}} /></div>
          <textarea className="mt12" rows="2" placeholder="Optional: what did you read or learn?" value={current.readingNote||""} onChange={e=>updateToday({readingNote:e.target.value})}/>
          <div className="muted mt8">At 45 minutes this automatically credits Read 45 in Daily Points Tracker.</div>
        </div></section>

        <section className="section"><div className="section-title"><span>Podcasts</span><span>{current.podcastEntries.filter(p=>p.podcast).length} logged</span></div><div className="card">
          {current.podcastEntries.map((p,i)=><div className="pod" key={i}>
            <div className="grid2"><select value={p.podcast} onChange={e=>{const a=[...current.podcastEntries];a[i]={...p,podcast:e.target.value};updateToday({podcastEntries:a});}}><option value="">Select podcast…</option>{podcasts.map(x=><option key={x}>{x}</option>)}</select><input placeholder="Episode title" value={p.episodeTitle||""} onChange={e=>{const a=[...current.podcastEntries];a[i]={...p,episodeTitle:e.target.value};updateToday({podcastEntries:a});}}/></div>
            <input className="mt8" placeholder="Guest (optional)" value={p.guest||""} onChange={e=>{const a=[...current.podcastEntries];a[i]={...p,guest:e.target.value};updateToday({podcastEntries:a});}}/>
            <textarea className="mt8" rows="2" placeholder="Key takeaway" value={p.takeaway1||""} onChange={e=>{const a=[...current.podcastEntries];a[i]={...p,takeaway1:e.target.value};updateToday({podcastEntries:a});}}/>
            <textarea className="mt8" rows="2" placeholder="Second takeaway (optional)" value={p.takeaway2||""} onChange={e=>{const a=[...current.podcastEntries];a[i]={...p,takeaway2:e.target.value};updateToday({podcastEntries:a});}}/>
            {current.podcastEntries.length>1&&<button className="btn ghost danger mt8" onClick={()=>updateToday({podcastEntries:current.podcastEntries.filter((_,j)=>j!==i)})}>REMOVE</button>}
          </div>)}
          <button className="btn ghost" style={{width:"100%"}} onClick={()=>updateToday({podcastEntries:[...current.podcastEntries,{podcast:"",episodeTitle:"",guest:"",takeaway1:"",takeaway2:""}]})}>+ ADD PODCAST</button>
          <div className="muted mt8">Podcast count automatically mirrors into Daily Points Tracker. Episode titles keep takeaways attached to their source.</div>
        </div></section>

        <section className="section"><div className="section-title"><span>Other learning</span></div><div className="card">
          <div className="toggle" onClick={()=>updateToday({arabicStudied:!current.arabicStudied})}><div><div>Arabic</div><div className="muted">Automatically mirrors to Daily Points Tracker</div></div><div className={`pill ${current.arabicStudied?"on":""}`}/></div>
          <div style={{height:1,background:"#20242b",margin:"14px 0"}}/>
          <div className="toggle" onClick={()=>updateToday({geoRead:!current.geoRead})}><div><div>Geopolitical Futures</div><div className="muted">Log the subject and one thing worth remembering</div></div><div className={`pill ${current.geoRead?"on":""}`}/></div>
          {current.geoRead&&<><input className="mt12" placeholder="Subject" value={current.geoSubject||""} onChange={e=>updateToday({geoSubject:e.target.value})}/><textarea className="mt8" rows="2" placeholder="Key takeaway" value={current.geoTakeaway||""} onChange={e=>updateToday({geoTakeaway:e.target.value})}/></>}
        </div></section>
      </>}

      {view==="history" && <>
        <div className="hero"><div className="panel"><div className="label">Learning days</div><div className="stat accent">{completed.length}</div></div><div className="panel"><div className="label">Streak</div><div className="stat accent">{streak}</div></div></div>
        <div className="card"><div className="section-title"><span>Last 35 days</span></div><div className="calendar">{Array.from({length:35},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(34-i));const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return <div key={k} title={fmt(k)} className={`day ${isMeaningful(entries[k])?"done":""}`}>{d.getDate()}</div>})}</div></div>
        <section className="section"><div className="section-title"><span>Recent entries</span></div>{[...allDates].reverse().slice(0,30).map(d=>{const e=normalizeEntry(entries[d]);return <div className="result" key={d}><div style={{display:"flex",justifyContent:"space-between"}}><div className="date">{fmt(d).toUpperCase()}</div><div className={isMeaningful(e)?"green":"muted"}>{isMeaningful(e)?"COMPLETE":"PARTIAL"}</div></div><div className="muted mt8">{[e.readingMinutes>=45?`${e.readingMinutes}m reading`:"",...e.podcastEntries.filter(p=>p.podcast).map(p=>[p.podcast,p.episodeTitle].filter(Boolean).join(" · ")),e.arabicStudied?"Arabic":"",e.geoRead?"Geopol Futures":""].filter(Boolean).join(" • ")||"No substantive activity"}</div></div>})}</section>
      </>}

      {view==="library" && <>
        <div className="panel"><div className="label">Finished books</div><div className="stat accent">{library.length}</div><div className="muted">Finishing a current book adds it here automatically.</div></div>
        <section className="section">{library.length===0?<div className="card muted">No finished books yet.</div>:library.map(b=><div className="card" key={b.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><div><div className="booktitle">{b.title}</div><div className="muted">{[b.author,b.format,b.genre,b.dateFinished&&fmt(b.dateFinished)].filter(Boolean).join(" • ")}</div></div><div className="accent">{b.rating?`${"★".repeat(b.rating)}`:""}</div></div>{b.review&&<div className="muted mt12">{b.review}</div>}<button className="btn ghost danger mt12" onClick={()=>saveLibrary(library.filter(x=>x.id!==b.id))}>REMOVE</button></div>)}</section>
      </>}

      {view==="search" && <>
        <input placeholder="Search episode titles, guests, takeaways, books…" value={query} onChange={e=>setQuery(e.target.value)} autoFocus/>
        <div className="muted mt8">{query.length<2?"Type at least 2 characters.":`${searchResults.length} result${searchResults.length===1?"":"s"}`}</div>
        <section className="section">{searchResults.map((r,i)=><div className="result" key={`${r.date}-${i}`}><div style={{display:"flex",justifyContent:"space-between"}}><div className="tag">{r.type.toUpperCase()}</div><div className="date">{r.date?fmt(r.date):""}</div></div><div className="booktitle mt8">{r.title}</div>{r.text&&<div className="muted mt8">{r.text}</div>}</div>)}</section>
      </>}

      {view==="settings" && <>
        <div className="card"><div className="section-title"><span>Sync</span></div><div className="muted">This version syncs Reading Log data through the same Firebase project used by Daily Points Tracker. Logging Podcast, Arabic, Geopolitical Futures, or Read 45 here mirrors those categories into the Daily Tracker so you only enter them once.</div></div>
        <div className="card mt12"><div className="section-title"><span>Podcast list</span></div><div className="row"><input placeholder="Add podcast" value={newPodcast} onChange={e=>setNewPodcast(e.target.value)}/><button className="btn primary" onClick={()=>{const v=newPodcast.trim();if(v&&!podcasts.includes(v)){savePodcasts([...podcasts,v].sort());setNewPodcast("");}}}>ADD</button></div><div className="muted mt12">{podcasts.join(" • ")}</div></div>
        <div className="card mt12"><div className="section-title"><span>Backup</span></div><button className="btn" onClick={()=>{const data={rt_entries:entries,rt_current_books:books,rt_podcasts:podcasts,rt_library:library};navigator.clipboard?.writeText(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));alert("Backup code copied.");}}>COPY BACKUP CODE</button></div>
      </>}
    </main>

    {showFinish&&<div className="modal" onClick={()=>setShowFinish(null)}><div className="sheet" onClick={e=>e.stopPropagation()}><div className="section-title"><span>Finish book</span></div><div className="grid2"><input placeholder="Title" value={finishForm.title} onChange={e=>setFinishForm({...finishForm,title:e.target.value})}/><input placeholder="Author" value={finishForm.author} onChange={e=>setFinishForm({...finishForm,author:e.target.value})}/><select value={finishForm.genre} onChange={e=>setFinishForm({...finishForm,genre:e.target.value})}><option value="">Genre</option>{GENRES.map(g=><option key={g}>{g}</option>)}</select><select value={finishForm.rating} onChange={e=>setFinishForm({...finishForm,rating:Number(e.target.value)})}><option value={0}>Rating</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} star{n>1?"s":""}</option>)}</select></div><textarea className="mt8" rows="3" placeholder="Short review / what mattered" value={finishForm.review} onChange={e=>setFinishForm({...finishForm,review:e.target.value})}/><div className="row mt12"><button className="btn ghost" onClick={()=>setShowFinish(null)}>CANCEL</button><button className="btn primary" onClick={finishBook}>ADD TO LIBRARY</button></div></div></div>}
  </div>
}
