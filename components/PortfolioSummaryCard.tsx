import { prisma } from "@/lib/prisma";
import Value from "@/components/Value";

// Ghostfolio Summary tab 式的密集 key-value 行：一行一个指标，细分隔线分组。

function Row({
  label,
  children,
  bold = false,
}: {
  label: string;
  children: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className={`text-sm ${bold ? "font-semibold text-ink" : "text-ink-secondary"}`}>
        {label}
      </span>
      <span className={`text-sm ${bold ? "font-semibold" : ""}`}>{children}</span>
    </div>
  );
}

function Divider() {
  return <hr className="my-2 border-line" />;
}

export default async function PortfolioSummaryCard({
  costMYR,
  netWorthMYR,
  investedMYR,
  cashMYR,
  performanceByCurrency,
  holdingsCount,
  accountsCount,
}: {
  costMYR: number;
  netWorthMYR: number;
  investedMYR: number;
  cashMYR: number;
  performanceByCurrency: {
    currency: string;
    costNative: number;
    valueNative: number;
    plNative: number;
    plPct: number;
  }[];
  holdingsCount: number;
  accountsCount: number;
}) {
  // Time in Market：从最早一笔持仓建立算起。查询失败（比如空库）就不显示这行。
  let daysInMarket: number | null = null;
  try {
    const earliest = await prisma.holding.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (earliest) {
      daysInMarket = Math.max(
        0,
        Math.floor((Date.now() - earliest.createdAt.getTime()) / 86_400_000)
      );
    }
  } catch {
    daysInMarket = null;
  }

  return (
    <div>
      {daysInMarket !== null && (
        <Row label="入市时间">
          <span className="text-ink tabular-nums">{daysInMarket} 天</span>
        </Row>
      )}
      <Row label="持仓 / 户口">
        <span className="text-ink tabular-nums">
          {holdingsCount} 笔 · {accountsCount} 个
        </span>
      </Row>

      <Divider />

      <Row label="投入成本">
        <Value value={costMYR} className="text-ink" />
      </Row>
      {performanceByCurrency.map((p) => (
        <Row key={p.currency} label={`未实现损益 · ${p.currency}`}>
          <span>
            <Value value={p.plNative} currency={p.currency} colorizeSign />{" "}
            (<Value value={p.plPct} kind="percent" colorizeSign />)
          </span>
        </Row>
      ))}
      {performanceByCurrency.length === 0 && (
        <Row label="未实现损益">
          <span className="text-ink-muted">尚无投资部位</span>
        </Row>
      )}

      <Divider />

      <Row label="投资部位">
        <Value value={investedMYR} className="text-ink" />
      </Row>
      <Row label="现金部位">
        <Value value={cashMYR} className="text-ink" />
      </Row>

      <Divider />

      <Row label="净资产" bold>
        <Value value={netWorthMYR} className="text-ink" />
      </Row>
    </div>
  );
}
