# 给 Claude Code 的 Prompt：行情来源迁移

> 用法：在 WealthAssistant 专案根目录开一个**全新** Claude Code session，把下面 `---` 之间的整段贴进去。

---

## Objective

把行情与汇率来源从 Alpha Vantage 迁移到 **yahoo-finance2**（股价/ETF）+ **Frankfurter**（汇率），并在 `lib/marketData.ts` 底下加一层 provider 抽象层。

**为什么**：Alpha Vantage 免费额度只有 25 次/天、每秒 1 次，持仓一多就撞墙，现在连一个 USD/MYR 汇率都要烧额度。Yahoo 无日额度、Frankfurter 走 ECB 央行汇率且不需要 API key。加抽象层是因为 Yahoo 是非官方接口、随时可能挂，日后换来源不该动到调用端。

## Context

**技术栈**：Next.js 16.2.10（App Router）、TypeScript、Prisma 7.8 + SQLite（`@prisma/adapter-better-sqlite3`）、Mastra agent。

**现在的行情层**（全部现况，没有其他隐藏路径）：

- `lib/marketData.ts`（64 行）导出两个函式：
  - `getStockPrice(symbol: string)` → `{ price, currency, cached }`
  - `getFxRate(base: string, quote: string)` → `{ rate, cached }`
  - 两者都是：先查 Prisma 快取（`PriceCache` / `FxRate`），`CACHE_TTL_MS = 12h` 内直接回；否则打 Alpha Vantage；**API 失败时若有旧快取就回旧值、不整个 throw**（这个降级行为必须保留）
- **唯一调用端**是 `app/api/refresh-prices/route.ts`：先 `auth()` 拿 `session.user.id`，迴圈抓当前登入用户底下 `symbol != null` 的持仓（`{ symbol: { not: null }, account: { userId } }`）→ 写回 `Holding.lastPrice` / `priceAsOf` → sleep 1200ms → 抓 USD/MYR → `upsertTodaySnapshot(userId)`。**这个 route 需要登入态**，手动测试 `POST /api/refresh-prices` 前要先在浏览器登入拿 session cookie，纯 curl 打不通（`session!.user.id` 未登入时会直接炸）。
- `lib/portfolio.ts` 不直接调行情，它读 `Holding.lastPrice`（fallback 到 `costBasis`）和 `FxRate` 表来换算 MYR

**资料库**：`PriceCache.source` 和 `FxRate` 都已存在且栏位够用，`source` 是自由字串（现值 `ALPHA_VANTAGE`）。**这次不需要任何 schema migration。**

**用户实际持仓**（决定优先级）：美股 ETF `VOO`、马来西亚现金 MYR、Public Mutual 单位信托、未来会加马股（moomoo）与加密货币。基准货币是 **MYR**。

**已知不可解**：Public Mutual 单位信托（马来西亚 unit trust）Yahoo / FMP / Alpha Vantage 都没有报价，这次**维持手动输入**，不要为它写抓取逻辑。

**已知 bug（这次一并修）**：DB 里有一笔持仓是 `assetType: STOCK` / `name: "USD Cash"` / `symbol: "VOO"` / `lastPrice: 14.9`。这是现金被误标成股票又挂了 VOO 代号。`refresh-prices` 只用 `symbol != null` 过滤，下次刷新会把它的单价覆写成 VOO 的约 693 美元，净值直接虚增。

## Target State

1. 新增 `lib/marketData/providers/` 目录，每个来源一个 adapter，各自导出统一介面（例如 `quote(symbol)` / `fxRate(base, quote)`），互不知道彼此存在
2. `lib/marketData.ts` 变成 orchestrator：**对外函式签名 `getStockPrice` / `getFxRate` 与回传形状完全不变**，底下改成「查快取 → 依序试 provider → 全挂就回旧快取」
3. 预设链：股价 `yahoo` → `alphaVantage`（仅当 `ALPHA_VANTAGE_API_KEY` 存在才挂上，当最后备援）；汇率 `frankfurter` → `alphaVantage`（同上）
4. `PriceCache.source` / provider 标记写入 `YAHOO` / `FRANKFURTER` / `ALPHA_VANTAGE`
5. TTL 分开设定：股价 1 小时（Yahoo 无日额度但仍会限流，别打太凶），汇率 12 小时（ECB 一天才更新一次）
6. `refresh-prices` 不再需要 1200ms sleep（那是为 Alpha Vantage 每秒 1 次限制加的），并且**跳过 `assetType: CASH` 的持仓**
7. 行情来源切换后，`npm run build` 与 `npx tsc --noEmit` 皆通过

## Scope

**可以改**：

- `lib/marketData.ts`
- 新建 `lib/marketData/providers/*.ts`
- `app/api/refresh-prices/route.ts`
- `prisma/schema.prisma` **只能改注解**（`PriceCache` 上那行「避免打爆 Alpha Vantage 免费额度」已过时）
- 新建 `scripts/` 底下的一次性检查脚本
- `package.json`（只为加 `yahoo-finance2`）

**绝对不要碰**：

