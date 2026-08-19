import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/transactions";
import { getDerivedCashBalances } from "@/lib/cashBalance";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

async function makeAccount(userId: string, currency = "MYR") {
  return prisma.account.create({
    data: { userId, name: "户口", type: "BROKERAGE", institution: "T", currency },
  });
}

/** 空持仓：份额与成本都由 INVEST 记录带进来 */
async function makeTarget(accountId: string, currency = "MYR") {
  return prisma.holding.create({
    data: {
      accountId, assetType: "FUND", valuation: "MANUAL_UNIT_PRICE", name: "基金",
      quantity: 0, costBasis: 0, currency,
    },
  });
}

async function reload(id: string) {
  return prisma.holding.findUniqueOrThrow({ where: { id } });
}

describe("INVEST 记录与持仓的联动", () => {
  it("第一笔投资：份额 = 金额 ÷ 单价，成本 = 单价", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);

    await createTransaction(user.id, {
      date: D("2026-01-01"), amount: 1000, type: "INVEST",
      description: "买入", holdingId: target.id, unitPrice: 10,
    });

    const h = await reload(target.id);
    expect(h.quantity).toBeCloseTo(100, 9);
    expect(h.costBasis).toBeCloseTo(10, 9);
  });

  it("第二笔用不同价买入：成本走加权平均", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);

    await createTransaction(user.id, {
      date: D("2026-01-01"), amount: 1000, type: "INVEST",
      description: "第一笔", holdingId: target.id, unitPrice: 10,
    });
    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 2000, type: "INVEST",
      description: "第二笔", holdingId: target.id, unitPrice: 20,
    });

    const h = await reload(target.id);
    // 100 股 @10 + 100 股 @20 -> 200 股，总成本 3000，均价 15
    expect(h.quantity).toBeCloseTo(200, 9);
    expect(h.costBasis).toBeCloseTo(15, 9);
  });

  it("删掉其中一笔，份额与成本精确还原到那笔之前", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);

    await createTransaction(user.id, {
      date: D("2026-01-01"), amount: 1000, type: "INVEST",
      description: "第一笔", holdingId: target.id, unitPrice: 10,
    });
    const second = await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 2000, type: "INVEST",
      description: "第二笔", holdingId: target.id, unitPrice: 20,
    });

    await deleteTransaction(user.id, second.id);

    const h = await reload(target.id);
    expect(h.quantity).toBeCloseTo(100, 9);
    expect(h.costBasis).toBeCloseTo(10, 9);
  });

  it("删光所有投资记录後，持仓归零而不是留下残值", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);

    const t1 = await createTransaction(user.id, {
      date: D("2026-01-01"), amount: 333.33, type: "INVEST",
      description: "零头金额", holdingId: target.id, unitPrice: 7.77,
    });
    await deleteTransaction(user.id, t1.id);

    const h = await reload(target.id);
    expect(h.quantity).toBeCloseTo(0, 9);
    expect(h.costBasis).toBeCloseTo(0, 9);
  });

  it("改金额後，持仓跟着重算", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);

    const t = await createTransaction(user.id, {
      date: D("2026-01-01"), amount: 1000, type: "INVEST",
      description: "买入", holdingId: target.id, unitPrice: 10,
    });
    await updateTransaction(user.id, t.id, {
      date: D("2026-01-01"), amount: 500, type: "INVEST",
      description: "改成一半", holdingId: target.id, unitPrice: 10,
    });

    const h = await reload(target.id);
    expect(h.quantity).toBeCloseTo(50, 9);
    expect(h.costBasis).toBeCloseTo(10, 9);
  });
});

