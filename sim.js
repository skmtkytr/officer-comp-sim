// ============================================================
// 個人課税（令和7年度税制改正後・令和7〜8年分）
// ============================================================

// 給与所得控除（最低保障65万）
function salDed(i) {
  if(i<=1900000)return 650000;
  if(i<=3600000)return i*0.3+8e4; if(i<=6600000)return i*0.2+44e4;
  if(i<=8500000)return i*0.1+11e5; return 195e4;
}
function incTax(t) {
  if(t<=0)return 0; if(t<=195e4)return t*0.05; if(t<=330e4)return t*0.10-97500;
  if(t<=695e4)return t*0.20-427500; if(t<=900e4)return t*0.23-636e3;
  if(t<=1800e4)return t*0.33-1536e3; if(t<=4000e4)return t*0.40-2796e3;
  return t*0.45-4796e3;
}

// 所得税の基礎控除（令和7・8年分。58万＋特例加算）
function basicDedIT(inc) {
  if(inc<=132e4)return 95e4; if(inc<=336e4)return 88e4;
  if(inc<=489e4)return 68e4; if(inc<=655e4)return 63e4;
  if(inc<=2350e4)return 58e4; if(inc<=2400e4)return 48e4;
  if(inc<=2450e4)return 32e4; if(inc<=2500e4)return 16e4;
  return 0;
}

// 住民税の基礎控除
function basicDedRT(inc) {
  if(inc<=2400e4)return 43e4; if(inc<=2450e4)return 29e4;
  if(inc<=2500e4)return 15e4; return 0;
}

// 住民税（東京23区・単身）
//   inc = 合計所得金額, socialDed = 社会保険料控除
//   非課税ライン45万、均等割5,000（森林環境税含む）、調整控除（基礎控除の人的控除差5万）
const RT_EXEMPT_LINE = 450000;
const RT_PER_CAPITA = 5000;
function residentTax(inc, socialDed) {
  if(inc<=RT_EXEMPT_LINE) return { incomeLevy:0, perCapita:0, taxable:0, total:0 };
  const taxable=Math.max(0, inc-socialDed-basicDedRT(inc));
  let adj=0;
  if(inc<=2500e4) adj = taxable<=200e4 ? Math.min(5e4,taxable)*0.05 : Math.max((5e4-(taxable-200e4))*0.05, 2500);
  const incomeLevy=Math.max(0, taxable*0.10-adj);
  return { incomeLevy, perCapita:RT_PER_CAPITA, taxable, total:incomeLevy+RT_PER_CAPITA };
}

// 所得税・復興税・住民税（inc = 合計所得金額）
function personalTaxes(inc, socialDed) {
  inc=Math.max(0, inc);
  const tp=Math.max(0, inc-socialDed-basicDedIT(inc));
  const it=incTax(tp), rc=it*0.021;
  const r=residentTax(inc, socialDed);
  return { tp, it, rc, rt:r.total, rtDetail:r };
}

// ============================================================
// 社会保険（協会けんぽ東京 令和8年度）
//   健保 9.85% / 介護(40〜64歳) 1.62% / 子ども・子育て支援金 0.23% / 厚生年金 18.3%
// ============================================================
const SI_RATE = { pension:0.183, health:0.0985, care:0.0162, child:0.0023 };

// 健康保険の標準報酬月額 等級表（[標準報酬, 報酬月額の上限(未満)]）
const HEALTH_GRADES = [
  [58e3,63e3],[68e3,73e3],[78e3,83e3],[88e3,93e3],[98e3,101e3],[104e3,107e3],[110e3,114e3],
  [118e3,122e3],[126e3,130e3],[134e3,138e3],[142e3,146e3],[150e3,155e3],[160e3,165e3],
  [170e3,175e3],[180e3,185e3],[190e3,195e3],[200e3,210e3],[220e3,230e3],[240e3,250e3],
  [260e3,270e3],[280e3,290e3],[300e3,310e3],[320e3,330e3],[340e3,350e3],[360e3,370e3],
  [380e3,395e3],[410e3,425e3],[440e3,455e3],[470e3,485e3],[500e3,515e3],[530e3,545e3],
  [560e3,575e3],[590e3,605e3],[620e3,635e3],[650e3,665e3],[680e3,695e3],[710e3,730e3],
  [750e3,770e3],[790e3,810e3],[830e3,855e3],[880e3,905e3],[930e3,955e3],[980e3,1005e3],
  [1030e3,1055e3],[1090e3,1115e3],[1150e3,1175e3],[1210e3,1235e3],[1270e3,1295e3],
  [1330e3,1355e3],[1390e3,Infinity],
];
function standardMonthly(m) {
  for(const [std,upper] of HEALTH_GRADES) if(m<upper) return std;
  return 1390e3;
}
function pensionStandard(m) {
  return Math.min(650e3, Math.max(88e3, standardMonthly(m)));
}

