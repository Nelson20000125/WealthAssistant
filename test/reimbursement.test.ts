import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTransaction,
  getMonthCashflow,
  getYearCashflow,
  listOutstandingReimbursements,
} from "@/lib/transactions";
import { getDerivedCashBalances } from "@/lib/cashBalance";

// 垫付 / 还款的需求（2026-08-12）：
//
//   垫钱请客不是费用，是应收。钱确实离开了现金池，但其中垫付的部分只是
//   从现金变成「别人欠我」，没有被消耗掉。朋友还钱也不是收入，只是应收变回现金。
//
// 所以这一组测的是「两套口径不能互相污染」：
//   统计口径（收入/支出/分类占比）要扣掉垫付与还款
//   现金口径（余额推导）一律用 amount 全额，一分都不能少

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

/** 一个设了期初的现金池，余额走流水推导 */
async function makeCashPool(userId: string, opening: number, openingDate: string) {
  const account = await prisma.account.create({
    data: { userId, name: "银行", type: "BANK", institution: "T", currency: "MYR" },
  });
  return prisma.holding.create({
    data: {
      accountId: account.id,
      assetType: "CASH",
      valuation: "DERIVED",
      name: "现金池",
      quantity: 1,
      costBasis: opening,
      currency: "MYR",
      openingBalance: opening,
      openingBalanceDate: D(openingDate),
    },
  });
}

async function makeCategory(userId: string, name: string, type: "INCOME" | "EXPENSE", countsInTotals = true) {
  return prisma.category.create({ data: { userId, name, type, countsInTotals } });
}

describe("垫付：支出只算自己那份", () => {
  it("垫付 225 的 300 元饭钱，支出汇总只计 75", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, "餐饮", "EXPENSE");

    await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: cat.id,
      reimbursable: 225,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    expect(flow.totals.expense).toBeCloseTo(75, 9);
  });

  it("分类占比也要扣掉垫付，否则「餐饮花了多少」照样是虚的", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, "餐饮", "EXPENSE");

    await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: cat.id,
      reimbursable: 225,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    const dining = flow.expenseByCategory.find((c) => c.name === "餐饮");
    expect(dining?.valueMYR).toBeCloseTo(75, 9);
  });

  it("现金余额扣的是全额 300 —— 垫出去的钱真的离开了户口", async () => {
    const user = await makeUser();
    const pool = await makeCashPool(user.id, 1000, "2026-03-01");
    const cat = await makeCategory(user.id, "餐饮", "EXPENSE");

    await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: cat.id,
      cashHoldingId: pool.id,
      reimbursable: 225,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(pool.id)).toBeCloseTo(700, 9);
  });

  it("没填垫付的支出，行为跟以前完全一样", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, "餐饮", "EXPENSE");

    await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "自己吃",
      categoryId: cat.id,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    expect(flow.totals.expense).toBeCloseTo(300, 9);
  });
});