describe("INVEST 的防呆", () => {
  it("目标持仓不能是现金", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await prisma.holding.create({
      data: {
        accountId: acc.id, assetType: "CASH", valuation: "DERIVED", name: "现金",
        quantity: 1, costBasis: 500, currency: "MYR",
      },
    });

    await expect(
      createTransaction(user.id, {
        date: D("2026-01-01"), amount: 100, type: "INVEST",
        description: "乱买", holdingId: cash.id, unitPrice: 1,
      })
    ).rejects.toThrow();
  });

  it("扣款现金与目标持仓币种不一致要挡下来", async () => {
    const user = await makeUser();
    const accUsd = await makeAccount(user.id, "USD");
    const target = await makeTarget(accUsd.id, "USD");
    const myrCash = await prisma.holding.create({
      data: {
        accountId: accUsd.id, assetType: "CASH", valuation: "DERIVED", name: "MYR 现金",
        quantity: 1, costBasis: 5000, currency: "MYR",
      },
    });

    await expect(
      createTransaction(user.id, {
        date: D("2026-01-01"), amount: 100, type: "INVEST",
        description: "币种不符", holdingId: target.id, unitPrice: 10,
        cashHoldingId: myrCash.id,
      })
    ).rejects.toThrow();
  });

  it("不能拿别人的持仓当投资目标", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const otherAcc = await makeAccount(other.id);
    const otherTarget = await makeTarget(otherAcc.id);

    await expect(
      createTransaction(me.id, {
        date: D("2026-01-01"), amount: 100, type: "INVEST",
        description: "越权", holdingId: otherTarget.id, unitPrice: 10,
      })
    ).rejects.toThrow();
  });

  it("单价必须大於 0", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);

    await expect(
      createTransaction(user.id, {
        date: D("2026-01-01"), amount: 100, type: "INVEST",
        description: "零单价", holdingId: target.id, unitPrice: 0,
      })
    ).rejects.toThrow();
  });
});

describe("现金联动", () => {
  it("推导型现金不碰 costBasis，余额靠流水自己算出来", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const target = await makeTarget(acc.id);
    const cash = await prisma.holding.create({
      data: {
        accountId: acc.id, assetType: "CASH", valuation: "DERIVED", name: "现金",
        quantity: 1, costBasis: 0, currency: "MYR",
        openingBalance: 5000, openingBalanceDate: D("2026-01-01"),
      },
    });

    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 1000, type: "INVEST",
      description: "用现金买", holdingId: target.id, unitPrice: 10,
      cashHoldingId: cash.id,
    });

    const after = await reload(cash.id);
    // costBasis 不该被动到 —— 那个栏位对推导型现金已经没有意义，
    // 写进去只会慢慢偏离真实值
    expect(after.costBasis).toBe(0);
    expect(after.openingBalance).toBe(5000);
  });
});

