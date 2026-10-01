import { describe, test, expect } from "bun:test";
import {
  sim,
  findOptBonus,
  findOpt,
  siCalc,
  kokuho,
  grossFromCost,
  simEmployee,
  simSoleProprietor,
  simMicroCorp,
  compareByCost,
  corpTax,
  corpTaxDetail,
  corpTaxFromProfit,
  salDed,
  basicDedIT,
  basicDedRT,
  residentTax,
  personalTaxes,
  standardMonthly,
  pensionStandard,
  interimPayment,
  carrybackRefund,
} from "./sim.js";

describe("sim effective tax rates", () => {
  // 基本ケース: 売上2000万、経費600万、月額報酬50万、賞与0、将来コスト20%
  const r = sim(2000, 600, 50, 0, 20);

  test("corpEffRate: 法人税実効税率 = 法人税等 / 法人所得", () => {
    expect(r.ci).toBeGreaterThan(0);
    expect(r.corpEffRate).toBeCloseTo(r.ct / r.ci, 10);
  });

  test("corpEffRate is between 0 and 1", () => {
    expect(r.corpEffRate).toBeGreaterThan(0);
    expect(r.corpEffRate).toBeLessThan(1);
  });

  test("personalEffRate: 個人実効税率 = (所得税+復興税+住民税+社保個人) / 総支給", () => {
    const personalTax = r.it + r.rc + r.rt + r.see;
    expect(r.personalEffRate).toBeCloseTo(personalTax / r.TI, 10);
  });

  test("personalEffRate is between 0 and 1", () => {
    expect(r.personalEffRate).toBeGreaterThan(0);
    expect(r.personalEffRate).toBeLessThan(1);
  });

  test("totalEffRate: トータル実効税率 = totalTax / 売上", () => {
    expect(r.totalEffRate).toBeCloseTo(r.totalTax / r.R, 10);
  });

  test("totalEffRate is between 0 and 1", () => {
    expect(r.totalEffRate).toBeGreaterThan(0);
    expect(r.totalEffRate).toBeLessThan(1);
  });

  // 法人所得が赤字のケース
  test("corpEffRate is 0 when corporate income is negative", () => {
    // 報酬を高くして法人所得を赤字にする
    const rLoss = sim(2000, 600, 200, 0, 20);
    expect(rLoss.ci).toBeLessThanOrEqual(0);
    expect(rLoss.corpEffRate).toBe(0);
  });

  // 賞与ありのケース
  test("rates are calculated correctly with bonus", () => {
    const rBonus = sim(2000, 600, 30, 200, 20);
    expect(rBonus.corpEffRate).toBeGreaterThan(0);
    expect(rBonus.personalEffRate).toBeGreaterThan(0);
    expect(rBonus.totalEffRate).toBeGreaterThan(0);
  });
});

