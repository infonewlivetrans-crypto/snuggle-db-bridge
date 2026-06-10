import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CarrierOfferAcceptBlock } from "@/components/contracts/CarrierOfferAcceptBlock";
import { buildOfferPayload, savePendingOffer, clearPendingOffer } from "@/lib/contracts/carrier-offer";
import { apiPost, setLocalSessionTokens } from "@/lib/api-client";

// Публичная страница регистрации кабинета перевозчика по ссылке.
// Использует ТОЛЬКО публичный supabase.auth.signUp (anon key),
// затем вызывает SECURITY DEFINER RPC claim_carrier_account_link(token),
// которая выдаёт роль `carrier` и создаёт связь dispatcher_carrier_users.
// service_role здесь не используется.

export const Route = createFileRoute("/carrier/activate/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Активация кабинета перевозчика — Радиус Трек" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivatePage,
});

const PENDING_KEY = "rt-carrier-activate-token";

type LinkInfo = {
  ext_id: string;
  carrier_name: string;
  expires_at: string;
  used: boolean;
  revoked: boolean;
  expired: boolean;
};

function ActivatePage() {
  const { token } = useParams({ from: "/carrier/activate/$token" });
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [offerAcceptedBy, setOfferAcceptedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "logged_in" | "needs_confirm">(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(`/api/public/carrier-activate/${encodeURIComponent(token)}`, {
          signal: ctrl.signal,
          headers: { accept: "application/json" },
        }).finally(() => clearTimeout(t));
        const body = (await res.json().catch(() => null)) as
          | { ok: boolean; link?: LinkInfo; reason?: string; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok || !body.link) {
          // Любая «битая» ссылка — чистим pending token, чтобы /carrier
          // не пытался повторно клеймить его в фоне.
          try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
          if (body?.reason === "not_found" || res.status === 404) {
            setError("Ссылка не найдена в системе. Возможно, она была удалена. Запросите новую у диспетчера.");
          } else {
            setError(`Ошибка сервера: ${body?.error ?? res.statusText}`);
          }
        } else {
          const li = body.link;
          setInfo(li);
          if (li.revoked) {
            try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
            setError("Ссылка отозвана администратором. Запросите новую.");
          } else if (li.expired) {
            try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
            setError("Срок действия ссылки истёк. Запросите новую у диспетчера.");
          }
          else if (li.used) {
            // Если ссылка уже использована — попробуем тихо привязать
            // текущего авторизованного пользователя (RPC проверит used_by).
            // Иначе покажем сообщение.
            const { data: sess } = await supabase.auth.getSession();
            if (sess.session) {
              setLocalSessionTokens({
                access_token: sess.session.access_token,
                refresh_token: sess.session.refresh_token,
              });
              const claim = await apiPost<{ ok: boolean; error?: string }>(
                `/api/carrier/activate/${encodeURIComponent(token)}`,
              ).catch(() => ({ ok: false } as { ok: boolean }));
              if (!cancelled && claim.ok) {
                try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
                setDone("logged_in");
                return;
              }
            }
            setError("Ссылка уже использована. Войдите по email и паролю, который вы указали при регистрации.");
          } else {
            // Не использована: если уже авторизован — сразу клеймим и в кабинет.
            const { data: sess } = await supabase.auth.getSession();
            if (sess.session) {
              setLocalSessionTokens({
                access_token: sess.session.access_token,
                refresh_token: sess.session.refresh_token,
              });
              const claim = await apiPost<{ ok: boolean; error?: string }>(
                `/api/carrier/activate/${encodeURIComponent(token)}`,
              ).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "error" }));
              if (cancelled) return;
              if (claim.ok) {
                try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
                setDone("logged_in");
                return;
              }
            }
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[carrier.activate] fetch failed", e);
        setError(e instanceof Error ? e.message : "Ошибка сети");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);




  // Запускает claim + запись акцепта, требует уже активной supabase-сессии.
  const runClaimFlow = async (
    session: { access_token: string; refresh_token: string },
    offerPayload: ReturnType<typeof buildOfferPayload>,
  ): Promise<boolean> => {
    setLocalSessionTokens({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    try {
      const claim = await apiPost<{ ok: boolean; reason?: string; error?: string }>(
        `/api/carrier/activate/${encodeURIComponent(token)}`,
      );
      if (!claim.ok) {
        toast.error(`Аккаунт не привязан: ${claim.error ?? claim.reason ?? "ошибка"}`);
        try { localStorage.setItem(PENDING_KEY, token); } catch { /* noop */ }
        savePendingOffer(offerPayload);
        return false;
      }
      if (info?.ext_id) {
        try {
          await apiPost("/api/carrier/offer-acceptance", {
            dispatcher_carrier_ext_id: info.ext_id,
            payload: offerPayload,
            source: "carrier_activate",
          });
          clearPendingOffer();
        } catch (recErr) {
          console.error("[carrier.activate] record_offer error", recErr);
          savePendingOffer(offerPayload);
        }
      }
      try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
      setDone("logged_in");
      return true;
    } catch (claimErr) {
      toast.error(`Не удалось привязать аккаунт: ${claimErr instanceof Error ? claimErr.message : "ошибка"}`);
      try { localStorage.setItem(PENDING_KEY, token); } catch { /* noop */ }
      savePendingOffer(offerPayload);
      return false;
    }
  };

  const submit = async () => {
    // Общая проверка для обоих режимов
    if (!email.trim() || password.length < 6) {
      toast.error("Заполните email и пароль (минимум 6 символов)");
      return;
    }
    if (!offerAccepted || !offerAcceptedBy.trim()) {
      toast.error("Необходимо принять договор-оферту и указать ФИО");
      return;
    }
    if (mode === "signup") {
      if (!fullName.trim()) {
        toast.error("Заполните ФИО");
        return;
      }
      if (password !== password2) {
        toast.error("Пароли не совпадают");
        return;
      }
    }

    setSubmitting(true);
    try {
      const offerPayload = buildOfferPayload({
        acceptedByName: offerAcceptedBy,
        acceptedByPhone: phone || undefined,
        acceptedByEmail: email || undefined,
        source: "carrier_activate",
      });

      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error || !data.session) {
          toast.error(error?.message ?? "Неверный email или пароль");
          return;
        }
        await runClaimFlow(
          { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
          offerPayload,
        );
        return;
      }

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/carrier`
          : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: fullName.trim(),
            phone: phone.trim() || null,
            // Серверная авто-связка подберёт токен после подтверждения email,
            // даже если localStorage в другом браузере недоступен.
            carrier_activate_token: token,
          },
        },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        const alreadyRegistered =
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("user already") ||
          msg.includes("registered");
        if (alreadyRegistered) {
          setMode("signin");
          setPassword("");
          setPassword2("");
          toast.message("У вас уже есть аккаунт", {
            description: "Введите пароль от существующего аккаунта — мы привяжем его к карточке перевозчика.",
          });
        } else {
          toast.error(error.message);
        }
        return;
      }
      if (data.session) {
        await runClaimFlow(
          { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
          offerPayload,
        );
      } else {
        // Email confirmation включён — сохраняем токен и акцепт до подтверждения.
        try { localStorage.setItem(PENDING_KEY, token); } catch { /* noop */ }
        savePendingOffer(offerPayload);
        setDone("needs_confirm");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось завершить операцию");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
            <h1 className="text-lg font-semibold">Ссылка недействительна</h1>
            <p className="text-sm text-muted-foreground">
              {error ?? "Запросите новую ссылку у администратора."}
            </p>
            <Link to="/" className="text-sm text-primary underline">
              На главную
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done === "logged_in") {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
            <h1 className="text-lg font-semibold">Кабинет активирован</h1>
            <p className="text-sm text-muted-foreground">
              Вы вошли как перевозчик. Можно перейти в кабинет.
            </p>
            <Button asChild>
              <Link to="/carrier">Открыть /carrier</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done === "needs_confirm") {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
            <h1 className="text-lg font-semibold">Аккаунт создан</h1>
            <p className="text-sm text-muted-foreground">
              Подтвердите email и войдите в кабинет перевозчика. Привязка
              к карточке произойдёт автоматически при первом входе.
            </p>
            <Button asChild variant="outline">
              <Link to="/">На страницу входа</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "signup" ? "Активация кабинета перевозчика" : "Вход в кабинет перевозчика"}
          </CardTitle>
          {info.carrier_name && (
            <p className="text-sm text-muted-foreground">
              Карточка: <span className="font-medium">{info.carrier_name}</span>
            </p>
          )}
          {mode === "signin" && (
            <p className="text-sm text-muted-foreground">
              Этот email уже зарегистрирован. Войдите паролем — мы привяжем аккаунт к карточке перевозчика.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "signup" && (
            <div className="space-y-1">
              <Label htmlFor="ca-name">ФИО</Label>
              <Input id="ca-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ca-email">Email</Label>
            <Input id="ca-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode === "signup" && (
            <div className="space-y-1">
              <Label htmlFor="ca-phone">Телефон</Label>
              <Input id="ca-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ca-pass">Пароль</Label>
            <Input id="ca-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {mode === "signup" && (
            <div className="space-y-1">
              <Label htmlFor="ca-pass2">Повторите пароль</Label>
              <Input id="ca-pass2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
          )}

          <CarrierOfferAcceptBlock
            accepted={offerAccepted}
            acceptedByName={offerAcceptedBy}
            onAcceptedChange={setOfferAccepted}
            onAcceptedByNameChange={setOfferAcceptedBy}
          />

          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "signup"
              ? "Создать аккаунт и активировать кабинет"
              : "Войти и активировать кабинет"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup"
              ? "У меня уже есть аккаунт — войти"
              : "Создать новый аккаунт"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export { PENDING_KEY as CARRIER_ACTIVATE_PENDING_KEY };
