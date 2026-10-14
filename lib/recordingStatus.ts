import { prisma } from "@/lib/prisma";

// 断记提醒的真实状态（P1-06）。日期一律是 YYYY-MM-DD（吉隆坡日历日），
// 交易的 date 存的就是那一天的 UTC 零点，所以 toISOString().slice(0, 10) 即日期键。

const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00.000Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function recordingStatus({
  today,
  lastTxDate,
  lastImportedDate,
}: {
  today: string;
  lastTxDate: string | null;
  lastImportedDate: string | null;
}) {
  const daysSinceLast =
    lastTxDate === null ? null : Math.max(0, Math.round((toMs(today) - toMs(lastTxDate)) / DAY_MS));

  // 上个月最后一天 = 本月 1 号的前一天。导入没到那天，就是有一张已经出了的月结单还没进来
  const endOfLastMonth = toMs(`${today.slice(0, 7)}-01`) - DAY_MS;
  const importGapFrom =
    lastImportedDate !== null && toMs(lastImportedDate) < endOfLastMonth
      ? toKey(toMs(lastImportedDate) + DAY_MS)
      : null;

  return { daysSinceLast, lastTxDate, importGapFrom };
}

export function todayKL() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

export async function getRecordingStatus(userId: string, today = todayKL()) {
  const [last, lastImported] = await Promise.all([
    prisma.transaction.aggregate({ where: { userId }, _max: { date: true } }),
    prisma.transaction.aggregate({ where: { userId, importBatchId: { not: null } }, _max: { date: true } }),
  ]);
  const key = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return recordingStatus({
    today,
    lastTxDate: key(last._max.date),
    lastImportedDate: key(lastImported._max.date),
  });
}
