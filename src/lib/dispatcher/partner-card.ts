// Сборка текста карточки партнёра/экипажа для отправки заказчику.
// Используется и на сервере (preview API), и на клиенте (для отображения).
// Никакой бизнес-логики, никаких внутренних полей (комиссия, user_id, UUID).

import {
  CARRIER_KIND_LABELS,
  CARRIER_TAX_REGIME_LABELS,
  CARRIER_STATUS_LABELS,
  DRIVER_STATUS_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_BODY_TYPE_LABELS,
  LOAD_METHOD_LABELS,
  DEAL_STATUS_LABELS,
  type CarrierKind,
  type CarrierTaxRegime,
  type CarrierStatus,
  type DriverStatus,
  type VehicleStatus,
  type VehicleBodyType,
  type LoadMethod,
  type DealStatus,
} from "@/lib/dispatcher/statuses";

export interface PartnerCardCarrier {
  id: string;
  name: string | null;
  carrier_kind: string | null;
  inn: string | null;
  ogrn: string | null;
  tax_regime: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  ati_id: string | null;
  whatsapp: string | null;
  telegram: string | null;
  max_messenger: string | null;
  bank_name: string | null;
  bank_bik: string | null;
  bank_account: string | null;
  bank_corr_account: string | null;
  verification_status: string | null;
  commission_agreed: boolean | null;
}

export interface PartnerCardDriver {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  dispatcher_status: string | null;
  docs_verified: boolean | null;
}

export interface PartnerCardVehicle {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | string | null;
  volume_m3: number | string | null;
  length_m: number | string | null;
  width_m: number | string | null;
  height_m: number | string | null;
  load_methods: string[] | null;
  home_city: string | null;
  dispatcher_status: string | null;
}

export interface PartnerCardDoc {
  owner_type: "carrier" | "driver" | "vehicle";
  title: string | null;
  document_type: string | null;
  document_status: string | null;
}

export interface PartnerCardDeal {
  id: string;
  deal_number: string | null;
  deal_status: string | null;
  route_from: string | null;
  route_to: string | null;
  total_rate: number | string | null;
}

export interface PartnerCardPayload {
  carrier: PartnerCardCarrier | null;
  driver: PartnerCardDriver | null;
  vehicle: PartnerCardVehicle | null;
  deal: PartnerCardDeal | null;
  documents: PartnerCardDoc[];
  dispatcher_comment?: string | null;
}

const NA = "не указано";

function val(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  const s = String(v).trim();
  return s.length > 0 ? s : NA;
}

function carrierKindLabel(v: string | null): string {
  if (!v) return NA;
  return CARRIER_KIND_LABELS[v as CarrierKind] ?? v;
}
function taxRegimeLabel(v: string | null): string {
  if (!v) return NA;
  return CARRIER_TAX_REGIME_LABELS[v as CarrierTaxRegime] ?? v;
}
function carrierStatusLabel(v: string | null): string {
  if (!v) return NA;
  return CARRIER_STATUS_LABELS[v as CarrierStatus] ?? v;
}
function driverStatusLabel(v: string | null): string {
  if (!v) return NA;
  return DRIVER_STATUS_LABELS[v as DriverStatus] ?? v;
}
function vehicleStatusLabel(v: string | null): string {
  if (!v) return NA;
  return VEHICLE_STATUS_LABELS[v as VehicleStatus] ?? v;
}
function bodyTypeLabel(v: string | null): string {
  if (!v) return NA;
  return VEHICLE_BODY_TYPE_LABELS[v as VehicleBodyType] ?? v;
}
function dealStatusLabel(v: string | null): string {
  if (!v) return NA;
  return DEAL_STATUS_LABELS[v as DealStatus] ?? v;
}

function docStatusLabel(s: string | null): string {
  switch (s) {
    case "approved":
      return "принят";
    case "checking":
      return "на проверке";
    case "uploaded":
      return "загружен";
    case "rejected":
      return "отклонён";
    case "expired":
      return "просрочен";
    case "archived":
      return "архив";
    default:
      return s ?? NA;
  }
}

export function buildPartnerCardSubject(p: PartnerCardPayload): string {
  const name = p.carrier?.name?.trim();
  return name ? `Карточка перевозчика: ${name}` : "Карточка перевозчика";
}