describe("还款：冲销应收，不是收入", () => {
  it("指向某笔垫付的还款不计入收入", async () => {
    const user = await makeUser();
    const expCat = await makeCategory(user.id, "餐饮", "EXPENSE");
    const incCat = await makeCategory(user.id, "还钱", "INCOME");

    const advance = await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: expCat.id,
      reimbursable: 225,
    });

    await createTransaction(user.id, {
      date: D("2026-03-07"),
      amount: 75,
      type: "INCOME",
      description: "阿明还钱",
      categoryId: incCat.id,
      settlesTransactionId: advance.id,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    expect(flow.totals.income).toBeCloseTo(0, 9);
  });

  it("还款的现金照样进帐 —— 钱是真的收到了", async () => {
    const user = await makeUser();
    const pool = await makeCashPool(user.id, 1000, "2026-03-01");
    const expCat = await makeCategory(user.id, "餐饮", "EXPENSE");
    const incCat = await makeCategory(user.id, "还钱", "INCOME");

    const advance = await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: expCat.id,
      cashHoldingId: pool.id,
      reimbursable: 225,
    });

    await createTransaction(user.id, {
      date: D("2026-03-07"),
      amount: 75,
      type: "INCOME",
      description: "阿明还钱",
      categoryId: incCat.id,
      cashHoldingId: pool.id,
      settlesTransactionId: advance.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    // 1000 - 300 + 75
    expect(balances.get(pool.id)).toBeCloseTo(775, 9);
  });

  it("没指向任何垫付的收入照常计入 —— 工资不该被误伤", async () => {
    const user = await makeUser();
    const incCat = await makeCategory(user.id, "工资", "INCOME");

    await createTransaction(user.id, {
      date: D("2026-03-25"),
      amount: 5000,
      type: "INCOME",
      description: "月薪",
      categoryId: incCat.id,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    expect(flow.totals.income).toBeCloseTo(5000, 9);
  });
});

describe("分类层级的不计入汇总开关", () => {
  it("countsInTotals=false 的收入分类不进收入汇总", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, "投资进账", "INCOME", false);

    await createTransaction(user.id, {
      date: D("2026-03-10"),
      amount: 1584,
      type: "INCOME",
      description: "PBE 转进来的",
      categoryId: cat.id,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    expect(flow.totals.income).toBeCloseTo(0, 9);
    expect(flow.incomeByCategory.find((c) => c.name === "投资进账")).toBeUndefined();
  });

  it("开关只管统计，现金余额照常增加", async () => {
    const user = await makeUser();
    const pool = await makeCashPool(user.id, 1000, "2026-03-01");
    const cat = await makeCategory(user.id, "投资进账", "INCOME", false);

    await createTransaction(user.id, {
      date: D("2026-03-10"),
      amount: 500,
      type: "INCOME",
      description: "转进来的",
      categoryId: cat.id,
      cashHoldingId: pool.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(pool.id)).toBeCloseTo(1500, 9);
  });

  it("countsInTotals=false 的支出分类也不进支出汇总", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, "内部划转", "EXPENSE", false);

    await createTransaction(user.id, {
      date: D("2026-03-10"),
      amount: 800,
      type: "EXPENSE",
      description: "划到另一个户口",
      categoryId: cat.id,
    });

    const flow = await getMonthCashflow(user.id, 2026, 3);
    expect(flow.totals.expense).toBeCloseTo(0, 9);
  });
});

describe("待收回清单", () => {
  it("垫付 225 收到 75，还差 150", async () => {
    const user = await makeUser();
    const expCat = await makeCategory(user.id, "餐饮", "EXPENSE");
    const incCat = await makeCategory(user.id, "还钱", "INCOME");

    const advance = await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: expCat.id,
      reimbursable: 225,
    });
    await createTransaction(user.id, {
      date: D("2026-03-07"),
      amount: 75,
      type: "INCOME",
      description: "阿明还钱",
      categoryId: incCat.id,
      settlesTransactionId: advance.id,
    });

    const list = await listOutstandingReimbursements(user.id);
    expect(list).toHaveLength(1);
    expect(list[0].reimbursable).toBeCloseTo(225, 9);
    expect(list[0].settled).toBeCloseTo(75, 9);
    expect(list[0].outstanding).toBeCloseTo(150, 9);
  });

  it("收清了就不再出现在待收回里", async () => {
    const user = await makeUser();
    const expCat = await makeCategory(user.id, "餐饮", "EXPENSE");
    const incCat = await makeCategory(user.id, "还钱", "INCOME");

    const advance = await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: expCat.id,
      reimbursable: 225,
    });
    for (const amt of [100, 125]) {
      await createTransaction(user.id, {
        date: D("2026-03-07"),
        amount: amt,
        type: "INCOME",
        description: "还钱",
        categoryId: incCat.id,
        settlesTransactionId: advance.id,
      });
    }

    const list = await listOutstandingReimbursements(user.id);
    expect(list).toHaveLength(0);
  });

  it("没垫付的支出不会出现在待收回里", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, "餐饮", "EXPENSE");
    await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "自己吃",
      categoryId: cat.id,
    });

    const list = await listOutstandingReimbursements(user.id);
    expect(list).toHaveLength(0);
  });

  it("只看自己的垫付，别人的不出现", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const otherCat = await makeCategory(other.id, "餐饮", "EXPENSE");

    await createTransaction(other.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "别人垫的",
      categoryId: otherCat.id,
      reimbursable: 225,
    });

    const list = await listOutstandingReimbursements(me.id);
    expect(list).toHaveLength(0);
  });
});

describe("年度汇总与月度同口径", () => {
  it("年表的支出也扣掉垫付、收入也扣掉还款", async () => {
    const user = await makeUser();
    const expCat = await makeCategory(user.id, "餐饮", "EXPENSE");
    const incCat = await makeCategory(user.id, "还钱", "INCOME");
    const salary = await makeCategory(user.id, "工资", "INCOME");

    const advance = await createTransaction(user.id, {
      date: D("2026-03-05"),
      amount: 300,
      type: "EXPENSE",
      description: "请一桌吃饭",
      categoryId: expCat.id,
      reimbursable: 225,
    });
    await createTransaction(user.id, {
      date: D("2026-03-07"),
      amount: 75,
      type: "INCOME",
      description: "阿明还钱",
      categoryId: incCat.id,
      settlesTransactionId: advance.id,
    });
    await createTransaction(user.id, {
      date: D("2026-03-25"),
      amount: 5000,
      type: "INCOME",
      description: "月薪",
      categoryId: salary.id,
    });

    const year = await getYearCashflow(user.id, 2026);
    const march = year.months.find((m) => m.month === 3)!;
    expect(march.expense).toBeCloseTo(75, 9);
    expect(march.income).toBeCloseTo(5000, 9);
    expect(march.net).toBeCloseTo(4925, 9);
    expect(year.totals.expense).toBeCloseTo(75, 9);
    expect(year.totals.income).toBeCloseTo(5000, 9);
  });
});
