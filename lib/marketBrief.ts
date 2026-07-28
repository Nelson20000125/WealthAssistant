export type NewsItem = {
  id: string;
  title: string;
  url: string;
  company: string | null;
  ticker: string | null;
  one_liner: string | null;
  score: number | null;
  digest_date: string;
};

export async function getMarketBrief(limit = 6): Promise<NewsItem[]> {
  const base = process.env.AI_HUB_SUPABASE_URL;
  const key = process.env.AI_HUB_SUPABASE_ANON_KEY;
  if (!base || !key) return [];

  const query =
    "/rest/v1/sp500_news_items?select=id,title,url,company,ticker,one_liner,score,digest_date" +
    `&order=digest_date.desc,score.desc&limit=${limit}`;

  const res = await fetch(base + query, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    next: { revalidate: 1800 }, // AI Hub 那边是每天更新一次，30 分钟快取够用
  });

  if (!res.ok) return [];
  return res.json();
}