// mc = 月額報酬, ab = 賞与（年1回支給前提）, opts.age40 = 介護保険第2号被保険者
function siCalc(mc,ab,opts={}) {
  if(mc<=0) return { ee:0, er:0, total:0 };
  const hRate=SI_RATE.health+SI_RATE.child+(opts.age40?SI_RATE.care:0);
  const mt=(pensionStandard(mc)*SI_RATE.pension+standardMonthly(mc)*hRate)*12;
  const sb=Math.floor(Math.max(0,ab)/1000)*1000; // 標準賞与額
  const bt=Math.min(sb,150e4)*SI_RATE.pension+Math.min(sb,573e4)*hRate;
  const total=mt+bt;
  return { ee:total/2, er:total/2, total };
}

// ============================================================
// 法人税等（中小法人・東京都特別区・資本金1億以下）
//   法人税 15%(800万以下)/23.2%, 地方法人税 10.3%, 法人都民税 法人税割 7.0% + 均等割,
//   事業税 所得割 3.5/5.3/7.0%（軽減税率不適用法人は7.0%一律）, 特別法人事業税 37%,
//   防衛特別法人税 (法人税額−500万)×4%（令和8.4.1以後開始事業年度）
// ============================================================
const floorTo = (n, u) => Math.floor(n / u) * u;

function bizTaxOf(base, reduced) {
  const jigyo = floorTo(reduced
    ? Math.min(base,400e4)*0.035 + Math.min(Math.max(base-400e4,0),400e4)*0.053 + Math.max(base-800e4,0)*0.07
    : base*0.07, 100);
  return { jigyo, tokubetsu: floorTo(jigyo*0.37, 100) };
}

// income = 課税所得（別表四の所得金額）
// opts.bizTaxReduced（既定 true）, opts.kintou（均等割・既定 7万）
function corpTaxDetail(income, opts={}) {
  const reduced = opts.bizTaxReduced !== false;
  const kintou = opts.kintou ?? 70000;
  const base = floorTo(Math.max(0, income), 1000);
  const houjinRaw = Math.min(base,800e4)*0.15 + Math.max(base-800e4,0)*0.232;
  const houjin = floorTo(houjinRaw, 100);
  const hBase = floorTo(houjinRaw, 1000); // 地方法人税・法人税割の課税標準
  const chihou = floorTo(hBase*0.103, 100);
  const juminWari = floorTo(hBase*0.07, 100);
  const defense = floorTo(Math.max(0, houjinRaw-500e4)*0.04, 100);
  const { jigyo, tokubetsu } = bizTaxOf(base, reduced);
  const total = houjin+chihou+juminWari+kintou+jigyo+tokubetsu+defense;
  return { taxable: Math.max(0, income), houjin, chihou, juminWari, kintou, jigyo, tokubetsu, defense, total };
}

// profit = 税引前利益（事業税控除前）。事業税等は支払年度の損金になるため、
// 定常状態（毎年同水準）を仮定し 課税所得 + 事業税等 = 税引前利益 となる課税所得を求める。
function corpTaxFromProfit(profit, opts={}) {
  const reduced = opts.bizTaxReduced !== false;
  let lo=0, hi=Math.max(0, Math.floor(profit));
  while(lo<hi) {
    const mid=Math.ceil((lo+hi)/2);
    const b=bizTaxOf(floorTo(mid,1000), reduced);
    if(mid+b.jigyo+b.tokubetsu<=profit) lo=mid; else hi=mid-1;
  }
  return corpTaxDetail(lo, opts);
}

// ============================================================
// 赤字のときの還付
// ============================================================
const CORP_TAX_KEYS = ['houjin','chihou','juminWari','kintou','jigyo','tokubetsu','defense'];