describe("sim consumption tax (簡易課税)", () => {
  // みなし仕入率: 第五種(サービス業) = 50%
  // 納付消費税 = 売上(税抜) × 10% × (1 - みなし仕入率)
  // = 2000万 × 10% × (1 - 0.5) = 100万
  test("第五種(50%): consumption tax is calculated correctly", () => {
    const r = sim(2000, 600, 50, 0, 20, 50);
    expect(r.consumptionTax).toBeCloseTo(2000e4 * 0.10 * (1 - 0.50), 0);
  });

  // 第一種(卸売業) = 90%
  test("第一種(90%): low consumption tax", () => {
    const r = sim(2000, 600, 50, 0, 20, 90);
    expect(r.consumptionTax).toBeCloseTo(2000e4 * 0.10 * (1 - 0.90), 0);
  });

  // 第六種(不動産業) = 40%
  test("第六種(40%): high consumption tax", () => {
    const r = sim(2000, 600, 50, 0, 20, 40);
    expect(r.consumptionTax).toBeCloseTo(2000e4 * 0.10 * (1 - 0.40), 0);
  });

  // 免税事業者 (みなし仕入率 = -1 or undefined → 消費税0)
  test("免税事業者: no consumption tax when deemedRate is -1", () => {
    const r = sim(2000, 600, 50, 0, 20, -1);
    expect(r.consumptionTax).toBe(0);
  });

  test("backward compat: no deemedRate arg means no consumption tax", () => {
    const r = sim(2000, 600, 50, 0, 20);
    expect(r.consumptionTax).toBe(0);
  });

  // 消費税がtotalTaxに含まれる
  test("consumption tax is included in totalTax", () => {
    const rWith = sim(2000, 600, 50, 0, 20, 50);
    const rWithout = sim(2000, 600, 50, 0, 20, -1);
    expect(rWith.totalTax).toBeGreaterThan(rWithout.totalTax);
    expect(rWith.totalTax - rWithout.totalTax).toBeCloseTo(rWith.consumptionTax, 0);
  });

  // 消費税は法人所得に影響しない（損金不算入ではなく税込経理方式でもないため）
  // ※簡易課税の納付消費税は法人の経費になるが、ここではシンプルに別枠で計算
  test("consumption tax does not affect corporate income", () => {
    const rWith = sim(2000, 600, 50, 0, 20, 50);
    const rWithout = sim(2000, 600, 50, 0, 20, -1);
    expect(rWith.ci).toBe(rWithout.ci);
  });
});

describe("findOptBonus (月額固定で最適賞与を探す)", () => {
  test("returns optimal bonus for fixed monthly comp", () => {
    const opt = findOptBonus(2000, 600, 50, 20, 50);
    expect(opt).toHaveProperty("b");
    expect(opt).toHaveProperty("tax");
    expect(opt.b).toBeGreaterThanOrEqual(0);
    expect(opt.b).toBeLessThanOrEqual(1000);
  });

  test("optimal bonus has tax <= bonus=0 case", () => {
    const opt = findOptBonus(2000, 600, 50, 20, 50);
    const rZero = sim(2000, 600, 50, 0, 20, 50);
    expect(opt.tax).toBeLessThanOrEqual(rZero.totalTax);
  });

  test("optimal bonus has tax <= any other bonus", () => {
    const opt = findOptBonus(2000, 600, 30, 20, -1);
    // spot check a few values
    for (const b of [0, 100, 200, 500, 1000]) {
      const r = sim(2000, 600, 30, b, 20, -1);
      if (r.ci >= -1e4) {
        expect(opt.tax).toBeLessThanOrEqual(r.totalTax + 1); // +1 for float tolerance
      }
    }
  });

  test("skips combos that cause corporate loss", () => {
    // 月額200万だと法人所得が赤字になりやすい → 賞与0が返るはず
    const opt = findOptBonus(2000, 600, 200, 20, -1);
    expect(opt.b).toBe(0);
  });
});

// ============================================================
// 雇用形態の比較（同じ会社コストで）
//   会社が1人を雇うのにかかる年間コスト C を固定して、
//   正社員 / 個人事業主 / マイクロ法人 を比較する。
// ============================================================

describe("grossFromCost（会社コストから額面を逆算）", () => {
  test("額面 + 会社負担社保 = 会社コスト", () => {
    const cost = 8_000_000;
    const gross = grossFromCost(cost);
    const er = siCalc(gross / 12, 0).er;
    expect(gross + er).toBeCloseTo(cost, 0);
  });

  test("額面は会社コスト未満（会社負担社保がある分だけ小さい）", () => {
    expect(grossFromCost(8_000_000)).toBeLessThan(8_000_000);
  });

  test("標準報酬の等級の段差があっても会社コストを超えない", () => {
    for (let cost = 1_000_000; cost <= 20_000_000; cost += 70_000) {
      const gross = grossFromCost(cost);
      const er = siCalc(gross / 12, 0).er;
      expect(gross + er).toBeLessThanOrEqual(cost + 1e-6);
      expect(cost - (gross + er)).toBeLessThan(60_000); // 1等級分の段差以内
    }
  });

  test("コスト0なら額面0", () => {
    expect(grossFromCost(0)).toBeCloseTo(0, 5);
  });
});

