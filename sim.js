function salDed(i) {
  if(i<=1625000)return 550000; if(i<=1800000)return i*0.4-1e5;
  if(i<=3600000)return i*0.3+8e4; if(i<=6600000)return i*0.2+44e4;
  if(i<=8500000)return i*0.1+11e5; return 195e4;
}
function incTax(t) {
  if(t<=0)return 0; if(t<=195e4)return t*0.05; if(t<=330e4)return t*0.10-97500;
  if(t<=695e4)return t*0.20-427500; if(t<=900e4)return t*0.23-636e3;
  if(t<=1800e4)return t*0.33-1536e3; if(t<=4000e4)return t*0.40-2796e3;
  return t*0.45-4796e3;
}
function siCalc(mc,ab) {
  const pm=Math.min(mc,65e4)*0.183, hm=Math.min(mc,139e4)*0.0998;
  const mt=(pm+hm)*12;
  const bp=Math.min(ab,150e4)*0.183, bh=Math.min(ab,573e4)*0.0998;
  return { ee:(mt+bp+bh)/2, er:(mt+bp+bh)/2, total:mt+bp+bh };
}
function corpTax(i) {
  if(i<=0)return 0; if(i<=400e4)return i*0.218;
  if(i<=800e4)return 400e4*0.218+(i-400e4)*0.236;
  return 400e4*0.218+400e4*0.236+(i-800e4)*0.337;
}

function sim(rv,ex,mc,bm,futPct,deemedRate,taxInclusive) {
  const Rinput=rv*1e4;
  const R=taxInclusive ? Math.round(Rinput/1.1) : Rinput;
  const EX=ex*1e4, M=mc*1e4, AC=M*12, AB=bm*1e4, TI=AC+AB;
  const s=siCalc(M,AB);
  const ci=R-EX-TI-s.er;
  const ct=corpTax(Math.max(0,ci));
  const sd=salDed(TI), tp=Math.max(0,TI-sd-s.ee-48e4);
  const it=incTax(tp), rt=tp*0.10, rc=it*0.021;
  const ph=TI-s.ee-it-rc-rt;
  const cr=Math.max(0,ci)-ct;
  // 簡易課税の消費税
  const consumptionTax = (deemedRate!=null && deemedRate>=0) ? R*0.10*(1-deemedRate/100) : 0;
  // 今期の税+社保
  const nowTax=ct+it+rc+rt+s.total+consumptionTax;
  // 法人留保の将来取出コスト
  const futCost=cr*(futPct/100);
  // 実質トータル税コスト
  const totalTax=nowTax+futCost;
  const usable=R-totalTax;

  // 実効税率
  const corpEffRate = ci > 0 ? ct / ci : 0;
  const personalTax = it + rc + rt + s.ee;
  const personalEffRate = TI > 0 ? personalTax / TI : 0;
  const totalEffRate = R > 0 ? totalTax / R : 0;

  return { R,Rinput,EX,TI,AC,AB,ci,ct,sd,tp,it,rc,rt,see:s.ee,ser:s.er,st:s.total,ph,cr,nowTax,futCost,totalTax,usable,
    corpEffRate, personalTax, personalEffRate, totalEffRate, consumptionTax };
}

function findOptBonus(rv,ex,mc,futPct,deemedRate,taxInclusive) {
  let best={b:0,tax:Infinity};
  for(let b=0;b<=1000;b+=10) {
    const r=sim(rv,ex,mc,b,futPct,deemedRate,taxInclusive);
    if(r.ci<-1e4) continue;
    if(r.totalTax<best.tax) best={b,tax:r.totalTax};
  }
  return best;
}

export { salDed, incTax, siCalc, corpTax, sim, findOptBonus };
