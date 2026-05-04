import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { landingPathForRoles } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";

export function LoginPage() {
  const { diagnoseSignIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSteps([]);
    setBusy(true);
    const addStep = (message: string) => setSteps((prev) => [...prev, message]);
    try {
      const result = await diagnoseSignIn(email.trim(), password, addStep);
      const target = landingPathForRoles(result.roles);
      addStep(`redirect выполнен: ${target}`);
      navigate({ to: target, search: target === "/" ? { orderId: undefined } : (undefined as never) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка входа";
      setError(
        msg.toLowerCase().includes("invalid")
          ? "Неверный email или пароль"
          : msg,
      );
      setSteps((prev) => [...prev, `ошибка: ${msg}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="mb-6 flex justify-center">
          <BrandLogo size={40} />
        </div>
        <h1 className="text-center text-xl font-bold text-foreground">Вход в систему</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Введите свои учётные данные
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.ru"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                aria-pressed={showPassword}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </Button>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
            {steps.length ? steps.map((step, index) => <div key={`${step}-${index}`}>{step}</div>) : "Диагностика входа появится здесь"}
          </div>
        </form>
      </div>
    </div>
  );
}