describe("kokuho（国民健康保険・簡易）", () => {
  test("所得ゼロなら均等割のみ", () => {
    expect(kokuho(0)).toBeCloseTo(64100, 0);
  });

  test("賦課限度額89万で頭打ち", () => {
    expect(kokuho(50_000_000)).toBe(890_000);
  });

  test("所得が増えると保険料も増える（上限まで）", () => {
    expect(kokuho(5_000_000)).toBeGreaterThan(kokuho(1_000_000));
  });
});

describe("simEmployee（正社員）", () => {
  const r = simEmployee(800);

  test("実質使えるお金 = 会社コスト − 負担", () => {
    expect(r.usable).toBeCloseTo(r.C - r.burden, 5);
  });

  test("負担 = 所得税+復興+住民税 + 社保（労使合計）", () => {
    expect(r.burden).toBeCloseTo(r.it + r.rc + r.rt + r.si, 5);
  });

  test("社保は労使折半（本人負担 = 会社負担）", () => {
    expect(r.ee).toBeCloseTo(r.er, 5);
  });

  test("実効負担率は0〜1", () => {
    expect(r.effRate).toBeGreaterThan(0);
    expect(r.effRate).toBeLessThan(1);
  });
});

describe("simSoleProprietor（個人事業主）", () => {
  const r = simSoleProprietor(800, 0);

  test("実質使えるお金 = 会社コスト − 経費 − 負担", () => {
    expect(r.usable).toBeCloseTo(r.C - r.EX - r.burden, 5);
  });

  test("負担 = 所得税+復興+住民税 + 国民年金 + 国保 + 事業税", () => {
    expect(r.burden).toBeCloseTo(
      r.it + r.rc + r.rt + r.nenkin + r.kokuho + r.bizTax,
      5,
    );
  });

  test("青色申告特別控除65万が適用される", () => {
    expect(r.aoiro).toBe(650_000);
  });

  test("事業所得290万以下なら個人事業税は0（事業主控除290万）", () => {
    const low = simSoleProprietor(280, 0);
    expect(low.bizTax).toBe(0);
  });

  test("国民年金は定額", () => {
    const a = simSoleProprietor(500, 0);
    const b = simSoleProprietor(1500, 0);
    expect(a.nenkin).toBe(b.nenkin);
  });
});

describe("simMicroCorp（マイクロ法人）", () => {
  const r = simMicroCorp(800, 0, 20);

  test("最適な役員報酬を範囲内で選ぶ", () => {
    expect(r.optComp).toBeGreaterThanOrEqual(5);
    expect(r.optComp).toBeLessThanOrEqual(200);
  });

  test("実質使えるお金 = 会社コスト − 経費 − 負担", () => {
    expect(r.usable).toBeCloseTo(r.C - r.EX - r.burden, 5);
  });

  test("負担 = 法人税 + 所得税+復興+住民税 + 社保 + 将来取出コスト", () => {
    expect(r.burden).toBeCloseTo(
      r.ct + r.it + r.rc + r.rt + r.st + r.futCost,
      5,
    );
  });

  test("消費税は比較から除外される（deemedRate無効）", () => {
    // consumptionTax を含まないことを確認するため、同条件の sim と比べる
    const direct = sim(800, 0, r.optComp, r.optBonus, 20, -1, false);
    expect(direct.consumptionTax).toBe(0);
  });
});

