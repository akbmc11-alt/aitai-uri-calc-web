// 相対売り損益計算ロジック（calc.py の1対1移植）。
// ブラウザ(<script src="calc.js">)からは window.RelCalc として、
// Node.js(テスト用)からは require("./calc.js") として、同じ関数群を使える。
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RelCalc = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const UNIT_KG = "kg", UNIT_BAG = "bag", UNIT_CASE = "case";
  const ZEN_TO_HAN = { "０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9","．":".","，":"," };

  class InputError extends Error {}

  function parseNumber(text, fieldName) {
    let t = String(text == null ? "" : text).replace(/[０-９．，]/g, (ch) => ZEN_TO_HAN[ch] || ch).replace(/,/g, "").trim();
    if (!t) return 0;
    const n = Number(t);
    if (Number.isNaN(n)) throw new InputError(fieldName + "に数値を入力してください");
    return n;
  }

  function convertToPerKg(value, unit, fieldName, bagKg, caseKg) {
    if (unit === UNIT_KG) return value;
    if (unit === UNIT_BAG) {
      if (bagKg <= 0) throw new InputError(fieldName + "を袋単位で計算するには「1袋あたりの内容量(kg)」を入力してください");
      return value / bagKg;
    }
    if (unit === UNIT_CASE) {
      if (caseKg <= 0) throw new InputError(fieldName + "をケース単位で計算するには「1ケースあたりの内容量(kg)」の換算を入力してください");
      return value / caseKg;
    }
    throw new InputError("不明な単位です: " + unit);
  }

  function convertFromPerKg(valuePerKg, unit, bagKg, caseKg) {
    if (unit === UNIT_KG) return valuePerKg;
    if (unit === UNIT_BAG) return valuePerKg * bagKg;
    if (unit === UNIT_CASE) return valuePerKg * caseKg;
    throw new InputError("不明な単位です: " + unit);
  }

  function halfMonthUnits(holdingMonths) {
    if (holdingMonths <= 0) return 0;
    const rounded = Math.round(holdingMonths * 2 * 1e6) / 1e6;
    return Math.ceil(rounded - 1e-9);
  }

  function calculate(p) {
    const centerFee = p.sell * p.centerFeePct / 100;
    const storage = p.storageRate * halfMonthUnits(p.holdingMonths);
    const fixedExclStorage = p.purchase + p.freight + p.labor + p.box + centerFee + p.handling + p.grace + p.freeze;
    const profitBeforeStorage = p.sell - fixedExclStorage;
    const profit = profitBeforeStorage - storage;
    const profitRate = p.sell ? profit / p.sell : null;
    return { profit: profit, profitRate: profitRate, profitBeforeStorage: profitBeforeStorage };
  }

  function breakevenSellPrice(p) {
    const feeRatio = p.centerFeePct / 100;
    if (feeRatio >= 1) return null;
    const fixedCosts = p.purchase + p.freight + p.labor + p.box + p.handling + p.grace + p.freeze + p.storage;
    return fixedCosts / (1 - feeRatio);
  }

  function sellPriceForTargetRate(p) {
    const feeRatio = p.centerFeePct / 100;
    const denom = 1 - feeRatio - p.targetRate;
    if (denom <= 0) return null;
    const fixedCosts = p.purchase + p.freight + p.labor + p.box + p.handling + p.grace + p.freeze + p.storage;
    return fixedCosts / denom;
  }

  const DEFAULT_REFERENCE_RATES = [0, 0.05, 0.10, 0.15, 0.20];

  function referencePriceTable(p, rates) {
    return (rates || DEFAULT_REFERENCE_RATES).map((rate) => [
      rate,
      sellPriceForTargetRate(Object.assign({}, p, { targetRate: rate })),
    ]);
  }

  function breakevenHoldingMonths(profitBeforeStorage, storageRate) {
    if (storageRate <= 0) return null;
    if (profitBeforeStorage <= 0) return 0;
    const units = Math.floor(profitBeforeStorage / storageRate + 1e-9);
    return units / 2;
  }

  function actualPurchaseUnitPrice(declaredKg, quotedUnitPrice, actualKg) {
    if (actualKg <= 0) return null;
    const totalCost = declaredKg * quotedUnitPrice;
    return totalCost / actualKg;
  }

  const SENSITIVITY_FACTORS = [
    ["purchase", "仕入値"], ["freight", "運賃"], ["labor", "労務費"], ["box", "箱代"],
    ["centerFeePct", "センターフィ"], ["handling", "入出庫料金"], ["grace", "グレース料"],
    ["freeze", "凍結料"], ["storageRate", "倉賃(半月単価)"],
  ];

  function sensitivityAnalysis(p) {
    const swing = p.swing == null ? 0.1 : p.swing;
    const base = {
      purchase: p.purchase, freight: p.freight, labor: p.labor, box: p.box, centerFeePct: p.centerFeePct,
      handling: p.handling, grace: p.grace, freeze: p.freeze, storageRate: p.storageRate,
      holdingMonths: p.holdingMonths,
    };
    function profitAt(overrides) {
      const values = Object.assign({}, base, overrides);
      return calculate({
        sell: p.sell, purchase: values.purchase, freight: values.freight, labor: values.labor,
        box: values.box, centerFeePct: values.centerFeePct, handling: values.handling,
        grace: values.grace, freeze: values.freeze, storageRate: values.storageRate,
        holdingMonths: values.holdingMonths,
      }).profit;
    }
    const baseProfit = profitAt({});
    const rows = SENSITIVITY_FACTORS.map(([key, label]) => {
      const baseValue = base[key];
      const profitA = profitAt({ [key]: baseValue * (1 - swing) });
      const profitB = profitAt({ [key]: baseValue * (1 + swing) });
      const profitLow = Math.min(profitA, profitB);
      const profitHigh = Math.max(profitA, profitB);
      return { key, label, profitLow, profitHigh, swing: profitHigh - profitLow };
    });
    rows.sort((a, b) => b.swing - a.swing);
    return { baseProfit, rows };
  }

  return {
    UNIT_KG, UNIT_BAG, UNIT_CASE, InputError,
    parseNumber, convertToPerKg, convertFromPerKg, halfMonthUnits, calculate,
    breakevenSellPrice, sellPriceForTargetRate, DEFAULT_REFERENCE_RATES, referencePriceTable,
    breakevenHoldingMonths, actualPurchaseUnitPrice, sensitivityAnalysis,
  };
});
