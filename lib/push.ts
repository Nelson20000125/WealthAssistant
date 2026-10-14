import { prisma } from "@/lib/prisma";
import { getRecordingStatus, todayKL } from "@/lib/recordingStatus";

// 每日记账提醒（P1-07）。订阅只会在使用者亲手按「开启提醒」、授权通知之后才存在，
// 所以「未授权不准发」由资料本身保证：没订阅就没有对象可发。

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export function saveSubscription(userId: string, s: BrowserSubscription) {
  const data = { userId, p256dh: s.keys.p256dh, auth: s.keys.auth };
  return prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    update: data,
    create: { endpoint: s.endpoint, ...data },
  });
}

export function removeSubscription(userId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export const REMINDER = {
  title: "我的钱",
  body: "今天还记账吗？花了什么，记一下就好。",
  url: "/?add=1",
};

type Send = (sub: BrowserSubscription, payload: string) => Promise<unknown>;

/**
 * 给今天还没记账的人发提醒。send 由调用方注入（正式是 web-push 的 sendNotification），
 * 测试就不必真的连推播服务。userIds 不给＝所有有订阅的人。
 */
export async function sendDailyReminders({
  send,
  today = todayKL(),
  userIds,
}: {
  send: Send;
  today?: string;
  userIds?: string[];
}) {
  const subs = await prisma.pushSubscription.findMany({
    where: userIds ? { userId: { in: userIds } } : undefined,
  });
  const byUser = Map.groupBy(subs, (s) => s.userId);
  const payload = JSON.stringify(REMINDER);
  const result = { sent: 0, failed: 0, removed: 0, skippedRecorded: 0 };

  for (const [userId, userSubs] of byUser) {
    const { daysSinceLast } = await getRecordingStatus(userId, today);
    if (daysSinceLast === 0) {
      result.skippedRecorded++;
      continue;
    }
    for (const s of userSubs) {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        result.sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404 / 410：推播服务说这个订阅没了（删了 app、撤销了通知权限）
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } });
          result.removed++;
        } else {
          result.failed++;
        }
      }
    }
  }
  return result;
}
