import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CarrierUnifiedConsentBlock } from "@/components/contracts/CarrierUnifiedConsentBlock";
import { buildOfferPayload } from "@/lib/contracts/carrier-offer";

export const Route = createFileRoute("/dispatcher/register/$token")({
  // Страница полностью клиентская: грузит данные по токену через fetch в useEffect.
  // Отключаем SSR, чтобы исключить падение воркера на этом маршруте.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Регистрация — AI-диспетчер" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RegisterPage,
});

type EntityType = "carrier" | "driver" | "vehicle";
interface ResolveResp {
  ok: boolean;
  reason?: string;
  invite_type?: string;
  entity_type?: EntityType;
  entity_id?: string;
  expires_at?: string | null;
  entity?: Record<string, unknown>;
}

const COMMISSION_TEXT =
  "Я подтверждаю, что за рейсы, найденные диспетчером/сервисом, оплачиваю комиссию 5% после получения оплаты за перевозку.";

function RegisterPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ResolveResp | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [offerAcceptedBy, setOfferAcceptedBy] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/dispatcher-invite/${token}`);
        const body = (await res.json()) as ResolveResp;
        setInfo(body);
        if (body.ok && body.entity) setForm({ ...body.entity });
      } catch {
        setInfo({ ok: false, reason: "network" });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const entityType = info?.entity_type;

  const setField = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async (): Promise<boolean> => {
    if (!entityType) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/public/dispatcher-invite/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, data: form }),
      });
      const body = (await res.json()) as { ok: boolean; reason?: string };
      if (!body.ok) {
        toast.error(body.reason ?? "Ошибка сохранения");
        return false;
      }
      toast.success("Сохранено");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!(await save())) return;
    if (entityType === "carrier") {
      if (!agreed || !agreedBy.trim()) {
        toast.error("Подтвердите согласие и укажите ФИО");
        return;
      }
      if (!offerAccepted || !offerAcceptedBy.trim()) {
        toast.error("Необходимо принять договор-оферту и указать ФИО");
        return;
      }
    }
    setSaving(true);
    try {
      const phone = (form.phone as string) || "";
      const email = (form.email as string) || "";
      const body =
        entityType === "carrier"
          ? {
              agreed: true,
              agreed_by: agreedBy.trim(),
              agreement_text: COMMISSION_TEXT,
              offer_acceptance: buildOfferPayload({
                acceptedByName: offerAcceptedBy,
                acceptedByPhone: phone || undefined,
                acceptedByEmail: email || undefined,
                source: "dispatcher_register_token",
              }),
            }
          : {};
      const res = await fetch(`/api/public/dispatcher-invite/${token}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const resp = (await res.json()) as { ok: boolean; reason?: string };
      if (!resp.ok) {
        toast.error(resp.reason ?? "Не удалось завершить");
        return;
      }
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const get = (k: string) => (form[k] ?? "") as string | number;
  const arr = (k: string) =>
    (Array.isArray(form[k]) ? (form[k] as string[]) : []).join(", ");

  const reasonMsg = useMemo(() => {
    if (!info || info.ok) return null;
    switch (info.reason) {
      case "not_found":
        return "Ссылка не найдена";
      case "expired":
        return "Срок действия ссылки истёк";
      case "used":
        return "Ссылка уже использована";
      case "revoked":
        return "Ссылка отозвана";
      default:
        return "Ссылка недействительна";
    }
  }, [info]);

  if (loading) {
    return <Centered>Загрузка…</Centered>;
  }
  if (!info?.ok) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Ссылка недоступна</h1>
        <p className="mt-2 text-sm text-muted-foreground">{reasonMsg}</p>
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Спасибо!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Анкета отправлена диспетчеру. Закройте страницу — мы свяжемся с вами.
        </p>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">
            {entityType === "carrier"
              ? "Регистрация перевозчика"
              : entityType === "driver"
                ? "Регистрация водителя"
                : "Регистрация транспорта"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Проверьте и дополните данные. После завершения диспетчер свяжется с вами.
          </p>
        </header>

        {entityType === "carrier" && (
          <CarrierForm get={get} setField={setField} />
        )}
        {entityType === "driver" && <DriverForm get={get} setField={setField} />}
        {entityType === "vehicle" && (
          <VehicleForm get={get} arr={arr} setField={setField} />
        )}

        {entityType === "carrier" && (
          <section className="rounded-md border bg-card p-4 space-y-3">
            <h2 className="font-semibold">Согласие на комиссию 5%</h2>
            <p className="text-sm">{COMMISSION_TEXT}</p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} />
              <span>Я подтверждаю условия и согласен на комиссию 5%.</span>
            </label>
            <div>
              <Label>ФИО подтверждающего</Label>
              <Input
                value={agreedBy}
                onChange={(e) => setAgreedBy(e.target.value)}
                placeholder="Иванов Иван Иванович"
              />
            </div>
          </section>
        )}

        {entityType === "carrier" && (
          <CarrierOfferAcceptBlock
            accepted={offerAccepted}
            acceptedByName={offerAcceptedBy}
            onAcceptedChange={setOfferAccepted}
            onAcceptedByNameChange={setOfferAcceptedBy}
          />
        )}

        <section className="rounded-md border bg-card p-4">
          <h2 className="font-semibold">Документы</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Загрузка документов будет добавлена следующим этапом. Пока укажите комментарий, если нужно.
          </p>
          {entityType !== "carrier" && (
            <div className="mt-3">
              <Label>Комментарий по документам</Label>
              <Textarea
                value={(form.docs_comment as string) ?? ""}
                onChange={(e) => setField("docs_comment", e.target.value)}
                rows={3}
              />
            </div>
          )}
        </section>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={save} disabled={saving}>
            Сохранить черновик
          </Button>
          <Button onClick={complete} disabled={saving}>
            Завершить регистрацию
          </Button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}

