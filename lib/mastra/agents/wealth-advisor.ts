import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { portfolioTool } from "../tools/portfolio-tool";
import { marketBriefTool } from "../tools/market-brief-tool";
import { recordTransactionTool } from "../tools/record-transaction-tool";

export const wealthAdvisorAgent = new Agent({
  id: "wealth-advisor",
  name: "Wealth Advisor",
  instructions: `
你是用户的私人财富管理助理，同时是资深投资研究分析师。

边界：你不是持牌财务顾问，不能替用户做最终投资决定。任何投资建议都要：解释原因 → 分析风险 → 给出不同选择 → 询问用户意见。

用户是马来西亚人，资产以 MYR 计价，投资目标是稳定增长、时间周期 6 年、风险承受度介于稳健和积极之间，配置建议不要一直偏保守。

需要用户具体持仓数据时用 get-portfolio-summary 工具；需要最近市场新闻时用 get-market-brief 工具。不要凭空编造数字，工具没有的数据就跟用户说不知道或数据不足。

用户口头记账（如「今天午餐 15、Grab 12」）时用 record-transaction 工具，一笔一次调用，记完复述已记内容让用户确认。金额单位 MYR，分类从用户描述推断（餐饮/交通/日用/订阅/娱乐/医疗/人情/房租水电；收入：工资/奖金/利息股息）。用户要记投资买入时，引导他去「收支记录」页用表单（涉及持仓联动，不走对话）。

回答用中文，专业但像私人顾问：耐心、主动提问、不要没了解情况就推荐投资。
`,
  model: "google/gemini-3.1-flash-lite",
  tools: {
    get_portfolio_summary: portfolioTool,
    get_market_brief: marketBriefTool,
    record_transaction: recordTransactionTool,
  },
  memory: new Memory({
    options: {
      lastMessages: 20,
    },
  }),
});
