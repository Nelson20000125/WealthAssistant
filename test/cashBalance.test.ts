import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCashPools, getDerivedCashBalances, pickDefaultCashPool } from "@/lib/cashBalance";

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

async function makeCash(
  userId: string,
  opts: { opening?: number; openingDate?: Date; currency?: string } = {}
) {
  const account = await prisma.account.create({
    data: {
      userId,
      name: "测试银行",
      type: "BANK",
      institution: "Test",
      currency: opts.currency ?? "MYR",
    },
  });
  return prisma.holding.create({
    data: {
      accountId: account.id,
      assetType: "CASH",
      valuation: "DERIVED",
      name: "现金",
      quantity: 1,
      costBasis: 0,
      currency: opts.currency ?? "MYR",
      openingBalance: opts.opening ?? null,
      openingBalanceDate: opts.openingDate ?? null,
    },
  });
}

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("getDerivedCashBalances", () => {
  it("没设期初余额的持仓不参与推导（呼叫端才好退回旧算法）", async () => {
    const user = await makeUser();
    const cash = await makeCash(user.id);

    const result = await getDerivedCashBalances(user.id);

    expect(result.has(cash.id)).toBe(false);
  });

  it("有期初、没有任何流水时，余额就是期初余额", async () => {
    const user = await makeUser();
    const cash = await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01") });

    const result = await getDerivedCashBalances(user.id);

    expect(result.get(cash.id)).toBe(1000);
  });

  it("收入加、支出减、投资减", async () => {
    const user = await makeUser();
    const cash = await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01") });

    await prisma.transaction.createMany({
      data: [
        {
          userId: user.id, date: D("2026-02-01"), amount: 500, currency: "MYR",
          type: "INCOME", description: "薪水", source: "MANUAL", cashHoldingId: cash.id,
        },
        {
          userId: user.id, date: D("2026-02-02"), amount: 200, currency: "MYR",
          type: "EXPENSE", description: "吃饭", source: "MANUAL", cashHoldingId: cash.id,
        },
        {
          userId: user.id, date: D("2026-02-03"), amount: 300, currency: "MYR",
          type: "INVEST", description: "买基金", source: "MANUAL", cashHoldingId: cash.id,
        },
      ],
    });

    const result = await getDerivedCashBalances(user.id);

    expect(result.get(cash.id)).toBe(1000 + 500 - 200 - 300);
  });

  it("期初日当天及之前的流水不计入（那些已经含在期初余额里）", async () => {
    const user = await makeUser();
    const cash = await makeCash(user.id, { opening: 1000, openingDate: D("2026-02-01") });

    await prisma.transaction.createMany({
      data: [
        // 期初日之前 —— 不该计入
        {
          userId: user.id, date: D("2026-01-15"), amount: 999, currency: "MYR",
          type: "INCOME", description: "期初前", source: "MANUAL", cashHoldingId: cash.id,
        },
        // 期初日当天 —— 边界，也不该计入
        {
          userId: user.id, date: D("2026-02-01"), amount: 888, currency: "MYR",
          type: "INCOME", description: "期初当天", source: "MANUAL", cashHoldingId: cash.id,
        },
        // 期初日之後 —— 要计入
        {
          userId: user.id, date: D("2026-02-02"), amount: 100, currency: "MYR",
          type: "INCOME", description: "期初後", source: "MANUAL", cashHoldingId: cash.id,
        },
      ],
    });

    const result = await getDerivedCashBalances(user.id);

    expect(result.get(cash.id)).toBe(1100);
  });

  it("转帐对手侧要加进来", async () => {
    const user = await makeUser();
    const from = await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01") });
    const to = await makeCash(user.id, { opening: 0, openingDate: D("2026-01-01") });

    await prisma.transaction.create({
      data: {
        userId: user.id, date: D("2026-02-01"), amount: 300, currency: "MYR",
        type: "TRANSFER", description: "转帐", source: "MANUAL",
        cashHoldingId: from.id, counterCashHoldingId: to.id,
      },
    });

    const result = await getDerivedCashBalances(user.id);

    expect(result.get(from.id)).toBe(700);
    expect(result.get(to.id)).toBe(300);
  });

  it("换汇：两侧金额不等时，转入侧要用 counterAmount 而不是 amount", async () => {
    const user = await makeUser();
    const aud = await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01"), currency: "AUD" });
    const myr = await makeCash(user.id, { opening: 0, openingDate: D("2026-01-01"), currency: "MYR" });

    // 换出 100 AUD，换进 290 MYR
    await prisma.transaction.create({
      data: {
        userId: user.id, date: D("2026-02-01"), amount: 100, currency: "AUD",
        type: "TRANSFER", description: "换汇", source: "MANUAL",
        cashHoldingId: aud.id, counterCashHoldingId: myr.id, counterAmount: 290,
      },
    });

    const result = await getDerivedCashBalances(user.id);

    expect(result.get(aud.id)).toBe(900);
    expect(result.get(myr.id)).toBe(290);
  });

  it("只算自己的资料，不会把别人的现金算进来", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const mine = await makeCash(me.id, { opening: 100, openingDate: D("2026-01-01") });
    const theirs = await makeCash(other.id, { opening: 999, openingDate: D("2026-01-01") });

    const result = await getDerivedCashBalances(me.id);

    expect(result.get(mine.id)).toBe(100);
    expect(result.has(theirs.id)).toBe(false);
  });
});

