/** 延后执行、执行前可撤销。给「已删除 · 撤销」用：真正的 DELETE 等 snackbar 过期才发 */
export function deferred(commit: () => void, ms: number) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    commit();
  };
  const timer = setTimeout(run, ms);
  return {
    /** 回传 false 表示已经执行过、撤销不了 */
    cancel() {
      if (done) return false;
      done = true;
      clearTimeout(timer);
      return true;
    },
    flush: run,
  };
}
