/**
 * 一次性检查：列出疑似「assetType / symbol / name 对不上」的持仓，方便手动确认。
 *   npx tsx scripts/audit-holdings.ts
 *
 * 只印出来，不会自动改资料库。
 */
import { prisma } from "@/lib/prisma";

const CASH_LIKE = /cash|现金|存款|储蓄/i;

async function main() {
  const holdings = await prisma.holding.findMany({
    include: { account: { select: { name: true, user: { select: { email: true } } } } },
  });

  const flagged = holdings.flatMap((h) => {
    const reasons: string[] = [];

    if (h.assetType !== "CASH" && CASH_LIKE.test(h.name)) {
      reasons.push(`assetType=${h.assetType} 但 name 看起来是现金`);
    }
    if (h.symbol && CASH_LIKE.test(h.name)) {
      reasons.push(`name 看起来是现金，但挂了 symbol=${h.symbol}`);
    }

    return reasons.length > 0 ? [{ h, reasons }] : [];
  });

  if (flagged.length === 0) {
    console.log("没有发现可疑持仓。");
    return;
  }

  console.log(`发现 ${flagged.length} 笔可疑持仓：\n`);
  for (const { h, reasons } of flagged) {
    console.log(`- [${h.id}] ${h.account.user.email} / ${h.account.name}`);
    console.log(`  assetType=${h.assetType} symbol=${h.symbol ?? "(空)"} name="${h.name}" lastPrice=${h.lastPrice ?? "(空)"}`);
    for (const r of reasons) console.log(`  原因：${r}`);
    console.log();
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    prisma.$disconnect();
    process.exit(1);
  });