describe("compareByCost（3形態の同時比較）", () => {
  const c = compareByCost(800, 0, 20);

  test("3形態すべてを返す", () => {
    expect(c.emp.type).toBe("employee");
    expect(c.sole.type).toBe("sole");
    expect(c.micro.type).toBe("micro");
  });

  test("3形態とも同じ会社コスト C を使う", () => {
    expect(c.emp.C).toBeCloseTo(c.sole.C, 0);
    expect(c.sole.C).toBeCloseTo(c.micro.C, 0);
  });

  test("どの形態も使えるお金は正で会社コスト未満", () => {
    for (const r of [c.emp, c.sole, c.micro]) {
      expect(r.usable).toBeGreaterThan(0);
      expect(r.usable).toBeLessThan(r.C);
    }
  });

  test("経費を増やすと個人・法人とも使えるお金は減る（支出のため）", () => {
    const c0 = compareByCost(800, 0, 20);
    const c1 = compareByCost(800, 100, 20);
    expect(c1.sole.usable).toBeLessThan(c0.sole.usable);
    expect(c1.micro.usable).toBeLessThan(c0.micro.usable);
  });
});

describe("tax inclusive mode (税込売上)", () => {
  // 税込2200万 = 税抜2000万
  // 税込モードの結果は、税抜2000万と同じ法人所得・個人税になるはず
  test("R is converted to tax-exclusive internally", () => {
    const rIncl = sim(2200, 600, 50, 0, 20, -1, true);
    const rExcl = sim(2000, 600, 50, 0, 20, -1, false);
    expect(rIncl.R).toBeCloseTo(rExcl.R, 0);
  });

  test("corporate income matches tax-exclusive equivalent", () => {
    const rIncl = sim(2200, 600, 50, 0, 20, -1, true);
    const rExcl = sim(2000, 600, 50, 0, 20, -1, false);
    expect(rIncl.ci).toBeCloseTo(rExcl.ci, 0);
  });

  test("personal tax matches tax-exclusive equivalent", () => {
    const rIncl = sim(2200, 600, 50, 0, 20, -1, true);
    const rExcl = sim(2000, 600, 50, 0, 20, -1, false);
    expect(rIncl.it).toBeCloseTo(rExcl.it, 0);
  });

  test("consumption tax uses tax-exclusive base", () => {
    // 税込2200万 → 税抜2000万 → 消費税 = 2000万 × 10% × (1-50%) = 100万
    const rIncl = sim(2200, 600, 50, 0, 20, 50, true);
    expect(rIncl.consumptionTax).toBeCloseTo(2000e4 * 0.10 * 0.50, 0);
  });

  test("Rinput stores the original tax-inclusive input", () => {
    const rIncl = sim(2200, 600, 50, 0, 20, -1, true);
    expect(rIncl.Rinput).toBe(2200e4);
    // R is the tax-exclusive amount
    expect(rIncl.R).toBeCloseTo(2000e4, 0);
  });

  test("false taxInclusive behaves same as omitted", () => {
    const r1 = sim(2000, 600, 50, 0, 20, 50, false);
    const r2 = sim(2000, 600, 50, 0, 20, 50);
    expect(r1.R).toBe(r2.R);
    expect(r1.ci).toBe(r2.ci);
    expect(r1.totalTax).toBe(r2.totalTax);
  });
});

// ============================================================
// 法人税等の内訳（中小法人・東京都特別区）
//   実申告書（令和7.9.1〜令和8.8.31、所得6,949,034円、事業税は軽減税率不適用）を再現できること
// ============================================================

