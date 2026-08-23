function sentences(text='') {
  return String(text).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
}

function lastSentence(text='') { const s=sentences(text); return s[s.length-1] || ''; }
function uniq(items=[]) { const out=[]; const seen=new Set(); for(const x of items){const k=x.toLowerCase(); if(x&&!seen.has(k)){seen.add(k);out.push(x)}} return out; }

const GOOD_ENERGY_DETAILS = {
  0: [`Means' central claim is that many conditions medicine treats as separate diagnoses can be downstream expressions of the same metabolic dysfunction. Her mother's pancreatic-cancer story is the emotional entry point for asking why the system often treats disease late and organ-by-organ instead of looking for shared upstream biology.`],
  1: [`The useful shift is from asking which specialist owns a symptom to asking whether inflammation, insulin resistance, oxidative stress or impaired cellular energy could be contributing across multiple organs at once. The practical implication is that apparently unrelated symptoms may deserve a common metabolic workup rather than a collection of isolated fixes.`],
  2: [`Means puts mitochondrial function near the center of the framework: when cells cannot efficiently convert fuel into usable energy, she argues that insulin resistance, oxidative stress and chronic inflammation can reinforce one another and show up as very different chronic diseases. The memorable idea is that "bad energy" is not one disease but a shared cellular failure mode.`],
  3: [`Means argues that "normal" on a lab report is not always the same thing as metabolically optimal, because reference ranges often describe a population in which metabolic dysfunction is already common. Her broader prescription is to know your own trends, symptoms and biomarkers rather than waiting until a value crosses a conventional disease threshold.`],
  4: [
    `Her preferred metabolic panel is notably broader than fasting glucose alone: she highlights fasting insulin, ApoB, triglycerides, uric acid and HbA1c as five core markers worth following. In her own public materials tied to the book, she also emphasizes hsCRP, triglyceride-to-HDL ratio and liver enzymes as useful context for metabolic health.`,
    `Means explicitly favors tighter "optimal" targets than many standard lab cutoffs. Examples she has published include hsCRP below about 0.36 mg/L, triglyceride-to-HDL ratio below 1, and AST/ALT below about 17 U/L; those are her preferred targets, not universal clinical guidelines.`
  ],
  5: [
    `The six food principles are more interesting than "eat healthy": food supplies the literal molecular building blocks of cells and the microbiome; eating is a matching problem between cellular needs and inputs; food acts as a signal to cells; strong cravings can be feedback from mixed or inadequate inputs; competing diet tribes often work when they reduce ultra-processed food; and mindful eating is meant to restore attention to what food actually is.`,
    `One of Means' more memorable claims is that cravings are not simply a willpower failure. She frames them partly as biological feedback, while also arguing that ultra-processed foods are engineered in ways that intensify repeat consumption and can drown out normal satiety signals.`
  ],
  6: [`The meal chapter becomes highly tactical: do not eat a high-carbohydrate food by itself; eat vegetables/protein/fat before the starch; favor carbohydrates earlier in the day; avoid liquid sugar; add fiber; use vinegar when appropriate; take a walk after eating; and gradually compress the daily eating window. The point is to reduce the size and frequency of post-meal glucose excursions rather than merely counting calories.`],
  7: [`Means treats circadian timing as metabolic input. Light exposure, sleep timing and meal timing affect hormones, appetite and glucose handling, so the same food or behavior can have different consequences depending on when it occurs.`],
  8: [`Movement is framed less as a discrete workout and more as a repeated signal the body needs throughout the day. Means also treats heat, cold and reduction of avoidable toxic exposures as forms of environmental input that can either strengthen or burden metabolic resilience.`],
  9: [`The final lifestyle layer is psychological: chronic fear, stress and loss of agency are not treated as separate from metabolism. Means' broader point is that a metabolically healthy life requires an environment and mindset that repeatedly signal safety, capability and adaptation rather than chronic threat.`]
};

