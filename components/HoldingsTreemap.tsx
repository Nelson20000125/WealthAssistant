import { formatMYR, formatPct } from "@/lib/format";

// Ghostfolio 式持仓热力图：方块面积 = 市值占比，颜色 = 盈亏方向与幅度。
// squarified treemap 算法手写实现，不引图表库。

type Holding = {
  id: string;
  name: string;
  symbol: string | null;
  assetType: string;
  valueMYR: number | null;
  costValueMYR: number | null;
};

type Rect = { x: number; y: number; w: number; h: number };

// 布局逻辑坐标系（近似 16:9），最后按百分比映射到容器
const W = 160;
const H = 90;

function worstAspect(row: number[], side: number) {
  const sum = row.reduce((a, b) => a + b, 0);
  const thick = sum / side;
  let worst = 0;
  for (const v of row) {
    const len = v / thick;
    worst = Math.max(worst, len / thick, thick / len);
  }
  return worst;
}

/** 经典 squarify：每次沿短边铺一行，行内个数取「最差长宽比」最优的切分 */
function squarify(values: number[]): Rect[] {
  const rects: Rect[] = [];
  let [x, y, w, h] = [0, 0, W, H];
  let i = 0;
  while (i < values.length) {
    const vertical = w < h;
    const side = vertical ? w : h;
    let row = [values[i]];
    let best = worstAspect(row, side);
    let j = i + 1;
    while (j < values.length) {
      const cand = [...row, values[j]];
      const score = worstAspect(cand, side);
      if (score <= best) {
        row = cand;
        best = score;
        j++;
      } else break;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    const thick = sum / side;
    let offset = 0;
    for (const v of row) {
      const len = v / thick;
      rects.push(
        vertical
          ? { x: x + offset, y, w: len, h: thick }
          : { x, y: y + offset, w: thick, h: len }
      );
      offset += len;
    }
    if (vertical) {
      y += thick;
      h -= thick;
    } else {
      x += thick;
      w -= thick;
    }
    i = j;
  }
  return rects;
}

/** 盈亏 → 颜色：正绿负红，±30% 处饱和度封顶；现金/无成本数据为中性灰 */
function tileBackground(plPct: number | null) {
  if (plPct === null || plPct === 0) {
    return "color-mix(in srgb, var(--ink-muted) 22%, transparent)";
  }
  const base = plPct > 0 ? "var(--good)" : "var(--critical)";
  const mix = 25 + Math.min(Math.abs(plPct) / 0.3, 1) * 55;
  return `color-mix(in srgb, ${base} ${mix}%, transparent)`;
}

export default function HoldingsTreemap({ holdings }: { holdings: Holding[] }) {
  const items = holdings
    .filter((h) => h.valueMYR !== null && h.valueMYR > 0)
    .map((h) => ({
      ...h,
      plPct:
        h.assetType !== "CASH" && h.costValueMYR !== null && h.costValueMYR > 0
          ? (h.valueMYR! - h.costValueMYR) / h.costValueMYR
          : null,
    }))
    .sort((a, b) => b.valueMYR! - a.valueMYR!);

  if (items.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted">
        没有可显示的持仓（缺市值数据）
      </div>
    );
  }

  const total = items.reduce((a, b) => a + b.valueMYR!, 0);
  const rects = squarify(items.map((h) => (h.valueMYR! / total) * W * H));

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl">
      {items.map((h, i) => {
        const r = rects[i];
        const pctOfTotal = h.valueMYR! / total;
        // 小方块（面积 < 6%）只留色块，文字塞不下就不硬塞
        const showText = pctOfTotal >= 0.06;
        return (
          <div
            key={h.id}
            title={`${h.name} · ${formatMYR(h.valueMYR!)}${h.plPct !== null ? ` · ${formatPct(h.plPct)}` : ""}`}
            className="absolute flex flex-col justify-end overflow-hidden p-2"
            style={{
              left: `${(r.x / W) * 100}%`,
              top: `${(r.y / H) * 100}%`,
              width: `${(r.w / W) * 100}%`,
              height: `${(r.h / H) * 100}%`,
              background: tileBackground(h.plPct),
              // 用背景色当分隔，不画边框（Ghostfolio 同款做法）
              boxShadow: "inset 0 0 0 1.5px var(--surface)",
            }}
          >
            {showText && (
              <>
                <div className="truncate text-xs font-semibold text-ink">
                  {h.symbol ?? h.name}
                </div>
                <div className="truncate text-xs text-ink-secondary tabular-nums">
                  {formatMYR(h.valueMYR!, true)}
                  {h.plPct !== null && ` · ${formatPct(h.plPct)}`}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