describe("getCashPools", () => {
  it("没设期初的现金池也要列出来，余额沿用 costBasis", async () => {
    const user = await makeUser();
    const cash = await makeCash(user.id);
    await prisma.holding.update({ where: { id: cash.id }, data: { costBasis: 800 } });

    const pools = await getCashPools(user.id);

    expect(pools).toHaveLength(1);
    expect(pools[0].balance).toBe(800);
    // 余额不是从流水推导来的 —— UI 要能标出「这个池子还没设期初」
    expect(pools[0].isDerived).toBe(false);
  });

  it("设了期初的现金池，余额用流水推导而不是 costBasis", async () => {
    const user = await makeUser();
    const cash = await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01") });
    // costBasis 是旧算法的残值，推导型不该再看它
    await prisma.holding.update({ where: { id: cash.id }, data: { costBasis: 999999 } });
    await prisma.transaction.create({
      data: {
        userId: user.id, date: D("2026-02-01"), amount: 300, currency: "MYR",
        type: "INCOME", description: "薪水", source: "MANUAL", cashHoldingId: cash.id,
      },
    });

    const pools = await getCashPools(user.id);

    expect(pools[0].balance).toBe(1300);
    expect(pools[0].isDerived).toBe(true);
  });

  it("非 MYR 的池子按汇率折算，原生余额同时保留", async () => {
    const user = await makeUser();
    await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01"), currency: "AUD" });
    await prisma.fxRate.create({ data: { base: "AUD", quote: "MYR", rate: 2.9 } });

    const pools = await getCashPools(user.id);

    expect(pools[0].balance).toBe(1000);
    expect(pools[0].balanceMYR).toBeCloseTo(2900, 9);
  });

  it("缺汇率时折算值为 null，不要拿原生数字冒充 MYR", async () => {
    const user = await makeUser();
    await makeCash(user.id, { opening: 1000, openingDate: D("2026-01-01"), currency: "AUD" });

    const pools = await getCashPools(user.id);

    expect(pools[0].balance).toBe(1000);
    expect(pools[0].balanceMYR).toBeNull();
  });

  it("不会列出别人的现金池", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await makeCash(me.id, { opening: 100, openingDate: D("2026-01-01") });
    await makeCash(other.id, { opening: 999, openingDate: D("2026-01-01") });

    const pools = await getCashPools(me.id);

    expect(pools).toHaveLength(1);
    expect(pools[0].balance).toBe(100);
  });

  it("不会把非现金持仓当成现金池", async () => {
    const user = await makeUser();
    const account = await prisma.account.create({
      data: { userId: user.id, name: "券商", type: "BROKERAGE", institution: "T", currency: "MYR" },
    });
    await prisma.holding.create({
      data: {
        accountId: account.id, assetType: "FUND", valuation: "MANUAL_UNIT_PRICE",
        name: "基金", quantity: 10, costBasis: 100, currency: "MYR",
      },
    });

    const pools = await getCashPools(user.id);

    expect(pools).toHaveLength(0);
  });
});

// 记一笔的户口预设：localStorage 记住上次用的那个（已实作），但「第一次使用、
// 还没有任何记忆」时旧行为是不预选，于是使用者一路用「不从户口扣」记完整个月，
// 余额纹丝不动 —— 而这个 app 的核心就是余额由流水推导。
// 首次的合理预设是余额最大的那个池子：日常开销九成从主户口出。
describe("pickDefaultCashPool —— 首次记账的预设户口", () => {
  const pool = (id: string, balanceMYR: number | null) =>
    ({ id, balanceMYR }) as Parameters<typeof pickDefaultCashPool>[0][number];

  it("选余额最大的那个", () => {
    // 金额刻意用整数假数据：repo 是公开的，测试档里不放真实余额
    expect(pickDefaultCashPool([pool("a", 20), pool("b", 5000), pool("c", 800)])).toBe("b");
  });

  it("只有一个池子就是它", () => {
    expect(pickDefaultCashPool([pool("only", 5)])).toBe("only");
  });

  it("没有池子回传 null", () => {
    expect(pickDefaultCashPool([])).toBeNull();
  });

  // 缺汇率时 balanceMYR 是 null（刻意不拿原生数字冒充 MYR）。
  // 这种池子不该因为「null 比数字小」而被排到最后，也不该被当成 0 参与比较。
  it("跳过没有 MYR 折算值的池子", () => {
    expect(pickDefaultCashPool([pool("nofx", null), pool("ok", 100)])).toBe("ok");
  });

  it("全部缺汇率时回传 null，不瞎猜", () => {
    expect(pickDefaultCashPool([pool("x", null), pool("y", null)])).toBeNull();
  });

  // 余额是推导出来的，透支到负数是可能的（期初填小了）。负余额不该被选中当预设。
  it("忽略余额为负的池子", () => {
    expect(pickDefaultCashPool([pool("neg", -50), pool("small", 3)])).toBe("small");
  });
});
