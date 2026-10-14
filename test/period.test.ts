import { describe, it, expect } from "vitest";
import { monthComparisonRange } from "@/lib/period";

// 需求（P0-03）：进行中的月份只能跟上月的同一段期间比。
// 拿 9/1–9/25 去比完整的 8 月，会得出「支出 -88.3%」这种假消息。

describe("monthComparisonRange", () => {
  it("进行中的月份：两边都取 1 号到今天的日号", () => {
    const r = monthComparisonRange(new Date(Date.UTC(2026, 8, 25))); // 2026-09-25
    expect(r.partial).toBe(true);
    expect(r.current.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.current.end.toISOString()).toBe("2026-09-26T00:00:00.000Z"); // 含今天
    expect(r.previous.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(r.previous.end.toISOString()).toBe("2026-08-26T00:00:00.000Z");
  });

  it("月份最后一天：不再是部分月份，两边都取完整月", () => {
    const r = monthComparisonRange(new Date(Date.UTC(2026, 8, 30))); // 9/30
    expect(r.partial).toBe(false);
    expect(r.current.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.previous.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(r.previous.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("上月天数较少时夹到上月最后一天，不会溢出到再上个月", () => {
    // 3/30 对上 2 月：2 月只有 28 天，同期段只能到 2/28 结束
    const r = monthComparisonRange(new Date(Date.UTC(2026, 2, 30)));
    expect(r.partial).toBe(true);
    expect(r.previous.end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("一月要跨年回到去年十二月", () => {
    const r = monthComparisonRange(new Date(Date.UTC(2026, 0, 10)));
    expect(r.previous.start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(r.previous.end.toISOString()).toBe("2025-12-11T00:00:00.000Z");
  });
});
