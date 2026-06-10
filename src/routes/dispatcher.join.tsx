import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CarrierUnifiedConsentBlock } from "@/components/contracts/CarrierUnifiedConsentBlock";
import { buildOfferPayload } from "@/lib/contracts/carrier-offer";

// Публичная общая регистрация в AI-диспетчере.
// Страница полностью клиентская, без SSR — чтобы не упасть на воркере.

export const Route = createFileRoute("/dispatcher/join")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Регистрация в AI-диспетчере" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Заполните анкету перевозчика, водителя или транспорта, чтобы диспетчер мог подбирать вам грузы и догрузы.",
      },
    ],
  }),
  component: JoinPage,
});

type RegType = "carrier" | "driver" | "driver_with_vehicle" | "carrier_full";

const COMMISSION_TEXT =
  "Я подтверждаю, что за рейсы, найденные диспетчером/сервисом, оплачиваю комиссию 5% после получения оплаты за перевозку.";

const CARRIER_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "ip", label: "ИП" },
  { value: "ooo", label: "ООО" },
  { value: "self_employed", label: "Самозанятый" },
  { value: "individual", label: "Физлицо" },
];

const ROLE_OPTIONS: { value: RegType; title: string; subtitle: string }[] = [
  {
    value: "carrier",
    title: "Я перевозчик",
    subtitle: "Компания/ИП/самозанятый с парком машин",
  },
  {
    value: "driver",
    title: "Я водитель",
    subtitle: "Работаю по найму или ищу заказы",
  },
  {
    value: "driver_with_vehicle",
    title: "Я водитель со своей машиной",
    subtitle: "Сам себе перевозчик на одной машине",
  },
  {
    value: "carrier_full",
    title: "Перевозчик с машиной и водителем",
    subtitle: "Сразу заполняю всё одной анкетой",
  },
];

type CarrierForm = {
  name: string;
  carrier_kind: string;
  inn: string;
  ogrn: string;
  city: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  max_messenger: string;
  email: string;
  bank_name: string;
  bank_account: string;
  bank_bik: string;
  bank_corr_account: string;
  commission_payment_method: string;
};
type DriverForm = {
  full_name: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  max_messenger: string;
  email: string;
  city: string;
  dispatcher_comment: string;
};
type VehicleForm = {
  vehicle_kind: string;
  body_type: string;
  payload_kg: string;
  volume_m3: string;
  length_m: string;
  width_m: string;
  height_m: string;
  load_methods: string;
  home_city: string;
  ready_to_cities: string;
  ready_date: string;
  minimum_trip_rate: string;
  minimum_km_rate: string;
  city_rate: string;
  point_rate: string;
  rate_comment: string;
};

const emptyCarrier: CarrierForm = {
  name: "",
  carrier_kind: "individual",
  inn: "",
  ogrn: "",
  city: "",
  phone: "",
  whatsapp: "",
  telegram: "",
  max_messenger: "",
  email: "",
  bank_name: "",
  bank_account: "",
  bank_bik: "",
  bank_corr_account: "",
  commission_payment_method: "",
};
const emptyDriver: DriverForm = {
  full_name: "",
  phone: "",
  whatsapp: "",
  telegram: "",
  max_messenger: "",
  email: "",
  city: "",
  dispatcher_comment: "",
};
const emptyVehicle: VehicleForm = {
  vehicle_kind: "",
  body_type: "",
  payload_kg: "",
  volume_m3: "",
  length_m: "",
  width_m: "",
  height_m: "",
  load_methods: "",
  home_city: "",
  ready_to_cities: "",
  ready_date: "",
  minimum_trip_rate: "",
  minimum_km_rate: "",
  city_rate: "",
  point_rate: "",
  rate_comment: "",
};

