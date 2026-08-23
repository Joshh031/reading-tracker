import baseHandler from './podcast2.js';

function showNotesFallback(d={}){
  const text=String(d.description||'');
  const lower=text.toLowerCase();
  const out=[];

  if(/rolling recession|sector-level recession|rotation|broadening/.test(lower)){
    out.push(`Sonders frames the post-pandemic economy as a sequence of rolling, sector-level recessions and expansions rather than a single clean business cycle, while the market is increasingly defined by rotation beneath the index surface. That framing implies that headline index strength can coexist with meaningful weakness in individual industries or cohorts, making breadth and leadership changes more informative than a simple recession-or-no-recession call. For a portfolio manager, the practical implication is to distinguish aggregate resilience from cross-sectional stress and to look for opportunities created by asynchronous sector cycles rather than waiting for one macro turning point.`);
  }
  if(/ai capital|ai capex|earnings concentration|market breadth/.test(lower)){
    out.push(`A central discussion is the tension between a broadening equity rally and earnings growth that remains concentrated, with AI-related capital spending still an important driver of profits and investment. The episode treats AI capex not just as a technology story but as a force affecting earnings leadership, market breadth, and the durability of the current expansion. For a portfolio manager, the key question is whether broader price participation is being confirmed by a genuine broadening in earnings power or whether the market is simply rotating around a still-narrow profit engine.`);
  }
  if(/stock-bond|treasury|yield|deficit|inflation/.test(lower)){
    out.push(`Sonders focuses on the changing relationship between stocks and bonds, alongside Treasury yields, inflation volatility, and the fiscal deficit. The broader point is that the old assumption that bonds will reliably offset equity risk can break down when inflation and fiscal concerns dominate, making the correlation regime itself an important portfolio variable. For a portfolio manager, duration is therefore not merely a macro view on Fed policy; it is also a decision about whether Treasuries still provide the diversification properties embedded in traditional portfolio construction.`);
  }
  if(/immigration|labor supply|labor market|hiring/.test(lower)){
    out.push(`The episode connects immigration, labor supply, hiring trends, and economic growth rather than treating the labor market as a simple unemployment-rate story. Changes in labor-force growth can affect both the economy's speed limit and the interpretation of payroll data, while also influencing wage pressure and the inflation outlook. For a portfolio manager, weaker job growth can have very different implications if it reflects falling labor demand versus a constrained supply of workers, and those two cases should produce different conclusions for rates, margins, and cyclicals.`);
  }
  if(/sentiment|rebalanc|ipo|wealth effect|retail trading/.test(lower)){
    out.push(`Sonders also spends time on investor sentiment, portfolio rebalancing, IPO activity, and the growing wealth effect from the stock market itself. The implication is that market behavior increasingly feeds back into the economy through household wealth, risk appetite, and capital formation, so financial conditions can become part of the fundamental story rather than just a reflection of it. For a portfolio manager, this creates a reflexivity question: a durable rally can support activity and confidence, but a reversal can transmit more quickly into spending and financing when households and businesses are highly exposed to market values.`);
  }

  if(out.length) return out.slice(0,5);

  const sentences=text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>70&&!x.endsWith('?')).slice(0,4);
  return sentences.map(s=>`${s} This point comes from the publisher's official episode description rather than a verified transcript, so it should be treated as a discussion theme rather than a verbatim guest conclusion. For a portfolio manager, the useful next step is to use the theme as a prompt for follow-up while avoiding attribution of a precise forecast, number, or conviction level that is not supported by the source text.`);
}

export default async function handler(req,res){
  let statusCode=200;
  let payload=null;
  const capture={
    status(code){statusCode=code;return this;},
    json(value){payload=value;return value;}
  };

  await baseHandler(req,capture);

  if(statusCode===200 && payload && !(payload.investorInsights||[]).length){
    const insights=showNotesFallback(payload);
    if(insights.length){
      payload={
        ...payload,
        investorInsights:insights,
        oneLine:insights[0].split(/(?<=[.!?])\s+/)[0]||'',
        summaryBasis:'Official publisher show notes',
        insightSource:'OFFICIAL SHOW NOTES · NOT TRANSCRIPT',
        insightsAvailable:true,
        transcriptFound:false,
        confidence:'show-notes based'
      };
      console.log('show_notes_fallback',{guest:payload.guest,title:payload.episodeTitle,insightCount:insights.length});
    }
  }

  return res.status(statusCode).json(payload);
}
