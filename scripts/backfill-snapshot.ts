/**
 * 手动补录当日净值快照（不想等 refresh-prices 触发时用）：
 *   npx tsx scripts/backfill-snapshot.ts
 *
 * 注意：只能记"当下"的净值，没法凭空补出历史——过去某天的净值需要当天的
 * 价格/汇率，数据库里没有留存。曲线是从开始记快照那天起逐日积累的。
 */
import { upsertTodaySnapshot } from "@/lib/snapshot";
import { prisma } from "@/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("请先在 .env.local 设置 ADMIN_EMAIL");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const s = await upsertTodaySnapshot(user.id);
  console.log(
    `已写入 ${s.date.toISOString().slice(0, 10)} 快照：净资产 RM${s.netWorthMYR.toFixed(2)}（投资 RM${s.investedMYR.toFixed(2)} + 现金 RM${s.cashMYR.toFixed(2)}）`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
