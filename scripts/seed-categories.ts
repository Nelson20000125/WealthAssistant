/**
 * 种子分类（幂等，可重复跑）：npx tsx scripts/seed-categories.ts
 * 2026-07-19 首次执行时已通过 migration 流程写入，这里留作重建/新环境用。
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const SEEDS = [
  { type: "EXPENSE", names: ["餐饮", "交通", "日用", "订阅", "娱乐", "医疗", "人情", "房租水电", "车贷", "房屋", "家用", "宠物", "其他"] },
  { type: "INCOME", names: ["工资", "奖金", "利息股息", "其他"] },
  { type: "INVEST", names: ["定投", "加仓", "公积金"] },
  { type: "TRANSFER", names: ["电子钱包"] },
] as const;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("请先在 .env.local 设置 ADMIN_EMAIL");

  // 动态 import：确保上面的 dotenv config() 先跑完、DATABASE_URL 已经在 process.env 里，
  // 静态 import 会被提升到文件最上面，比 config() 先执行，届时 DATABASE_URL 还是空的
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  for (const { type, names } of SEEDS) {
    for (const name of names) {
      await prisma.category.upsert({
        where: { userId_name_type: { userId: user.id, name, type } },
        update: {},
        create: { userId: user.id, name, type },
      });
    }
  }
  const count = await prisma.category.count({ where: { userId: user.id } });
  console.log(`分类就绪，共 ${count} 个`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
