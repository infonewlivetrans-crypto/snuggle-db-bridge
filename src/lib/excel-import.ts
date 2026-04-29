import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ImportResult = {
  inserted: number;
  total: number;
  errors: Array<{ row: number; message: string }>;
};

const HEADER_MAP: Record<string, string> = {
  "номер": "order_number",
  "номер заказа": "order_number",
  "order_number": "order_number",
  "клиент": "contact_name",
  "имя": "contact_name",
  "contact_name": "contact_name",
  "телефон": "contact_phone",
  "phone": "contact_phone",
  "contact_phone": "contact_phone",
  "адрес": "delivery_address",
  "address": "delivery_address",
  "delivery_address": "delivery_address",
  "координаты": "coordinates",
  "coordinates": "coordinates",
  "товар": "goods",
  "вес": "total_weight_kg",
  "weight": "total_weight_kg",
  "объём": "total_volume_m3",
  "объем": "total_volume_m3",
  "volume": "total_volume_m3",
  "сумма": "goods_amount",
  "amount": "goods_amount",
  "тип оплаты": "payment_type",
  "оплата": "payment_type",
  "payment_type": "payment_type",
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const TEMPLATE_HEADERS = [
  "Номер заказа",
  "Клиент",
  "Телефон",
  "Адрес",
  "Координаты",
  "Товар",
  "Вес",
  "Объём",
  "Сумма",
  "Тип оплаты",
];

export function downloadOrdersTemplate() {
  const example = ["ORD-1001", "Иван Иванов", "+7 999 000 00 00", "г. Москва, ул. Ленина, 1", "55.7558, 37.6173", "Доска 50х50", 12.5, 0.05, 5000, "cash"];
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Заказы");
  XLSX.writeFile(wb, "template_orders.xlsx");
}

function mapHeaderRow(headerRow: unknown[]): Record<number, string> {
  const out: Record<number, string> = {};
  headerRow.forEach((h, i) => {
    const key = HEADER_MAP[norm(h)];
    if (key) out[i] = key;
  });
  return out;
}

export async function importOrdersFromFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const errors: Array<{ row: number; message: string }> = [];
  if (!ws) return { inserted: 0, total: 0, errors: [{ row: 0, message: "Файл пуст" }] };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length < 2) return { inserted: 0, total: 0, errors: [{ row: 0, message: "Нет данных" }] };
  const headerMap = mapHeaderRow(aoa[0] as unknown[]);
  let inserted = 0;
  let total = 0;
  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i] as unknown[];
    if (!raw || raw.every((v) => v === "" || v == null)) continue;
    total++;
    const data: Record<string, unknown> = {};
    raw.forEach((v, idx) => {
      const key = headerMap[idx];
      if (key) data[key] = v;
    });
    const orderNumber = str(data.order_number);
    if (!orderNumber) {
      errors.push({ row: i + 1, message: "Пустой номер заказа" });
      continue;
    }
    let lat: number | null = null;
    let lng: number | null = null;
    const coords = str(data.coordinates);
    if (coords) {
      const parts = coords.split(/[,\s;]+/).filter(Boolean);
      if (parts.length >= 2) {
        lat = num(parts[0]);
        lng = num(parts[1]);
      }
    }
    const payload = {
      order_number: orderNumber,
      contact_name: str(data.contact_name),
      contact_phone: str(data.contact_phone),
      delivery_address: str(data.delivery_address),
      latitude: lat,
      longitude: lng,
      total_weight_kg: num(data.total_weight_kg),
      total_volume_m3: num(data.total_volume_m3),
      goods_amount: num(data.goods_amount),
      payment_type: (str(data.payment_type) ?? "cash"),
      delivery_cost: 0,
      source: "excel",
    };
    const { error } = await supabase.from("orders").insert(payload as never);
    if (error) errors.push({ row: i + 1, message: error.message });
    else inserted++;
  }
  return { inserted, total, errors };
}