- `.env` / `.env.local`（我自己处理；`ALPHA_VANTAGE_API_KEY` 先留着不删）
- `package-lock.json` 手动编辑（跑 npm 让它自己更新可以）
- `prisma/migrations/`、`dev.db`、`mastra.db`
- `auth.ts` / `auth.config.ts` / `middleware.ts`
- `components/`、`app/` 底下除 `api/refresh-prices` 以外的任何档案
- `lib/` 底下除 `marketData*` 以外的任何档案（特别是 `portfolio.ts`、`snapshot.ts` 不要动）

## Constraints

- **动手写码前，先读 `AGENTS.md`，再读 `node_modules/next/dist/docs/` 里相关章节。** 这个 Next.js 版本跟你训练资料里的有 breaking changes，不要凭印象写 route handler。
- **先读完 `lib/marketData.ts`、`app/api/refresh-prices/route.ts`、`lib/portfolio.ts`、`prisma/schema.prisma` 全文再开始改。**
- 唯一预先批准的新依赖是 `yahoo-finance2`。Frankfurter 直接用原生 `fetch`，**不要**为它装 SDK。要装任何其他套件先停下来问。
- `yahoo-finance2` 的实际 API 以套件自带的 type definitions / README 为准，**不要凭记忆写方法名**。特别是批次查询（一次传多个 symbol）如果该版本支援就用，能把 N 次请求降成 1 次；不确定就先查再写。
- 同样地，Frankfurter 的端点与回传格式请先用一次真实请求确认，再写解析逻辑。
- 马股 symbol 在 Yahoo 是 `.KL` 后缀（如 `1155.KL`）。这次**不用**实作转换，但 adapter 要留一个明显的注解说明日后加马股要在哪里处理。
- 保留现有的降级行为：provider 全失败但快取有旧值 → 回旧值 + `cached: true`，不要 throw。
- 只做上面列的事。不要顺手重构、不要加测试框架、不要加 logging 套件、不要「顺便优化」其他档案。

## Acceptance Criteria

- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 成功
- [ ] `getStockPrice` / `getFxRate` 的函式签名与回传形状跟改动前逐字一致（`app/api/refresh-prices/route.ts` 的解构不需要改写就能跑）
- [ ] `lib/marketData.ts` 内**没有任何** `alphavantage.co` 字串（该 URL 只能出现在 `providers/alpha-vantage.ts`）
- [ ] 手动打一次 `POST /api/refresh-prices`：`VOO` 回传合理价格（约 600–800 USD 区间）且 `source` 记录为 `YAHOO`
- [ ] 同一次请求 USD/MYR 汇率回传合理值（约 3.5–5.0 区间）且来自 Frankfurter
- [ ] 连续打两次 `/api/refresh-prices`，第二次的股价回传 `cached: true`
- [ ] `assetType: CASH` 的持仓在刷新后 `lastPrice` **没有被改动**

## Bug 修复（分两步，不要合併）

**第一步（改码）**：`refresh-prices` 的查询条件加上排除 `assetType: CASH`，让现金类持仓永远不进行情刷新。

**第二步（查资料，不要自动改）**：写一个 `scripts/audit-holdings.ts`，列出所有「`assetType` 不是 `CASH` 但 `name` 含 cash/现金」或「`symbol` 与 `name` 明显不符」的持仓，**把结果印出来给我看就好**。不要自动 UPDATE 资料库。我确认后再决定怎么改。

⚠️ 注意：第一步只挡得住 `assetType: CASH` 的持仓。那笔「USD Cash」目前被标成 `STOCK`，**在我手动修正它的 `assetType` / `symbol` 之前，它仍然会被行情刷新覆写**。所以完成第一步后、跑验收的 `POST /api/refresh-prices` 之前，先跑 `scripts/audit-holdings.ts` 把清单给我，等我回覆再继续。

## Stop Conditions

遇到下列情况**立刻停下来问我**，不要自行决定：

- 需要安装 `yahoo-finance2` 以外的任何依赖
- 需要改 `prisma/schema.prisma` 的栏位（不只是注解）或跑任何 migration
- 需要写入或删除 `dev.db` 里的任何一列资料
- 需要修改 Scope 的「绝对不要碰」清单里的档案
- Yahoo 或 Frankfurter 实测打不通、回传格式跟预期不符
- 发现改动会影响 `getPortfolioSummary` 的回传结果

## Progress

每完成一步输出一行：`✅ [做了什么] — [影响的档案]`

## Session Strategy

New session — 这是独立任务，不需要延续先前脉络。开始前先读 `AGENTS.md`、`CLAUDE.md`。

---

🎯 **Target**: Claude Code (Opus 4.x)
💡 前 30% 就锁死了 scope 与「函式签名不变」这个最关键的约束；把「先读文件再写码」「不要凭记忆写第三方 API」写成硬性要求，因为 Next.js 16 和 yahoo-finance2 4.x 都在训练资料之后；验收条件全部改成可二元判定（数值区间、字串不存在、`tsc` 零错误），不留「看起来没问题」的模糊空间。

⚠️ 这个 prompt 会让 agent 真的动你的档案系统和 `package.json`。贴之前请再确认一次 Scope 里的路径清单，特别是「绝对不要碰」那几行。