describe("corpTaxDetail（課税所得から法人税等の内訳）", () => {
  test("実申告書を再現（軽減税率不適用＝事業税7.0%一律）", () => {
    const d = corpTaxDetail(6_949_034, { bizTaxReduced: false });
    expect(d.houjin).toBe(1_042_300);      // 法人税 15%（百円未満切捨）
    expect(d.chihou).toBe(107_300);        // 地方法人税 10.3%
    expect(d.juminWari).toBe(72_900);      // 法人都民税 法人税割 7.0%
    expect(d.kintou).toBe(70_000);         // 均等割
    expect(d.jigyo).toBe(486_400);         // 事業税 所得割
    expect(d.tokubetsu).toBe(179_900);     // 特別法人事業税 37%
    expect(d.defense).toBe(0);
    expect(d.total).toBe(1_958_800);
  });

  test("軽減税率（デフォルト）なら事業税は段階税率 3.5% / 5.3%", () => {
    const d = corpTaxDetail(6_949_034);
    // 400万×3.5% + 294.9万×5.3% = 140,000 + 156,297 → 296,200
    expect(d.jigyo).toBe(296_200);
    expect(d.tokubetsu).toBe(109_500); // 296,200×37% = 109,594 → 109,500
    expect(d.houjin).toBe(1_042_300);
  });

  test("所得0でも均等割7万はかかる", () => {
    const d = corpTaxDetail(0);
    expect(d.total).toBe(70_000);
    expect(d.kintou).toBe(70_000);
  });

  test("マイナス所得は0扱い（均等割のみ）", () => {
    expect(corpTaxDetail(-1_000_000).total).toBe(70_000);
  });

  test("800万超の部分は法人税23.2%", () => {
    const d = corpTaxDetail(10_000_000);
    expect(d.houjin).toBe(1_200_000 + 464_000);
  });

  test("防衛特別法人税 = (法人税額 − 500万) × 4%", () => {
    const d = corpTaxDetail(40_000_000);
    // 法人税 = 1,200,000 + 3,200万×23.2% = 8,624,000
    expect(d.houjin).toBe(8_624_000);
    expect(d.defense).toBe(144_900); // (8,624,000−5,000,000)×4% = 144,960 → 144,900
  });

  test("均等割はオプションで変更できる", () => {
    expect(corpTaxDetail(0, { kintou: 180_000 }).total).toBe(180_000);
  });
});

describe("corpTaxFromProfit（税引前利益から定常状態の法人税等）", () => {
  test("事業税は損金：課税所得 + 事業税等 ≒ 税引前利益", () => {
    const d = corpTaxFromProfit(7_348_000);
    expect(d.taxable + d.jigyo + d.tokubetsu).toBeLessThanOrEqual(7_348_000);
    expect(7_348_000 - (d.taxable + d.jigyo + d.tokubetsu)).toBeLessThan(2_000);
  });

  test("課税所得は税引前利益より事業税分だけ小さい", () => {
    const d = corpTaxFromProfit(7_348_000);
    expect(d.taxable).toBeLessThan(7_348_000);
  });

  test("赤字なら均等割のみ", () => {
    const d = corpTaxFromProfit(-500_000);
    expect(d.taxable).toBe(0);
    expect(d.total).toBe(70_000);
  });

  test("corpTax は total を返す", () => {
    expect(corpTax(7_348_000)).toBe(corpTaxFromProfit(7_348_000).total);
  });
});

describe("sim の法人税等（内訳と均等割・事業税切替）", () => {
  test("ct は内訳の合計", () => {
    const r = sim(1276.2, 369.3, 14.6, 0, 20, -1, false);
    expect(r.ct).toBe(r.ctDetail.total);
  });

  test("赤字でも均等割が totalTax に入る", () => {
    const r = sim(2000, 600, 200, 0, 20, -1);
    expect(r.ci).toBeLessThan(0);
    expect(r.ct).toBe(70_000);
  });

  test("軽減税率不適用にすると法人税等が増える", () => {
    const a = sim(1276.2, 369.3, 14.6, 0, 20, -1, false);
    const b = sim(1276.2, 369.3, 14.6, 0, 20, -1, false, { bizTaxReduced: false });
    expect(b.ct).toBeGreaterThan(a.ct);
  });

  test("留保が赤字のとき将来取出コストはマイナスにならない", () => {
    const r = sim(2000, 600, 200, 0, 20, -1);
    expect(r.futCost).toBe(0);
  });
});

// ============================================================
// 個人課税（令和7年度改正後・令和7〜8年分）
// ============================================================

