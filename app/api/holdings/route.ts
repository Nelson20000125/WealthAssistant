import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateHoldingInput, resolveValuation } from "@/lib/holdingValidation";

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json();
  const error = validateHoldingInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const account = await prisma.account.findUnique({ where: { id: body.accountId } });
  if (!account || account.userId !== session!.user.id) {
    return NextResponse.json({ error: "户口不存在" }, { status: 404 });
  }

  const currency = body.currency.trim().toUpperCase();
  const isCash = body.assetType === "CASH";
  const qty = Number(body.quantity);
  const unitCost = Number(body.costBasis);

  // 建仓日：非现金用来当那笔 INVEST 记录的日期。没给就用今天。
  // 有这个栏位是因为手动建仓不留交易的话，买入日期就永久丢失了 ——
  // VOO 那笔就是这样，最後得翻券商记录才补得回来。
  const openedAt = body.openedAt ? new Date(body.openedAt) : new Date();
  if (Number.isNaN(openedAt.getTime())) {
    return NextResponse.json({ error: "建仓日期不合法" }, { status: 400 });
  }

  const holding = await prisma.$transaction(async (tx) => {
    const created = await tx.holding.create({
      data: {
        accountId: body.accountId,
        assetType: body.assetType,
        // 旧呼叫端（收支记录里就地建持仓）不送 valuation，依 assetType 补预设
        valuation: resolveValuation(body.assetType, body.valuation)!,
        name: body.name.trim(),
        symbol: body.symbol?.trim() || null,
        // 份额与成本不直接写入：非现金由下面那笔 INVEST 记录带进来，
        // 现金则走期初余额推导。两条路都不经过手填。
        quantity: isCash ? qty : 0,
        costBasis: isCash ? unitCost : 0,
        currency,
        lastPrice: unitCost,
        priceAsOf: new Date(),
        // 现金一建立就是推导模式，不再产生「余额躺在 costBasis」的旧式资料
        ...(isCash
          ? { openingBalance: qty * unitCost, openingBalanceDate: openedAt }
          : {}),
      },
    });

    if (!isCash && qty > 0 && unitCost > 0) {
      const amount = qty * unitCost;
      await tx.transaction.create({
        data: {
          userId: session!.user.id,
          date: openedAt,
          amount,
          currency,
          type: "INVEST",
          description: `建仓：${created.name} ${qty} @ ${unitCost}`,
          source: "MANUAL",
          holdingId: created.id,
          units: qty,
          unitPrice: unitCost,
          // 不挂现金持仓：建仓填的是「我已经持有多少」，钱在现实中早就付掉了。
          // 挂上去会从现金余额再扣一次。
          cashHoldingId: null,
        },
      });
      return tx.holding.update({
        where: { id: created.id },
        data: { quantity: qty, costBasis: unitCost },
      });
    }

    return created;
  });

  return NextResponse.json({ holding });
}