describe("收支记录与现金池的联动", () => {
  /** 推导型现金池；预设 MYR、期初 1000 */
  async function makeCashPool(
    accountId: string,
    opts: { currency?: string; opening?: number } = {}
  ) {
    return prisma.holding.create({
      data: {
        accountId, assetType: "CASH", valuation: "DERIVED", name: "现金池",
        quantity: 1, costBasis: 0, currency: opts.currency ?? "MYR",
        openingBalance: opts.opening ?? 1000, openingBalanceDate: D("2026-01-01"),
      },
    });
  }

  it("收入指定现金池後，该池余额增加", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 3000, type: "INCOME",
      description: "薪水", cashHoldingId: cash.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(cash.id)).toBeCloseTo(4000, 9);
  });

  it("支出指定现金池後，该池余额减少", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 250, type: "EXPENSE",
      description: "买菜", cashHoldingId: cash.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(cash.id)).toBeCloseTo(750, 9);
  });

  it("不指定现金池的收支照常记录，只是不影响任何余额", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 3000, type: "INCOME",
      description: "现金红包，没进户口",
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(cash.id)).toBeCloseTo(1000, 9);
  });

  it("金额币种跟着现金池走，不是一律记成 MYR", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id, "AUD");
    const audCash = await makeCashPool(acc.id, { currency: "AUD" });

    const tx = await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 500, type: "INCOME",
      description: "澳洲打工", cashHoldingId: audCash.id,
    });

    // 记成 MYR 的话，推导会把 500 当马币直接加进澳币池，余额从此失真
    expect(tx.currency).toBe("AUD");
  });

  it("改掉金额後，余额跟着重算", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    const tx = await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 3000, type: "INCOME",
      description: "薪水", cashHoldingId: cash.id,
    });
    await updateTransaction(user.id, tx.id, {
      date: D("2026-02-01"), amount: 3500, type: "INCOME",
      description: "薪水（补上加班费）", cashHoldingId: cash.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(cash.id)).toBeCloseTo(4500, 9);
  });

  it("改成另一个现金池後，旧池不再算这笔、新池才算", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const oldPool = await makeCashPool(acc.id);
    const newPool = await makeCashPool(acc.id);

    const tx = await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 3000, type: "INCOME",
      description: "记错户口了", cashHoldingId: oldPool.id,
    });
    await updateTransaction(user.id, tx.id, {
      date: D("2026-02-01"), amount: 3000, type: "INCOME",
      description: "改到正确户口", cashHoldingId: newPool.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(oldPool.id)).toBeCloseTo(1000, 9);
    expect(balances.get(newPool.id)).toBeCloseTo(4000, 9);
  });

  it("删掉记录後余额回到原样", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    const tx = await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 3000, type: "INCOME",
      description: "薪水", cashHoldingId: cash.id,
    });
    await deleteTransaction(user.id, tx.id);

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(cash.id)).toBeCloseTo(1000, 9);
  });

  it("转帐指定转出的现金池後，该池余额减少", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    // 只记转出侧：钱确实离开了这个池。对家池在不在系统里是另一回事
    // （在的话由 counterCashHoldingId 记转入侧），不该因此让转出侧不算数。
    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 400, type: "TRANSFER",
      description: "转去电子钱包", cashHoldingId: cash.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(cash.id)).toBeCloseTo(600, 9);
  });

  it("转帐两侧都指定时，转出池减、转入池加，且不影响收支", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const from = await makeCashPool(acc.id);
    const to = await makeCashPool(acc.id);

    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 400, type: "TRANSFER",
      description: "银行转电子钱包", cashHoldingId: from.id, counterCashHoldingId: to.id,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(from.id)).toBeCloseTo(600, 9);
    // 同币种不必填 counterAmount，推导会退回 amount
    expect(balances.get(to.id)).toBeCloseTo(1400, 9);
  });

  it("跨币种转帐没填转入金额就该报错", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const myr = await makeCashPool(acc.id);
    const aud = await makeCashPool(acc.id, { currency: "AUD" });

    // 少了 counterAmount 会把 400 MYR 原样加进澳币池 —— 宁可挡下来
    await expect(
      createTransaction(user.id, {
        date: D("2026-02-01"), amount: 400, type: "TRANSFER",
        description: "换汇", cashHoldingId: myr.id, counterCashHoldingId: aud.id,
      })
    ).rejects.toThrow();
  });

  it("跨币种转帐两侧各记各的金额", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const myr = await makeCashPool(acc.id);
    const aud = await makeCashPool(acc.id, { currency: "AUD", opening: 0 });

    await createTransaction(user.id, {
      date: D("2026-02-01"), amount: 400, type: "TRANSFER",
      description: "换汇", cashHoldingId: myr.id,
      counterCashHoldingId: aud.id, counterAmount: 137.5,
    });

    const balances = await getDerivedCashBalances(user.id);
    expect(balances.get(myr.id)).toBeCloseTo(600, 9);
    expect(balances.get(aud.id)).toBeCloseTo(137.5, 9);
  });

  it("转出与转入不能是同一个池", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await makeCashPool(acc.id);

    await expect(
      createTransaction(user.id, {
        date: D("2026-02-01"), amount: 100, type: "TRANSFER",
        description: "自己转自己", cashHoldingId: cash.id, counterCashHoldingId: cash.id,
      })
    ).rejects.toThrow();
  });

  it("收支的现金池不能是别人的", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const otherAcc = await makeAccount(other.id);
    const otherCash = await makeCashPool(otherAcc.id);

    await expect(
      createTransaction(me.id, {
        date: D("2026-02-01"), amount: 100, type: "INCOME",
        description: "越权", cashHoldingId: otherCash.id,
      })
    ).rejects.toThrow();
  });

  it("收支的现金池必须是现金类持仓", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const fund = await makeTarget(acc.id);

    await expect(
      createTransaction(user.id, {
        date: D("2026-02-01"), amount: 100, type: "INCOME",
        description: "选错成基金", cashHoldingId: fund.id,
      })
    ).rejects.toThrow();
  });
});
