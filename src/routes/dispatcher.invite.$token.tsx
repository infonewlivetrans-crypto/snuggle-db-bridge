// Страница активации приглашения для нового диспетчера.
// Полностью клиентская — не упирается в SSR и не использует service_role.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dispatcher/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Активация диспетчера" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DispatcherInviteActivatePage,
});

type Info = { ok: boolean; reason?: string; full_name?: string; email?: string | null };

function DispatcherInviteActivatePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/dispatcher-user-invite/${token}`);
        const body = (await res.json()) as Info;
        setInfo(body);
        if (body.email) setEmail(body.email);
      } catch {
        setInfo({ ok: false, reason: "network" });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async () => {
    if (!info?.ok) return;
    if (password.length < 6) {
      toast.error("Пароль должен быть не короче 6 символов");
      return;
    }
    if (password !== password2) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/dispatcher-user-invite/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        reason?: string;
        access_token?: string | null;
        refresh_token?: string | null;
      };
      if (!body.ok) {
        const map: Record<string, string> = {
          email_taken: "Этот email уже зарегистрирован. Используйте другой адрес.",
          already_activated: "Эта ссылка уже использована.",
          disabled: "Ссылка отключена администратором.",
          not_found: "Ссылка недействительна.",
          weak_password: "Пароль слишком короткий.",
          bad_email: "Введите корректный email.",
        };
        toast.error(map[body.reason ?? ""] ?? body.reason ?? "Ошибка активации");
        return;
      }
      if (body.access_token && body.refresh_token) {
        await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        toast.success("Готово! Добро пожаловать.");
        navigate({ to: "/dispatcher" });
      } else {
        toast.success("Аккаунт создан. Войдите с указанным email и паролем.");
        navigate({ to: "/auth" });
      }
    } catch {
      toast.error("Сеть недоступна, попробуйте ещё раз");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Загружаем приглашение…
      </div>
    );
  }
  if (!info?.ok) {
    const reasonMap: Record<string, string> = {
      not_found: "Ссылка недействительна.",
      disabled: "Ссылка отключена администратором.",
      already_activated: "Эта ссылка уже использовалась.",
      network: "Не удалось загрузить приглашение, проверьте подключение.",
      missing_token: "Некорректная ссылка.",
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Не удалось открыть приглашение</h1>
          <p className="text-muted-foreground">
            {reasonMap[info?.reason ?? ""] ?? "Свяжитесь с администратором."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full rounded-xl border bg-card p-6 space-y-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Активация диспетчера</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Здравствуйте, <strong>{info.full_name}</strong>. Задайте email и пароль для входа.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password2">Повторите пароль</Label>
          <Input
            id="password2"
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <Button
          className="w-full"
          onClick={submit}
          disabled={submitting || !email || password.length < 6}
        >
          {submitting ? "Создаём аккаунт…" : "Активировать и войти"}
        </Button>
      </div>
    </div>
  );
}
