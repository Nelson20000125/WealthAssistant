import { describe, it, expect } from "vitest";
import { emergencyFundMonths, emergencyFundVerdict } from "@/lib/portfolioIntelligence";

// 需求（P0-06）：AI 顾问不能只看「现金占比 60% 偏高」就叫人加仓股票。
// 现金够不够用，是拿现金除以真实月支出算出来的。

describe("emergencyFundMonths", () => {
  it("现金 10.4k、月均支出 7124 → 约 1.5 个月", () => {
    expect(emergencyFundMonths(10_400, 7_124)).toBeCloseTo(1.46, 2);
  });

  it("月支出为 0 时不给数字，而不是回 Infinity", () => {
    expect(emergencyFundMonths(10_000, 0)).toBeNull();
  });

  it("没有现金就是 0 个月", () => {
    expect(emergencyFundMonths(0, 3_000)).toBe(0);
  });
});

describe("emergencyFundVerdict", () => {
  it("不足 3 个月：优先讲现金垫，不准建议加仓", () => {
    const v = emergencyFundVerdict(1.46);
    expect(v.level).toBe("critical");
    expect(v.allowsMoreEquity).toBe(false);
  });

  it("3–6 个月：可以开始谈投资", () => {
    expect(emergencyFundVerdict(4).level).toBe("ok");
    expect(emergencyFundVerdict(4).allowsMoreEquity).toBe(true);
  });

  it("超过 12 个月：现金确实偏多了", () => {
    expect(emergencyFundVerdict(14).level).toBe("excess");
    expect(emergencyFundVerdict(14).allowsMoreEquity).toBe(true);
  });

  it("算不出月数时不给结论", () => {
    expect(emergencyFundVerdict(null).level).toBe("unknown");
    expect(emergencyFundVerdict(null).allowsMoreEquity).toBe(false);
  });
});
