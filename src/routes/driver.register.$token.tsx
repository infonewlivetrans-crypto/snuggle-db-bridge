import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/driver/register/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Регистрация водителя — Радиус Трек" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DriverRegisterPage,
});

type ResolveResp = {
  ok: boolean;
  reason?: string;
  carrier?: { id: string; company_name: string; city: string | null } | null;
  expires_at?: string | null;
};

function DriverRegisterPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<ResolveResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    city: "",
    license_number: "",
    comment: "",
    agreed: false,
    website: "", // honeypot
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/driver-invite/${token}`);
        const body = (await res.json()) as ResolveResp;
        setInfo(body);
      } catch {
        setInfo({ ok: false, reason: "network" });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim() || !form.email.trim() || !form.password) {
      toast.error("Заполните обязательные поля");
      return;
    }
    if (!form.agreed) {
      toast.error("Подтвердите согласие на обработку данных");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/public/driver-invite/${token}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        if (body.already_registered) {
          toast.info("Вы уже зарегистрированы. Войдите по своему email и паролю.");
          setTimeout(() => navigate({ to: "/" }), 1500);
          return;
        }
        toast.error(body.reason || `Ошибка ${res.status}`);
        return;
      }
      setDone(true);
      toast.success("Регистрация завершена");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!info?.ok) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <Card className="w-full">
          <CardContent className="space-y-2 py-8 text-center">
            <h1 className="text-lg font-semibold">Приглашение недействительно</h1>
            <p className="text-sm text-muted-foreground">
              {info?.reason === "expired"
                ? "Срок действия ссылки истёк. Попросите перевозчика создать новую."
                : info?.reason === "revoked"
                  ? "Ссылка отозвана перевозчиком."
                  : "Ссылка не найдена или повреждена."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <Card className="w-full">
          <CardContent className="space-y-2 py-8 text-center">
            <h1 className="text-lg font-semibold">Регистрация завершена</h1>
            <p className="text-sm text-muted-foreground">
              Войдите по своему email и паролю, чтобы открыть кабинет водителя.
            </p>
            <Button className="mt-3" onClick={() => navigate({ to: "/" })}>
              Перейти ко входу
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <CardTitle>Регистрация водителя</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Перевозчик:{" "}
            <span className="font-medium text-foreground">
              {info.carrier?.company_name ?? "—"}
            </span>
            {info.carrier?.city ? `, ${info.carrier.city}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Row label="ФИО *">
              <Input
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                maxLength={255}
                required
              />
            </Row>
            <Row label="Телефон *">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                maxLength={50}
                placeholder="+7 999 123-45-67"
                required
              />
            </Row>
            <Row label="Email *">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                maxLength={255}
                required
              />
            </Row>
            <Row label="Пароль *">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                minLength={8}
                maxLength={200}
                placeholder="Не менее 8 символов"
                required
              />
            </Row>
            <Row label="Город">
              <Input
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                maxLength={100}
              />
            </Row>
            <Row label="Водительское удостоверение">
              <Input
                value={form.license_number}
                onChange={(e) => setForm((p) => ({ ...p, license_number: e.target.value }))}
                maxLength={50}
              />
            </Row>
            <Row label="Комментарий">
              <Textarea
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                rows={3}
                maxLength={1000}
              />
            </Row>

            {/* honeypot */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              aria-hidden
            />

            <label className="flex cursor-pointer items-start gap-2 pt-1 text-sm">
              <Checkbox
                checked={form.agreed}
                onCheckedChange={(v) => setForm((p) => ({ ...p, agreed: Boolean(v) }))}
              />
              <span className="text-muted-foreground">
                Согласен на обработку персональных данных
              </span>
            </label>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Зарегистрироваться
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
