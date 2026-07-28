/**
 * 8 月 1 日正式记账前的数据重置（设计见 bookkeeping-design.md 第五节）：
 *   npx tsx scripts/reset-for-august.ts
 *
 * 清空：Holding、PortfolioSnapshot、Transaction、PriceCache（旧测试数据）
 * 保留：Account（户口结构）、Category（分类）、FxRate、Goal
 *
 * 跑之前建议先手动备份：copy dev.db dev.db.bak-YYYYMMDD
 */
import { prisma } from "@/lib/prisma";
import * as readline from "node:readline/promises";

async function main() {
  const [holdings, snapshots, transactions] = await Promise.all([
    prisma.holding.count(),
    prisma.portfolioSnapshot.count(),
    prisma.transaction.count(),
  ]);

  console.log(`将删除：持仓 ${holdings} 笔、净值快照 ${snapshots} 条、收支记录 ${transactions} 笔`);
  console.log("保留：户口、分类、汇率、目标\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("确定重置？输入 RESET 继续：");
  rl.close();
  if (answer.trim() !== "RESET") {
    console.log("已取消，什么都没动。");
    return;
  }

  await prisma.$transaction([
    prisma.transaction.deleteMany(),
    prisma.portfolioSnapshot.deleteMany(),
    prisma.holding.deleteMany(),
    prisma.priceCache.deleteMany(),
  ]);
  console.log("重置完成。8 月开始在持仓页重新录入资产、在收支记录页开始记账。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
