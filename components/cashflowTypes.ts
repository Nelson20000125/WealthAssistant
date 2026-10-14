// 收支列表与记账表单共用的资料形状。单独一档是因为两边互相 import 会绕成环。

export type TxItem = {
  id: string;
  date: string; // ISO
  amount: number;
  currency: string;
  amountMYR: number | null;
  type: "INCOME" | "EXPENSE" | "INVEST" | "TRANSFER";
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  holdingId: string | null;
  holdingLabel: string | null;
  units: number | null;
  unitPrice: number | null;
  cashHoldingId: string | null;
  counterCashHoldingId: string | null;
  counterAmount: number | null;
  reimbursable: number | null;
  settlesTransactionId: string | null;
};

/** 待收回的垫付，给「这笔还款在冲销哪一笔」的下拉用 */
export type OutstandingOption = {
  id: string;
  date: Date;
  description: string;
  currency: string;
  outstanding: number;
};

export type CategoryOption = { id: string; name: string; type: string; usageCount?: number };

export type HoldingOption = {
  id: string;
  name: string;
  symbol: string | null;
  assetType: string;
  currency: string;
  lastPrice: number | null;
  costBasis: number;
};