// 予定申告の中間納付額（前期確定税額 × 6/12）。前期法人税の1/2が10万以下なら中間申告不要。
//   prevIncome = 前期の課税所得（別表一「所得金額」）
function interimPayment(prevIncome, opts={}) {
  const none = { required:false, total:0 };
  CORP_TAX_KEYS.forEach(k => none[k]=0);
  if(!(prevIncome>0)) return none;
  const prev = corpTaxDetail(prevIncome, opts);
  if(prev.houjin/2 <= 100000) return none;
  const r = { required:true, total:0 };
  CORP_TAX_KEYS.forEach(k => { r[k]=floorTo(prev[k]/2, 100); r.total+=r[k]; });
  return r;
}

// 欠損金の繰戻し還付（中小法人・青色申告・前1年）
//   法人税 = 前期法人税額 × 欠損金額 / 前期所得金額（欠損金は前期所得が上限）
//   地方法人税 = 法人税の還付額 × 10.3%（前期の地方法人税が上限）
function carrybackRefund(loss, prevIncome, opts={}) {
  if(!(loss>0) || !(prevIncome>0)) return { houjin:0, chihou:0, total:0, used:0 };
  const prev = corpTaxDetail(prevIncome, opts);
  const used = Math.min(loss, prevIncome);
  const houjin = Math.floor(prev.houjin*used/prevIncome);
  const chihou = Math.min(Math.floor(houjin*0.103), prev.chihou);
  return { houjin, chihou, total:houjin+chihou, used };
}

// 今期の還付・納付のまとめ
//   opts.prevIncome（前期の課税所得・円）, opts.carryback（既定 true）, opts.interim（既定 true＝予定申告）
function refundSummary(ci, ctDetail, opts={}) {
  const prevIncome = opts.prevIncome || 0;
  const loss = Math.max(0, -ci);
  const carryback = opts.carryback === false ? carrybackRefund(0, 0) : carrybackRefund(loss, prevIncome, opts);
  const interim = opts.interim === false ? interimPayment(0) : interimPayment(prevIncome, opts);
  let refund=0, pay=0;
  CORP_TAX_KEYS.forEach(k => {
    const d = ctDetail[k]-interim[k];
    if(d>0) pay+=d; else refund-=d;
  });
  return { loss, carryback, carryForward: loss-carryback.used, interim, settle:{ refund, pay } };
}

function corpTax(profit, opts={}) {
  return corpTaxFromProfit(profit, opts).total;
}

// opts: { bizTaxReduced, kintou, age40, prevIncome, carryback, interim }
function sim(rv,ex,mc,bm,futPct,deemedRate,taxInclusive,opts={}) {
  const Rinput=rv*1e4;
  const R=taxInclusive ? Math.round(Rinput/1.1) : Rinput;
  const EX=ex*1e4, M=mc*1e4, AC=M*12, AB=bm*1e4, TI=AC+AB;
  const s=siCalc(M,AB,opts);
  const ci=R-EX-TI-s.er;
  const ctDetail=corpTaxFromProfit(ci,opts);
  const ct=ctDetail.total;
  const refund=refundSummary(ci,ctDetail,opts);
  const sd=salDed(TI);
  const p=personalTaxes(TI-sd, s.ee);
  const tp=p.tp, it=p.it, rc=p.rc, rt=p.rt;
  const ph=TI-s.ee-it-rc-rt;
  const cr=Math.max(0,ci)-ct;
  // 簡易課税の消費税
  const consumptionTax = (deemedRate!=null && deemedRate>=0) ? R*0.10*(1-deemedRate/100) : 0;
  // 今期の税+社保
  //   欠損金の繰戻し還付はマイナスの税として差し引く（中間納付は時期のずれなので含めない）
  const nowTax=ct-refund.carryback.total+it+rc+rt+s.total+consumptionTax;
  // 法人留保の将来取出コスト
  const futCost=Math.max(0,cr)*(futPct/100);
  // 実質トータル税コスト
  const totalTax=nowTax+futCost;
  const usable=R-totalTax;

  // 実効税率
  const corpEffRate = ci > 0 ? ct / ci : 0;
  const personalTax = it + rc + rt + s.ee;
  const personalEffRate = TI > 0 ? personalTax / TI : 0;
  const totalEffRate = R > 0 ? totalTax / R : 0;

  return { R,Rinput,EX,TI,AC,AB,ci,ct,ctDetail,refund,sd,tp,it,rc,rt,see:s.ee,ser:s.er,st:s.total,ph,cr,nowTax,futCost,totalTax,usable,
    corpEffRate, personalTax, personalEffRate, totalEffRate, consumptionTax };
}

