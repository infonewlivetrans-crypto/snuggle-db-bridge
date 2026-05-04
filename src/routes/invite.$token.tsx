import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { SplashScreen } from "@/components/SplashScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { landingPathForRoles, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Вход по ссылке — Радиус Трек" }] }),
  component: InviteLoginPage,
});

type InviteInfo = { full_name: string; role: AppRole; already_activated: boolean };

function InviteLoginPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/invite-login?token=${encodeURIComponent(token)}`);
        const body = (await res.json().catch(() => null)) as InviteInfo & { error?: string } | null;
        if (!res.ok || !body || (body as { error?: string }).error) {
          throw new Error((body as { error?: string })?.error || "Ссылка недействительна");
        }
        setInfo(body);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Ссылка недействительна");
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/invite-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), password }),
      });
      const body = (await res.json().catch(() => null)) as
        | { access_token?: string; refresh_token?: string; role?: AppRole; error?: string }
        | null;
      if (!res.ok || !body?.access_token || !body?.refresh_token) {
        throw new Error(body?.error || "Не удалось активировать ссылку");
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (setErr) throw setErr;
      const role = (body.role ?? info?.role ?? "driver") as AppRole;
      const dest = landingPathForRoles([role]);
      navigate({ to: dest, replace: true });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Не удалось активировать ссылку");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            Ссылка недействительна
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Попросите администратора перевыпустить ссылку или проверьте, что ссылка скопирована полностью.
          </p>
        </div>
      </div>
    );
  }

  if (!info) return <SplashScreen />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-2 text-xl font-semibold text-foreground">Активация доступа</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Здравствуйте, <span className="font-medium text-foreground">{info.full_name}</span>!
          </p>
          <p className="text-xs text-muted-foreground">
            Роль: {ROLE_LABELS[info.role] ?? info.role}
          </p>
          {info.already_activated && (
            <p className="mt-2 text-xs text-amber-600">
              Эта ссылка уже использовалась. Вы можете задать новый email и пароль.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль (минимум 6 символов)</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Активация…" : "Войти"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          После входа email и пароль сохранятся — в дальнейшем вы сможете входить с обычной страницы входа.
        </p>
      </form>
    </div>
  );
}
