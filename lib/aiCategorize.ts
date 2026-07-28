import { Agent } from "@mastra/core/agent";
import { z } from "zod";

// PDF 汇入时，关键字规则比对不到的交易（多半是没见过的餐厅/商店名）用 AI 猜一次分类。
// 只用来把「其他」精修成更具体的分类（如餐饮/宠物），不做 INVEST/TRANSFER 这种需要
// domain knowledge 才能判断的分类——那些交给关键字规则处理，AI 瞎猜风险较高。
// 猜不出来、或整个 AI 调用失败，都直接维持原本的「其他」，不阻塞汇入流程。
const categorizerAgent = new Agent({
  id: "cashflow-categorizer",
  name: "Cashflow Categorizer",
  instructions:
    "你要根据银行/电子钱包对帐单的原始交易描述文字，判断这笔消费属于提供的分类清单中的哪一个。" +
    "文字里的商户名称（餐厅、宠物店、超商等）是主要判断依据。只能回传清单里列出的原文分类名称，" +
    "完全看不出来、或觉得不属于清单任何一个分类，就回传 null，不要硬猜。",
  model: "google/gemini-3.1-flash-lite",
});

const ResultSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      categoryName: z.string().nullable(),
    })
  ),
});

export type CategorizeItem = { index: number; description: string };

/** 回传 index -> 分类名称 的 map；AI 调用失败或没猜出来的 index 不会出现在结果里 */
export async function aiSuggestCategories(
  items: CategorizeItem[],
  categoryNames: string[]
): Promise<Map<number, string>> {
  if (items.length === 0 || categoryNames.length === 0) return new Map();

  const prompt = `分类清单：${categoryNames.join("、")}

交易列表（格式：index: 描述）：
${items.map((i) => `${i.index}: ${i.description}`).join("\n")}

给每一笔交易挑一个最合适的分类，categoryName 必须是清单里的原文，挑不出来就填 null。`;

  try {
    const response = await categorizerAgent.generate(prompt, {
      structuredOutput: { schema: ResultSchema },
    });
    const map = new Map<number, string>();
    for (const r of response.object.results) {
      if (r.categoryName && categoryNames.includes(r.categoryName)) {
        map.set(r.index, r.categoryName);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}