function splitList(value: string): string[] | null {
  const arr = value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

function JoinPage() {
  const [regType, setRegType] = useState<RegType | null>(null);
  const [carrier, setCarrier] = useState<CarrierForm>(emptyCarrier);
  const [driver, setDriver] = useState<DriverForm>(emptyDriver);
  const [vehicle, setVehicle] = useState<VehicleForm>(emptyVehicle);
  const [honeypot, setHoneypot] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [offerAcceptedBy, setOfferAcceptedBy] = useState("");

  const needsCarrier = regType === "carrier" || regType === "carrier_full";
  const needsDriver =
    regType === "driver" ||
    regType === "driver_with_vehicle" ||
    regType === "carrier_full";
  const needsVehicle =
    regType === "driver_with_vehicle" || regType === "carrier_full";

  const submit = async () => {
    if (!regType) return;
    if (needsCarrier) {
      if (!carrier.name.trim()) return toast.error("Укажите название перевозчика");
      if (!carrier.phone.trim()) return toast.error("Укажите телефон перевозчика");
      if (!agreed || !agreedBy.trim())
        return toast.error("Подтвердите согласие на комиссию 5% и укажите ФИО");
      if (!offerAccepted || !offerAcceptedBy.trim())
        return toast.error("Необходимо принять договор-оферту и указать ФИО");
    }
    if (needsDriver) {
      if (!driver.full_name.trim()) return toast.error("Укажите ФИО водителя");
      if (!driver.phone.trim()) return toast.error("Укажите телефон водителя");
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        registration_type: regType,
        website: honeypot, // honeypot
      };
      if (needsCarrier) payload.carrier = carrier;
      if (needsDriver) payload.driver = driver;
      if (needsVehicle) {
        payload.vehicle = {
          ...vehicle,
          load_methods: splitList(vehicle.load_methods),
          ready_to_cities: splitList(vehicle.ready_to_cities),
        };
      }
      if (needsCarrier) {
        payload.agreement = {
          agreed,
          agreed_by: agreedBy.trim(),
          agreement_text: COMMISSION_TEXT,
        };
        payload.offer_acceptance = buildOfferPayload({
          acceptedByName: offerAcceptedBy,
          acceptedByPhone: carrier.phone || undefined,
          acceptedByEmail: carrier.email || undefined,
          source: "dispatcher_join",
        });
      }




const res = await fetch("/api/public/dispatcher-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; reason?: string };
      if (!body.ok) {
        toast.error(body.reason ?? "Ошибка отправки");
        return;
      }
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Сетевая ошибка");
    } finally {
      setSaving(false);
    }
  };

  const title = useMemo(() => {
    if (!regType) return "Регистрация в AI-диспетчере";
    return ROLE_OPTIONS.find((r) => r.value === regType)?.title ?? "Регистрация";
  }, [regType]);

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <h1 className="mb-3 text-2xl font-semibold">Анкета отправлена диспетчеру</h1>
          <p className="text-muted-foreground">
            Диспетчер проверит ваши данные и свяжется с вами. Контакт — по WhatsApp,
            Telegram, Max или телефону, который вы указали.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Заполните анкету, чтобы диспетчер мог подбирать вам грузы и догрузы.
          Комиссия сервиса — 5% только после получения оплаты за рейс.
        </p>
      </div>

      {!regType ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRegType(r.value)}
              className="rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow"
            >
              <div className="font-medium">{r.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{r.subtitle}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => setRegType(null)}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            ← Выбрать другую роль
          </button>

          {/* Honeypot — скрытое поле */}
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

          {needsCarrier && (
            <section className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-medium">Данные перевозчика</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Название / ФИО *">
                  <Input
                    value={carrier.name}
                    onChange={(e) => setCarrier({ ...carrier, name: e.target.value })}
                  />
                </Field>
                <Field label="Тип">
                  <Select
                    value={carrier.carrier_kind}
                    onValueChange={(v) => setCarrier({ ...carrier, carrier_kind: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIER_KIND_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="ИНН">
                  <Input
                    value={carrier.inn}
                    onChange={(e) => setCarrier({ ...carrier, inn: e.target.value })}
                  />
                </Field>
                <Field label="ОГРН / ОГРНИП">
                  <Input
                    value={carrier.ogrn}
                    onChange={(e) => setCarrier({ ...carrier, ogrn: e.target.value })}
                  />
                </Field>
                <Field label="Город">
                  <Input
                    value={carrier.city}
                    onChange={(e) => setCarrier({ ...carrier, city: e.target.value })}
                  />
                </Field>
                <Field label="Телефон *">
                  <Input
                    value={carrier.phone}
                    onChange={(e) => setCarrier({ ...carrier, phone: e.target.value })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <Input
                    value={carrier.whatsapp}
                    onChange={(e) =>
                      setCarrier({ ...carrier, whatsapp: e.target.value })
                    }
                  />
                </Field>
                <Field label="Telegram">
                  <Input
                    value={carrier.telegram}
                    onChange={(e) =>
                      setCarrier({ ...carrier, telegram: e.target.value })
                    }
                  />
                </Field>
                <Field label="Max Messenger">
                  <Input
                    value={carrier.max_messenger}
                    onChange={(e) =>
                      setCarrier({ ...carrier, max_messenger: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={carrier.email}
                    onChange={(e) =>
                      setCarrier({ ...carrier, email: e.target.value })
                    }
                  />
                </Field>
                <Field label="Банк">
                  <Input
                    value={carrier.bank_name}
                    onChange={(e) =>
                      setCarrier({ ...carrier, bank_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Расчётный счёт">
                  <Input
                    value={carrier.bank_account}
                    onChange={(e) =>
                      setCarrier({ ...carrier, bank_account: e.target.value })
                    }
                  />
                </Field>
                <Field label="БИК">
                  <Input
                    value={carrier.bank_bik}
                    onChange={(e) =>
                      setCarrier({ ...carrier, bank_bik: e.target.value })
                    }
                  />
                </Field>
                <Field label="Корр. счёт">
                  <Input
                    value={carrier.bank_corr_account}
                    onChange={(e) =>
                      setCarrier({ ...carrier, bank_corr_account: e.target.value })
                    }
                  />
                </Field>
                <Field label="Способ оплаты комиссии диспетчеру" full>
                  <Input
                    placeholder="например, на карту / на расчётный счёт"
                    value={carrier.commission_payment_method}
                    onChange={(e) =>
                      setCarrier({
                        ...carrier,
                        commission_payment_method: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <div className="mt-5 rounded-md border bg-muted/40 p-4">
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

              <div className="mt-4">
                <CarrierOfferAcceptBlock
                  accepted={offerAccepted}
                  acceptedByName={offerAcceptedBy}
                  onAcceptedChange={setOfferAccepted}
                  onAcceptedByNameChange={setOfferAcceptedBy}
                />
              </div>
            </section>
          )}

          {needsDriver && (
            <section className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-medium">Данные водителя</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ФИО *">
                  <Input
                    value={driver.full_name}
                    onChange={(e) =>
                      setDriver({ ...driver, full_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Телефон *">
                  <Input
                    value={driver.phone}
                    onChange={(e) => setDriver({ ...driver, phone: e.target.value })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <Input
                    value={driver.whatsapp}
                    onChange={(e) =>
                      setDriver({ ...driver, whatsapp: e.target.value })
                    }
                  />
                </Field>
                <Field label="Telegram">
                  <Input
                    value={driver.telegram}
                    onChange={(e) =>
                      setDriver({ ...driver, telegram: e.target.value })
                    }
                  />
                </Field>
                <Field label="Max Messenger">
                  <Input
                    value={driver.max_messenger}
                    onChange={(e) =>
                      setDriver({ ...driver, max_messenger: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={driver.email}
                    onChange={(e) => setDriver({ ...driver, email: e.target.value })}
                  />
                </Field>
                <Field label="Город">
                  <Input
                    value={driver.city}
                    onChange={(e) => setDriver({ ...driver, city: e.target.value })}
                  />
                </Field>
                <Field label="Комментарий" full>
                  <Textarea
                    rows={2}
                    value={driver.dispatcher_comment}
                    onChange={(e) =>
                      setDriver({ ...driver, dispatcher_comment: e.target.value })
                    }
                  />
                </Field>
              </div>
            </section>
          )}

          {needsVehicle && (
            <section className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-medium">Данные транспорта</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Тип машины">
                  <Input
                    value={vehicle.vehicle_kind}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, vehicle_kind: e.target.value })
                    }
                  />
                </Field>
                <Field label="Тип кузова">
                  <Input
                    value={vehicle.body_type}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, body_type: e.target.value })
                    }
                  />
                </Field>
                <Field label="Грузоподъёмность, кг">
                  <Input
                    inputMode="decimal"
                    value={vehicle.payload_kg}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, payload_kg: e.target.value })
                    }
                  />
                </Field>
                <Field label="Объём, м³">
                  <Input
                    inputMode="decimal"
                    value={vehicle.volume_m3}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, volume_m3: e.target.value })
                    }
                  />
                </Field>
                <Field label="Длина, м">
                  <Input
                    inputMode="decimal"
                    value={vehicle.length_m}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, length_m: e.target.value })
                    }
                  />
                </Field>
                <Field label="Ширина, м">
                  <Input
                    inputMode="decimal"
                    value={vehicle.width_m}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, width_m: e.target.value })
                    }
                  />
                </Field>
                <Field label="Высота, м">
                  <Input
                    inputMode="decimal"
                    value={vehicle.height_m}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, height_m: e.target.value })
                    }
                  />
                </Field>
                <Field label="Способы загрузки (через запятую)" full>
                  <Input
                    value={vehicle.load_methods}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, load_methods: e.target.value })
                    }
                    placeholder="задняя, боковая, верхняя"
                  />
                </Field>
                <Field label="Город нахождения">
                  <Input
                    value={vehicle.home_city}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, home_city: e.target.value })
                    }
                  />
                </Field>
                <Field label="Куда готов ехать (через запятую)">
                  <Input
                    value={vehicle.ready_to_cities}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, ready_to_cities: e.target.value })
                    }
                  />
                </Field>
                <Field label="Дата готовности">
                  <Input
                    type="date"
                    value={vehicle.ready_date}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, ready_date: e.target.value })
                    }
                  />
                </Field>
                <Field label="Мин. ставка за рейс">
                  <Input
                    inputMode="decimal"
                    value={vehicle.minimum_trip_rate}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, minimum_trip_rate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Мин. ставка за км">
                  <Input
                    inputMode="decimal"
                    value={vehicle.minimum_km_rate}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, minimum_km_rate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Ставка по городу">
                  <Input
                    inputMode="decimal"
                    value={vehicle.city_rate}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, city_rate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Ставка за точку">
                  <Input
                    inputMode="decimal"
                    value={vehicle.point_rate}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, point_rate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Комментарий по ставке" full>
                  <Textarea
                    rows={2}
                    value={vehicle.rate_comment}
                    onChange={(e) =>
                      setVehicle({ ...vehicle, rate_comment: e.target.value })
                    }
                  />
                </Field>
              </div>
            </section>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setRegType(null)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Отправляем…" : "Отправить анкету диспетчеру"}
            </Button>
          </div>
        </div>
      )}
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
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label className="text-sm">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
