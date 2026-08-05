import { AssetType } from "@/app/generated/prisma/enums";

export function validateHoldingInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "请求格式不对";
  const b = body as Record<string, unknown>;

  if (typeof b.accountId !== "string" || !b.accountId) return "请选择户口";
  if (typeof b.assetType !== "string" || !(b.assetType in AssetType)) return "资产类型不合法";
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
