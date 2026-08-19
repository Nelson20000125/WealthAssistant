import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { partitionByExisting } from "@/lib/importDedupe";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

async function makeCategory(userId: string) {
  return prisma.category.create({ data: { userId, name: "餐饮", type: "EXPENSE" } });
}

async function seedTx(
  userId: string,
  categoryId: string,
  t: { date: Date; amount: number; description: string }
) {
  return prisma.transaction.create({
    data: {
      userId,
      date: t.date,
      amount: t.amount,
      currency: "MYR",
      type: "EXPENSE",
      description: t.description,
      categoryId,
      source: "STATEMENT_IMPORT",
    },
  });
}

describe("partitionByExisting", () => {
  it("同日期同金额同描述的算重复，从待汇入里剔除", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    await seedTx(user.id, cat.id, { date: D("2026-08-01"), amount: 29.45, description: "McDonalds" });

    const result = await partitionByExisting(user.id, [
      { date: D("2026-08-01"), amount: 29.45, description: "McDonalds" },
      { date: D("2026-08-02"), amount: 15, description: "99 Speedmart" },
    ]);

    expect(result.fresh).toHaveLength(1);
    expect(result.fresh[0].description).toBe("99 Speedmart");
    expect(result.duplicates).toBe(1);
  });

  it("三者只要有一个不同就不是重复", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    await seedTx(user.id, cat.id, { date: D("2026-08-01"), amount: 29.45, description: "McDonalds" });

    const result = await partitionByExisting(user.id, [
      { date: D("2026-08-02"), amount: 29.45, description: "McDonalds" }, // 日期不同
      { date: D("2026-08-01"), amount: 29.46, description: "McDonalds" }, // 金额不同
      { date: D("2026-08-01"), amount: 29.45, description: "McDonald's" }, // 描述不同
    ]);

    expect(result.fresh).toHaveLength(3);
    expect(result.duplicates).toBe(0);
  });

  it("真的重复消费两次时，只挡掉已存在的那几笔而不是全挡", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    // 同一天在同一家店刷了两笔一模一样的金额，DB 里已经有一笔
    await seedTx(user.id, cat.id, { date: D("2026-08-01"), amount: 12, description: "咖啡" });

    const result = await partitionByExisting(user.id, [
      { date: D("2026-08-01"), amount: 12, description: "咖啡" },
      { date: D("2026-08-01"), amount: 12, description: "咖啡" },
    ]);

    // 按笔数配对：DB 有 1 笔就只挡 1 笔，第二笔仍要汇入 ——
    // 用 Set 判断的话两笔都会被吃掉，那笔钱就永远进不了系统
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("落在日期范围最边界的那笔也要认得出是重复", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    // 已存在的这笔正好是待汇入清单里最晚的一天 —— 捞既有记录的范围查询
    // 若用 lte 卡在这一天，边界这笔会被漏掉，于是重复汇入
    await seedTx(user.id, cat.id, { date: D("2026-08-12"), amount: 2500, description: "车险转帐" });

    const result = await partitionByExisting(user.id, [
      { date: D("2026-08-01"), amount: 29.45, description: "McDonalds" },
      { date: D("2026-08-12"), amount: 2500, description: "车险转帐" },
    ]);

    expect(result.duplicates).toBe(1);
    expect(result.fresh).toHaveLength(1);
    expect(result.fresh[0].description).toBe("McDonalds");
  });

  it("只有一笔待汇入、且它已存在时，范围退化成单一时点也要认得出", async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    await seedTx(user.id, cat.id, { date: D("2026-08-12"), amount: 2500, description: "车险转帐" });

    const result = await partitionByExisting(user.id, [
      { date: D("2026-08-12"), amount: 2500, description: "车险转帐" },
    ]);

    expect(result.duplicates).toBe(1);
    expect(result.fresh).toHaveLength(0);
  });

  it("别人的记录不算我的重复", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const otherCat = await makeCategory(other.id);
    await seedTx(other.id, otherCat.id, { date: D("2026-08-01"), amount: 29.45, description: "McDonalds" });

    const result = await partitionByExisting(me.id, [
      { date: D("2026-08-01"), amount: 29.45, description: "McDonalds" },
    ]);

    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toBe(0);
  });

  it("空清单不炸，也不去捞资料库", async () => {
    const user = await makeUser();

    const result = await partitionByExisting(user.id, []);

    expect(result.fresh).toHaveLength(0);
    expect(result.duplicates).toBe(0);
  });
});
