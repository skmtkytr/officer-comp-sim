import { describe, test, expect } from "bun:test";
import { sim, findOptBonus } from "./sim.js";

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
