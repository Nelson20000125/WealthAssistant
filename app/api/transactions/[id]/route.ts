import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteTransaction, updateTransaction, type TransactionInput } from "@/lib/transactions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const input: TransactionInput = {
      date: new Date(String(body.date)),
      amount: Number(body.amount),
      type: body.type,
      description: String(body.description ?? "").trim(),
      categoryId: body.categoryId ?? null,
      holdingId: body.holdingId ?? null,
      unitPrice: body.unitPrice ? Number(body.unitPrice) : null,
      cashHoldingId: body.cashHoldingId ?? null,
      counterCashHoldingId: body.counterCashHoldingId ?? null,
      counterAmount: body.counterAmount ? Number(body.counterAmount) : null,
      reimbursable: body.reimbursable ? Number(body.reimbursable) : null,
      settlesTransactionId: body.settlesTransactionId ?? null,
    };
    return NextResponse.json(await updateTransaction(session!.user.id, id, input));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  try {
    await deleteTransaction(session!.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
