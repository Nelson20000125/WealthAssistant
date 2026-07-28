import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

/**
 * Demo seed —— 这里的数字全部是虚构的，仅供公开 demo 与新环境初始化使用。
 *
 * 真实资产资料不放在这个档案里：
 *   - 正式环境的资料已经在 DB 里，不需要重新 seed
 *   - 若真的需要重建，用 `prisma/seed.local.ts`（已 gitignore，不进版本库）
 */
async function main() {
  // 幂等保护：已经有户口资料就跳过，避免 prisma migrate dev 之后的自动 seed 重复建立
  const existing = await prisma.account.count();
  if (existing > 0) {
    console.log(`已有 ${existing} 个户口，跳过 demo 种子`);
    return;
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("请先在 .env.local 设置 ADMIN_EMAIL");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const brokerage = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Demo Brokerage Account",
      type: "BROKERAGE",
      institution: "Demo Securities",
      currency: "MYR",
      holdings: {
        create: [
          {
            // 保留真实 ticker，让 demo 能展示 Yahoo 行情抓取；数量与成本为虚构
            assetType: "ETF",
            symbol: "VOO",
            name: "Vanguard S&P 500 ETF",
            quantity: 2.5,
            costBasis: 610.0,
            currency: "USD",
            lastPrice: 680.0,
            priceAsOf: new Date("2026-07-01"),
          },
          {
            assetType: "ETF",
            symbol: "QQQ",
            name: "Invesco QQQ Trust",
            quantity: 4,
            costBasis: 480.0,
            currency: "USD",
            lastPrice: 512.0,
            priceAsOf: new Date("2026-07-01"),
          },
          {
            assetType: "CASH",
            name: "MYR Cash",
            quantity: 1,
            costBasis: 1200.0,
            currency: "MYR",
            lastPrice: 1200.0,
            priceAsOf: new Date("2026-07-01"),
          },
        ],
      },
    },
  });

  const fund = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Demo Unit Trust Account",
      type: "FUND",
      institution: "Demo Asset Management",
      currency: "MYR",
      holdings: {
        create: [
          {
            // 单位信托没有公开行情 API，净值一律手动输入
            assetType: "FUND",
            name: "Demo Technology Growth Fund",
            quantity: 8000,
            costBasis: 0.52,
            currency: "MYR",
            lastPrice: 0.61,
            priceAsOf: new Date("2026-07-01"),
          },
        ],
      },
    },
  });

  const bank = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Demo Savings Account",
      type: "BANK",
      institution: "Demo Bank",
      currency: "MYR",
      holdings: {
        create: [
          {
            assetType: "CASH",
            name: "Savings Balance",
            quantity: 1,
            costBasis: 25000.0,
            currency: "MYR",
            lastPrice: 25000.0,
            priceAsOf: new Date("2026-07-01"),
          },
        ],
      },
    },
  });

  console.log("Seeded demo accounts:", brokerage.name, fund.name, bank.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
