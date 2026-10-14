import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, getMonthCashflow } from "@/lib/transactions";

// 需求（P1-03）：收支页交易按日分组，每组右侧显示当天小计；汇总加上储蓄率。
// 当天小计必须跟月汇总是同一套口径（P0-04）——垫付扣掉、不计入的分类不算——
// 否则把每天的小计加起来会对不上上面的「支出」，使用者会以为系统算错。

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

describe("按日小计", () => {
  it("同一天的收支各自加总，按日期由新到旧", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-09-03"), amount: 12.5, type: "EXPENSE", description: "午餐" });
    await createTransaction(user.id, { date: D("2026-09-03"), amount: 7.5, type: "EXPENSE", description: "咖啡" });
    await createTransaction(user.id, { date: D("2026-09-03"), amount: 100, type: "INCOME", description: "卖旧货" });
    await createTransaction(user.id, { date: D("2026-09-05"), amount: 30, type: "EXPENSE", description: "晚餐" });

    const { byDay } = await getMonthCashflow(user.id, 2026, 9);
    expect(byDay).toEqual([
      { date: "2026-09-05", income: 0, expense: 30 },
      { date: "2026-09-03", income: 100, expense: 20 },
    ]);
  });

  it("小计口径跟月汇总一致：垫付扣掉、不计入的分类不算，逐日加总 = 月支出", async () => {
    const user = await makeUser();
    const payback = await prisma.category.create({
      data: { userId: user.id, name: "投资进账", type: "INCOME", countsInTotals: false },
    });
    await createTransaction(user.id, {
      date: D("2026-09-10"), amount: 90, type: "EXPENSE", description: "请客", reimbursable: 60,
    });
    await createTransaction(user.id, {
      date: D("2026-09-10"), amount: 500, type: "INCOME", description: "赎回", categoryId: payback.id,
    });
    await createTransaction(user.id, { date: D("2026-09-11"), amount: 10, type: "EXPENSE", description: "早餐" });

    const { byDay, totals } = await getMonthCashflow(user.id, 2026, 9);
    const day10 = byDay.find((d) => d.date === "2026-09-10")!;
    expect(day10.expense).toBeCloseTo(30, 9);
    expect(day10.income).toBe(0);
    expect(byDay.reduce((s, d) => s + d.expense, 0)).toBeCloseTo(totals.expense, 9);
  });
});

describe("储蓄率", () => {
  it("＝结余 / 收入", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-09-01"), amount: 4000, type: "INCOME", description: "薪水" });
    await createTransaction(user.id, { date: D("2026-09-02"), amount: 3000, type: "EXPENSE", description: "房租" });

    const { totals } = await getMonthCashflow(user.id, 2026, 9);
    expect(totals.savingsRate).toBeCloseTo(0.25, 9);
  });

  it("本月没有收入时是 null，不是 0 也不是 -Infinity", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-09-02"), amount: 50, type: "EXPENSE", description: "杂货" });

    const { totals } = await getMonthCashflow(user.id, 2026, 9);
    expect(totals.savingsRate).toBeNull();
  });
});
