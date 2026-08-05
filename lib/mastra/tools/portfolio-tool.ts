import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getPortfolioSummary } from "@/lib/portfolio";

export const portfolioTool = createTool({
  id: "get-portfolio-summary",
  description:
    "读取用户当前的资产持仓总览：净资产（MYR）、成本、按币种分列的投资表现、资产配置比例、每笔持仓明细（含币种、数量、现价、是否缺汇率）。" +
    "重要：投资报酬只按币种原生计算（performanceByCurrency），不要把不同币种的损益相加，也不要把它们换算成 MYR 后再算百分比——" +
    "用户的口径是汇率变动不计入投资报酬。净资产 netWorthMYR 则是按今日汇率换算的，回答「我有多少钱」时才用它。",
  inputSchema: z.object({}),
  outputSchema: z.object({
    netWorthMYR: z.number(),
    costMYR: z.number(),
    performanceByCurrency: z.array(
      z.object({
        currency: z.string(),
        costNative: z.number(),
        valueNative: z.number(),
        plNative: z.number(),
        plPct: z.number(),
      })
    ),
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
