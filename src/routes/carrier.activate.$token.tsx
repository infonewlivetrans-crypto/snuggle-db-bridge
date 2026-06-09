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
        const rpcPromise = (supabase as unknown as {
          rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
        }).rpc("get_carrier_account_link", { _token: token });
        const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: "Превышено время ожидания сервера. Проверьте интернет и попробуйте обновить страницу." } }), 12000),
        );
        const { data, error } = await Promise.race([rpcPromise, timeout]);
        if (cancelled) return;
        if (error) {
          console.error("[carrier.activate] rpc error", error);
          setError(`Ошибка сервера: ${error.message}`);
        } else if (!data || (Array.isArray(data) && data.length === 0)) {
          setError("Ссылка не найдена в системе. Возможно, она была удалена. Запросите новую у диспетчера.");
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          const li = row as LinkInfo;
          setInfo(li);
          if (li.revoked) setError("Ссылка отозвана администратором. Запросите новую.");
          else if (li.expired) setError("Срок действия ссылки истёк. Запросите новую у диспетчера.");
          else if (li.used) setError("Ссылка уже использована. Войдите по email и паролю, который вы указали при регистрации.");
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



  const submit = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast.error("Заполните ФИО, email и пароль (минимум 6 символов)");
      return;
    }
    if (password !== password2) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (!offerAccepted || !offerAcceptedBy.trim()) {
      toast.error("Необходимо принять договор-оферту и указать ФИО");
      return;
    }
    setSubmitting(true);
    try {
      const offerPayload = buildOfferPayload({
        acceptedByName: offerAcceptedBy,
        acceptedByPhone: phone || undefined,
        acceptedByEmail: email || undefined,
        source: "carrier_activate",
      });

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/carrier`
          : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: fullName.trim(), phone: phone.trim() || null },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      // Если у нас уже есть session — confirmation отключён, можно сразу клеймить.
      if (data.session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const claim = await (supabase as any).rpc("claim_carrier_account_link", { _token: token });
        if (claim.error) {
          toast.error(`Аккаунт создан, но не привязан: ${claim.error.message}`);
          try { localStorage.setItem(PENDING_KEY, token); } catch { /* noop */ }
          savePendingOffer(offerPayload);
        } else {
          // Запись акцепта договора-оферты
          if (info?.ext_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rec = await (supabase as any).rpc("record_carrier_offer_acceptance", {
              p_dispatcher_carrier_ext_id: info.ext_id,
              p_payload: offerPayload,
              p_source: "carrier_activate",
            });
            if (rec.error) {
              console.error("[carrier.activate] record_offer error", rec.error);
              // не блокируем активацию, сохраним для повторной попытки на /carrier
              savePendingOffer(offerPayload);
            } else {
              clearPendingOffer();
            }
          }
          setDone("logged_in");
          try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
          return;
        }
      } else {
        // Email confirmation включён — сохраняем и токен, и акцепт для записи после входа.
        try { localStorage.setItem(PENDING_KEY, token); } catch { /* noop */ }
        savePendingOffer(offerPayload);
        setDone("needs_confirm");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось завершить регистрацию");
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
          <CardTitle>Активация кабинета перевозчика</CardTitle>
          {info.carrier_name && (
            <p className="text-sm text-muted-foreground">
              Карточка: <span className="font-medium">{info.carrier_name}</span>
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ca-name">ФИО</Label>
            <Input id="ca-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-email">Email</Label>
            <Input id="ca-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-phone">Телефон</Label>
            <Input id="ca-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-pass">Пароль</Label>
            <Input id="ca-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-pass2">Повторите пароль</Label>
            <Input id="ca-pass2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </div>

          <CarrierOfferAcceptBlock
            accepted={offerAccepted}
            acceptedByName={offerAcceptedBy}
            onAcceptedChange={setOfferAccepted}
            onAcceptedByNameChange={setOfferAcceptedBy}
          />

          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать аккаунт и активировать кабинет
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export { PENDING_KEY as CARRIER_ACTIVATE_PENDING_KEY };
