function sentences(text='') {
  return String(text).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
}

function firstSentence(text='') { return sentences(text)[0] || ''; }
function lastSentence(text='') { const s=sentences(text); return s[s.length-1] || ''; }
function uniq(items=[]) { const out=[]; const seen=new Set(); for(const x of items){const k=x.toLowerCase(); if(x&&!seen.has(k)){seen.add(k);out.push(x)}} return out; }
function spaced(items,max=7){
  if(items.length<=max) return items;
  const idx=[];
  for(let i=0;i<max;i++) idx.push(Math.round(i*(items.length-1)/(max-1)));
  return [...new Set(idx)].map(i=>items[i]);
}

export function buildBookSynthesis(guide, chapterLogs=[]){
  if(!guide) return null;
  const completed=(chapterLogs||[]).filter(x=>x.bookId===guide.id);
  if(!completed.length) return null;
  const through=Math.max(...completed.map(x=>Number(x.chapterNumber)||0));
  const chapters=guide.chapters.filter(c=>Number(c.n)<=through);
  if(!chapters.length) return null;

  const coreSentences=uniq(chapters.map(c=>firstSentence(c.core)));
  const selected=spaced(coreSentences, through<=3?5:7);
  const split=Math.max(1,Math.ceil(selected.length/2));
  const paragraph1=selected.slice(0,split).join(' ');
  const paragraph2=selected.slice(split).join(' ') || lastSentence(chapters[chapters.length-1].core);
  const mostImportant=spaced(uniq(chapters.map(c=>firstSentence(c.core))),6);
  const latest=chapters[chapters.length-1];

  if(guide.id==='goodenergy'){
    const practical=spaced(uniq(chapters.map(c=>lastSentence(c.core))),4);
    return {
      bookId:guide.id,bookTitle:guide.title,author:guide.author,through,style:'general',
      throughLabel:through===0?'Introduction':`Chapter ${through}`,
      headline:`${guide.title} through ${through===0?'the introduction':`Chapter ${through}`}`,
      paragraph1,paragraph2,
      mostImportant,
      secondLabel:'What matters in practice',
      secondPoints:practical,
      note:'This synthesis emphasizes the crux of the health framework and practical ideas rather than forcing an investing lens.'
    };
  }

  const lensSentences=spaced(uniq(chapters.map(c=>firstSentence(c.lens))),5);
  const discussion=spaced(uniq(chapters.slice(-4).flatMap(c=>[lastSentence(c.core),lastSentence(c.lens)])),3);
  return {
    bookId:guide.id,bookTitle:guide.title,author:guide.author,through,style:'pm',
    throughLabel:through===0?'Prologue':`Chapter ${through}`,
    headline:`${guide.title} through ${through===0?'the prologue':`Chapter ${through}`}`,
    paragraph1,paragraph2,
    mostImportant,
    secondLabel:'Investing + institutional lens',
    secondPoints:lensSentences,
    discussion,
    note:'This synthesis emphasizes the ideas most useful for markets, technology, institutions, sociology and PM discussion.'
  };
}
