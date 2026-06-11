// Сборка текста "Данные перевозчика по заявке" для отправки заказчику.
// Без внутренних полей: комиссии, выплат, UUID, внутренних статусов.

import {
  VEHICLE_BODY_TYPE_LABELS,
  type VehicleBodyType,
} from "@/lib/dispatcher/statuses";

export interface CustomerCardFreight {
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  cargo_name: string | null;
  title: string | null;
  weight_kg: number | string | null;
  volume_m3: number | string | null;
  customer_name: string | null;
}
export interface CustomerCardCarrier {
  name: string | null;
  inn: string | null;
  phone: string | null;
  email: string | null;
  ati_id: string | null;
}
export interface CustomerCardDriver {
  full_name: string | null;
  phone: string | null;
}
export interface CustomerCardVehicle {
  vehicle_kind: string | null;
  body_type: string | null;
  plate: string | null;
  payload_kg: number | string | null;
  volume_m3: number | string | null;
}
export interface CustomerCardPayload {
  freight: CustomerCardFreight;
  carrier: CustomerCardCarrier | null;
  driver: CustomerCardDriver | null;
  vehicle: CustomerCardVehicle | null;
  dispatcher_comment: string | null;
}

const NA = "не указано";

function val(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  const s = String(v).trim();
  return s.length > 0 ? s : NA;
}

function bodyTypeLabel(v: string | null): string {
  if (!v) return NA;
  return VEHICLE_BODY_TYPE_LABELS[v as VehicleBodyType] ?? v;
}

export function buildCustomerCardSubject(p: CustomerCardPayload): string {
  const from = p.freight.loading_city?.trim();
  const to = p.freight.unloading_city?.trim();
  const route = [from, to].filter(Boolean).join(" → ");
  return route
    ? `Данные перевозчика по заявке: ${route}`
    : "Данные перевозчика по заявке";
}

export function buildCustomerCardMessage(p: CustomerCardPayload): string {
  const f = p.freight;
  const c = p.carrier;
  const d = p.driver;
  const v = p.vehicle;

  const route = [f.loading_city, f.unloading_city]
    .map((x) => (x && x.trim() ? x.trim() : null))
    .filter(Boolean)
    .join(" → ");

  const lines: string[] = [];
  lines.push("Добрый день.");
  lines.push("");
  lines.push("Направляем данные перевозчика по перевозке:");
  lines.push("");
  lines.push(`Маршрут: ${route || NA}`);
  lines.push(`Груз: ${val(f.cargo_name ?? f.title ?? null)}`);
  lines.push(`Дата загрузки: ${val(f.loading_date)}`);
  lines.push(`Дата выгрузки: ${val(f.unloading_date)}`);
  if (f.weight_kg != null && String(f.weight_kg).trim() !== "") {
    lines.push(`Вес, кг: ${val(f.weight_kg)}`);
  }
  if (f.volume_m3 != null && String(f.volume_m3).trim() !== "") {
    lines.push(`Объём, м³: ${val(f.volume_m3)}`);
  }
  lines.push("");
  lines.push("Перевозчик:");
  lines.push(`Название: ${val(c?.name ?? null)}`);
  lines.push(`ИНН: ${val(c?.inn ?? null)}`);
  lines.push(`Телефон: ${val(c?.phone ?? null)}`);
  lines.push(`Email: ${val(c?.email ?? null)}`);
  lines.push(`ATI: ${val(c?.ati_id ?? null)}`);
  lines.push("");
  lines.push("Водитель:");
  lines.push(`ФИО: ${val(d?.full_name ?? null)}`);
  lines.push(`Телефон: ${val(d?.phone ?? null)}`);
  lines.push("");
  lines.push("Транспорт:");
  lines.push(`Тип: ${val(v?.vehicle_kind ?? null)}`);
  lines.push(`Кузов: ${bodyTypeLabel(v?.body_type ?? null)}`);
  lines.push(`Госномер: ${val(v?.plate ?? null)}`);
  lines.push(`Грузоподъёмность, кг: ${val(v?.payload_kg ?? null)}`);
  lines.push(`Объём, м³: ${val(v?.volume_m3 ?? null)}`);
  lines.push("");
  lines.push("Комментарий диспетчера:");
  lines.push(val(p.dispatcher_comment));
  return lines.join("\n");
}
