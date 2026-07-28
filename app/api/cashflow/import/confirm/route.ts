import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type ConfirmRow = { date: string; amount: number; categoryId: string; description: string };

// 确认汇入：把预览列表（可能已被用户手动改过分类）写进 DB。
// 刻意不走 lib/transactions.ts 的 createTransaction —— 那支函式规定 INVEST 类型必须
// 挂一个持仓（方案 B 联动，更新加权平均成本），但对帐单汇入的公积金/AmBank 定投这类
// INVEST 记录在系统里根本没有对应持仓，只是单纯记一笔现金流，不需要也不能走那条联动。
export async function POST(request: Request) {
  const session = await auth();
  const userId = session!.user.id;

  try {
    const body = await request.json();
    const fileName = String(body.fileName ?? "对帐单").trim();
    const rows: ConfirmRow[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) throw new Error("没有可汇入的交易");

    const categoryIds = Array.from(new Set(rows.map((r) => String(r.categoryId))));
    const categories = await prisma.category.findMany({ where: { id: { in: categoryIds }, userId } });
    if (categories.length !== categoryIds.length) throw new Error("有分类不属于当前用户");
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.importBatch.create({ data: { userId, fileName } });
      for (const r of rows) {
        const category = categoryById.get(String(r.categoryId));
        if (!category) throw new Error("分类不存在");
        const date = new Date(String(r.date));
        if (Number.isNaN(date.getTime())) throw new Error("日期无效");
        const amount = Number(r.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("金额必须大于 0");

        await tx.transaction.create({
          data: {
            userId,
            date,
            amount,
            currency: "MYR",
            type: category.type,
            description: String(r.description ?? "").trim(),
            categoryId: category.id,
            source: "STATEMENT_IMPORT",
            importBatchId: created.id,
          },
        });
      }
      return created;
    });

    return NextResponse.json({ importBatchId: batch.id, count: rows.length }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
