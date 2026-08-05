import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// 关键字规则原本完全没有 API，只能靠脚本维护。这支补上列表与新增。
export async function GET() {
  const session = await auth();
  try {
    const rules = await prisma.categoryRule.findMany({
      where: { category: { userId: session!.user.id } },
      include: { category: { select: { id: true, name: true, type: true } } },
      orderBy: { keyword: "asc" },
    });
    return NextResponse.json(rules);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  try {
    const body = await request.json();
    const keyword = String(body.keyword ?? "").trim();
    const categoryId = String(body.categoryId ?? "");
    if (!keyword) throw new Error("关键字不能为空");

    // 归属检查：分类必须是自己的，否则可以把规则挂到别人的分类上
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat || cat.userId !== session!.user.id) throw new Error("分类不存在");

    const dup = await prisma.categoryRule.findFirst({
      where: { keyword, category: { userId: session!.user.id } },
    });
    if (dup) throw new Error(`关键字「${keyword}」已经存在`);

    const rule = await prisma.categoryRule.create({
      data: { keyword, categoryId },
      include: { category: { select: { id: true, name: true, type: true } } },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
