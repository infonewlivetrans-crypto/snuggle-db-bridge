import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { SplashScreen } from "@/components/SplashScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { landingPathForRoles, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { AuthLayout, GlassCard } from "@/components/auth/AuthLayout";
import { BrandLogo } from "@/components/BrandLogo";
import { playAuthSignal } from "@/lib/auth-signal";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Вход по ссылке — Радиус Трек" }] }),
  component: InviteLoginPage,
});

type InviteInfo = { full_name: string; role: AppRole; already_activated: boolean };

function InviteLoginPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { refresh, diagnoseSignIn } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Поля регистрации (первая активация)
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Поля входа (когда invite уже использован)
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/invite-login?token=${encodeURIComponent(token)}`);
        const body = (await res.json().catch(() => null)) as InviteInfo & { error?: string } | null;
        if (!res.ok || !body || (body as { error?: string }).error) {
          throw new Error((body as { error?: string })?.error || "Ссылка недействительна");
        }
        setInfo(body);
        if (body.role === "manager" && body.full_name) {
          setFullName(body.full_name);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Ссылка недействительна");
      }
    })();
  }, [token]);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    playAuthSignal();
    setSubmitError(null);

    const emailTrim = email.trim();
    const phoneTrim = phone.trim();
    const fullNameTrim = fullName.trim().replace(/\s+/g, " ");
    const isManager = info?.role === "manager";
    if (isManager) {
      if (!fullNameTrim) return setSubmitError("Введите полное ФИО");
      const parts = fullNameTrim.split(" ").filter((p) => p.length >= 2);
      if (parts.length < 2)
        return setSubmitError("Введите полное ФИО (минимум фамилия и имя)");
    }
    if (!emailTrim) return setSubmitError("Введите email");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTrim))
      return setSubmitError("Введите корректный email");
    if (!phoneTrim) return setSubmitError("Введите номер телефона");
    if (password.length < 6)
      return setSubmitError("Пароль должен содержать минимум 6 символов");
    if (password !== passwordConfirm)
      return setSubmitError("Пароли не совпадают");

    setSubmitting(true);
    try {
      const res = await fetch("/api/invite-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          email: emailTrim,
          password,
          phone: phoneTrim,
          ...(isManager ? { fullName: fullNameTrim } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; role?: AppRole; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        const msg = body?.error || "Не удалось активировать ссылку";
        // Если оказалось, что invite уже использован, или email/phone заняты —
        // переключаемся на форму входа.
        if (/уже использовалась|уже занят|already|exists|registered/i.test(msg)) {
          setInfo((prev) => (prev ? { ...prev, already_activated: true } : prev));
          setLoginEmail(emailTrim);
          setSubmitError(null);
          return;
        }
        throw new Error(msg);
      }
      await refresh();
      const role = (body.role ?? info?.role ?? "driver") as AppRole;
      const dest = landingPathForRoles([role]);
      navigate({ to: dest, replace: true });
    } catch (e) {
      console.error("[invite-activate] failed", e);
      setSubmitError(e instanceof Error ? e.message : "Не удалось активировать ссылку");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    playAuthSignal();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const result = await diagnoseSignIn(loginEmail.trim(), loginPassword, () => {});
      const target = landingPathForRoles(result.roles);
      navigate({
        to: target,
        replace: true,
        search: target === "/" ? { orderId: undefined } : (undefined as never),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка входа";
      setLoginError(
        msg.toLowerCase().includes("invalid")
          ? "Неверный email или пароль"
          : msg,
      );
    } finally {
      setLoginBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthLayout align="center">
        <GlassCard className="text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            Ссылка недействительна
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Попросите администратора перевыпустить ссылку или проверьте, что
            ссылка скопирована полностью.
          </p>
          <div className="mt-4">
            <Link to="/" className="text-sm font-medium text-primary hover:underline">
              Перейти на страницу входа
            </Link>
          </div>
        </GlassCard>
      </AuthLayout>
    );
  }

  if (!info) return <SplashScreen />;

  // === Аккаунт уже создан — показываем форму входа ===
  if (info.already_activated) {
    return (
      <AuthLayout align="center">
        <GlassCard>
          <div className="flex flex-col items-center text-center">
            <BrandLogo size={56} />
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Вход в кабинет
            </div>
            <h1 className="mt-1 text-xl font-semibold text-foreground">
              Аккаунт уже создан
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {info.full_name
                ? `${info.full_name}, войдите по логину и паролю.`
                : "Войдите по логину и паролю."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Роль: {ROLE_LABELS[info.role] ?? info.role}
            </p>
          </div>
          <form className="mt-5 space-y-4" onSubmit={handleSignIn}>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-white/90"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Пароль</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showLoginPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="bg-white/90 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  aria-label={showLoginPassword ? "Скрыть пароль" : "Показать пароль"}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {loginError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loginError}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loginBusy}>
              {loginBusy ? "Входим…" : "Войти"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Забыли пароль? Обратитесь к администратору для сброса.
            </p>
          </form>
        </GlassCard>
      </AuthLayout>
    );
  }

  // === Первая активация — регистрация ===
  return (
    <AuthLayout align="left">
      <GlassCard>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="flex flex-col items-center text-center">
            <BrandLogo size={56} />
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Активация доступа
            </div>
            <h1 className="mt-1 text-xl font-semibold text-foreground">
              Здравствуйте, {info.full_name}!
            </h1>
            <p className="text-xs text-muted-foreground">
              Роль: {ROLE_LABELS[info.role] ?? info.role}
            </p>
          </div>

          {info.role === "manager" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Полное ФИО</Label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                className="bg-white/90"
              />
              <p className="text-[11px] text-muted-foreground">
                Укажите фамилию и имя полностью — это будет использоваться в системе.
              </p>
            </div>
          )}

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
              className="bg-white/90"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (999) 123-45-67"
              className="bg-white/90"
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
              className="bg-white/90"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="passwordConfirm">Повторите пароль</Label>
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="bg-white/90"
            />
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Активация…" : "Войти"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            После входа email и пароль сохранятся — в дальнейшем вы сможете
            входить с обычной страницы входа.
          </p>
        </form>
      </GlassCard>
    </AuthLayout>
  );
}
