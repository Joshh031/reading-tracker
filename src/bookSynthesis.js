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

const GOOD_ENERGY_DETAILS = {
  0: [
    `Means' central claim is that many conditions medicine treats as separate diagnoses can be downstream expressions of the same metabolic dysfunction. Her mother's pancreatic-cancer story is the emotional entry point for asking why the system often treats disease late and organ-by-organ instead of looking for shared upstream biology.`
  ],
  1: [
    `The useful shift is from asking which specialist owns a symptom to asking whether inflammation, insulin resistance, oxidative stress or impaired cellular energy could be contributing across multiple organs at once. The practical implication is that apparently unrelated symptoms may deserve a common metabolic workup rather than a collection of isolated fixes.`
  ],
  2: [
    `Means puts mitochondrial function near the center of the framework: when cells cannot efficiently convert fuel into usable energy, she argues that insulin resistance, oxidative stress and chronic inflammation can reinforce one another and show up as very different chronic diseases. The memorable idea is that "bad energy" is not one disease but a shared cellular failure mode.`
  ],
  3: [
    `Means argues that "normal" on a lab report is not always the same thing as metabolically optimal, because reference ranges often describe a population in which metabolic dysfunction is already common. Her broader prescription is to know your own trends, symptoms and biomarkers rather than waiting until a value crosses a conventional disease threshold.`
  ],
  4: [
    `Her preferred metabolic panel is notably broader than fasting glucose alone: she highlights fasting insulin, ApoB, triglycerides, uric acid and HbA1c as five core markers worth following. In her own public materials tied to the book, she also emphasizes hsCRP, triglyceride-to-HDL ratio and liver enzymes as useful context for metabolic health.`,
    `Means explicitly favors tighter "optimal" targets than many standard lab cutoffs. Examples she has published include hsCRP below about 0.36 mg/L, triglyceride-to-HDL ratio below 1, and AST/ALT below about 17 U/L; those are her preferred targets, not universal clinical guidelines.`
  ],
  5: [
    `The six food principles are more interesting than "eat healthy": food supplies the literal molecular building blocks of cells and the microbiome; eating is a matching problem between cellular needs and inputs; food acts as a signal to cells; strong cravings can be feedback from mixed or inadequate inputs; competing diet tribes often work when they reduce ultra-processed food; and mindful eating is meant to restore attention to what food actually is.`,
    `One of Means' more memorable claims is that cravings are not simply a willpower failure. She frames them partly as biological feedback, while also arguing that ultra-processed foods are engineered in ways that intensify repeat consumption and can drown out normal satiety signals.`
  ],
  6: [
    `The meal chapter becomes highly tactical: do not eat a high-carbohydrate food by itself; eat vegetables/protein/fat before the starch; favor carbohydrates earlier in the day; avoid liquid sugar; add fiber; use vinegar when appropriate; take a walk after eating; and gradually compress the daily eating window. The point is to reduce the size and frequency of post-meal glucose excursions rather than merely counting calories.`
  ],
  7: [
    `Means treats circadian timing as metabolic input. Light exposure, sleep timing and meal timing affect hormones, appetite and glucose handling, so the same food or behavior can have different consequences depending on when it occurs.`
  ],
  8: [
    `Movement is framed less as a discrete workout and more as a repeated signal the body needs throughout the day. Means also treats heat, cold and reduction of avoidable toxic exposures as forms of environmental input that can either strengthen or burden metabolic resilience.`
  ],
  9: [
    `The final lifestyle layer is psychological: chronic fear, stress and loss of agency are not treated as separate from metabolism. Means' broader point is that a metabolically healthy life requires an environment and mindset that repeatedly signal safety, capability and adaptation rather than chronic threat.`
  ]
};

const GOOD_ENERGY_PRACTICAL = {
  3: `Know your own longitudinal data rather than relying on a once-a-year "normal/abnormal" flag. The useful habit is trend recognition: symptoms plus repeated biomarkers are more informative than a single isolated reading.`,
  4: `For a compact metabolic dashboard, Means' framework pushes you beyond glucose toward fasting insulin, ApoB, triglycerides, uric acid and HbA1c, with inflammation and liver markers as additional context.`,
  5: `When diet advice conflicts, her simplifying rule is to ask whether the food is minimally processed, nutrient dense and supplying fiber, protein, healthy fats and micronutrients rather than starting with a diet label.`,
  6: `The easiest glucose experiment is meal order and movement: fiber/protein/fat first, starch later, no liquid sugar, then a short walk after eating. Those are small behaviors with immediate feedback if you use a CGM or post-meal glucose checks.`,
  7: `Protect sleep and morning/daytime light exposure, and avoid making late-night eating a routine metabolic input.`,
  8: `Think of movement as something to distribute across the day, not something a single gym session fully compensates for.`
};

function goodEnergySynthesis(guide, chapters, through){
  const details=[];
  for(const c of chapters){ for(const x of (GOOD_ENERGY_DETAILS[c.n]||[])) details.push(x); }
  const mostImportant=uniq(details).slice(-7);
  const practical=[];
  for(const c of chapters){ if(GOOD_ENERGY_PRACTICAL[c.n]) practical.push(GOOD_ENERGY_PRACTICAL[c.n]); }

  const foundation = `Means' argument is more specific than "metabolic health matters." She is proposing a common upstream model in which mitochondrial dysfunction, insulin resistance, oxidative stress and chronic inflammation can help explain diseases that the medical system often treats in separate silos. Her challenge to the reader is to detect that dysfunction earlier, using symptoms and longitudinal metabolic data before conventional disease thresholds are crossed.`;
  const latestSpecific = mostImportant.slice(-3).join(' ');

  return {
    bookId:guide.id,bookTitle:guide.title,author:guide.author,through,style:'general',
    throughLabel:through===0?'Introduction':`Chapter ${through}`,
    headline:`${guide.title} through ${through===0?'the introduction':`Chapter ${through}`}`,
    paragraph1:foundation,
    paragraph2:latestSpecific || lastSentence(chapters[chapters.length-1].core),
    mostImportant,
    secondLabel:'Most useful in practice',
    secondPoints:uniq(practical).slice(-5),
    note:'This synthesis deliberately favors concrete mechanisms, biomarkers, thresholds, food rules and behaviors over generic wellness language. Numeric targets shown are Means’ preferred ranges where noted, not universal medical cutoffs.'
  };
}

export function buildBookSynthesis(guide, chapterLogs=[]){
  if(!guide) return null;
  const completed=(chapterLogs||[]).filter(x=>x.bookId===guide.id);
  if(!completed.length) return null;
  const through=Math.max(...completed.map(x=>Number(x.chapterNumber)||0));
  const chapters=guide.chapters.filter(c=>Number(c.n)<=through);
  if(!chapters.length) return null;

  if(guide.id==='goodenergy') return goodEnergySynthesis(guide,chapters,through);

  const coreSentences=uniq(chapters.map(c=>firstSentence(c.core)));
  const selected=spaced(coreSentences, through<=3?5:7);
  const split=Math.max(1,Math.ceil(selected.length/2));
  const paragraph1=selected.slice(0,split).join(' ');
  const paragraph2=selected.slice(split).join(' ') || lastSentence(chapters[chapters.length-1].core);
  const mostImportant=spaced(uniq(chapters.map(c=>firstSentence(c.core))),6);
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