describe("salDed（給与所得控除・最低65万）", () => {
  test("190万以下は65万", () => {
    expect(salDed(1_000_000)).toBe(650_000);
    expect(salDed(1_752_000)).toBe(650_000);
    expect(salDed(1_900_000)).toBe(650_000);
  });
  test("190万超は従来どおり", () => {
    expect(salDed(3_000_000)).toBe(980_000);
    expect(salDed(10_000_000)).toBe(1_950_000);
  });
  test("収入が控除額未満でも給与所得はマイナスにならない（呼び出し側で確認）", () => {
    expect(Math.max(0, 500_000 - salDed(500_000))).toBe(0);
  });
});

describe("basicDedIT（所得税の基礎控除・令和7〜8年分）", () => {
  test.each([
    [0, 950_000],
    [1_320_000, 950_000],
    [1_320_001, 880_000],
    [3_360_000, 880_000],
    [3_360_001, 680_000],
    [4_890_001, 630_000],
    [6_550_001, 580_000],
    [23_500_000, 580_000],
    [23_500_001, 480_000],
    [24_000_001, 320_000],
    [24_500_001, 160_000],
    [25_000_001, 0],
  ])("合計所得 %d → %d", (inc, ded) => {
    expect(basicDedIT(inc)).toBe(ded);
  });
});

describe("basicDedRT（住民税の基礎控除）", () => {
  test.each([
    [0, 430_000],
    [24_000_000, 430_000],
    [24_000_001, 290_000],
    [24_500_001, 150_000],
    [25_000_001, 0],
  ])("合計所得 %d → %d", (inc, ded) => {
    expect(basicDedRT(inc)).toBe(ded);
  });
});

describe("residentTax（住民税）", () => {
  test("合計所得45万以下は非課税（均等割も0）", () => {
    expect(residentTax(450_000, 0).total).toBe(0);
  });
  test("非課税ラインの境界（45万超で課税）", () => {
    expect(residentTax(450_001, 0).perCapita).toBe(5_000);
  });
  test("社保控除で課税所得がマイナスにならない", () => {
    const r = residentTax(500_000, 1_000_000);
    expect(r.incomeLevy).toBe(0);
    expect(r.total).toBe(5_000);
  });
  test("課税なら均等割5,000が乗る", () => {
    const r = residentTax(1_000_000, 0);
    expect(r.perCapita).toBe(5_000);
  });
  test("課税所得200万以下の調整控除 = min(5万, 課税所得)×5%", () => {
    // 合計所得 1,000,000 − 基礎43万 = 570,000 → 所得割 57,000 − 2,500
    const r = residentTax(1_000_000, 0);
    expect(r.incomeLevy).toBeCloseTo(57_000 - 2_500, 5);
  });
  test("課税所得200万超でも調整控除は最低2,500", () => {
    const r = residentTax(10_000_000, 0);
    expect(r.incomeLevy).toBeCloseTo((10_000_000 - 430_000) * 0.1 - 2_500, 5);
  });
});

describe("personalTaxes（給与所得者の所得税・住民税）", () => {
  test("実申告の役員報酬（月14.6万×12）は所得税0", () => {
    const s = siCalc(146_000, 0);
    const p = personalTaxes(1_752_000 - salDed(1_752_000), s.ee);
    expect(p.it).toBe(0);
    expect(p.rc).toBe(0);
  });
  test("マイナス所得は0扱い", () => {
    const p = personalTaxes(-100_000, 0);
    expect(p.it).toBe(0);
    expect(p.rt).toBe(0);
  });
  test("sim の個人税は personalTaxes と一致", () => {
    const r = sim(2000, 600, 50, 0, 20);
    const p = personalTaxes(r.TI - r.sd, r.see);
    expect(r.it).toBeCloseTo(p.it, 5);
    expect(r.rt).toBeCloseTo(p.rt, 5);
  });
});

// ============================================================
// 社会保険（協会けんぽ東京 令和8年度・等級表）
// ============================================================

