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

  const holding = await prisma.holding.update({
    where: { id },
    data: {
      accountId: body.accountId,
      assetType: body.assetType,
      name: body.name.trim(),
      symbol: body.symbol?.trim() || null,
      quantity: body.quantity,
      costBasis: body.costBasis,
      currency: body.currency.trim().toUpperCase(),
    },
  });

  return NextResponse.json({ holding });
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
