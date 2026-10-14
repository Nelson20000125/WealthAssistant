import { describe, it, expect } from "vitest";
import { parseAvgRates, latestRateFor } from "@/lib/marketData/providers/fed-treasury";
import ratesFixture from "./fixtures/treasury-avg-rates.json";

// fixture 是 fiscaldata.treasury.gov 的真实回应（avg_interest_rates，最新 8 笔）。

const payload = ratesFixture as unknown as Parameters<typeof parseAvgRates>[0];

describe("parseAvgRates —— 美国公债平均利率", () => {
  // fiscaldata 所有栏位都是字串，包含数字栏位：
  //   "avg_interest_rate_amt": "3.758"
  // 直接拿去算会变字串串接（"3.758" + 1 === "3.7581"），必须先转 number。
  it("利率转成 number，不留字串", () => {
    const rates = parseAvgRates(payload);

    expect(rates.every((r) => typeof r.rate === "number")).toBe(true);
    expect(rates.every((r) => Number.isFinite(r.rate))).toBe(true);
  });

  // 原始值 3.758 的语义是 3.758%。专案里 formatPct 吃的是小数（0.022 → "+2.2%"），
  // 若把 3.758 原样传进去会显示成 "+375.8%"。在来源这层就转成小数，
  // 让所有下游拿到的百分比语义一致。
  it("利率以小数表示，与 formatPct 的输入一致", () => {
    const bills = latestRateFor(payload, "Treasury Bills");

    expect(bills!.rate).toBeCloseTo(0.03758, 8);
  });

  it("带出记录日期与证券名称", () => {
    const rates = parseAvgRates(payload);

    expect(rates[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rates[0].securityDesc.length).toBeGreaterThan(0);
  });

  it("空资料回传空阵列，不抛错", () => {
    expect(parseAvgRates({ data: [] })).toEqual([]);
  });
});

describe("latestRateFor —— 取某种券的最新利率", () => {
  it("依名称找到对应的券", () => {
    const notes = latestRateFor(payload, "Treasury Notes");

    expect(notes!.securityDesc).toBe("Treasury Notes");
    expect(notes!.rate).toBeCloseTo(0.03309, 8);
  });

  it("名称不存在时回传 null", () => {
    expect(latestRateFor(payload, "Corporate Bonds")).toBeNull();
  });
});