function findOptBonus(rv,ex,mc,futPct,deemedRate,taxInclusive,opts={}) {
  let best={b:0,tax:Infinity};
  for(let b=0;b<=1000;b+=10) {
    const r=sim(rv,ex,mc,b,futPct,deemedRate,taxInclusive,opts);
    if(r.ci<-1e4) continue;
    if(r.totalTax<best.tax) best={b,tax:r.totalTax};
  }
  return best;
}

function findOpt(rv,ex,futPct,deemedRate,taxInclusive,opts={}) {
  let best={c:5,b:0,tax:Infinity};
  for(let m=5;m<=200;m++) for(let b=0;b<=1000;b+=10) {
    const r=sim(rv,ex,m,b,futPct,deemedRate,taxInclusive,opts);
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
//   標準報酬の等級で会社負担が段階的に変わるため、額面 + 会社負担 ≤ コスト となる最大の額面を返す
function grossFromCost(cost, opts = {}) {
  let lo = 0, hi = cost;
  for (let i = 0; i < 80; i++) {
    const ag = (lo + hi) / 2;
    const er = siCalc(ag / 12, 0, opts).er;
    if (ag + er > cost) hi = ag; else lo = ag;
  }
  return lo;
}

// 正社員: 会社コスト C(万) = 額面 + 会社負担社保
function simEmployee(cWan, opts = {}) {
  const C = cWan * 1e4;
  const gross = grossFromCost(C, opts);
  const s = siCalc(gross / 12, 0, opts);
  const sd = salDed(gross);
  const { tp, it, rc, rt } = personalTaxes(gross - sd, s.ee);
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
  const { tp, it, rc, rt } = personalTaxes(afterAoiro, socialDed);
  const burden = it + rc + rt + nenkin + kokuhoIns + bizTax;
  const usable = C - EX - burden;
  return { type: 'sole', C, EX, bizIncome, aoiro, nenkin, kokuho: kokuhoIns, bizTax, tp, it, rc, rt, burden, usable, effRate: burden / C };
}

// マイクロ法人: 会社コスト C(万) を全額 売上として受取、税+社保最小の役員報酬を自動選択
function simMicroCorp(cWan, exWan, futPct, opts = {}) {
  const opt = findOpt(cWan, exWan, futPct, -1, false, opts); // 消費税は除外(deemedRate=-1)
  const r = sim(cWan, exWan, opt.c, opt.b, futPct, -1, false, opts);
  const C = r.R;
  const EX = (exWan || 0) * 1e4;
  const burden = r.ct + r.it + r.rc + r.rt + r.st + r.futCost;
  const usable = C - EX - burden;
  return { type: 'micro', C, EX, optComp: opt.c, optBonus: opt.b, ct: r.ct, st: r.st, it: r.it, rc: r.rc, rt: r.rt, cr: r.cr, futCost: r.futCost, ph: r.ph, burden, usable, effRate: burden / C };
}

// 3形態を同時に計算して返す
function compareByCost(cWan, exWan, futPct, opts = {}) {
  return {
    emp: simEmployee(cWan, opts),
    sole: simSoleProprietor(cWan, exWan),
    micro: simMicroCorp(cWan, exWan, futPct, opts),
  };
}

// ブラウザでは <script src="sim.js"> でグローバルに読み込む（file:// でも動くよう ES module にしない）。
// テスト（bun）からは CommonJS 経由で import する。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    salDed, incTax, basicDedIT, basicDedRT, residentTax, personalTaxes,
    standardMonthly, pensionStandard, siCalc,
    corpTax, corpTaxDetail, corpTaxFromProfit, interimPayment, carrybackRefund, sim, findOptBonus, findOpt,
    kokuho, grossFromCost, simEmployee, simSoleProprietor, simMicroCorp, compareByCost,
  };
}