interface FProps {
  get: (k: string) => string | number;
  setField: (k: string, v: unknown) => void;
}

function CarrierForm({ get, setField }: FProps) {
  return (
    <section className="rounded-md border bg-card p-4 space-y-4">
      <h2 className="font-semibold">Контакты и реквизиты</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Название / ФИО" k="name" get={get} setField={setField} />
        <Field label="Тип" k="carrier_kind" get={get} setField={setField} placeholder="individual_entrepreneur / llc / self_employed / individual" />
        <Field label="ИНН" k="inn" get={get} setField={setField} />
        <Field label="ОГРН / ОГРНИП" k="ogrn" get={get} setField={setField} />
        <Field label="Город" k="city" get={get} setField={setField} />
        <Field label="Телефон" k="phone" get={get} setField={setField} />
        <Field label="WhatsApp" k="whatsapp" get={get} setField={setField} />
        <Field label="Telegram" k="telegram" get={get} setField={setField} />
        <Field label="Max Messenger" k="max_messenger" get={get} setField={setField} />
        <Field label="Email" k="email" get={get} setField={setField} />
        <Field label="Банк" k="bank_name" get={get} setField={setField} />
        <Field label="Р/счёт" k="bank_account" get={get} setField={setField} />
        <Field label="БИК" k="bank_bik" get={get} setField={setField} />
        <Field label="Корр. счёт" k="bank_corr_account" get={get} setField={setField} />
        <Field label="Способ выплаты комиссии" k="commission_payment_method" get={get} setField={setField} />
      </div>
    </section>
  );
}

function DriverForm({ get, setField }: FProps) {
  return (
    <section className="rounded-md border bg-card p-4 space-y-4">
      <h2 className="font-semibold">Контакты</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="ФИО" k="full_name" get={get} setField={setField} />
        <Field label="Телефон" k="phone" get={get} setField={setField} />
        <Field label="WhatsApp" k="whatsapp" get={get} setField={setField} />
        <Field label="Telegram" k="telegram" get={get} setField={setField} />
        <Field label="Max Messenger" k="max_messenger" get={get} setField={setField} />
        <Field label="Email" k="email" get={get} setField={setField} />
        <Field label="Город" k="city" get={get} setField={setField} />
      </div>
    </section>
  );
}

function VehicleForm({
  get,
  arr,
  setField,
}: FProps & { arr: (k: string) => string }) {
  const setArr = (k: string, v: string) =>
    setField(
      k,
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  return (
    <section className="rounded-md border bg-card p-4 space-y-4">
      <h2 className="font-semibold">Машина и ставки</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Тип машины" k="vehicle_kind" get={get} setField={setField} />
        <Field label="Тип кузова" k="body_type" get={get} setField={setField} />
        <Field label="Грузоподъёмность, кг" k="payload_kg" get={get} setField={setField} type="number" />
        <Field label="Объём, м³" k="volume_m3" get={get} setField={setField} type="number" />
        <Field label="Длина, м" k="length_m" get={get} setField={setField} type="number" />
        <Field label="Ширина, м" k="width_m" get={get} setField={setField} type="number" />
        <Field label="Высота, м" k="height_m" get={get} setField={setField} type="number" />
        <div>
          <Label>Способы загрузки (через запятую)</Label>
          <Input value={arr("load_methods")} onChange={(e) => setArr("load_methods", e.target.value)} />
        </div>
        <Field label="Город нахождения" k="home_city" get={get} setField={setField} />
        <div>
          <Label>Куда готов ехать (через запятую)</Label>
          <Input value={arr("ready_to_cities")} onChange={(e) => setArr("ready_to_cities", e.target.value)} />
        </div>
        <Field label="Дата готовности" k="ready_date" get={get} setField={setField} type="date" />
        <Field label="Мин. ставка за рейс" k="minimum_trip_rate" get={get} setField={setField} type="number" />
        <Field label="Мин. ставка за км" k="minimum_km_rate" get={get} setField={setField} type="number" />
        <Field label="Ставка по городу" k="city_rate" get={get} setField={setField} type="number" />
        <Field label="Ставка за точку" k="point_rate" get={get} setField={setField} type="number" />
      </div>
      <div>
        <Label>Комментарий по ставке</Label>
        <Textarea
          value={(get("rate_comment") as string) ?? ""}
          onChange={(e) => setField("rate_comment", e.target.value)}
          rows={2}
        />
      </div>
    </section>
  );
}

function Field({
  label,
  k,
  get,
  setField,
  type,
  placeholder,
}: FProps & { label: string; k: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type ?? "text"}
        placeholder={placeholder}
        value={(get(k) as string | number) ?? ""}
        onChange={(e) =>
          setField(k, type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
        }
      />
    </div>
  );
}
