import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction } from "@/lib/transactions";
import { getFinancialSummary } from "@/lib/financialSummary";

// 需求：月均收支只能用「记账已经覆盖到月底」的月份来算。
// 2026-10 实际踩过：最后一笔记录停在 9/3，9 月只有 3 天的支出、收入是 0，
// 却被当成完整的一个月拿去平均 —— 月均收入被拉低一半、储蓄率算成负数、
// 应急金判定为 critical。它不报错，它撒谎。
// 同时要把「数据截至哪天」交出去，让 AI 顾问知道结论是不是建立在过期资料上。

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = D("2026-10-14");

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

describe("getFinancialSummary 的取样口径", () => {
  it("最后一笔记录之后还没过完的月份不计入月均", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-08-25"), amount: 5200, type: "INCOME", description: "薪水" });
    await createTransaction(user.id, { date: D("2026-08-15"), amount: 2000, type: "EXPENSE", description: "生活费" });
    await createTransaction(user.id, { date: D("2026-09-03"), amount: 300, type: "EXPENSE", description: "杂费" });

    const s = await getFinancialSummary(user.id, TODAY);
    expect(s.monthsSampled).toBe(1);
    expect(s.avgMonthlyIncomeMYR).toBe(5200);
    expect(s.avgMonthlyExpenseMYR).toBe(2000);
  });

  it("交出数据截至日期；超过 7 天没记账就标记为过期", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-09-03"), amount: 300, type: "EXPENSE", description: "杂费" });

    const s = await getFinancialSummary(user.id, TODAY);
    expect(s.dataAsOf).toBe("2026-09-03");
    expect(s.isStale).toBe(true);
  });

  it("记账持续到最近，上个月就算完整月份，也不算过期", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-09-25"), amount: 5200, type: "INCOME", description: "薪水" });
    await createTransaction(user.id, { date: D("2026-09-10"), amount: 2000, type: "EXPENSE", description: "生活费" });
    await createTransaction(user.id, { date: D("2026-10-12"), amount: 15, type: "EXPENSE", description: "午餐" });

    const s = await getFinancialSummary(user.id, TODAY);
    expect(s.monthsSampled).toBe(1);
    expect(s.avgMonthlyExpenseMYR).toBe(2000);
    expect(s.dataAsOf).toBe("2026-10-12");
    expect(s.isStale).toBe(false);
  });

  it("完全没有记录时不给日期，视为过期", async () => {
    const user = await makeUser();
    const s = await getFinancialSummary(user.id, TODAY);
    expect(s.dataAsOf).toBeNull();
    expect(s.isStale).toBe(true);
    expect(s.monthsSampled).toBe(0);
  });
});
