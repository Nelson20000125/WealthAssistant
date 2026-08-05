import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function ownedAccount(id: string, userId: string) {
  const acct = await prisma.account.findUnique({ where: { id } });
  if (!acct || acct.userId !== userId) throw new Error("户口不存在");
  return acct;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  try {
    const { id } = await params;
    const acct = await ownedAccount(id, session!.user.id);
    const body = await request.json();

    const name = String(body.name ?? acct.name).trim();
    const institution = String(body.institution ?? acct.institution).trim();
    const currency = String(body.currency ?? acct.currency).trim().toUpperCase();
    const type = String(body.type ?? acct.type);
    if (!name) throw new Error("户口名不能为空");
    if (!["BROKERAGE", "FUND", "BANK", "CRYPTO"].includes(type)) throw new Error("无效的户口类型");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("币种要用三码，例如 MYR");

    const updated = await prisma.account.update({
      where: { id },
      data: { name, institution, currency, type: type as typeof acct.type },
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
    await ownedAccount(id, session!.user.id);

    // 户口 -> 持仓是级联删除。直接删会把底下的资产一起带走，
    // 而净资产是从持仓加总出来的 —— 那等于无声地把一笔钱从帐上抹掉。
    const holdings = await prisma.holding.count({ where: { accountId: id } });
    if (holdings > 0) {
      throw new Error(`这个户口底下还有 ${holdings} 笔持仓，删掉会连资产一起消失。请先删除或搬移持仓。`);
    }

    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
