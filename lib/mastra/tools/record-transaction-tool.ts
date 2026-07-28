import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTransaction, ensureCategory } from "@/lib/transactions";

// AI 对话记账：用户说「今天午餐 15、Grab 12」就逐笔入账。
// v1 只开放支出/收入；投资涉及持仓联动，走表单（见 bookkeeping-design.md）。

export const recordTransactionTool = createTool({
  id: "record-transaction",
  description:
    "帮用户记一笔支出或收入。用户口头描述消费/进账时用这个，一次调用记一笔，多笔就多次调用。" +
    "分类按名称传入（如 餐饮/交通/日用/订阅/娱乐/医疗/人情/房租水电/工资/奖金 等），没有的分类会自动创建。" +
    "金额单位 MYR。日期不说就是今天。投资买入不要用这个工具，请用户去收支记录页的表单操作。",
  inputSchema: z.object({
    type: z.enum(["EXPENSE", "INCOME"]).describe("EXPENSE=支出，INCOME=收入"),
    amount: z.number().positive().describe("金额（MYR）"),
    category: z.string().describe("分类名称，如 餐饮、交通、工资"),
    description: z.string().default("").describe("备注：这笔是给什么的，如 '午餐 麦当劳'"),
    date: z
      .string()
      .optional()
      .describe("日期 YYYY-MM-DD，省略 = 今天（吉隆坡时区）"),
  }),
  outputSchema: z.object({
    id: z.string(),
    recorded: z.string().describe("已记录内容的一句话确认"),
  }),
  execute: async ({ type, amount, category, description, date }, { requestContext }) => {
    const userId = requestContext?.get("userId") as string | undefined;
    if (!userId) throw new Error("未登入");

    const dateKey =
      date ??
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
    const cat = await ensureCategory(userId, category.trim(), type);
    const created = await createTransaction(userId, {
      date: new Date(`${dateKey}T00:00:00.000Z`),
      amount,
      type,
      description,
      categoryId: cat.id,
    });
    return {
      id: created.id,
      recorded: `已记${type === "EXPENSE" ? "支出" : "收入"} RM${amount}（${cat.name}${description ? ` · ${description}` : ""}，${dateKey}）`,
    };
  },
});
