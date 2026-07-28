# Ghostfolio 风格改版计划（方案 B：保留骨架，移植精华）

> 决策记录（2026-07-19）：用户选定方案 B + 主色换 teal。
> 参考对象：https://github.com/ghostfolio/ghostfolio（已读源码 apps/client/src）

## 设计基准（来自 Ghostfolio 源码）

- 主色 teal：`rgb(54, 207, 204)` / #36CFCC，色阶 50–900 见 `apps/client/src/styles.scss` 的 `--palette-primary-*`
- 深色模式：背景 `rgb(25,25,25)`，卡片 `#424242`，selector 用 `.theme-dark`
- 数字：`font-variant-numeric: tabular-nums`，正负着色（正绿负红）统一由一个 Value 组件处理
- 首页主视觉：巨型居中收益数字（display-4）+ 净收益额/百分比 + 时间区间 chips（1D/1M/YTD/1Y/Max）+ 折线图
- Holdings：Table ↔ Treemap 切换
- Summary：密集 key-value 行，细分隔线分组
- 隐私模式：眼睛图标一键打码所有金额

## 保留不动

- Sidebar 导航与现有四页结构（总览 / 持仓明细 / 市场简报 / AI 顾问）
- AI 顾问（Portfolio Intelligence）作为差异化特色
- 现有 tokens 架构（globals.css CSS 变量 → shadcn 映射），只改值不改结构

## Phase 1 — 设计地基（纯前端，无数据依赖）

1. tokens 换色：`--portfolio-accent` → teal #36CFCC（含 hover/ring 等派生色）；`--ai-accent` 是否保留靛紫待定
2. 深色模式：`.theme-dark`（或 `data-theme`）覆写整套 tokens，参照 Ghostfolio 深色值；侧边栏加切换按钮，localStorage 持久化
3. 新建 `<Value>` 组件：统一金额/百分比渲染，tabular-nums + colorized sign + 隐私打码支持，替换 CountUpValue/各处散落的格式化

## Phase 2 — 数据地基

1. Prisma 新增 `PortfolioSnapshot`（date, netWorthMYR, investedMYR, cashMYR, byAssetType JSON）
2. 快照写入：refresh-prices API 成功后 upsert 当日快照；提供回填脚本
3. `lib/portfolio.ts` 增加按区间取历史序列的查询（1M/3M/YTD/1Y/Max）

## Phase 3 — 首页 Hero 重构

1. 净资产大数字居中化（Ghostfolio 式 hero），下方总收益额 + 百分比（colorized）
2. 时间区间 chips + 净值折线图（数据来自 PortfolioSnapshot）
3. 现有卡片（配置圆环、户口分布、排行、AI 入口）下移收纳，降低首屏密度

## Phase 4 — 交互精华

1. 持仓页 Table ↔ Treemap 切换（按市值大小、涨跌着色）✅
2. ~~全局隐私模式~~（2026-07-19 用户决定不做；`<Value>` 的 masked prop 保留，以后想加随时能接）
3. 总览页加 Summary key-value 区块（投入 / 收益 / 现金 / Time in Market）✅

## 验收标准

- 深浅两套主题下所有页面无硬编码颜色残留（grep 检查 hex 值）
- 所有金额/百分比经由 `<Value>` 渲染
- 折线图在快照 < 2 条时有空状态（提示"数据积累中"）
- Treemap 在持仓 ≤ 3 个时降级为网格
