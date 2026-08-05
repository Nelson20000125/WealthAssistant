import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateHoldingInput } from "@/lib/holdingValidation";

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

  // 推导型现金：余额 = 期初 + 流水，quantity/costBasis 是算出来的结果而不是输入。
  // 照收会写进去但被 getPortfolioSummary 忽略 —— 使用者改了没反应也没错误讯息。
  // 这里改成只让改「期初余额/期初日」，今天的余额一律不接受手改。
  const isDerivedCash = existing.assetType === "CASH" && existing.openingBalance !== null;

  const holding = await prisma.holding.update({
    where: { id },
    data: {
      accountId: body.accountId,
      assetType: body.assetType,
      name: body.name.trim(),
      symbol: body.symbol?.trim() || null,
      quantity: isDerivedCash ? existing.quantity : body.quantity,
      costBasis: isDerivedCash ? existing.costBasis : body.costBasis,
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
