import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureCategory, listCategories, type TxType } from "@/lib/transactions";

export async function GET() {
  const session = await auth();
  try {
    return NextResponse.json(await listCategories(session!.user.id));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = String(body.type) as TxType;
    if (!name) throw new Error("分类名不能为空");
    // TRANSFER 之前被漏掉，导致「投资赎回」这类内部转帐分类只能靠脚本建
    if (!["INCOME", "EXPENSE", "INVEST", "TRANSFER"].includes(type)) throw new Error("无效的分类类型");
    return NextResponse.json(await ensureCategory(session!.user.id, name, type), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
