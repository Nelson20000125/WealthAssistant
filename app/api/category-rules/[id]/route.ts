import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** 确认这条规则透过 category 属于当前使用者，不然任何人都能改别人的规则 */
async function ownedRule(id: string, userId: string) {
  const rule = await prisma.categoryRule.findUnique({ where: { id }, include: { category: true } });
  if (!rule || rule.category.userId !== userId) throw new Error("规则不存在");
  return rule;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  try {
    const { id } = await params;
    await ownedRule(id, session!.user.id);
    const body = await request.json();

    const data: { keyword?: string; categoryId?: string } = {};
    if (body.keyword !== undefined) {
      const keyword = String(body.keyword).trim();
      if (!keyword) throw new Error("关键字不能为空");
      data.keyword = keyword;
    }
    if (body.categoryId !== undefined) {
      const cat = await prisma.category.findUnique({ where: { id: String(body.categoryId) } });
      if (!cat || cat.userId !== session!.user.id) throw new Error("分类不存在");
      data.categoryId = cat.id;
    }

    const updated = await prisma.categoryRule.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true, type: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  try {
    const { id } = await params;
    await ownedRule(id, session!.user.id);
    // 规则只影响「未来汇入怎么分类」，删掉不会动到已经分好类的交易
    await prisma.categoryRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
