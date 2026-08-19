import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createTransaction, getMonthCashflow, type TransactionInput } from "@/lib/transactions";

function parseInput(body: Record<string, unknown>): TransactionInput {
  const amount = Number(body.amount);
  const date = new Date(String(body.date));
  const type = String(body.type) as TransactionInput["type"];
  if (!["INCOME", "EXPENSE", "INVEST", "TRANSFER"].includes(type)) throw new Error("无效的记录类型");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("金额必须是大于 0 的数字");
  if (Number.isNaN(date.getTime())) throw new Error("日期无效");
  return {
    date,
    amount,
    type,
    description: String(body.description ?? "").trim(),
    categoryId: body.categoryId ? String(body.categoryId) : null,
    holdingId: body.holdingId ? String(body.holdingId) : null,
    unitPrice: body.unitPrice ? Number(body.unitPrice) : null,
    cashHoldingId: body.cashHoldingId ? String(body.cashHoldingId) : null,
    counterCashHoldingId: body.counterCashHoldingId ? String(body.counterCashHoldingId) : null,
    counterAmount: body.counterAmount ? Number(body.counterAmount) : null,
    reimbursable: body.reimbursable ? Number(body.reimbursable) : null,
    settlesTransactionId: body.settlesTransactionId ? String(body.settlesTransactionId) : null,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = Number(searchParams.get("year") ?? now.getFullYear());
  const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
  try {
    return NextResponse.json(await getMonthCashflow(session!.user.id, year, month));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  try {
    const body = await request.json();
    const created = await createTransaction(session!.user.id, parseInput(body));
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
