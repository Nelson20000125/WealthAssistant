import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateCategory } from "@/lib/transactions";

async function ownedCategory(id: string, userId: string) {
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat || cat.userId !== userId) throw new Error("分类不存在");
  return cat;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  try {
    const { id } = await params;
    const body = await request.json();
    return NextResponse.json(
      await updateCategory(session!.user.id, id, {
        name: body.name === undefined ? undefined : String(body.name),
        countsInTotals:
          body.countsInTotals === undefined ? undefined : Boolean(body.countsInTotals),
      })
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  try {
    const { id } = await params;
    await ownedCategory(id, session!.user.id);

    // 挡住还在用的分类。直接删会让那些交易的 categoryId 变 null，
    // 报表少一块而画面上不会有任何提示 —— 宁可讲清楚让人先去改。
    const inUse = await prisma.transaction.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new Error(`还有 ${inUse} 笔交易在用这个分类，请先把它们改成别的分类再删`);
    }

    // 规则可以一起走，它只影响未来汇入
    const rules = await prisma.categoryRule.count({ where: { categoryId: id } });
    await prisma.categoryRule.deleteMany({ where: { categoryId: id } });
    await prisma.category.delete({ where: { id } });

    return NextResponse.json({ ok: true, deletedRules: rules });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
