// /carrier/email-settings — подключение SMTP-почты для отправки данных грузовладельцу.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { apiGetAuth, apiPost, authHeaders } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/carrier/email-settings")({
  head: () => ({ meta: [{ title: "Почта для писем грузовладельцу — Радиус Трек" }] }),
  component: CarrierEmailSettingsPage,
});

interface AccountRow {
  id: string;
  email: string;
  from_name: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  ati_email: string | null;
  is_verified: boolean;
  is_active: boolean;
  last_test_at: string | null;
  last_error: string | null;
  has_password: boolean;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean;
  imap_user: string | null;
  has_imap_password: boolean;
}

interface FormState {
  email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string; // вводимое значение; не отправлять, если пусто и has_password=true
  ati_email: string;
  is_active: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  imap_password: string;
}

const EMPTY: FormState = {
  email: "",
  from_name: "",
  smtp_host: "",
  smtp_port: 465,
  smtp_secure: true,
  smtp_user: "",
  smtp_password: "",
  ati_email: "",
  is_active: true,
  imap_host: "",
  imap_port: 993,
  imap_secure: true,
  imap_user: "",
  imap_password: "",
};

const PRESETS: Array<{ label: string; host: string; port: number; secure: boolean }> = [
  { label: "Яндекс (yandex.ru) — 465 SSL", host: "smtp.yandex.ru", port: 465, secure: true },
  { label: "Mail.ru — 465 SSL", host: "smtp.mail.ru", port: 465, secure: true },
  { label: "Gmail — 465 SSL", host: "smtp.gmail.com", port: 465, secure: true },
  { label: "Свой SMTP (587 STARTTLS)", host: "", port: 587, secure: false },
];

function CarrierEmailSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "email-account"],
    queryFn: () => apiGetAuth<{ row: AccountRow | null }>("/api/carrier/email-account", 10000),
  });
  const account = data?.row ?? null;

  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (account) {
      setForm({
        email: account.email,
        from_name: account.from_name ?? "",
        smtp_host: account.smtp_host,
        smtp_port: account.smtp_port,
        smtp_secure: account.smtp_secure,
        smtp_user: account.smtp_user,
        smtp_password: "",
        ati_email: account.ati_email ?? "",
        is_active: account.is_active,
        imap_host: account.imap_host ?? "",
        imap_port: account.imap_port ?? 993,
        imap_secure: account.imap_secure ?? true,
        imap_user: account.imap_user ?? "",
        imap_password: "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        email: form.email.trim(),
        from_name: form.from_name.trim() || null,
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port) || 465,
        smtp_secure: form.smtp_secure,
        smtp_user: form.smtp_user.trim(),
        ati_email: form.ati_email.trim() || null,
        is_active: form.is_active,
        imap_host: form.imap_host.trim() || null,
        imap_port: Number(form.imap_port) || 993,
        imap_secure: form.imap_secure,
        imap_user: form.imap_user.trim() || null,
      };
      // Пароли шлём только если введены.
      if (form.smtp_password.length > 0) body.smtp_password = form.smtp_password;
      if (form.imap_password.length > 0) body.imap_password = form.imap_password;
      const r = await fetch("/api/carrier/email-account", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!r.ok || !j.ok) throw new Error(j.detail ?? j.error ?? "Не удалось сохранить");
      return j;
    },
    onSuccess: () => {
      toast.success("Настройки почты сохранены");
      setForm((f) => ({ ...f, smtp_password: "", imap_password: "" }));
      qc.invalidateQueries({ queryKey: ["carrier", "email-account"] });
    },
    onError: (e: unknown) =>
      toast.error("Проверьте IMAP host, логин или пароль", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const testMut = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; error?: string; messageId?: string }>(
        "/api/carrier/email-account/test",
        {},
      ),
    onSuccess: (r) => {
      if (r.ok) toast.success("Почта подключена", { description: "Тестовое письмо отправлено." });
      else toast.error("Не удалось подключиться", { description: r.error });
      qc.invalidateQueries({ queryKey: ["carrier", "email-account"] });
    },
    onError: (e: unknown) =>
      toast.error("Ошибка подключения", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  const status = !account
    ? { label: "Не подключена", variant: "secondary" as const, icon: Mail }
    : account.is_verified
      ? { label: "Подключена и проверена", variant: "default" as const, icon: CheckCircle2 }
      : account.last_error
        ? { label: "Ошибка подключения", variant: "destructive" as const, icon: AlertCircle }
        : { label: "Подключена, не проверена", variant: "secondary" as const, icon: KeyRound };

  return (
    <div className="space-y-4 pb-[env(safe-area-inset-bottom)]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>Почта для писем грузовладельцу</span>
            <Badge variant={status.variant} className="gap-1">
              <status.icon className="h-3 w-3" />
              {status.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Подключите ту же почту, через которую вы работаете с ATI и грузовладельцами.
            Когда диспетчер согласует рейс, данные перевозчика и водителя
            отправятся грузовладельцу <strong>с вашего email-адреса</strong>, чтобы он
            видел знакомого отправителя и мог сразу ответить вам.
            <div className="mt-1">
              Используйте <strong>пароль приложения / SMTP-пароль</strong> — не основной пароль от ящика.
              Для Яндекса: Настройки → Безопасность → Пароли приложений → SMTP.
            </div>
          </div>

          {account?.last_error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              Последняя ошибка: {account.last_error}
            </div>
          )}

          <div>
            <Label className="text-xs">Готовая конфигурация</Label>
            <Select
              onValueChange={(v) => {
                const p = PRESETS[Number(v)];
                if (!p) return;
                setForm((f) => ({
                  ...f,
                  smtp_host: p.host || f.smtp_host,
                  smtp_port: p.port,
                  smtp_secure: p.secure,
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Выберите провайдера" /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p, i) => (
                  <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Email отправителя"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="vasya@yandex.ru"
              type="email"
            />
            <Field
              label="Имя отправителя"
              value={form.from_name}
              onChange={(v) => setForm({ ...form, from_name: v })}
              placeholder="ИП Иванов В.В."
            />
            <Field
              label="SMTP-хост"
              value={form.smtp_host}
              onChange={(v) => setForm({ ...form, smtp_host: v })}
              placeholder="smtp.yandex.ru"
            />
            <Field
              label="SMTP-порт"
              value={String(form.smtp_port)}
              onChange={(v) => setForm({ ...form, smtp_port: Number(v) || 465 })}
              type="number"
            />
            <div className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2">
              <div>
                <div className="text-xs text-muted-foreground">Шифрование</div>
                <div className="font-medium">
                  {form.smtp_secure ? "SSL/TLS (465)" : "STARTTLS (587)"}
                </div>
              </div>
              <Switch
                checked={form.smtp_secure}
                onCheckedChange={(v) => setForm({ ...form, smtp_secure: v })}
              />
            </div>
            <Field
              label="SMTP-логин"
              value={form.smtp_user}
              onChange={(v) => setForm({ ...form, smtp_user: v })}
              placeholder="обычно совпадает с email"
            />
            <Field
              label={
                account?.has_password
                  ? "Новый SMTP-пароль (оставьте пустым — не менять)"
                  : "Пароль приложения / SMTP-пароль"
              }
              value={form.smtp_password}
              onChange={(v) => setForm({ ...form, smtp_password: v })}
              placeholder={account?.has_password ? "••••••••" : "16-значный код от приложения"}
              type="password"
            />
            <Field
              label="Email для ATI (необязательно)"
              value={form.ati_email}
              onChange={(v) => setForm({ ...form, ati_email: v })}
              placeholder="если ATI-кабинет на другом ящике"
            />
            <div className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2 sm:col-span-2">
              <div>
                <div className="font-medium">Использовать для отправки</div>
                <div className="text-xs text-muted-foreground">
                  Если выключено, диспетчер не будет отправлять грузовладельцам с вашей почты.
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
            <Button
              variant="outline"
              onClick={() => testMut.mutate()}
              disabled={!account || !account.has_password || testMut.isPending}
            >
              {testMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Проверить почту
            </Button>
          </div>

          {account?.last_test_at && (
            <div className="text-xs text-muted-foreground">
              Последняя проверка: {new Date(account.last_test_at).toLocaleString("ru-RU")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </div>
  );
}
