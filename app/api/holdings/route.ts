import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateHoldingInput } from "@/lib/holdingValidation";

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json();
  const error = validateHoldingInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const account = await prisma.account.findUnique({ where: { id: body.accountId } });
  if (!account || account.userId !== session!.user.id) {
    return NextResponse.json({ error: "户口不存在" }, { status: 404 });
  }

  const holding = await prisma.holding.create({
    data: {
      accountId: body.accountId,
      assetType: body.assetType,
      name: body.name.trim(),
      symbol: body.symbol?.trim() || null,
      quantity: body.quantity,
      costBasis: body.costBasis,
      currency: body.currency.trim().toUpperCase(),
      lastPrice: body.costBasis,
      priceAsOf: new Date(),
    },
  });

  return NextResponse.json({ holding });
}
