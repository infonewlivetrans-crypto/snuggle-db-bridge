import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CARRIER_PAYMENT_METHODS,
  CARRIER_PAYMENT_METHOD_LABELS,
} from "@/lib/dispatcher/statuses";

// Общая постоянная многоразовая публичная регистрация перевозчика.
// Этап 9, шаг 1: только базовые поля + email/password + согласие 5%.

export const Route = createFileRoute("/carrier/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Регистрация перевозчика — Радиус Трек" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Зарегистрируйтесь как перевозчик в системе Радиус Трек: получите личный кабинет, доступ к заданиям и инструменты для водителей.",
      },
    ],
  }),
  component: CarrierRegisterPage,
});

const CARRIER_KINDS = [
  { value: "ip", label: "ИП" },
  { value: "ooo", label: "ООО" },
  { value: "self_employed", label: "Самозанятый" },
  { value: "individual", label: "Физлицо" },
] as const;

const COMMISSION_TEXT =
  "Я подтверждаю, что за рейсы, найденные диспетчером/сервисом, оплачиваю комиссию 5% после получения оплаты за перевозку.";

function CarrierRegisterPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [regType, setRegType] = useState<"carrier_only" | "carrier_with_driver">(
    "carrier_only",
  );
  const [companyName, setCompanyName] = useState("");
  const [carrierKind, setCarrierKind] = useState<(typeof CARRIER_KINDS)[number]["value"]>(
    "individual",
  );
  const [inn, setInn] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [agreedBy, setAgreedBy] = useState("");
  const [driverFullName, setDriverFullName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlreadyRegistered(false);

    if (!email.trim()) return toast.error("Укажите email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Некорректный email");
    if (password.length < 8) return toast.error("Пароль не короче 8 символов");
    if (password !== password2) return toast.error("Пароли не совпадают");
    if (!companyName.trim()) return toast.error("Укажите название / ФИО");
    if (!phone.trim()) return toast.error("Укажите телефон");
    if (!/^[+\d][\d\s()\-]{5,30}$/.test(phone.trim())) return toast.error("Некорректный телефон");
    if (inn.trim() && !/^\d{10}$|^\d{12}$/.test(inn.trim())) return toast.error("ИНН: 10 или 12 цифр");
    if (!agreed || !agreedBy.trim())
      return toast.error("Подтвердите согласие на комиссию 5% и укажите ФИО");
    if (regType === "carrier_with_driver") {
      if (!driverFullName.trim()) return toast.error("Укажите ФИО водителя");
      if (!driverPhone.trim()) return toast.error("Укажите телефон водителя");
    }

    setBusy(true);
    try {
      const emailNorm = email.trim();

      // Шаг 1: signUp на клиенте через Supabase (без admin key).
      let accessToken: string | null = null;
      const signUpRes = await supabase.auth.signUp({
        email: emailNorm,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/carrier`,
          data: {
            full_name: contactPerson.trim() || companyName.trim(),
            source: "carrier_self_register",
          },
        },
      });

      if (signUpRes.error) {
        const msg = signUpRes.error.message || "";
        if (/already|registered|exists/i.test(msg)) {
          // Email уже зарегистрирован — пробуем войти этим же паролем.
          const signInRes = await supabase.auth.signInWithPassword({
            email: emailNorm,
            password,
          });
          if (signInRes.error || !signInRes.data.session) {
            setAlreadyRegistered(true);
            toast.error("Этот email уже зарегистрирован. Войдите по email и паролю.");
            return;
          }
          accessToken = signInRes.data.session.access_token;
        } else {
          toast.error(msg || "Не удалось зарегистрироваться. Попробуйте позже.");
          return;
        }
      } else {
        accessToken = signUpRes.data.session?.access_token ?? null;
        if (!accessToken) {
          // confirm-email включён в проекте — сессии нет. Пробуем сразу войти.
          const signInRes = await supabase.auth.signInWithPassword({
            email: emailNorm,
            password,
          });
          if (signInRes.error || !signInRes.data.session) {
            toast.success(
              "Подтвердите email из письма и войдите по email и паролю.",
            );
            navigate({ to: "/" });
            return;
          }
          accessToken = signInRes.data.session.access_token;
        }
      }

      // Шаг 2: создаём/привязываем production-карточку перевозчика к user_id.
      const res = await fetch("/api/public/carrier-register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: emailNorm,
          registration_type: regType,
          company_name: companyName.trim(),
          carrier_kind: carrierKind,
          inn: inn.trim(),
          phone: phone.trim(),
          city: city.trim(),
          contact_person: contactPerson.trim(),
          commission_payment_method: paymentMethod.trim(),
          commission_agreed: agreed,
          commission_agreed_by: agreedBy.trim(),
          driver_full_name: driverFullName.trim() || undefined,
          driver_phone: driverPhone.trim() || undefined,
          website: honeypot,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        reason?: string;
      };
      if (!body.ok) {
        if (body.reason === "validation_failed") {
          toast.error("Проверьте обязательные поля и попробуйте снова");
          return;
        }
        if (body.reason === "unauthorized") {
          toast.error("Сессия не получена. Попробуйте войти и завершить регистрацию.");
          return;
        }
        toast.error("Не удалось зарегистрироваться. Попробуйте позже.");
        return;
      }

      toast.success("Регистрация прошла. Входим в кабинет…");
      try {
        await signIn(emailNorm, password);
      } catch {
        // сессия уже есть от supabase.auth — этого достаточно.
      }
      navigate({ to: "/carrier" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Регистрация перевозчика</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Создайте учётную запись перевозчика. После регистрации вы попадёте в
          личный кабинет, где сможете добавить транспорт и водителей.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Honeypot */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
          <label>
            Сайт компании
            <input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Учётная запись</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email *">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Телефон *">
              <Input
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Пароль *">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Повторите пароль *">
              <Input
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </Field>
          </div>
          {alreadyRegistered ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              Этот email уже зарегистрирован.{" "}
              <Link to="/" className="font-medium underline">
                Войти в кабинет
              </Link>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Кто вы?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <RoleCard
              active={regType === "carrier_only"}
              title="Я только перевозчик"
              subtitle="Управляю своими машинами и водителями"
              onClick={() => setRegType("carrier_only")}
            />
            <RoleCard
              active={regType === "carrier_with_driver"}
              title="Я перевозчик и водитель"
              subtitle="Сам сяду за руль; одной анкетой"
              onClick={() => setRegType("carrier_with_driver")}
            />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Данные перевозчика</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название / ФИО *">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Field>
            <Field label="Тип">
              <Select value={carrierKind} onValueChange={(v) => setCarrierKind(v as typeof carrierKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIER_KINDS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ИНН">
              <Input value={inn} onChange={(e) => setInn(e.target.value)} />
            </Field>
            <Field label="Город">
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="Контактное лицо">
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </Field>
            <Field label="Способ оплаты комиссии">
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="— не выбрано —" />
                </SelectTrigger>
                <SelectContent>
                  {CARRIER_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {CARRIER_PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </section>

        {regType === "carrier_with_driver" ? (
          <section className="rounded-lg border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">Данные водителя</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ФИО водителя *">
                <Input
                  value={driverFullName}
                  onChange={(e) => setDriverFullName(e.target.value)}
                />
              </Field>
              <Field label="Телефон водителя *">
                <Input
                  inputMode="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                />
              </Field>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-medium">Согласие с комиссией</h2>
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agree-5"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(Boolean(v))}
              />
              <Label htmlFor="agree-5" className="text-sm leading-snug">
                {COMMISSION_TEXT}
              </Label>
            </div>
            <div className="mt-3">
              <Label className="text-sm">ФИО подтверждающего *</Label>
              <Input
                className="mt-1"
                value={agreedBy}
                onChange={(e) => setAgreedBy(e.target.value)}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            Уже есть учётная запись? Войти
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? "Регистрируем…" : "Зарегистрироваться"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="text-sm">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function RoleCard({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left shadow-sm transition ${
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary"
          : "bg-card hover:border-primary"
      }`}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
    </button>
  );
}
