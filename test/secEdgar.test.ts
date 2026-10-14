import { describe, it, expect } from "vitest";
import {
  parseAnnualFacts,
  latestAnnual,
  parseTickerMap,
  tickerToCik,
} from "@/lib/marketData/providers/sec-edgar";
import conceptFixture from "./fixtures/sec-netincome-aapl.json";

// fixture 是 data.sec.gov 的真实回应（AAPL / us-gaap:NetIncomeLoss）裁剪而来，
// 刻意保留了 EDGAR 最容易踩的两个结构问题，见下方各 describe 的说明。

const concept = conceptFixture as unknown as Parameters<typeof parseAnnualFacts>[0];

describe("parseAnnualFacts —— 年度基本面", () => {
  // EDGAR 把「这笔数字出现在哪份申报里」和「这笔数字本身是哪一年的」混在一起：
  //
  //   { start: 2023-10-01, end: 2024-09-28, val: 93736000000, fy: 2024, filed: 2024-11-01 }
  //   { start: 2023-10-01, end: 2024-09-28, val: 93736000000, fy: 2025, filed: 2025-10-31 }
  //
  // 同一个 2024 财年的净利，因为又被当成比较期写进 FY2025 的 10-K，就多出一笔 fy=2025。
  // AAPL 这支光是 10-K/FY 就有 139 笔，但只对应 67 个不重复期间。
  // 拿 fy 当年度、或不去重直接 map，都会得到重复且错位的财报序列。
  it("同一期间被多份申报重复上报时，只留一笔", () => {
    const facts = parseAnnualFacts(concept);
    const periods = facts.map((f) => `${f.periodStart}~${f.periodEnd}`);

    expect(new Set(periods).size).toBe(periods.length);
  });

  it("年度以期间结束日为准，不采用 fy 栏位", () => {
    const facts = parseAnnualFacts(concept);
    const fy2024 = facts.find((f) => f.periodEnd === "2024-09-28");

    // 这笔在原始资料里同时以 fy=2024 与 fy=2025 出现过
    expect(fy2024).toBeDefined();
    expect(fy2024!.periodStart).toBe("2023-10-01");
    expect(fy2024!.value).toBe(93_736_000_000);
  });

  it("只取年报，季报要被排除", () => {
    const facts = parseAnnualFacts(concept);

    expect(facts.every((f) => f.form.startsWith("10-K"))).toBe(true);
  });

  it("依期间由旧到新排序", () => {
    const ends = parseAnnualFacts(concept).map((f) => f.periodEnd);

    expect(ends).toEqual([...ends].sort());
  });

  it("带出单位，金额不做任何缩放", () => {
    const facts = parseAnnualFacts(concept);

    expect(facts[0].unit).toBe("USD");
    expect(Number.isInteger(facts[0].value)).toBe(true);
  });

  // 财报重编（10-K/A）时，同一期间会有新旧两个不同的值。
  // 去重必须留申报日期较晚的那笔，否则显示的是已经被更正掉的数字。
  it("同一期间有重编时，取申报日期较新的值", () => {
    const amended = {
      ...concept,
      units: {
        USD: [
          ...concept.units.USD,
          {
            start: "2024-09-29",
            end: "2025-09-27",
            val: 999_000_000_000,
            accn: "0000320193-26-000001",
            fy: 2026,
            fp: "FY",
            form: "10-K/A",
            filed: "2026-02-01",
          },
        ],
      },
    };

    const fact = parseAnnualFacts(amended as typeof concept)
      .find((f) => f.periodEnd === "2025-09-27");

    expect(fact!.value).toBe(999_000_000_000);
    expect(fact!.form).toBe("10-K/A");
  });
});

describe("latestAnnual —— 最近一个完整财年", () => {
  it("回传期间结束日最新的一笔", () => {
    const latest = latestAnnual(concept);

    expect(latest!.periodEnd).toBe("2025-09-27");
    expect(latest!.value).toBe(112_010_000_000);
  });

  it("没有任何年报资料时回传 null，不要抛错", () => {
    const empty = { ...concept, units: { USD: [] } };

    expect(latestAnnual(empty as typeof concept)).toBeNull();
  });
});

describe("parseTickerMap / tickerToCik —— ticker 换 CIK", () => {
  // company_tickers.json 的形状是 { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, ... }
  // cik_str 是「数字」，但 data.sec.gov 的路径要求补零到 10 位的字串（CIK0000320193）。
  // 直接把数字塞进 URL 会 404。
  const raw = {
    "0": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
    "1": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  };

  it("CIK 补零到 10 位字串", () => {
    expect(parseTickerMap(raw).get("AAPL")).toBe("0000320193");
  });

  it("ticker 大小写不敏感", () => {
    expect(tickerToCik(parseTickerMap(raw), "nvda")).toBe("0001045810");
  });

  it("查不到的 ticker 回传 undefined", () => {
    // VOO 是 ETF，不申报 10-K，EDGAR 的 ticker 表里查不到
    expect(tickerToCik(parseTickerMap(raw), "VOO")).toBeUndefined();
  });
});
