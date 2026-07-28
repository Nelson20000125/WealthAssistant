import { prisma } from "@/lib/prisma";
import * as yahoo from "@/lib/marketData/providers/yahoo";
import * as frankfurter from "@/lib/marketData/providers/frankfurter";
import * as alphaVantage from "@/lib/marketData/providers/alpha-vantage";

// 股价：Yahoo 无日额度但仍会限流，别打太凶；汇率：ECB 一天才更新一次，快取久一点没关系
const STOCK_CACHE_TTL_MS = 60 * 60 * 1000;
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// Alpha Vantage 只在有 API key 时才当最后备援挂上
const hasAlphaVantageKey = Boolean(process.env.ALPHA_VANTAGE_API_KEY);

function isFresh(fetchedAt: Date, ttlMs: number) {
  return Date.now() - fetchedAt.getTime() < ttlMs;
}

export async function getStockPrice(symbol: string) {
  const cached = await prisma.priceCache.findUnique({ where: { symbol } });
  if (cached && isFresh(cached.fetchedAt, STOCK_CACHE_TTL_MS)) {
    return { price: cached.price, currency: cached.currency, cached: true };
  }

  const providers: { name: string; quote: typeof yahoo.quote }[] = [
    { name: "YAHOO", quote: yahoo.quote },
    ...(hasAlphaVantageKey ? [{ name: "ALPHA_VANTAGE", quote: alphaVantage.quote }] : []),
  ];

  for (const provider of providers) {
    try {
      const { price, currency } = await provider.quote(symbol);

      await prisma.priceCache.upsert({
        where: { symbol },
        create: { symbol, price, currency, source: provider.name },
        update: { price, currency, source: provider.name, fetchedAt: new Date() },
      });

      return { price, currency, cached: false };
    } catch {
      // 换下一个 provider 试试看
    }
  }

  // 所有 provider 都挂了，有旧快取就先用旧的，不要整个失败
  if (cached) return { price: cached.price, currency: cached.currency, cached: true };
  throw new Error(`所有行情来源都没能取得 ${symbol} 的报价`);
}

export async function getFxRate(base: string, quote: string) {
  const cached = await prisma.fxRate.findUnique({ where: { base_quote: { base, quote } } });
  if (cached && isFresh(cached.fetchedAt, FX_CACHE_TTL_MS)) {
    return { rate: cached.rate, cached: true };
  }

  const providers: { name: string; fxRate: typeof frankfurter.fxRate }[] = [
    { name: "FRANKFURTER", fxRate: frankfurter.fxRate },
    ...(hasAlphaVantageKey ? [{ name: "ALPHA_VANTAGE", fxRate: alphaVantage.fxRate }] : []),
  ];

  for (const provider of providers) {
    try {
      const { rate } = await provider.fxRate(base, quote);

      await prisma.fxRate.upsert({
        where: { base_quote: { base, quote } },
        create: { base, quote, rate },
        update: { rate, fetchedAt: new Date() },
      });

      return { rate, cached: false };
    } catch {
      // 换下一个 provider 试试看
    }
  }

  if (cached) return { rate: cached.rate, cached: true };
  throw new Error(`所有行情来源都没能取得 ${base}/${quote} 汇率`);
}
