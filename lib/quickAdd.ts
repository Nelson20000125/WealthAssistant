// 记一笔（P1-01）的纯逻辑：日期快捷与「每个分类记住上次用的户口」。
// 拆出来是因为这两段都有边界（跨月跨年回退、storage 里的脏资料），
// 塞在 component 里就只能靠手点来验。

/** 分类 → 上次用的现金户口。跟 wa-last-cash-pool 并存：那个是全域预设，这个更精确 */
export const POOL_BY_CATEGORY_KEY = "wa-pool-by-category";

function shift(iso: string, days: number) {
  // 用 UTC 做算术，不碰本地时区 —— iso 本来就是已经换算成大马日期的字串
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 今天 / 昨天 / 前天。九成的记账发生在这三天内 */
export function dateShortcuts(today: string) {
  return [
    { label: "今天", value: today },
    { label: "昨天", value: shift(today, -1) },
    { label: "前天", value: shift(today, -2) },
  ];
}

/** storage 里的内容可能是旧版写的或被手改过，形状不对一律当没有记忆 */
export function readPoolMemory(raw: string | null): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string"
    )
  );
}

export function rememberPool(
  memory: Record<string, string>,
  categoryId: string | null,
  poolId: string
): Record<string, string> {
  if (!categoryId || !poolId) return memory;
  return { ...memory, [categoryId]: poolId };
}

/**
 * 选了分类之后该预选哪个户口。记忆指向已删掉的户口时退回目前这个 ——
 * 送一个服务端认不得的 holdingId 出去，使用者只会看到一句「保存失败」。
 */
export function poolForCategory(
  categoryId: string,
  memory: Record<string, string>,
  availablePoolIds: string[],
  current: string
): string {
  const remembered = memory[categoryId];
  return remembered && availablePoolIds.includes(remembered) ? remembered : current;
}