describe("standardMonthly（標準報酬月額）", () => {
  test.each([
    [62_999, 58_000],
    [63_000, 68_000],
    [146_000, 150_000],
    [154_999, 150_000],
    [155_000, 160_000],
    [500_000, 500_000],
    [1_354_999, 1_330_000],
    [2_000_000, 1_390_000],
  ])("報酬 %d → 標準報酬 %d", (m, s) => {
    expect(standardMonthly(m)).toBe(s);
  });
  test("厚生年金は 88,000〜650,000 にクランプ", () => {
    expect(pensionStandard(50_000)).toBe(88_000);
    expect(pensionStandard(700_000)).toBe(650_000);
    expect(pensionStandard(146_000)).toBe(150_000);
  });
});

describe("siCalc（等級・最新料率・介護・子ども子育て支援金）", () => {
  test("月14.6万（40歳未満）: 標準15万 ×(18.3%+9.85%+0.23%)×12", () => {
    const s = siCalc(146_000, 0);
    expect(s.total).toBeCloseTo(150_000 * (0.183 + 0.0985 + 0.0023) * 12, 5);
    expect(s.ee).toBeCloseTo(s.total / 2, 5);
  });
  test("40〜64歳は介護保険1.62%が加算", () => {
    const a = siCalc(146_000, 0);
    const b = siCalc(146_000, 0, { age40: true });
    expect(b.total - a.total).toBeCloseTo(150_000 * 0.0162 * 12, 5);
  });
  test("賞与は千円未満切捨、年金は150万・健保は573万が上限", () => {
    const s0 = siCalc(146_000, 0);
    const s1 = siCalc(146_000, 1_000_500);
    expect(s1.total - s0.total).toBeCloseTo(1_000_000 * (0.183 + 0.0985 + 0.0023), 5);
    const s2 = siCalc(146_000, 10_000_000);
    expect(s2.total - s0.total).toBeCloseTo(1_500_000 * 0.183 + 5_730_000 * (0.0985 + 0.0023), 5);
  });
  test("報酬0なら社保0（未加入）", () => {
    expect(siCalc(0, 0).total).toBe(0);
  });
});

// ============================================================
// 赤字のときの還付（中間納付の還付・欠損金の繰戻し還付・繰越欠損金）
//   前期 = 実申告（所得 6,949,034円・事業税は軽減税率不適用）
// ============================================================

const PREV = 6_949_034;
const FLAT = { bizTaxReduced: false };

describe("interimPayment（予定申告の中間納付額＝前期の1/2）", () => {
  test("前期実績から各税目の1/2（百円未満切捨）", () => {
    const i = interimPayment(PREV, FLAT);
    expect(i.required).toBe(true);
    expect(i.houjin).toBe(521_100);   // 1,042,300 / 2
    expect(i.chihou).toBe(53_600);    // 107,300 / 2
    expect(i.juminWari).toBe(36_400); // 72,900 / 2
    expect(i.kintou).toBe(35_000);    // 70,000 / 2
    expect(i.jigyo).toBe(243_200);    // 486,400 / 2
    expect(i.tokubetsu).toBe(89_900); // 179,900 / 2
    expect(i.total).toBe(979_200);
  });

  test("前期法人税の1/2が10万以下なら中間申告不要", () => {
    const i = interimPayment(1_000_000); // 法人税150,000 → 1/2 = 75,000
    expect(i.required).toBe(false);
    expect(i.total).toBe(0);
  });

  test("前期が赤字・0なら中間納付なし", () => {
    expect(interimPayment(0).total).toBe(0);
    expect(interimPayment(-1_000_000).total).toBe(0);
  });
});

