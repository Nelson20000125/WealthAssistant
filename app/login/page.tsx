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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();
  if (session) redirect("/");

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
      </div>
    </div>
  );
}
