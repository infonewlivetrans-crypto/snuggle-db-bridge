import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type OrderImportRow = {
  order_number?: string;
  client?: string;
  phone?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  product?: string;
  weight_kg?: number | null;
  volume_m3?: number | null;
  amount?: number | null;
  payment_type?: string;
  external_id?: string | null;
};

export type ImportResult = {
  total: number;
  inserted: number;
  errors: Array<{ row: number; message: string }>;
};

// Сопоставление любых вариантов названий колонок к нашим полям
const HEADER_MAP: Record<string, keyof OrderImportRow> = {
  // order_number
  "номер": "order_number",
  "номер заказа": "order_number",
  "№": "order_number",
  "order_number": "order_number",
  // client
  "клиент": "client",
  "контрагент": "client",
  "client": "client",
  // phone
  "телефон": "phone",
  "phone": "phone",
  // address
  "адрес": "address",
  "адрес доставки": "address",
  "address": "address",
  // coords
  "широта": "latitude",
  "lat": "latitude",
  "latitude": "latitude",
  "долгота": "longitude",
  "lng": "longitude",
  "lon": "longitude",
  "longitude": "longitude",
  // product
  "товар": "product",
  "наименование": "product",
  "product": "product",
  // weight
  "вес": "weight_kg",
  "вес, кг": "weight_kg",
  "weight": "weight_kg",
  "weight_kg": "weight_kg",
  // volume
  "объем": "volume_m3",
  "объём": "volume_m3",
  "объем, м3": "volume_m3",
  "объём, м3": "volume_m3",
  "volume": "volume_m3",
  "volume_m3": "volume_m3",
  // amount
  "сумма": "amount",
  "amount": "amount",
  "total": "amount",
  // payment
  "оплата": "payment_type",
  "тип оплаты": "payment_type",
  "payment": "payment_type",
  "payment_type": "payment_type",
  // external
  "id 1с": "external_id",
  "external_id": "external_id",
};

const PAYMENT_MAP: Record<string, "cash" | "card" | "online" | "qr"> = {
  "наличные": "cash",
  "нал": "cash",
  "cash": "cash",
  "карта": "card",
  "card": "card",
  "онлайн": "online",
  "online": "online",
  "qr": "qr",
  "qr-код": "qr",
};

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(",", ".").replace(/\s+/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseOrdersWorkbook(file: ArrayBuffer): OrderImportRow[] {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return raw.map((row) => {
    const out: OrderImportRow = {};
    for (const [k, v] of Object.entries(row)) {
      const key = HEADER_MAP[normalizeKey(k)];
      if (!key) continue;
      if (key === "latitude" || key === "longitude" || key === "weight_kg" || key === "volume_m3" || key === "amount") {
        (out as Record<string, unknown>)[key] = toNumber(v);
      } else {
        const s = String(v ?? "").trim();
        (out as Record<string, unknown>)[key] = s || undefined;
      }
    }
    return out;
  });
}

export async function importOrdersFromFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const rows = parseOrdersWorkbook(buf);
  const result: ImportResult = { total: rows.length, inserted: 0, errors: [] };

  // Получаем последний номер для авто-генерации
  const { data: lastOrder } = await supabase
    .from("orders")
    .select("order_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let counter = 1;
  const lastNum = lastOrder?.order_number?.match(/(\d+)$/)?.[1];
  if (lastNum) counter = parseInt(lastNum, 10) + 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.address && (r.latitude == null || r.longitude == null)) {
        throw new Error("Нужен адрес или координаты");
      }
      const orderNumber = r.order_number?.trim() || `IMP-${String(counter++).padStart(4, "0")}`;
      const paymentRaw = r.payment_type ? normalizeKey(r.payment_type) : "";
      const payment_type = PAYMENT_MAP[paymentRaw] || "cash";

      const commentParts: string[] = [];
      if (r.client) commentParts.push(`Клиент: ${r.client}`);
      if (r.product) commentParts.push(`Товар: ${r.product}`);
      if (r.amount != null) commentParts.push(`Сумма: ${r.amount}`);

      const { error } = await supabase.from("orders").insert({
        order_number: orderNumber,
        delivery_address: r.address ?? null,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        contact_name: r.client ?? null,
        contact_phone: r.phone ?? null,
        payment_type,
        total_weight_kg: r.weight_kg ?? null,
        total_volume_m3: r.volume_m3 ?? null,
        comment: commentParts.join(" • ") || null,
        external_id: r.external_id ?? null,
        source: "manual",
        status: "new",
      });
      if (error) throw error;
      result.inserted++;
    } catch (e) {
      result.errors.push({
        row: i + 2, // +2: header + 1-based
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}

/** Скачать пустой шаблон Excel для импорта заказов */
export function downloadOrdersTemplate() {
  const headers = [
    "Номер заказа",
    "Клиент",
    "Телефон",
    "Адрес",
    "Широта",
    "Долгота",
    "Товар",
    "Вес, кг",
    "Объём, м3",
    "Сумма",
    "Тип оплаты",
    "external_id",
  ];
  const example = [
    "ORD-0001",
    "ООО Ромашка",
    "+7 999 123-45-67",
    "г. Москва, ул. Ленина, 1",
    55.7558,
    37.6173,
    "Кофе зерновой 1кг",
    12.5,
    0.04,
    4500,
    "наличные",
    "",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Заказы");
  XLSX.writeFile(wb, "orders_template.xlsx");
}