export function buildPartnerCardMessage(p: PartnerCardPayload): string {
  const c = p.carrier;
  const d = p.driver;
  const v = p.vehicle;
  const deal = p.deal;
  const docsCarrier = p.documents.filter((x) => x.owner_type === "carrier");
  const docsDriver = p.documents.filter((x) => x.owner_type === "driver");
  const docsVehicle = p.documents.filter((x) => x.owner_type === "vehicle");

  const messengers = [
    c?.max_messenger ? `Max: ${c.max_messenger}` : null,
    c?.telegram ? `Telegram: ${c.telegram}` : null,
    c?.whatsapp ? `WhatsApp: ${c.whatsapp}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const lines: string[] = [];
  lines.push("Карточка партнёра для согласования перевозки");
  lines.push("");
  lines.push("Перевозчик:");
  lines.push(`Название: ${val(c?.name ?? null)}`);
  lines.push(`Тип: ${carrierKindLabel(c?.carrier_kind ?? null)}`);
  lines.push(`ИНН: ${val(c?.inn ?? null)}`);
  lines.push(`ОГРН: ${val(c?.ogrn ?? null)}`);
  lines.push(`Налоговый режим: ${taxRegimeLabel(c?.tax_regime ?? null)}`);
  lines.push(`Город: ${val(c?.city ?? null)}`);
  lines.push(`Телефон: ${val(c?.phone ?? null)}`);
  lines.push(`Email: ${val(c?.email ?? null)}`);
  lines.push(`ATI ID: ${val(c?.ati_id ?? null)}`);
  lines.push(`Мессенджеры: ${messengers || NA}`);
  lines.push(`Статус: ${carrierStatusLabel(c?.verification_status ?? null)}`);
  lines.push("");
  lines.push("Реквизиты:");
  lines.push(`Банк: ${val(c?.bank_name ?? null)}`);
  lines.push(`БИК: ${val(c?.bank_bik ?? null)}`);
  lines.push(`Расчётный счёт: ${val(c?.bank_account ?? null)}`);
  lines.push(`Корр. счёт: ${val(c?.bank_corr_account ?? null)}`);
  lines.push("");
  lines.push("Документы перевозчика:");
  if (docsCarrier.length === 0) lines.push(`- ${NA}`);
  else for (const x of docsCarrier) lines.push(`- ${val(x.title)} — ${docStatusLabel(x.document_status)}`);
  lines.push("");

  if (d) {
    lines.push("Водитель:");
    lines.push(`ФИО: ${val(d.full_name)}`);
    lines.push(`Телефон: ${val(d.phone)}`);
    lines.push(`Город: ${val(d.city)}`);
    lines.push(`Статус: ${driverStatusLabel(d.dispatcher_status)}`);
    lines.push(`Документы проверены: ${d.docs_verified ? "да" : "нет"}`);
    lines.push("");
    lines.push("Документы водителя:");
    if (docsDriver.length === 0) lines.push(`- ${NA}`);
    else for (const x of docsDriver) lines.push(`- ${val(x.title)} — ${docStatusLabel(x.document_status)}`);
    lines.push("");
  }

  if (v) {
    const dims = [v.length_m, v.width_m, v.height_m]
      .map((n) => (n == null || n === "" ? null : String(n)))
      .filter(Boolean)
      .join(" × ");
    const loads = (v.load_methods ?? [])
      .map((m) => LOAD_METHOD_LABELS[m as LoadMethod] ?? m)
      .join(", ");
    lines.push("Транспорт:");
    lines.push(`Тип: ${val(v.vehicle_kind)}`);
    lines.push(`Кузов: ${bodyTypeLabel(v.body_type)}`);
    lines.push(`Марка/модель: ${val(v.vehicle_kind)}`);
    lines.push(`Грузоподъёмность, кг: ${val(v.payload_kg)}`);
    lines.push(`Объём, м³: ${val(v.volume_m3)}`);
    lines.push(`Габариты, м: ${dims || NA}`);
    lines.push(`Загрузка: ${loads || NA}`);
    lines.push(`Город нахождения: ${val(v.home_city)}`);
    lines.push(`Статус: ${vehicleStatusLabel(v.dispatcher_status)}`);
    lines.push("");
    lines.push("Документы транспорта:");
    if (docsVehicle.length === 0) lines.push(`- ${NA}`);
    else for (const x of docsVehicle) lines.push(`- ${val(x.title)} — ${docStatusLabel(x.document_status)}`);
    lines.push("");
  }

  if (deal) {
    lines.push("Сделка/рейс:");
    lines.push(`Номер: ${val(deal.deal_number)}`);
    lines.push(`Статус: ${dealStatusLabel(deal.deal_status)}`);
    lines.push(`Маршрут: ${val(deal.route_from)} → ${val(deal.route_to)}`);
    lines.push(`Ставка: ${val(deal.total_rate)}`);
    lines.push("");
  }

  lines.push("Комментарий диспетчера:");
  lines.push(val(p.dispatcher_comment ?? null));
  return lines.join("\n");
}
