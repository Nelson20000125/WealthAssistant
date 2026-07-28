import YahooFinance from "yahoo-finance2";

// suppressNotices 关掉 Yahoo 年度调查的 console 提示，不影响资料
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// 日后加马股：Yahoo 的马股 symbol 要加 .KL 后缀（如 1155.KL）。
// 这层 adapter 收到的 symbol 目前假设已经是 Yahoo 认得的格式，
// 转换逻辑应该加在这里（调用端 marketData.ts 不需要知道 .KL 这件事）。
export async function quote(symbol: string) {
  const result = await yahooFinance.quote(symbol);
  const price = result.regularMarketPrice;
  const currency = result.currency;

  if (typeof price !== "number" || !currency) {
    throw new Error(`Yahoo Finance 没有回传 ${symbol} 的报价`);
  }

  return { price, currency };
}