describe("carrybackRefund（欠損金の繰戻し還付）", () => {
  test("前期法人税 × 欠損金 / 前期所得", () => {
    const c = carrybackRefund(3_000_000, PREV, FLAT);
    // 1,042,300 × 3,000,000 / 6,949,034 = 449,976.2
    expect(c.houjin).toBe(449_976);
    expect(c.chihou).toBe(46_347); // 449,976 × 10.3% = 46,347.5
    expect(c.total).toBe(449_976 + 46_347);
    expect(c.used).toBe(3_000_000);
  });

  test("欠損金が前期所得を超える分は還付されない（前期納付額が上限）", () => {
    const c = carrybackRefund(10_000_000, PREV, FLAT);
    expect(c.houjin).toBe(1_042_300);
    expect(c.chihou).toBe(107_300); // 前期の地方法人税が上限
    expect(c.used).toBe(PREV);
  });

  test("欠損金0なら還付0", () => {
    expect(carrybackRefund(0, PREV).total).toBe(0);
  });

  test("前期所得が0なら還付0", () => {
    expect(carrybackRefund(3_000_000, 0).total).toBe(0);
  });
});

describe("sim の還付（opts.prevIncome）", () => {
  // 経費を増やして赤字にする: 売上1000万・経費1100万・月15万
  const lossArgs = [1000, 1100, 15, 0, 20, -1, false];

  test("前期情報がなければ還付なし（後方互換）", () => {
    const r = sim(...lossArgs);
    expect(r.refund.carryback.total).toBe(0);
    expect(r.refund.interim.total).toBe(0);
  });

  test("赤字なら欠損金 = −税引前利益", () => {
    const r = sim(...lossArgs, { ...FLAT, prevIncome: PREV });
    expect(r.ci).toBeLessThan(0);
    expect(r.refund.loss).toBe(-r.ci);
  });

  test("繰戻し還付の分だけ totalTax が減る", () => {
    const base = sim(...lossArgs, FLAT);
    const r = sim(...lossArgs, { ...FLAT, prevIncome: PREV });
    expect(r.refund.carryback.total).toBeGreaterThan(0);
    expect(r.totalTax).toBeCloseTo(base.totalTax - r.refund.carryback.total, 5);
    expect(r.usable).toBeCloseTo(base.usable + r.refund.carryback.total, 5);
  });

  test("繰戻しを使わなければ全額が繰越欠損金", () => {
    const r = sim(...lossArgs, { ...FLAT, prevIncome: PREV, carryback: false });
    expect(r.refund.carryback.total).toBe(0);
    expect(r.refund.carryForward).toBe(r.refund.loss);
  });

  test("繰戻しに使った分は繰越欠損金から減る", () => {
    const r = sim(...lossArgs, { ...FLAT, prevIncome: PREV });
    expect(r.refund.carryForward).toBe(r.refund.loss - r.refund.carryback.used);
  });

  test("赤字なら中間納付は均等割以外すべて還付、均等割は残り半分を納付", () => {
    const r = sim(...lossArgs, { ...FLAT, prevIncome: PREV });
    expect(r.refund.settle.refund).toBe(979_200 - 35_000);
    expect(r.refund.settle.pay).toBe(35_000);
  });

  test("中間申告しない（仮決算・ゼロ）なら中間納付の還付なし", () => {
    const r = sim(...lossArgs, { ...FLAT, prevIncome: PREV, interim: false });
    expect(r.refund.interim.total).toBe(0);
    expect(r.refund.settle.refund).toBe(0);
    expect(r.refund.settle.pay).toBe(r.ct);
  });

  test("黒字なら繰戻し還付なし・確定納付 = 確定税額 − 中間納付", () => {
    const r = sim(2000, 600, 50, 0, 20, -1, false, { ...FLAT, prevIncome: PREV });
    expect(r.ci).toBeGreaterThan(0);
    expect(r.refund.loss).toBe(0);
    expect(r.refund.carryback.total).toBe(0);
    expect(r.refund.settle.pay - r.refund.settle.refund).toBe(r.ct - r.refund.interim.total);
  });

  test("中間納付は時期のずれだけなので totalTax に影響しない", () => {
    const a = sim(2000, 600, 50, 0, 20, -1, false, FLAT);
    const b = sim(2000, 600, 50, 0, 20, -1, false, { ...FLAT, prevIncome: PREV, carryback: false });
    expect(b.totalTax).toBeCloseTo(a.totalTax, 5);
  });
});
