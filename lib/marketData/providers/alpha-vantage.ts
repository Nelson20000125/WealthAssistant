// 最后备援：只有设了 ALPHA_VANTAGE_API_KEY 才会挂上这个 provider。
const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";

export async function quote(symbol: string) {
  const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const priceStr = data["Global Quote"]?.["05. price"];

  if (!priceStr) {
    throw new Error(`Alpha Vantage 没有回传 ${symbol} 的报价：${JSON.stringify(data)}`);
  }

  return { price: parseFloat(priceStr), currency: "USD" };
}

export async function fxRate(base: string, quote: string) {
  const url = `${ALPHA_VANTAGE_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const rateStr = data["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"];

  if (!rateStr) {
    throw new Error(`Alpha Vantage 没有回传 ${base}/${quote} 汇率：${JSON.stringify(data)}`);
  }

  return { rate: parseFloat(rateStr) };
}