const GOOD_ENERGY_PRACTICAL = {
  3: `Know your own longitudinal data rather than relying on a once-a-year "normal/abnormal" flag. The useful habit is trend recognition: symptoms plus repeated biomarkers are more informative than a single isolated reading.`,
  4: `For a compact metabolic dashboard, Means' framework pushes you beyond glucose toward fasting insulin, ApoB, triglycerides, uric acid and HbA1c, with inflammation and liver markers as additional context.`,
  5: `When diet advice conflicts, her simplifying rule is to ask whether the food is minimally processed, nutrient dense and supplying fiber, protein, healthy fats and micronutrients rather than starting with a diet label.`,
  6: `The easiest glucose experiment is meal order and movement: fiber/protein/fat first, starch later, no liquid sugar, then a short walk after eating. Those are small behaviors with immediate feedback if you use a CGM or post-meal glucose checks.`,
  7: `Protect sleep and morning/daytime light exposure, and avoid making late-night eating a routine metabolic input.`,
  8: `Think of movement as something to distribute across the day, not something a single gym session fully compensates for.`
};

const NEXUS_CONCEPTS = {
  0: `Information networks should be judged not by how much information they produce, but by whether they can correct themselves when information is false, distorted or weaponized. Scale without error correction can make a system more powerful and more fragile at the same time.`,
  1: `Harari's counterintuitive definition of information is functional rather than truth-based: information creates connections between nodes. A false story can therefore be highly effective information if it coordinates millions of people, which explains why narrative power and factual accuracy are not the same thing.`,
  2: `Shared fictions are coordination infrastructure. Money, corporations, nations and legal entities work because large numbers of strangers accept the same intersubjective rules, which means legitimacy and narrative maintenance can be genuine sources of economic power rather than superficial branding.`,
  3: `Documents and databases are not passive records; they create the categories through which institutions see reality. Once a classification system becomes authoritative, people and firms start optimizing to the form, score or database rather than the underlying purpose, which is a useful way to think about bureaucracy, KPIs and enterprise software lock-in.`,
  4: `Harari's strongest institutional claim is that the crucial property of a resilient information network is not intelligence but error correction. Systems that institutionalize dissent, competing centers of authority and mechanisms for reversal can survive being wrong; systems that claim infallibility compound mistakes.`,
  5: `Democracy and totalitarianism can be viewed as competing information architectures: distributed versus centralized processing. Centralization can be faster, but it creates bottlenecks and incentives to suppress bad news; distributed systems are noisier but can surface errors from multiple independent channels.`,
  6: `The key AI discontinuity is agency. Computers are becoming participants in information networks that can generate content, make decisions, transact and interact with other machines, so the economic shift is from software that assists human decisions to systems that can become decision-making nodes themselves.`,
  7: `Machine-speed networks remove the biological pauses that historically constrained institutions. Always-on agents can price, persuade, monitor and transact continuously, creating a competitive tempo that human organizations and political systems may struggle to match.`,
  8: `Algorithmic authority can recreate the old fantasy of infallibility in a new form. As systems become more complex, reliability, auditability, provenance and the right to challenge a machine decision may matter economically as much as raw model capability.`,
  9: `Democracy requires enough shared informational infrastructure for citizens to argue about the same reality. Personalized algorithmic feeds can increase individual relevance while weakening the common factual substrate needed for collective decision-making.`,
  10: `AI can lower the cost of surveillance and centralized control dramatically, but it also creates a paradox for authoritarian systems: rulers may gain unprecedented monitoring capacity while becoming dependent on machine systems they cannot fully understand or control.`,
  11: `AI, chips, cloud infrastructure and data rules are becoming geopolitical architecture. A world of incompatible models, export controls, standards and data regimes could split technology markets into blocs, making political alignment part of product-market fit.`,
  12: `Harari ultimately rejects technological determinism. The durable question is not whether AI becomes powerful, but whether institutions preserve human accountability, reversibility and mechanisms for admitting error as nonhuman agents enter the network.`
};

