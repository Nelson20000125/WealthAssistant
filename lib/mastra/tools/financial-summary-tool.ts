import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getFinancialSummary } from "@/lib/financialSummary";

// AI 顾问在给任何投资建议之前必须先读这个（P0-06）。
// 以前它只拿得到资产比例，于是对一个现金只够撑 1.5 个月的人说
// 「现金占比 60% 偏高，建议提高股票配置」。

export const financialSummaryTool = createTool({
  id: "get-financial-summary",
  description:
    "读取用户真实现金流：现金、投资市值、近三个月的月均收入与支出、储蓄率、应急金月数。" +
    "在讨论任何投资配置、加仓、买卖之前必须先调用这个工具。" +
    "emergencyFund.allowsMoreEquity 为 false 时，不准建议增加股票或任何风险资产配置，" +
    "该优先讨论怎么把现金安全垫补到 3 个月。" +
    "avgMonthlyExpenseMYR 为 null 代表近三个月没有记账资料，这时不要推算应急金，直接告诉用户资料不足。",
  inputSchema: z.object({}),
  outputSchema: z.object({
    cashMYR: z.number(),
    investmentMYR: z.number(),
    netWorthMYR: z.number(),
    avgMonthlyIncomeMYR: z.number().nullable(),
    avgMonthlyExpenseMYR: z.number().nullable(),
    savingsRate: z.number().nullable(),
    emergencyFundMonths: z.number().nullable(),
    emergencyFund: z.object({
      level: z.enum(["unknown", "critical", "ok", "excess"]),
      allowsMoreEquity: z.boolean(),
    }),
    monthsSampled: z.number(),
  }),
  execute: async (_input, { requestContext }) => {
    const userId = requestContext?.get("userId") as string | undefined;
    if (!userId) throw new Error("未登入");
    return getFinancialSummary(userId);
  },
});
