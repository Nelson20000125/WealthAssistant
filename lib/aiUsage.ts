import { prisma } from "@/lib/prisma";

/**
 * AI 顾问的每日用量上限。
 *
 * 公开 demo 站的帐密就写在 README 里，任何人都能登入去打 /api/advisor，
 * 而那背后是我自己的 API key。没有上限的话额度迟早被刷光，
 * 结果是下一个点进来的人看到的不是 AI 顾问、是一页错误讯息。
 *
 * 上限由 AI_DAILY_LIMIT 决定，没设就是不限制 —— 本地开发不该被自己挡住，
 * 只有部署环境才需要设这个值。
 */

export function getDailyLimit(): number | null {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 「今天」以 Asia/Kuala_Lumpur 的日历日为准，不是伺服器时区。
 * 伺服器跑在 UTC，用它算的话马来西亚时间早上 8 点前都还算前一天，
 * 额度会在使用者眼中的半夜莫名其妙地重置。
 * en-CA 的输出刚好是 YYYY-MM-DD。
 */
function currentDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export type AiQuota = {
  limit: number | null; // null = 不限制
  used: number;
  remaining: number | null;
};

/** 只读查询，给 UI 显示「今日还剩几次」用，不会消耗额度。 */
export async function peekAiQuota(userId: string): Promise<AiQuota> {
  const limit = getDailyLimit();
  if (limit === null) return { limit: null, used: 0, remaining: null };

  const row = await prisma.aiUsage.findUnique({
    where: { userId_day: { userId, day: currentDay() } },
  });
  const used = row?.count ?? 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * 消耗一次额度。回传 allowed=false 代表这次不该放行。
 *
 * 先累加再判断，而不是先查再加：查完到写入之间有空隙，同时来两个请求会双双通过。
 * upsert 的 increment 是单一原子操作，累加後的值才是可信的判断依据。
 */
export async function consumeAiQuota(userId: string): Promise<AiQuota & { allowed: boolean }> {
  const limit = getDailyLimit();
  if (limit === null) return { allowed: true, limit: null, used: 0, remaining: null };

  const day = currentDay();
  const row = await prisma.aiUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 1 },
    update: { count: { increment: 1 } },
  });

  return {
    allowed: row.count <= limit,
    limit,
    used: row.count,
    remaining: Math.max(0, limit - row.count),
  };
}
