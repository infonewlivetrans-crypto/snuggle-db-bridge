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

export interface CarrierRequestContractPayload extends CarrierRequestPayload {
  request_created_at?: string | null;
  carrier_inn?: string | null;
  carrier_ogrn?: string | null;
  carrier_tax_regime?: string | null;
  carrier_phone?: string | null;
  carrier_email?: string | null;
  carrier_ati?: string | null;
  driver_phone?: string | null;
  vehicle_plate?: string | null;
  vehicle_kind?: string | null;
  vehicle_body_type?: string | null;
  vehicle_payload_kg?: number | string | null;
  vehicle_volume_m3?: number | string | null;
  carrier_responded_by?: string | null;
  carrier_responded_at?: string | null;
  /** Если true — не показывать комиссию (вариант для заказчика). */
  hide_commission?: boolean;
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

const TAX_REGIME_LABELS: Record<string, string> = {
  osn: "ОСН",
  usn_income: "УСН (доходы)",
  usn_income_minus: "УСН (доходы минус расходы)",
  patent: "Патент",
  npd: "НПД (самозанятый)",
  esn: "ЕСХН",
};

function fmtMoney(v: number | string | null | undefined, currency: string): string {
  if (v === null || v === undefined || v === "") return NA;
  return `${v} ${currency}`;
}

function fmtNum(v: number | string | null | undefined, suffix: string): string {
  if (v === null || v === undefined || v === "") return NA;
  return `${v} ${suffix}`;
}

/**
 * Текст «Заявка-договор на перевозку» для копирования/печати.
 * Никакого PDF/Word, только plain-text. UUID и внутренние поля не показываются.
 */
export function buildCarrierRequestContractText(
  p: CarrierRequestContractPayload,
): string {
  const currency = p.rate_currency ?? "RUB";
  const lines: string[] = [];

  lines.push("ЗАЯВКА-ДОГОВОР НА ПЕРЕВОЗКУ");
  lines.push("");
  lines.push(`Номер заявки: ${val(p.request_number)}`);
  lines.push(`Дата: ${val(p.request_created_at)}`);
  lines.push("");

  lines.push("Перевозчик:");
  lines.push(`  Наименование: ${val(p.carrier_name ?? null)}`);
  lines.push(`  ИНН: ${val(p.carrier_inn ?? null)}`);
  lines.push(`  ОГРН/ОГРНИП: ${val(p.carrier_ogrn ?? null)}`);
  lines.push(
    `  Налоговый режим: ${
      p.carrier_tax_regime
        ? TAX_REGIME_LABELS[p.carrier_tax_regime] ?? p.carrier_tax_regime
        : NA
    }`,
  );
  lines.push(`  Телефон: ${val(p.carrier_phone ?? null)}`);
  lines.push(`  Email: ${val(p.carrier_email ?? null)}`);
  lines.push(`  ATI: ${val(p.carrier_ati ?? null)}`);
  lines.push("");

  lines.push("Водитель:");
  lines.push(`  ФИО: ${val(p.driver_name ?? null)}`);
  lines.push(`  Телефон: ${val(p.driver_phone ?? null)}`);
  lines.push("");

  lines.push("Транспорт:");
  lines.push(`  Госномер: ${val(p.vehicle_plate ?? null)}`);
  lines.push(`  Тип: ${val(p.vehicle_kind ?? null)}`);
  lines.push(`  Кузов: ${val(p.vehicle_body_type ?? null)}`);
  lines.push(`  Грузоподъёмность: ${fmtNum(p.vehicle_payload_kg ?? null, "кг")}`);
  lines.push(`  Объём: ${fmtNum(p.vehicle_volume_m3 ?? null, "м³")}`);
  lines.push("");

  lines.push(`Груз: ${val(p.cargo_name)}`);
  lines.push(
    `Маршрут: ${val(p.loading_city)} → ${val(p.unloading_city)}`,
  );
  lines.push(`Адрес загрузки: ${val(p.loading_address)}`);
  lines.push(`Дата загрузки: ${val(p.loading_date)}`);
  lines.push(`Адрес выгрузки: ${val(p.unloading_address)}`);
  lines.push(`Дата выгрузки: ${val(p.unloading_date)}`);
  lines.push("");

  lines.push(`Ставка: ${fmtMoney(p.rate_amount, currency)}`);
  lines.push(
    `Условия оплаты: ${paymentLabel(p.payment_type ?? null, p.payment_delay_days ?? null)}`,
  );
  lines.push(
    `Отсрочка: ${
      p.payment_delay_days != null ? `${p.payment_delay_days} дн.` : NA
    }`,
  );

  if (!p.hide_commission) {
    const pct =
      p.commission_percent == null || p.commission_percent === ""
        ? NA
        : `${p.commission_percent}%`;
    const amt = fmtMoney(p.commission_amount, currency);
    lines.push(`Комиссия диспетчера: ${amt} (${pct})`);
  }

  lines.push(`Комментарий диспетчера: ${val(p.dispatcher_comment ?? null)}`);
  lines.push("");
  lines.push("Подтверждение перевозчика:");
  lines.push(
    p.terms_text ??
      "Перевозчик подтверждает принятие заявки и обязуется выполнить перевозку на указанных условиях.",
  );
  lines.push(`ФИО подтверждающего: ${val(p.carrier_responded_by ?? null)}`);
  lines.push(`Дата подтверждения: ${val(p.carrier_responded_at ?? null)}`);

  if (p.request_status) {
    lines.push("");
    lines.push(
      `Статус: ${CARRIER_REQUEST_STATUS_LABELS[p.request_status as CarrierRequestStatus] ?? p.request_status}`,
    );
  }

  return lines.join("\n");
}

export function carrierRequestContractSubject(
  p: Pick<CarrierRequestContractPayload, "request_number">,
): string {
  return `Заявка-договор №${p.request_number ?? "—"}`;
}