const NEXUS_IMPLICATIONS = {
  1: `Markets can be understood as narrative-coordination systems as well as price-discovery systems. A story can attract capital, talent and customers before fundamentals validate it, so the investment question is often not merely whether a narrative is true today but whether the underlying system contains a mechanism that eventually forces reality back into the story.`,
  2: `Some of the strongest moats are institutional rather than technical. Brands, currencies, exchanges, operating systems and platforms become valuable partly because participants coordinate around a common framework; breaking that coordination can be harder than copying the underlying technology.`,
  3: `Systems of record deserve more strategic weight than their user interface suggests. The database that defines the official customer, employee, asset, risk score or claim can become deeply embedded because downstream decisions depend on its categories, creating both switching costs and institutional rigidity.`,
  4: `For companies and investment teams, error-correction architecture may be an underappreciated moat. Organizations that reward bad-news transmission, run genuine postmortems and preserve independent decision channels should adapt better than organizations that centralize information around a charismatic leader or a single model.`,
  5: `The democracy-versus-totalitarianism analogy maps well to corporate design: centralized organizations can execute rapidly in stable environments, while distributed organizations may outperform when uncertainty is high because more independent information reaches decision makers. The trade-off is speed versus adaptability, not simply good versus bad governance.`,
  6: `If AI agents can act rather than merely advise, model quality may not be the only or even the primary moat. Permission, trust, workflow integration, identity, payments, liability and authorization to act inside regulated systems could determine where the durable economic value accrues.`,
  7: `Always-on agents compress response times across markets. Businesses organized around slow human workflows may face a structural disadvantage against systems that continuously price, code, market, procure and monitor risk, creating a new form of operating leverage for firms that can safely automate decisions.`,
  8: `The AI stack may develop a large reliability and governance layer analogous to cybersecurity or financial controls. Model monitoring, provenance, audit logs, human override and dispute mechanisms could become required infrastructure as autonomous systems move from suggestion to execution.`,
  9: `Recommendation algorithms create a regulatory conflict between private optimization and public stability. A platform can maximize engagement while degrading the shared informational commons, suggesting that provenance, identity, political-ad rules and algorithmic transparency could become structural rather than temporary policy costs.`,
  10: `Sovereign AI and surveillance technology may become strategic procurement categories. The same capabilities that create commercial efficiency can become tools of state control, increasing geopolitical and regulatory dispersion in valuation across data, cloud, cybersecurity and model providers.`,
  11: `Technology addressable markets may increasingly be determined by alliances and export regimes. Semiconductors, cloud, cybersecurity and foundation models could look less like globally fungible software markets and more like defense or telecom markets constrained by national security.`
};

