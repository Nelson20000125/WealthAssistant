import { AccountType } from "@/app/generated/prisma/enums";

export function validateAccountInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "请求格式不对";
  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string" || !b.name.trim()) return "请填写户口名称";
  if (typeof b.type !== "string" || !(b.type in AccountType)) return "户口类型不合法";
  if (typeof b.institution !== "string" || !b.institution.trim()) return "请填写所属机构";
  if (typeof b.currency !== "string" || !b.currency.trim()) return "请填写户口货币";

  return null;
}
