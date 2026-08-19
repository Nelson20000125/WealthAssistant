import { prisma } from "@/lib/prisma";

/**
 * 对帐单汇入的重复侦测。
 *
 * 同一笔交易重复汇入时，日期/金额/描述会完全一致 —— 对帐单是银行产生的，
 * 同一笔的文字不会变。拿这三个当指纹就够，不需要额外存 hash 栏位。
 *
 * parse（预览时先剔掉）与 confirm（真正写入前再挡一次）共用这支：
 * 预览到确认之间隔着使用者的操作时间，那段时间另一个分页可能已经汇入过同一份档案。
 */
export type DedupeRow = { date: Date; amount: number; description: string };

function fingerprint(date: Date, amount: number, description: string) {
  return `${date.toISOString().slice(0, 10)}|${amount.toFixed(2)}|${description}`;
}

/**
 * 按笔数配对，不是布林判断：DB 里有几笔就挡几笔。
 * 同一天在同一家店刷两笔一样的金额是真实会发生的事，
 * 用 Set 判断会把第二笔也吃掉，那笔钱就永远进不了系统。
 */
export async function partitionByExisting<T extends DedupeRow>(userId: string, rows: T[]) {
  if (rows.length === 0) return { fresh: [] as T[], duplicates: 0 };

  // 范围各放宽一天：日期在 SQLite 里是字串，而不同写入路径留下过不同的尾巴
  // （Prisma 写 "...000+00:00"、早期脚本写 "...000Z"），字串比较下 "Z" > "+"，
  // 卡在边界那天的记录会被 lte 排除掉，于是重复汇入。放宽范围只是多捞几笔，
  // 是不是重复仍然由底下的指纹精确判定。
  const DAY = 86_400_000;
  const times = rows.map((r) => r.date.getTime());
  const existing = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: new Date(Math.min(...times) - DAY), lte: new Date(Math.max(...times) + DAY) },
    },
    select: { date: true, amount: true, description: true },
  });

  const remaining = new Map<string, number>();
  for (const e of existing) {
    const k = fingerprint(e.date, e.amount, e.description);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }

  const fresh: T[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const k = fingerprint(r.date, r.amount, r.description);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      duplicates++;
      continue;
    }
    fresh.push(r);
  }

  return { fresh, duplicates };
}