const NEXUS_CRITIQUES = {
  1: `Harari's definition of information is useful because it separates coordination from truth, but it risks becoming so broad that almost any social signal counts as information. The framework is strongest when it explains network behavior, weaker when it implies a precise causal model from that definition alone.`,
  2: `Shared stories clearly coordinate large groups, but the framework can underweight material constraints. Narratives matter enormously, yet cash flows, coercive power, resources and technology can eventually overwhelm even very durable shared beliefs.`,
  4: `Harari strongly favors self-correcting institutions, but error correction is not free. Distributed challenge can also create paralysis, false equivalence and slow responses, so the real institutional question is how to preserve dissent without making decisive action impossible.`,
  5: `The claim that decentralized information systems are more resilient is plausible but not universal. Markets, democracies and decentralized organizations can herd around the same bad information, while a centralized system with excellent feedback can sometimes adapt faster. Independence of information channels matters more than decentralization by itself.`,
  6: `Calling AI an autonomous member of the network may overstate current agency if most systems remain constrained by human-set objectives, permissions and infrastructure. The thesis becomes much more consequential as agents gain persistent identity, money, memory and the authority to take irreversible actions.`,
  9: `The fragmentation of shared reality is real, but digital networks can also expose people to more competing viewpoints than broadcast-era media did. The harder question is whether algorithmic personalization causes polarization or mainly amplifies divisions created elsewhere.`,
  10: `AI may centralize surveillance power, but open models, cheap inference and distributed tooling can also decentralize capability. The political impact may depend less on AI itself than on who controls compute, identity systems, sensors and enforcement authority.`,
  11: `A permanent "Silicon Curtain" is a useful scenario, not a certainty. Economic interdependence, open-source models and the difficulty of fully sealing information flows could make the eventual architecture more porous and asymmetric than a clean two-bloc split.`
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

function nexusSynthesis(guide, chapters, through){
  const nums=chapters.map(c=>Number(c.n));
  const concepts=nums.map(n=>NEXUS_CONCEPTS[n]).filter(Boolean);
  const implications=nums.map(n=>NEXUS_IMPLICATIONS[n]).filter(Boolean);
  const critiques=nums.map(n=>NEXUS_CRITIQUES[n]).filter(Boolean);

  const paragraph1 = `Harari's argument so far is best understood as a theory of institutional resilience, not simply a history of information technology. Human societies become powerful by building information networks that coordinate enormous numbers of people, but connection and truth are different things: myths, documents, algorithms and databases can organize behavior even when they distort reality. The decisive question is therefore whether a network contains mechanisms that can discover and correct its own errors before scale turns a mistake into a systemic failure.`;
  const paragraph2 = through>=6
    ? `The arrival of AI raises the stakes because computers are beginning to move from channels that transmit human decisions to agents that can generate information, make decisions and act inside the network. That shifts the central issue from "how intelligent will models become?" to "which institutions will authorize them to act, how will their mistakes be detected, and who retains the power to reverse their decisions?" For markets, that points toward trust, permission, workflow integration, auditability and governance as potentially durable sources of value alongside raw model capability.`
    : `Through this point in the book, the most useful investing analogy is that institutions and companies should be evaluated partly by their information architecture. A system can look efficient because information is centralized and dissent is suppressed, yet become dangerously brittle when bad news cannot travel upward. Conversely, distributed systems can look messy while creating more opportunities for reality to challenge the dominant narrative.`;

  const mostImportant = uniq(concepts).slice(-7);
  const secondPoints = uniq(implications).slice(-6);
  const debate = uniq([
    ...critiques.slice(-3),
    ...(through>=6 ? [`PM debate: if autonomous agents become economically important, is the real moat the best model, or the institutional permission to let a model act inside payments, healthcare, banking, enterprise systems and government?`] : []),
    ...(through>=4 ? [`PM debate: should investors explicitly score management teams on error-correction architecture — how quickly bad news travels, whether dissent is protected, and whether decisions can be reversed — in the same way they score margins or market share?`] : []),
    ...(through>=5 ? [`PM debate: centralized organizations often outperform when speed matters, while distributed systems adapt better under uncertainty. Which industries are moving into an environment where adaptability should command a valuation premium over execution speed?`] : [])
  ]).slice(-4);

  return {
    bookId:guide.id,bookTitle:guide.title,author:guide.author,through,style:'pm',
    throughLabel:through===0?'Prologue':`Chapter ${through}`,
    headline:`${guide.title} through ${through===0?'the prologue':`Chapter ${through}`}`,
    paragraph1,paragraph2,
    mostImportant,
    secondLabel:'AI + markets + institutional implications',
    secondPoints,
    discussion:debate,
    note:'This synthesis separates Harari’s core framework from the investment implications and then stress-tests the argument. “Worth discussing” is intentionally framed as debatable propositions rather than settled conclusions.'
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
  if(guide.id==='nexus') return nexusSynthesis(guide,chapters,through);

  const paragraph1=chapters.slice(0,Math.ceil(chapters.length/2)).map(c=>sentences(c.core)[0]).filter(Boolean).join(' ');
  const paragraph2=chapters.slice(Math.ceil(chapters.length/2)).map(c=>sentences(c.core)[0]).filter(Boolean).join(' ') || lastSentence(chapters[chapters.length-1].core);
  const mostImportant=uniq(chapters.map(c=>sentences(c.core)[0]).filter(Boolean)).slice(-6);
  const secondPoints=uniq(chapters.map(c=>sentences(c.lens)[0]).filter(Boolean)).slice(-5);

  return {
    bookId:guide.id,bookTitle:guide.title,author:guide.author,through,style:'pm',
    throughLabel:through===0?'Prologue':`Chapter ${through}`,
    headline:`${guide.title} through ${through===0?'the prologue':`Chapter ${through}`}`,
    paragraph1,paragraph2,
    mostImportant,
    secondLabel:'Implications',
    secondPoints,
    discussion:[],
    note:'Rolling synthesis through the latest completed chapter.'
  };
}
