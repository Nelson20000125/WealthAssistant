import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deferred } from "@/lib/deferred";

// 需求（P1-04）：删除后给「已删除 · 撤销」。
// 撤销不能靠「删掉再重建」：重建会换 id，还款笔的 settlesTransactionId 在删除时已被 SetNull，
// 接不回去，那些还款会突然变成收入。所以删除要延后执行，撤销＝在执行前取消。

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("deferred", () => {
  it("时间到才执行", () => {
    const commit = vi.fn();
    deferred(commit, 5000);
    vi.advanceTimersByTime(4999);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("时间到之前撤销，就永远不执行", () => {
    const commit = vi.fn();
    const d = deferred(commit, 5000);
    expect(d.cancel()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(commit).not.toHaveBeenCalled();
  });

  it("离开页面时 flush 立刻执行，之后计时器到了也不会再执行第二次", () => {
    const commit = vi.fn();
    const d = deferred(commit, 5000);
    d.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("已经执行过就撤销不了（回传 false，让 UI 知道撤销失败）", () => {
    const commit = vi.fn();
    const d = deferred(commit, 5000);
    vi.advanceTimersByTime(5000);
    expect(d.cancel()).toBe(false);
  });
});
