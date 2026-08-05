import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

async function authenticate(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

/**
 * 公开 demo 用的一键登入。帐密从环境变数读，不接受任何外部输入 ——
 * 履历上的链接会被不看 README 的人直接点开，卡在空登入框等于这条路径断掉。
 */
async function loginAsDemo() {
  "use server";
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) redirect("/login?error=1");
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();
  if (session) redirect("/");

  // 用独立开关而不是靠 DATABASE_URL 是不是远端来猜：本机跑的是真实财务资料，
  // 那颗按钮绝对不该在那里出现
  const demoMode = process.env.DEMO_MODE === "1" && !!process.env.DEMO_EMAIL;

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">
          Investment OS
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink">登入</h1>
        <p className="mt-1 text-sm text-ink-muted">私人财富管理助理</p>

        <form action={authenticate} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-muted">邮箱</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-muted">密码</span>
            <input
              type="password"
              name="password"
              required
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </label>

          {error && (
            <div className="text-xs" style={{ color: "var(--critical)" }}>
              邮箱或密码不对，请再试一次
            </div>
          )}

          <button
            type="submit"
            className="mt-2 rounded-md bg-portfolio-accent px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            登入
          </button>
        </form>

        {demoMode && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-ink-muted">或</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <form action={loginAsDemo}>
              <button
                type="submit"
                className="w-full rounded-md border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
              >
                以访客身份查看 demo
              </button>
            </form>
            <p className="mt-2 text-center text-xs text-ink-muted">资料为虚构，可随意点选</p>
          </>
        )}
      </div>
    </div>
  );
}
