import { useEffect, useRef, useState } from 'react';
import QuickAppV5 from './QuickAppV5.jsx';

const KEY='rt_chapter_logs';
const parse=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
const sig=x=>JSON.stringify(x||{});

export default function QuickAppV6(){
  const [latest,setLatest]=useState(null);
  const [open,setOpen]=useState(false);
  const prior=useRef(null);

  useEffect(()=>{
    prior.current=parse();
    const timer=setInterval(()=>{
      const next=parse();
      const before=prior.current||[];
      if(JSON.stringify(next)!==JSON.stringify(before)){
        const beforeMap=new Map(before.map(x=>[x.id,sig(x)]));
        const changed=next.find(x=>!beforeMap.has(x.id)||beforeMap.get(x.id)!==sig(x));
        if(changed){setLatest(changed);setOpen(true)}
        prior.current=next;
      }
    },250);
    return()=>clearInterval(timer);
  },[]);

  function goBooks(){
    setOpen(false);
    const buttons=[...document.querySelectorAll('nav button')];
    const b=buttons.find(x=>x.textContent?.trim()==='BOOKS');
    if(b)b.click();
  }

  return <>
    <QuickAppV5/>
    {open&&latest&&<div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'12px'}} onClick={()=>setOpen(false)}>
      <div style={{width:'100%',maxWidth:720,maxHeight:'82vh',overflowY:'auto',background:'#111319',border:'1px solid #4b402c',borderRadius:18,padding:18,boxShadow:'0 -10px 40px rgba(0,0,0,.5)'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:'DM Mono, monospace',fontSize:10,letterSpacing:'.16em',color:'#86cf96',marginBottom:8}}>✓ CHAPTER SAVED</div>
        <div style={{fontFamily:'Playfair Display, Georgia, serif',fontWeight:700,fontSize:23,color:'#efeee9'}}>{latest.bookTitle}</div>
        <div style={{fontFamily:'DM Mono, monospace',fontSize:11,color:'#d5b06a',margin:'5px 0 16px'}}>{latest.chapterNumber===0?'':`Chapter ${latest.chapterNumber}: `}{latest.chapterTitle}</div>
        <div style={{fontFamily:'DM Mono, monospace',fontSize:9,letterSpacing:'.15em',color:'#d5b06a',marginBottom:7}}>CORE CHAPTER TAKEAWAY</div>
        <p style={{fontFamily:'Georgia, serif',fontSize:15,lineHeight:1.65,color:'#d8d9dc',margin:'0 0 18px'}}>{latest.core}</p>
        <div style={{fontFamily:'DM Mono, monospace',fontSize:9,letterSpacing:'.15em',color:'#d5b06a',marginBottom:7}}>INVESTING + SOCIOLOGICAL LENS</div>
        <p style={{fontFamily:'Georgia, serif',fontSize:15,lineHeight:1.65,color:'#d8d9dc',margin:'0 0 18px'}}>{latest.lens}</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={goBooks} style={{flex:1,border:0,borderRadius:10,padding:'12px',background:'#d5b06a',color:'#111',fontFamily:'DM Mono, monospace',fontWeight:700,fontSize:10,letterSpacing:'.08em'}}>VIEW IN BOOKS</button>
          <button onClick={()=>setOpen(false)} style={{flex:1,border:'1px solid #343a43',borderRadius:10,padding:'12px',background:'#181b21',color:'#ddd',fontFamily:'DM Mono, monospace',fontSize:10,letterSpacing:'.08em'}}>DONE</button>
        </div>
      </div>
    </div>}
  </>;
}
