import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, searchTransactions, parseSearchParams } from "@/lib/transactions";

// 需求（P1-05）：搜 merchant / 备注 / 分类 / 金额 / 户口；
// 筛分类、户口、金额范围、日期范围、交易类型。
// 有日期范围 → 一定是跨月份搜，不是只在当月列表里过滤。

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function setup() {
  const user = await prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
  const mkPool = async (name: string, accountName: string) => {
    const account = await prisma.account.create({
      data: { userId: user.id, name: accountName, type: "BANK", institution: "T", currency: "MYR" },
    });
    return prisma.holding.create({
      data: {
        accountId: account.id, assetType: "CASH", valuation: "DERIVED",
        name, quantity: 1, costBasis: 0, currency: "MYR",
      },
    });
  };
  const tng = await mkPool("TNG 钱包", "Touch n Go");
  const pbe = await mkPool("PUBLIC BANK", "Public Bank Berhad");
  const food = await prisma.category.create({ data: { userId: user.id, name: "餐饮", type: "EXPENSE" } });
  const daily = await prisma.category.create({ data: { userId: user.id, name: "日用", type: "EXPENSE" } });
  const salary = await prisma.category.create({ data: { userId: user.id, name: "工资", type: "INCOME" } });

  const tx = (date: string, amount: number, type: "INCOME" | "EXPENSE" | "TRANSFER", description: string, extra = {}) =>
    createTransaction(user.id, { date: D(date), amount, type, description, ...extra });

  const t = {
    shopee: await tx("2026-07-15", 45.9, "EXPENSE", "SHOPEE MALAYSIA SDN BHD", { categoryId: daily.id, cashHoldingId: pbe.id }),
    lunch: await tx("2026-08-03", 12.5, "EXPENSE", "午餐", { categoryId: food.id, cashHoldingId: tng.id }),
    dinner: await tx("2026-09-10", 125, "EXPENSE", "晚餐请客", { categoryId: food.id, cashHoldingId: pbe.id, reimbursable: 100 }),
    pay: await tx("2026-09-01", 4000, "INCOME", "薪水", { categoryId: salary.id, cashHoldingId: pbe.id }),
    topup: await tx("2026-09-05", 50, "TRANSFER", "充值", { cashHoldingId: pbe.id, counterCashHoldingId: tng.id }),
  };
  return { user, tng, pbe, food, daily, t };
}

const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id).sort();

describe("searchTransactions 关键字", () => {
  it("跨月份、不分大小写地搜描述（商户名就是从描述解析出来的）", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { q: "shopee" }))).toEqual([t.shopee.id]);
  });

  it("搜分类名", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { q: "餐饮" }))).toEqual([t.lunch.id, t.dinner.id].sort());
  });

  it("搜户口：现金池名或户口名都算，转账的两侧都算", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { q: "touch n go" }))).toEqual([t.lunch.id, t.topup.id].sort());
  });

  it("数字当金额精确比对：12.5 找得到 12.50，不会把 125 也拉进来", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { q: "12.5" }))).toEqual([t.lunch.id]);
  });

  it("只查得到自己的资料", async () => {
    await setup();
    const other = await setup();
    const r = await searchTransactions(other.user.id, { q: "shopee" });
    expect(ids(r)).toEqual([other.t.shopee.id]);
  });
});

describe("searchTransactions 筛选", () => {
  it("按交易类型", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { type: "INCOME" }))).toEqual([t.pay.id]);
  });

  it("按分类", async () => {
    const { user, daily, t } = await setup();
    expect(ids(await searchTransactions(user.id, { categoryId: daily.id }))).toEqual([t.shopee.id]);
  });

  it("按户口：转入侧也算", async () => {
    const { user, tng, t } = await setup();
    expect(ids(await searchTransactions(user.id, { poolId: tng.id }))).toEqual([t.lunch.id, t.topup.id].sort());
  });

  it("金额范围两端都包含", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { min: 45.9, max: 125 }))).toEqual(
      [t.shopee.id, t.dinner.id, t.topup.id].sort()
    );
  });

  it("日期范围两端都包含（到那天为止＝那一整天都算）", async () => {
    const { user, t } = await setup();
    expect(ids(await searchTransactions(user.id, { from: "2026-08-03", to: "2026-09-01" }))).toEqual(
      [t.lunch.id, t.pay.id].sort()
    );
  });

  it("条件可以叠加", async () => {
    const { user, pbe, t } = await setup();
    expect(ids(await searchTransactions(user.id, { type: "EXPENSE", poolId: pbe.id, q: "晚餐" }))).toEqual([t.dinner.id]);
  });
});

describe("searchTransactions 汇总", () => {
  it("结果的收支汇总跟月报同一口径：垫付扣掉、转账不算支出", async () => {
    const { user } = await setup();
    const r = await searchTransactions(user.id, { from: "2026-09-01", to: "2026-09-30" });
    expect(r.totals.income).toBeCloseTo(4000, 9);
    expect(r.totals.expense).toBeCloseTo(25, 9);
    expect(r.byDay.reduce((s, d) => s + d.expense, 0)).toBeCloseTo(25, 9);
  });
});

describe("parseSearchParams", () => {
  it("什么都没填 → null（页面照常显示当月）", () => {
    expect(parseSearchParams({})).toBeNull();
    expect(parseSearchParams({ q: "  ", type: "", min: "" })).toBeNull();
  });

  it("月份参数 m 不算搜索条件", () => {
    expect(parseSearchParams({ m: "2026-09" })).toBeNull();
  });

  it("解析各栏位，丢掉不合法的值而不是报错", () => {
    expect(
      parseSearchParams({ q: " shopee ", type: "EXPENSE", min: "10", max: "abc", from: "2026-09-01", to: "not-a-date" })
    ).toEqual({ q: "shopee", type: "EXPENSE", min: 10, from: "2026-09-01" });
    expect(parseSearchParams({ type: "HACK" })).toBeNull();
  });
});
