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

function findOpt(rv,ex,futPct,deemedRate,taxInclusive) {
  let best={c:5,b:0,tax:Infinity};
  for(let m=5;m<=200;m++) for(let b=0;b<=1000;b+=10) {
    const r=sim(rv,ex,m,b,futPct,deemedRate,taxInclusive);
    if(r.ci<-1e4) continue;
    if(r.totalTax<best.tax) best={c:m,b,tax:r.totalTax};
  }
  return best;
}

// ============================================================
// 雇用形態の比較（同じ会社コストで）
//   会社が1人を雇うのにかかる年間コスト C（円）を固定して、
//   正社員 / 個人事業主 / マイクロ法人 の「実質使えるお金」を比較する。
//   税負担の違い（所得課税・社会保険・法人税）にフォーカスするため、
//   消費税は3形態とも除外する。マイクロ法人の内部留保は
//   将来取出コスト（futPct）適用後で評価する。
// ============================================================

// 国民年金（定額・2024: 16,980円/月）
const NENKIN_ANNUAL = 203760;

// 国民健康保険（簡易・東京23区2024概算・介護分なし）
//   所得割 10.4% + 均等割 64,100円、賦課限度額 89万円
//   totalIncome = 総所得金額（青色控除後・基礎控除前）
function kokuho(totalIncome) {
  const base = Math.max(0, totalIncome - 430000); // 国保の基礎控除43万
  return Math.min(base * 0.104 + 64100, 890000);
}

// 会社コスト（額面 + 会社負担社保）から額面年収を逆算
function grossFromCost(cost) {
  let lo = 0, hi = cost;
  for (let i = 0; i < 80; i++) {
    const ag = (lo + hi) / 2;
    const er = siCalc(ag / 12, 0).er;
    if (ag + er > cost) hi = ag; else lo = ag;
  }
  return (lo + hi) / 2;
}

// 正社員: 会社コスト C(万) = 額面 + 会社負担社保
function simEmployee(cWan) {
  const C = cWan * 1e4;
  const gross = grossFromCost(C);
  const s = siCalc(gross / 12, 0);
  const sd = salDed(gross);
  const tp = Math.max(0, gross - sd - s.ee - 48e4);
  const it = incTax(tp), rt = tp * 0.10, rc = it * 0.021;
  const burden = it + rc + rt + s.total; // 所得課税 + 社保(労使合計)
  const usable = C - burden;
  return { type: 'employee', C, gross, ee: s.ee, er: s.er, si: s.total, sd, tp, it, rc, rt, burden, usable, effRate: burden / C };
}

// 個人事業主: 会社コスト C(万) を全額 業務委託費として受取
function simSoleProprietor(cWan, exWan) {
  const C = cWan * 1e4;
  const EX = (exWan || 0) * 1e4;
  const bizIncome = Math.max(0, C - EX);              // 事業所得（青色控除前）
  const aoiro = 650000;                               // 青色申告特別控除
  const afterAoiro = Math.max(0, bizIncome - aoiro);  // 総所得金額（国保算定ベース）
  const nenkin = NENKIN_ANNUAL;
  const kokuhoIns = kokuho(afterAoiro);
  const bizTax = Math.max(0, bizIncome - 2900000) * 0.05; // 個人事業税（青色控除なし・第一種5%）
  const socialDed = nenkin + kokuhoIns;               // 社会保険料控除（全額控除）
  const tp = Math.max(0, afterAoiro - socialDed - 48e4);
  const it = incTax(tp), rt = tp * 0.10, rc = it * 0.021;
  const burden = it + rc + rt + nenkin + kokuhoIns + bizTax;
  const usable = C - EX - burden;
  return { type: 'sole', C, EX, bizIncome, aoiro, nenkin, kokuho: kokuhoIns, bizTax, tp, it, rc, rt, burden, usable, effRate: burden / C };
}

// マイクロ法人: 会社コスト C(万) を全額 売上として受取、税+社保最小の役員報酬を自動選択
function simMicroCorp(cWan, exWan, futPct) {
  const opt = findOpt(cWan, exWan, futPct, -1, false); // 消費税は除外(deemedRate=-1)
  const r = sim(cWan, exWan, opt.c, opt.b, futPct, -1, false);
  const C = r.R;
  const EX = (exWan || 0) * 1e4;
  const burden = r.ct + r.it + r.rc + r.rt + r.st + r.futCost;
  const usable = C - EX - burden;
  return { type: 'micro', C, EX, optComp: opt.c, optBonus: opt.b, ct: r.ct, st: r.st, it: r.it, rc: r.rc, rt: r.rt, cr: r.cr, futCost: r.futCost, ph: r.ph, burden, usable, effRate: burden / C };
}

// 3形態を同時に計算して返す
function compareByCost(cWan, exWan, futPct) {
  return {
    emp: simEmployee(cWan),
    sole: simSoleProprietor(cWan, exWan),
    micro: simMicroCorp(cWan, exWan, futPct),
  };
}

export {
  salDed, incTax, siCalc, corpTax, sim, findOptBonus, findOpt,
  kokuho, grossFromCost, simEmployee, simSoleProprietor, simMicroCorp, compareByCost,
};
