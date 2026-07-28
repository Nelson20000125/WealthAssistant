/**
 * 把虚构的 demo 资料灌进 Turso：npx tsx scripts/seed-turso-demo.ts
 *
 * 这支脚本**只对 TURSO_DATABASE_URL 执行**，刻意不读 DATABASE_URL，
 * 所以不可能误伤本地 dev.db（那里放的是真实资料，永远不上线）。
 *
 * 需要在 .env.local 设定：
 *   TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 *   DEMO_EMAIL / DEMO_PASSWORD   ← demo 站公开的登入帐号，随便设，不要用真实密码
 *
 * 幂等：重跑会先清掉这个 demo 使用者的资料再重建。
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const CATEGORIES = [
  { type: "EXPENSE", names: ["餐饮", "交通", "日用", "订阅", "娱乐", "医疗", "房租水电", "其他"] },
  { type: "INCOME", names: ["工资", "奖金", "利息股息"] },
  { type: "INVEST", names: ["定投", "加仓"] },
  { type: "TRANSFER", names: ["电子钱包"] },
] as const;

// 每月固定的收支样板，金额刻意用整数、好看但明显是范例
const MONTHLY_EXPENSES: Array<[string, string, number]> = [
  ["房租水电", "月租 + 水电", 1400],
  ["餐饮", "日常伙食", 820],
  ["交通", "油费与过路费", 260],
  ["日用", "生活杂货", 180],
  ["订阅", "串流与云端订阅", 75],
  ["娱乐", "周末活动", 210],
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD;

  if (!url) throw new Error("缺少 TURSO_DATABASE_URL");
  if (!url.startsWith("libsql://") && !url.startsWith("https://")) {
    throw new Error(`拒绝执行：TURSO_DATABASE_URL 不是远端位址（${url}）`);
  }
  if (!email || !password) {
    throw new Error("请先在 .env.local 设置 DEMO_EMAIL / DEMO_PASSWORD");
  }

  const bcrypt = (await import("bcryptjs")).default;
  const { PrismaLibSql } = await import("@prisma/adapter-libsql");
  const { PrismaClient } = await import("../app/generated/prisma/client");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url, authToken }) });
  console.log(`目标：${url}`);

  // ── 使用者 ──
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: "Demo User" },
    create: { email, passwordHash, name: "Demo User" },
  });
  console.log(`demo 使用者：${user.email}`);

  // ── 清掉旧的 demo 资料（只清这个使用者的）──
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.portfolioSnapshot.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.category.deleteMany({ where: { userId: user.id } });

  // ── 分类 ──
  const catId = new Map<string, string>();
  for (const { type, names } of CATEGORIES) {
    for (const name of names) {
      const c = await prisma.category.create({ data: { userId: user.id, name, type } });
      catId.set(`${type}:${name}`, c.id);
    }
  }
  console.log(`分类 ${catId.size} 个`);

  // ── 户口与持仓 ──
  const asOf = new Date("2026-07-01");
  await prisma.account.create({
    data: {
      userId: user.id,
      name: "Demo Brokerage Account",
      type: "BROKERAGE",
      institution: "Demo Securities",
      currency: "MYR",
      holdings: {
        create: [
          { assetType: "ETF", symbol: "VOO", name: "Vanguard S&P 500 ETF", quantity: 2.5, costBasis: 610, currency: "USD", lastPrice: 680, priceAsOf: asOf },
          { assetType: "ETF", symbol: "QQQ", name: "Invesco QQQ Trust", quantity: 4, costBasis: 480, currency: "USD", lastPrice: 512, priceAsOf: asOf },
          { assetType: "CASH", name: "MYR Cash", quantity: 1, costBasis: 1200, currency: "MYR", lastPrice: 1200, priceAsOf: asOf },
        ],
      },
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      name: "Demo Unit Trust Account",
      type: "FUND",
      institution: "Demo Asset Management",
      currency: "MYR",
      holdings: {
        // 单位信托没有公开报价 API，净值一律手动输入
        create: [{ assetType: "FUND", name: "Demo Technology Growth Fund", quantity: 8000, costBasis: 0.52, currency: "MYR", lastPrice: 0.61, priceAsOf: asOf }],
      },
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      name: "Demo Savings Account",
      type: "BANK",
      institution: "Demo Bank",
      currency: "MYR",
      holdings: {
        create: [{ assetType: "CASH", name: "Savings Balance", quantity: 1, costBasis: 25000, currency: "MYR", lastPrice: 25000, priceAsOf: asOf }],
      },
    },
  });
  console.log("户口 3 个、持仓 5 笔");

  // ── 交易：往回 9 个月，让现金流图表有东西可画 ──
  const txs: Array<{
    userId: string; date: Date; amount: number; currency: string;
    type: "INCOME" | "EXPENSE" | "INVEST"; description: string;
    categoryId: string | null; source: "MANUAL" | "STATEMENT_IMPORT";
  }> = [];

  const end = new Date("2026-07-01");
  for (let back = 8; back >= 0; back--) {
    const m = new Date(end.getFullYear(), end.getMonth() - back, 1);
    const at = (day: number) => new Date(m.getFullYear(), m.getMonth(), day);

    txs.push({
      userId: user.id, date: at(25), amount: 5600, currency: "MYR",
      type: "INCOME", description: "月薪", categoryId: catId.get("INCOME:工资") ?? null,
      source: "MANUAL",
    });
    // 年中奖金，让收入曲线不是一条直线
    if (back === 4) {
      txs.push({
        userId: user.id, date: at(25), amount: 3000, currency: "MYR",
        type: "INCOME", description: "年中花红", categoryId: catId.get("INCOME:奖金") ?? null,
        source: "MANUAL",
      });
    }
    for (const [cat, desc, base] of MONTHLY_EXPENSES) {
      const jitter = ((back * 37 + desc.length * 11) % 21) - 10; // -10 ~ +10%，固定不随机，重跑结果一致
      txs.push({
        userId: user.id, date: at(8), amount: Math.round(base * (1 + jitter / 100)),
        currency: "MYR", type: "EXPENSE", description: desc,
        categoryId: catId.get(`EXPENSE:${cat}`) ?? null,
        source: back % 3 === 0 ? "STATEMENT_IMPORT" : "MANUAL",
      });
    }
    txs.push({
      userId: user.id, date: at(28), amount: 1000, currency: "MYR",
      type: "INVEST", description: "每月定投", categoryId: catId.get("INVEST:定投") ?? null,
      source: "MANUAL",
    });
  }
  await prisma.transaction.createMany({ data: txs });
  console.log(`交易 ${txs.length} 笔（跨 9 个月）`);

  // ── 净值快照：让总览页的净值曲线有历史 ──
  const snaps = [];
  for (let back = 8; back >= 0; back--) {
    const d = new Date(end.getFullYear(), end.getMonth() - back, 1);
    const grow = (8 - back) / 8;
    const invested = Math.round(14000 + 6000 * grow);
    const cash = Math.round(20000 + 6200 * grow);
    snaps.push({
      userId: user.id, date: d,
      netWorthMYR: invested + cash,
      investedMYR: invested,
      cashMYR: cash,
      costMYR: Math.round(13000 + 4800 * grow),
      byAssetType: JSON.stringify([
        { assetType: "ETF", valueMYR: Math.round(invested * 0.66) },
        { assetType: "FUND", valueMYR: Math.round(invested * 0.34) },
        { assetType: "CASH", valueMYR: cash },
      ]),
    });
  }
  await prisma.portfolioSnapshot.createMany({ data: snaps });
  console.log(`净值快照 ${snaps.length} 笔`);

  await prisma.$disconnect();
  console.log("demo 资料就绪");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
