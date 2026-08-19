import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateHoldingInput, resolveValuation } from "@/lib/holdingValidation";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const body = await req.json();
  const error = validateHoldingInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const existing = await prisma.holding.findUnique({ where: { id }, include: { account: true } });
  if (!existing || existing.account.userId !== session!.user.id) {
    return NextResponse.json({ error: "持仓不存在" }, { status: 404 });
  }

  const targetAccount = await prisma.account.findUnique({ where: { id: body.accountId } });
  if (!targetAccount || targetAccount.userId !== session!.user.id) {
    return NextResponse.json({ error: "户口不存在" }, { status: 404 });
  }

  // quantity / costBasis 一律不接受手改（决策 2026-08-06，成本单一事实来源）：
  //   现金   -> 余额 = openingBalance + 流水（getDerivedCashBalances）
  //   非现金 -> 份额与成本 = INVEST 交易的加权平均（transactions.ts:applyInvest）
  // 两者都是算出来的结果。照收会写进去但下一笔交易就被重算覆盖，
  // 使用者只会得到「改了过一阵子又变回去」这种最难查的行为。
  // 要改成本，去改对应的投资记录。
  const isDerivedCash = existing.assetType === "CASH" && existing.openingBalance !== null;

  const holding = await prisma.holding.update({
    where: { id },
    data: {
      accountId: body.accountId,
      assetType: body.assetType,
      valuation: resolveValuation(body.assetType, body.valuation)!,
      name: body.name.trim(),
      symbol: body.symbol?.trim() || null,
      quantity: existing.quantity,
      costBasis: existing.costBasis,
      currency: body.currency.trim().toUpperCase(),
      ...(body.openingBalance !== undefined && body.openingBalance !== null
        ? { openingBalance: Number(body.openingBalance) }
        : {}),
      ...(body.openingBalanceDate
        ? { openingBalanceDate: new Date(body.openingBalanceDate) }
        : {}),
    },
  });

  return NextResponse.json({ holding, derivedCashIgnoredEdits: isDerivedCash });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const existing = await prisma.holding.findUnique({ where: { id }, include: { account: true } });
  if (!existing || existing.account.userId !== session!.user.id) {
    return NextResponse.json({ error: "持仓不存在" }, { status: 404 });
  }

  await prisma.holding.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
