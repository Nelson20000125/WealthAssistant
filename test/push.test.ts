import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction } from "@/lib/transactions";
import { saveSubscription, removeSubscription, sendDailyReminders } from "@/lib/push";

// 需求（P1-07）：每天 21:30 提醒「今天还记账吗？花了什么，记一下就好。」
// - 只发给亲手开启过提醒（授权 + 订阅）的设备，未授权不会有订阅，自然不会发
// - 今天已经记过账就不发：提醒是为了「每天回来记一笔」，记了还催是噪音
// - 推播服务说订阅已失效（404/410）→ 删掉，不然每天对着死地址发

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = "2026-09-29";

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

const sub = (n: string) => ({
  endpoint: `https://web.push.apple.com/${n}-${Math.random()}`,
  keys: { p256dh: `p-${n}`, auth: `a-${n}` },
});

describe("订阅存取", () => {
  it("同一台设备重复开启，不会长出重复订阅", async () => {
    const user = await makeUser();
    const s = sub("phone");
    await saveSubscription(user.id, s);
    await saveSubscription(user.id, s);
    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it("关闭只删自己的订阅", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const s = sub("shared");
    await saveSubscription(a.id, s);
    await removeSubscription(b.id, s.endpoint);
    expect(await prisma.pushSubscription.count({ where: { userId: a.id } })).toBe(1);
    await removeSubscription(a.id, s.endpoint);
    expect(await prisma.pushSubscription.count({ where: { userId: a.id } })).toBe(0);
  });
});

describe("sendDailyReminders", () => {
  it("今天没记账 → 发给这个人的每台设备，点开进「记一笔」", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D("2026-09-27"), amount: 5, type: "EXPENSE", description: "咖啡" });
    const s1 = sub("phone");
    const s2 = sub("ipad");
    await saveSubscription(user.id, s1);
    await saveSubscription(user.id, s2);

    const send = vi.fn().mockResolvedValue(undefined);
    await sendDailyReminders({ send, today: TODAY, userIds: [user.id] });

    expect(send).toHaveBeenCalledTimes(2);
    const endpoints = send.mock.calls.map((c) => c[0].endpoint).sort();
    expect(endpoints).toEqual([s1.endpoint, s2.endpoint].sort());
    const payload = JSON.parse(send.mock.calls[0][1]);
    expect(payload.body).toBe("今天还记账吗？花了什么，记一下就好。");
    expect(payload.url).toBe("/?add=1");
  });

  it("今天已经记过账 → 不发", async () => {
    const user = await makeUser();
    await createTransaction(user.id, { date: D(TODAY), amount: 5, type: "EXPENSE", description: "咖啡" });
    await saveSubscription(user.id, sub("phone"));

    const send = vi.fn().mockResolvedValue(undefined);
    const r = await sendDailyReminders({ send, today: TODAY, userIds: [user.id] });
    expect(send).not.toHaveBeenCalled();
    expect(r.skippedRecorded).toBe(1);
  });

  it("一笔都没记过的人也要提醒", async () => {
    const user = await makeUser();
    await saveSubscription(user.id, sub("phone"));
    const send = vi.fn().mockResolvedValue(undefined);
    await sendDailyReminders({ send, today: TODAY, userIds: [user.id] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("推播服务回 410（订阅失效）→ 删掉那条订阅", async () => {
    const user = await makeUser();
    const dead = sub("old-phone");
    const alive = sub("phone");
    await saveSubscription(user.id, dead);
    await saveSubscription(user.id, alive);

    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint === dead.endpoint) throw Object.assign(new Error("Gone"), { statusCode: 410 });
    });
    const r = await sendDailyReminders({ send, today: TODAY, userIds: [user.id] });

    const left = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    expect(left.map((x) => x.endpoint)).toEqual([alive.endpoint]);
    expect(r).toMatchObject({ sent: 1, removed: 1, failed: 0 });
  });

  it("其他错误（网络、500）→ 订阅保留，记为失败，不影响其他设备", async () => {
    const user = await makeUser();
    const flaky = sub("flaky");
    await saveSubscription(user.id, flaky);
    await saveSubscription(user.id, sub("phone"));

    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint === flaky.endpoint) throw Object.assign(new Error("boom"), { statusCode: 500 });
    });
    const r = await sendDailyReminders({ send, today: TODAY, userIds: [user.id] });

    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(2);
    expect(r).toMatchObject({ sent: 1, removed: 0, failed: 1 });
  });
});
