import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getPortfolioSummary } from "@/lib/portfolio";

export const portfolioTool = createTool({
  id: "get-portfolio-summary",
  description:
    "读取用户当前的资产持仓总览：净资产、成本、未实现损益、资产配置比例、每笔持仓明细（含币种、数量、现价、是否缺汇率）。金额单位是 MYR。",
  inputSchema: z.object({}),
  outputSchema: z.object({
    netWorthMYR: z.number(),
    costMYR: z.number(),
    unrealizedPLMYR: z.number(),
    unrealizedPLPct: z.number(),
    allocation: z.array(
      z.object({
        assetType: z.string(),
        valueMYR: z.number(),
        pct: z.number(),
      })
    ),
    allocationByAccount: z.array(
      z.object({
        accountName: z.string(),
        valueMYR: z.number(),
        pct: z.number(),
      })
    ),
    holdings: z.array(
      z.object({
        id: z.string(),
        accountName: z.string(),
        assetType: z.string(),
        symbol: z.string().nullable(),
        name: z.string(),
        quantity: z.number(),
        currency: z.string(),
        unitPrice: z.number(),
        priceAsOf: z.date().nullable(),
        valueMYR: z.number().nullable(),
        costValueMYR: z.number().nullable(),
        fxMissing: z.boolean(),
      })
    ),
  }),
  execute: async (_input, { requestContext }) => {
    const userId = requestContext?.get("userId") as string | undefined;
    if (!userId) throw new Error("未登入");
    return getPortfolioSummary(userId);
  },
});
