/**
 * 种子对帐单汇入用的关键字分类规则（幂等，可重复跑）：npx tsx scripts/seed-category-rules.ts
 *
 * 这里放的是**通用范例**。实际使用时关键字要取自你自己对帐单上的真实文字，
 * 那份放在 scripts/seed-category-rules.local.ts（已 gitignore），因为里面会有
 * 真实商户名、人名与转帐描述，不适合进版本库。
 *
 * 规则设计要点（见 bookkeeping-design.md）：
 * - 关键字要挑够 specific 的完整词组。太泛用的词（例如只写一个人名）会把不同性质的
 *   交易混进同一个分类
 * - 同一笔钱在不同来源的对帐单上写法可能不同（有无空格、商户简称），需要各写一条
 * - 内部转帐要标 TRANSFER 而不是 EXPENSE，否则月度支出会虚高
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type CategoryType = "EXPENSE" | "INCOME" | "INVEST" | "TRANSFER";

const RULES: [string, string, CategoryType][] = [
  // 内部转帐：钱还是自己的，不能算支出
  ["TNG-EWALLET", "电子钱包", "TRANSFER"],
  ["RELOAD", "电子钱包", "TRANSFER"],

  // 投资投入：从现金变资产，不是支出
  ["KUMPULAN WANG SIMPANAN PEKERJA", "公积金", "INVEST"],
  ["PUBLIC MUTUAL", "定投", "INVEST"],
  ["MONTHLY TRANSFER", "定投", "INVEST"],

  // 一般支出
  ["DIGI TELECOMMUNICATION", "房租水电", "EXPENSE"],
  ["CELCOMDIGI", "房租水电", "EXPENSE"], // 同一笔电讯费在另一份对帐单上的写法
  ["GRAB", "餐饮", "EXPENSE"],
  ["MCDONALDS", "餐饮", "EXPENSE"],
  ["MAMAK", "餐饮", "EXPENSE"],
  ["7-ELEVEN", "日用", "EXPENSE"],
  ["VET CONSULT", "宠物", "EXPENSE"],
];

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("请先在 .env.local 设置 ADMIN_EMAIL");

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  for (const [keyword, categoryName, type] of RULES) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { userId_name_type: { userId: user.id, name: categoryName, type } },
    });
    const existing = await prisma.categoryRule.findFirst({
      where: { keyword, category: { userId: user.id } },
    });
    if (existing) {
      await prisma.categoryRule.update({ where: { id: existing.id }, data: { categoryId: category.id } });
    } else {
      await prisma.categoryRule.create({ data: { keyword, categoryId: category.id } });
    }
  }

  const count = await prisma.categoryRule.count({ where: { category: { userId: user.id } } });
  console.log(`分类规则就绪，共 ${count} 条`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
