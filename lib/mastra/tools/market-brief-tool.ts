import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getMarketBrief } from "@/lib/marketBrief";

export const marketBriefTool = createTool({
  id: "get-market-brief",
  description:
    "读取最新的标普 500 重仓股新闻简报（来自 AI Knowledge Hub，每日更新），含标题、公司、代号、一句话摘要、日期。用户问到最近市场动态、某支股票有没有新闻时用这个。",
  inputSchema: z.object({
    limit: z.number().int().positive().max(20).default(6).describe("要读几条新闻，默认 6 条"),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      company: z.string().nullable(),
      ticker: z.string().nullable(),
      one_liner: z.string().nullable(),
      score: z.number().nullable(),
      digest_date: z.string(),
    })
  ),
  execute: async ({ limit }) => getMarketBrief(limit),
});
