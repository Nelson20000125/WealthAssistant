# 记账系统设计文档（v1）

> 决策记录（2026-07-19）：投资联动选 B（记一笔自动更新持仓）；提醒 = Cowork 定时任务 + 应用内横幅，每晚 23:00；入口 = 快速表单 + AI 对话记账；8 月 1 日清空持仓和快照、保留户口结构。
> 目标：7 月内开发完成，8 月 1 日起正式记账。

## 一、数据模型

复用现有的 `Transaction` / `Category` / `CategoryRule` / `ImportBatch`（已在 schema 里，从未用过），做以下升级：

### TransactionType 增加 INVEST

```
enum TransactionType { INCOME | EXPENSE | INVEST }
```

投资不是支出：钱从现金变成资产，净资产不变。三类在报表里分开呈现。

### Transaction 增加投资联动字段（全部可空，只有 INVEST 用）

| 字段 | 类型 | 说明 |
|---|---|---|
| `holdingId` | String? | 买入的目标持仓 |
| `units` | Float? | 买入份额（= amount / unitPrice） |
| `unitPrice` | Float? | 买入单价 |
| `cashHoldingId` | String? | 扣款的现金持仓（可不选 = 外部资金） |

### Category 增加 type

```
model Category { id, name, type: TransactionType, ... }
```

同名分类在收入/支出下可并存。种子分类（可改）：
- 支出：餐饮、交通、日用、订阅、娱乐、医疗、人情、房租水电、其他
- 收入：工资、奖金、利息股息、其他
- 投资：定投、加仓（投资分类轻量，主要靠 holding 关联）

## 二、INVEST 联动逻辑（方案 B 核心）

记一笔「投 750 到 XX 基金 @ 0.56」时，同一事务内：

1. 现金持仓 `costBasis -= 750`（现金模型是 quantity=1, costBasis=金额）
2. 目标持仓加权平均成本：`newQty = qty + units`，`newCostBasis = (qty*costBasis + 750) / newQty`
3. Transaction 存下 amount/units/unitPrice/holdingId/cashHoldingId，**删除或修改时按公式精确逆算回滚**（加权平均可逆：`oldCostBasis = (newQty*newCB - amount) / oldQty`）

约束：删除持仓时若有关联 INVEST 记录，提示先处理；现金不足只警告不阻止（允许负现金，真实世界有透支）。

## 三、页面与入口

### 新页面：收支记录（/cashflow，侧边栏第 3 项）

- 顶部：月份切换 + 本月四格（收入 / 支出 / 投资 / 结余 = 收入−支出）
- 中部：支出分类圆环（复用 DonutChart）
- 列表：按日分组的流水，行 = 分类图标 + 备注 + 金额（支出中性、收入绿、投资 teal），行内可编辑/删除
- 分类管理：快速记账里可直接新建分类（v1 轻量做法）
- **年度对比区**（2026-07-19 追加需求）：12 个月收入 vs 支出柱状图；年度明细表（每月收入/支出/投资/结余 + 当月最大消费分类），最高消费月高亮，一眼看出哪个月花最多、花在哪

### 快速记账（全局）

- 侧边栏「+ 记一笔」按钮，任何页面可达
- 弹窗 3 字段起步：金额 → 分类（pills）→ 备注（选填），日期默认今天
- 切到「投资」tab 时多出：目标持仓、单价、扣款现金户（选填）

### 总览页集成

- 「本月现金流」小卡（右栏）：收入/支出/投资/结余四行
- 「今天还没记账」横幅：当天无任何记录时显示，附快速记账按钮，记了自动消失

### AI 对话记账

- Mastra agent 新增 `recordTransaction` 工具：解析「今天午餐 15、Grab 12」→ 逐笔入账（金额、分类按名称模糊匹配、备注、日期默认今天），回复确认已记内容
- v1 限支出/收入；INVEST 涉及持仓联动，先走表单，稳定后再开放给 AI

## 四、每日提醒（23:00）

1. **Cowork 定时任务**：每晚 23:00 触发，读 dev.db 查当天有没有记录——没记才提醒，记了就简短汇报今天的收支。不打无意义的扰。
2. **应用内横幅**：见上，双保险。

## 五、8 月 1 日重置

`scripts/reset-for-august.ts`：
- 清空：Holding、PortfolioSnapshot、Transaction（测试数据）、PriceCache
- 保留：Account（户口结构）、Category（分类）、FxRate、Goal
- 净值曲线从 8 月 1 日重新起步

## 六、开发排期（今天 7/19）

| 阶段 | 内容 | 目标 |
|---|---|---|
| A | schema 升级 + migration + 种子分类 | 7/19-20 |
| B | /cashflow 页 + 快速记账 + INVEST 联动 | 7/20-24 |
| C | 总览集成（现金流卡 + 横幅） | 7/25-26 |
| D | AI 记账工具 + Cowork 定时提醒 + reset 脚本 | 7/27-29 |
| — | 缓冲测试，7/31 晚跑 reset | 8/1 开录 |

## 七、明确不做（v1）

- 预算功能、对帐单导入 UI（表留着，后做）、多币种记账（先 MYR）、INVEST 的 AI 入口、隐私打码
