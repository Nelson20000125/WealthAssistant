import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, getMonthCashflow, updateCategory, listCategories } from "@/lib/transactions";

// 「不计入汇总」这个开关（2026-08-13）：
//
//   schema 与汇总逻辑早就支援 countsInTotals=false，但没有任何路径能把它设成 false ——
//   分类建立时一律 true，API 也不收这个栏位。结果是「还钱」「投资进账」这类
//   「钱进来了但不是收入」的分类只能一直算进收入，月报表虚高。
//
// 这一组测的是把开关接通之后的行为：能改、改了汇总真的跟着变、且既有的
// 改名与归属校验没被改坏。

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

describe("分类的「不计入汇总」开关", () => {
  it("可以把既有分类从计入改成不计入", async () => {
    const user = await makeUser();
    const cat = await prisma.category.create({
      data: { userId: user.id, name: "还钱", type: "INCOME" },
    });
    expect(cat.countsInTotals).toBe(true);

    const updated = await updateCategory(user.id, cat.id, { countsInTotals: false });
    expect(updated.countsInTotals).toBe(false);
  });

  it("改成不计入之后，该分类底下已存在的收入立刻退出收入汇总", async () => {
    const user = await makeUser();
    const salary = await prisma.category.create({
      data: { userId: user.id, name: "工资", type: "INCOME" },
    });
    const payback = await prisma.category.create({
      data: { userId: user.id, name: "还钱", type: "INCOME" },
    });

    await createTransaction(user.id, {
      date: D("2026-08-04"),
      amount: 5000,
      type: "INCOME",
      description: "薪水",
      categoryId: salary.id,
    });
    await createTransaction(user.id, {
      date: D("2026-08-08"),
      amount: 23,
      type: "INCOME",
      description: "朋友还钱",
      categoryId: payback.id,
    });

    const before = await getMonthCashflow(user.id, 2026, 8);
    expect(before.totals.income).toBeCloseTo(5023, 9);

    await updateCategory(user.id, payback.id, { countsInTotals: false });

    const after = await getMonthCashflow(user.id, 2026, 8);
    expect(after.totals.income).toBeCloseTo(5000, 9);
  });

  it("改名与开关可以一起改，也可以各改各的", async () => {
    const user = await makeUser();
    const cat = await prisma.category.create({
      data: { userId: user.id, name: "还钱", type: "INCOME" },
    });

    const renamed = await updateCategory(user.id, cat.id, { name: "朋友还钱" });
    expect(renamed.name).toBe("朋友还钱");
    expect(renamed.countsInTotals).toBe(true); // 没给的栏位不该被动到

    const both = await updateCategory(user.id, cat.id, { name: "代垫回收", countsInTotals: false });
    expect(both.name).toBe("代垫回收");
    expect(both.countsInTotals).toBe(false);
  });

  it("同 type 下改成重名要挡下来", async () => {
    const user = await makeUser();
    await prisma.category.create({ data: { userId: user.id, name: "工资", type: "INCOME" } });
    const cat = await prisma.category.create({
      data: { userId: user.id, name: "还钱", type: "INCOME" },
    });

    await expect(updateCategory(user.id, cat.id, { name: "工资" })).rejects.toThrow(/已经有同名/);
  });

  it("不是自己的分类改不动", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const cat = await prisma.category.create({
      data: { userId: owner.id, name: "还钱", type: "INCOME" },
    });

    await expect(
      updateCategory(other.id, cat.id, { countsInTotals: false })
    ).rejects.toThrow(/分类不存在/);
  });
});

// 记一笔的分类是 20+ 个药丸平铺，按 name asc 排 —— 于是最高频的「餐饮」排在最末尾，
// 记一顿午餐要扫完整面墙才找得到。排序要按实际使用次数来，
// 但 listCategories 同时给设定页用（那里按名字排才对），所以次数是附加资讯，
// 排序留给呼叫端决定。
describe("listCategories 附带使用次数", () => {
  it("回传每个分类被几笔交易用过", async () => {
    const user = await makeUser();
    const food = await prisma.category.create({
      data: { userId: user.id, name: "餐饮", type: "EXPENSE" },
    });
    const travel = await prisma.category.create({
      data: { userId: user.id, name: "旅游", type: "EXPENSE" },
    });
    await prisma.category.create({
      data: { userId: user.id, name: "宠物", type: "EXPENSE" },
    });

    for (let i = 0; i < 3; i++) {
      await createTransaction(user.id, {
        date: D("2026-08-01"), amount: 15,
        type: "EXPENSE", description: `午餐${i}`, categoryId: food.id,
      });
    }
    await createTransaction(user.id, {
      date: D("2026-08-02"), amount: 288,
      type: "EXPENSE", description: "机票", categoryId: travel.id,
    });

    const cats = await listCategories(user.id);
    const by = (n: string) => cats.find((c) => c.name === n)!;

    expect(by("餐饮").usageCount).toBe(3);
    expect(by("旅游").usageCount).toBe(1);
    expect(by("宠物").usageCount).toBe(0);
  });

  it("排序仍是名字优先，不因次数改变（设定页依赖这个）", async () => {
    const user = await makeUser();
    const z = await prisma.category.create({
      data: { userId: user.id, name: "自行车", type: "EXPENSE" },
    });
    await prisma.category.create({
      data: { userId: user.id, name: "阿姨", type: "EXPENSE" },
    });
    await createTransaction(user.id, {
      date: D("2026-08-01"), amount: 10,
      type: "EXPENSE", description: "修车", categoryId: z.id,
    });

    const names = (await listCategories(user.id)).map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("别的使用者的交易不算进来", async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    const myCat = await prisma.category.create({
      data: { userId: mine.id, name: "餐饮", type: "EXPENSE" },
    });
    const theirCat = await prisma.category.create({
      data: { userId: theirs.id, name: "餐饮", type: "EXPENSE" },
    });
    await createTransaction(theirs.id, {
      date: D("2026-08-01"), amount: 20,
      type: "EXPENSE", description: "他的晚餐", categoryId: theirCat.id,
    });

    const cats = await listCategories(mine.id);
    expect(cats.find((c) => c.id === myCat.id)!.usageCount).toBe(0);
  });
});
