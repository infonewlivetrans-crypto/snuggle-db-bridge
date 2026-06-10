// Сборка текста заявки на перевозку (для копирования и отправки перевозчику).
// Никакой бизнес-логики, никаких внутренних UUID, без PDF/Word.

import {
  CARRIER_REQUEST_PAYMENT_TYPE_LABELS,
  CARRIER_REQUEST_STATUS_LABELS,
  type CarrierRequestPaymentType,
  type CarrierRequestStatus,
} from "@/lib/dispatcher/statuses";

export interface CarrierRequestPayload {
  request_number: string | null;
  cargo_name: string | null;
  loading_city: string | null;
  loading_address: string | null;
  loading_date: string | null;
  unloading_city: string | null;
  unloading_address: string | null;
  unloading_date: string | null;
  rate_amount: number | string | null;
  rate_currency: string | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;
  customer_name?: string | null;
  carrier_name?: string | null;
  driver_name?: string | null;
  vehicle_name?: string | null;
  dispatcher_comment?: string | null;
  terms_text?: string | null;
  request_status?: string | null;
}

const NA = "не указано";

function val(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  const s = String(v).trim();
  return s.length > 0 ? s : NA;
}

function joinLine(city: string | null, addr: string | null, date: string | null): string {
  const parts = [city, addr].map((x) => (x ? x.trim() : "")).filter(Boolean);
  const head = parts.join(", ");
  const d = date ? ` (${date})` : "";
  return (head || NA) + d;
}

function paymentLabel(t: string | null, delay: number | null): string {
  if (!t) return NA;
  const base = CARRIER_REQUEST_PAYMENT_TYPE_LABELS[t as CarrierRequestPaymentType] ?? t;
  if (t === "delayed" && delay != null) return `${base}, ${delay} дн.`;
  return base;
}

export function buildCarrierRequestMessage(p: CarrierRequestPayload): string {
  const currency = p.rate_currency ?? "RUB";
  const rate =
    p.rate_amount == null || p.rate_amount === ""
      ? NA
      : `${p.rate_amount} ${currency}`;
  const commissionPct =
    p.commission_percent == null || p.commission_percent === ""
      ? NA
      : `${p.commission_percent}%`;
  const commissionAmt =
    p.commission_amount == null || p.commission_amount === ""
      ? NA
      : `${p.commission_amount} ${currency}`;

  const route = `${val(p.loading_city)} → ${val(p.unloading_city)}`;

  const lines: string[] = [];
  lines.push("Заявка на перевозку");
  lines.push("");
  lines.push(`Номер заявки: ${val(p.request_number)}`);
  if (p.carrier_name) lines.push(`Перевозчик: ${val(p.carrier_name)}`);
  lines.push(`Груз: ${val(p.cargo_name)}`);
  lines.push(`Маршрут: ${route}`);
  lines.push(`Загрузка: ${joinLine(p.loading_city, p.loading_address, p.loading_date)}`);
  lines.push(`Выгрузка: ${joinLine(p.unloading_city, p.unloading_address, p.unloading_date)}`);
  lines.push(`Ставка: ${rate}`);
  lines.push(`Условия оплаты: ${paymentLabel(p.payment_type ?? null, p.payment_delay_days ?? null)}`);
  lines.push(`Водитель: ${val(p.driver_name ?? null)}`);
  lines.push(`Транспорт: ${val(p.vehicle_name ?? null)}`);
  if (p.dispatcher_comment) {
    lines.push(`Комментарий: ${p.dispatcher_comment}`);
  } else {
    lines.push(`Комментарий: ${NA}`);
  }
  lines.push("");
  lines.push("Подтверждение:");
  lines.push(
    p.terms_text ??
      "Перевозчик подтверждает выполнение перевозки на указанных условиях и обязуется соблюдать сроки, маршрут и требования по документам.",
  );
  lines.push("");
  lines.push("Комиссия диспетчера (внутреннее, не показывать заказчику):");
  lines.push(`Процент: ${commissionPct}`);
  lines.push(`Сумма: ${commissionAmt}`);
  lines.push(`Порядок оплаты комиссии: ${val(p.payment_type ? paymentLabel(p.payment_type, p.payment_delay_days ?? null) : null)}`);
  if (p.request_status) {
    lines.push("");
    lines.push(
      `Статус: ${CARRIER_REQUEST_STATUS_LABELS[p.request_status as CarrierRequestStatus] ?? p.request_status}`,
    );
  }
  return lines.join("\n");
}

/**
 * Простой номер заявки: CR-YYYYMMDD-XXXX, где XXXX — случайные hex символы.
 */
export function generateCarrierRequestNumber(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `CR-${y}${m}${d}-${rnd}`;
}
