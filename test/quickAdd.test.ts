import { describe, it, expect } from "vitest";
import { dateShortcuts, readPoolMemory, rememberPool, poolForCategory } from "@/lib/quickAdd";

// 需求（P1-01）：记一笔要几秒内完成。
// 日期九成是今天/昨天/前天，不该每次开 native picker 点三下；
// 户口九成跟着分类走（餐饮→TNG、日用→PBE），选完分类就该自动带出来。

describe("dateShortcuts", () => {
  it("给出今天 / 昨天 / 前天三个日期", () => {
    expect(dateShortcuts("2026-09-29")).toEqual([
      { label: "今天", value: "2026-09-29" },
      { label: "昨天", value: "2026-09-28" },
      { label: "前天", value: "2026-09-27" },
    ]);
  });

  it("跨月回退：9/1 的昨天是 8/31", () => {
    expect(dateShortcuts("2026-09-01").map((d) => d.value)).toEqual([
      "2026-09-01",
      "2026-08-31",
      "2026-08-30",
    ]);
  });

  it("跨年回退：1/1 的前天是去年 12/30", () => {
    expect(dateShortcuts("2026-01-01").map((d) => d.value)).toEqual([
      "2026-01-01",
      "2025-12-31",
      "2025-12-30",
    ]);
  });

  it("闰年 3/1 的昨天是 2/29", () => {
    expect(dateShortcuts("2024-03-01")[1].value).toBe("2024-02-29");
  });
});

describe("readPoolMemory", () => {
  it("读得回存进去的 map", () => {
    expect(readPoolMemory('{"cat1":"pool1"}')).toEqual({ cat1: "pool1" });
  });

  // storage 里的东西是上一版程式写的、或被人手改过，不能假设形状正确。
  // 记账不该因为一条脏记忆就打不开表单。
  it("读不到 / 不是 JSON / 不是物件 / 值不是字串，一律当空记忆", () => {
    expect(readPoolMemory(null)).toEqual({});
    expect(readPoolMemory("不是 json")).toEqual({});
    expect(readPoolMemory('["a"]')).toEqual({});
    expect(readPoolMemory("null")).toEqual({});
    expect(readPoolMemory('{"cat1":123,"cat2":"pool2"}')).toEqual({ cat2: "pool2" });
  });
});

describe("rememberPool", () => {
  it("写入新的分类→户口对应，旧的保留", () => {
    expect(rememberPool({ cat1: "pool1" }, "cat2", "pool2")).toEqual({
      cat1: "pool1",
      cat2: "pool2",
    });
  });

  it("同一分类换了户口就覆盖", () => {
    expect(rememberPool({ cat1: "pool1" }, "cat1", "pool9")).toEqual({ cat1: "pool9" });
  });

  it("没有分类或没有户口时原样返回，不写空键", () => {
    expect(rememberPool({ cat1: "pool1" }, null, "pool2")).toEqual({ cat1: "pool1" });
    expect(rememberPool({ cat1: "pool1" }, "cat2", "")).toEqual({ cat1: "pool1" });
  });
});

describe("poolForCategory", () => {
  const ids = ["pool1", "pool2"];

  it("记得这个分类上次用的户口就用它", () => {
    expect(poolForCategory("cat1", { cat1: "pool2" }, ids, "pool1")).toBe("pool2");
  });

  // 户口被删掉后记忆会指向一个不存在的 id，照用会送出一个服务端认不得的 holdingId
  it("记忆指向已不存在的户口时退回目前选的", () => {
    expect(poolForCategory("cat1", { cat1: "gone" }, ids, "pool1")).toBe("pool1");
  });

  it("这个分类没有记忆时保持目前选的，不乱改", () => {
    expect(poolForCategory("cat2", { cat1: "pool2" }, ids, "pool1")).toBe("pool1");
  });
});
