import { AssetType, Valuation } from "@/app/generated/prisma/enums";

/**
 * 资产类型 -> 预设估值方式。放这里让前後端共用同一份：
 * 表单用它在使用者选类型时自动带出，API 用它补没送 valuation 的旧呼叫端
 * （例如「收支记录」里就地新建目标持仓，那个表单只让选资产类型）。
 */
type ValuationValue = (typeof Valuation)[keyof typeof Valuation];

export const DEFAULT_VALUATION: Record<string, ValuationValue> = {
  STOCK: "AUTO",
  ETF: "AUTO",
  CRYPTO: "AUTO",
  FUND: "MANUAL_UNIT_PRICE",
  COMMODITY: "MANUAL_UNIT_PRICE",
  PROPERTY: "MANUAL_VALUE",
  DEPOSIT: "MANUAL_VALUE",
  OTHER: "MANUAL_VALUE",
  CASH: "DERIVED",
};

/** 没给 valuation 就依 assetType 取预设；两者都不合法时回 null 让呼叫端报错 */
export function resolveValuation(
  assetType: string,
  valuation?: unknown
): ValuationValue | null {
  if (typeof valuation === "string" && valuation in Valuation)
    return valuation as ValuationValue;
  if (valuation !== undefined && valuation !== null) return null;
  return DEFAULT_VALUATION[assetType] ?? null;
}

export function validateHoldingInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "请求格式不对";
  const b = body as Record<string, unknown>;

  if (typeof b.accountId !== "string" || !b.accountId) return "请选择户口";
  if (typeof b.assetType !== "string" || !(b.assetType in AssetType)) return "资产类型不合法";
  const valuation = resolveValuation(b.assetType, b.valuation);
  if (valuation === null) return "估值方式不合法";
  // 份额 0 是「从投资表单就地新建目标持仓」的情形：代号与成本都还没有，
  // 由第一笔 INVEST 记录带进来，所以下面两条只在真的有份额时才检查。
  const hasQty = typeof b.quantity === "number" && b.quantity > 0;
  // AUTO 靠 symbol 打行情 API，没代号就永远抓不到价、盈亏恒为 0 —— 挡在这里，
  // 而不是让它建完之后安静地显示 0%。
  if (valuation === "AUTO" && hasQty && (typeof b.symbol !== "string" || !b.symbol.trim()))
    return "自动抓价需要填代号，没有代号请改选手动估值";
  // MANUAL_VALUE 没有份额概念：总市值放在价格上，份额固定 1（沿用现金的约定）。
  if (valuation === "MANUAL_VALUE" && hasQty && b.quantity !== 1)
    return "手动市值型持仓的份额固定为 1";
  if (typeof b.name !== "string" || !b.name.trim()) return "请填写名称";
  // 允许 0：从投资表单就地新建的目标持仓还没有任何份额，份额由第一笔
  // INVEST 记录经 applyInvest 累加进来（newQty = quantity + units）。
  // 挡住 0 会让「建立并选用」永远存不了。
  if (typeof b.quantity !== "number" || !Number.isFinite(b.quantity) || b.quantity < 0)
    return "数量必须是不小于 0 的数字";
  if (typeof b.costBasis !== "number" || !Number.isFinite(b.costBasis) || b.costBasis < 0)
    return "每单位成本必须是不小于 0 的数字";
  if (typeof b.currency !== "string" || !b.currency.trim()) return "请填写计价货币";
  if (b.symbol !== undefined && b.symbol !== null && typeof b.symbol !== "string")
    return "代号格式不对";

  return null;
}
