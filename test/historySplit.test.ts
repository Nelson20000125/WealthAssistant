import { describe, it, expect } from "vitest";
import { splitContributionAndReturn } from "@/lib/portfolio";

// 需求（P0-05）：净值涨了 RM2,866 不代表投资赚了 RM2,866。
// 自己存进去的钱要拆出来，剩下的才是投资收益。

const pt = (netWorthMYR: number, costMYR: number) => ({ netWorthMYR, costMYR });

describe("splitContributionAndReturn", () => {
  it("净值涨 2866、成本涨 2911 → 净投入 2911、收益 -45", () => {
    const r = splitContributionAndReturn([pt(14_540, 14_540), pt(17_406, 17_451)]);
    expect(r!.changeMYR).toBeCloseTo(2_866, 6);
    expect(r!.contributionMYR).toBeCloseTo(2_911, 6);
    expect(r!.returnMYR).toBeCloseTo(-45, 6);
  });

  it("没有追加投入时，净值变化全部算收益", () => {
    const r = splitContributionAndReturn([pt(10_000, 9_000), pt(11_000, 9_000)]);
    expect(r!.contributionMYR).toBe(0);
    expect(r!.returnMYR).toBeCloseTo(1_000, 6);
  });

  it("收益率的分母是期间平均投入成本，不是净值", () => {
    const r = splitContributionAndReturn([pt(1_000, 1_000), pt(3_100, 3_000)]);
    // 收益 100，平均成本 (1000+3000)/2 = 2000
    expect(r!.returnPct).toBeCloseTo(0.05, 6);
  });

  it("平均成本为 0 时不给百分比，而不是除以零", () => {
    const r = splitContributionAndReturn([pt(0, 0), pt(500, 0)]);
    expect(r!.returnPct).toBeNull();
  });

  it("不足两个点就没有区间可言", () => {
    expect(splitContributionAndReturn([])).toBeNull();
    expect(splitContributionAndReturn([pt(100, 100)])).toBeNull();
  });
});
